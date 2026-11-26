import type { JournalEntry, PersonProfile, PhotoRecord } from '../types';
import { entryToDateKey, getEntryDateParts } from './dateUtils';

export type MilestoneFilterGroup = 'milestones' | 'trips' | 'family';

export interface MilestoneMatch {
  entry: JournalEntry;
  category: string;
  filterGroup: MilestoneFilterGroup;
  color: string;
  label?: string;
  customPhotoKey?: string;
  summary: string;
  isPinned: boolean;
  isStarred: boolean;
  isFirstMention: boolean;
  score: number;
  snippet: string;
}

interface MilestoneRule {
  category: string;
  filterGroup: MilestoneFilterGroup;
  color: string;
  weight: number;
  patterns: RegExp[];
}

const MAX_AUTO_PER_YEAR = 4;

const PARTNER_RULES: MilestoneRule[] = [
  {
    category: 'Wedding & Marriage',
    filterGroup: 'milestones',
    color: '#B84A62',
    weight: 10,
    patterns: [
      /\b(our wedding|got married|we married|honeymoon|wedding vows|eloped|courthouse wedding|wedding day)\b/i,
    ],
  },
  {
    category: 'Engagement',
    filterGroup: 'milestones',
    color: '#C85A43',
    weight: 10,
    patterns: [
      /\b(engaged|engagement|proposed|proposal|fianc[eé]e?|she said yes|engagement ring)\b/i,
    ],
  },
  {
    category: 'Baby & Family',
    filterGroup: 'family',
    color: '#2563EB',
    weight: 10,
    patterns: [
      /\b(pregnant|pregnancy|ultrasound|due date|baby shower|gender reveal|gave birth|delivery room|was born|newborn)\b/i,
    ],
  },
  {
    category: 'How We Met & Dating',
    filterGroup: 'milestones',
    color: '#1B4965',
    weight: 9,
    patterns: [
      /\b(first date|asked her out|asked him out|started dating|became official|my girlfriend|met on hinge|met on bumble|coffee meets bagel)\b/i,
    ],
  },
  {
    category: 'Home & Moving',
    filterGroup: 'milestones',
    color: '#2D7A5E',
    weight: 8,
    patterns: [
      /\b(moved in together|moving in together|bought a house|bought our house|closed on the house|got the keys|signed the lease|moving day)\b/i,
    ],
  },
  {
    category: 'Trips & Adventures',
    filterGroup: 'trips',
    color: '#287B94',
    weight: 7,
    patterns: [
      /\b(vacation|road trip|trip to|flew to|honeymoon|national park|grand canyon|europe|japan|kyoto|tokyo|hawaii|cancun|italy|paris|iceland|mexico|alaska|cruise|disneyland|yosemite|banff|bali)\b/i,
    ],
  },
  {
    category: 'Anniversaries',
    filterGroup: 'family',
    color: '#A94A3E',
    weight: 7,
    patterns: [/\b(anniversary|valentine'?s day)\b/i],
  },
];

const CHILD_RULES: MilestoneRule[] = [
  {
    category: 'Birth & Arrival',
    filterGroup: 'milestones',
    color: '#1B4965',
    weight: 10,
    patterns: [/\b(was born|born today|birth|delivery|came home from the hospital|newborn|arrived)\b/i],
  },
  {
    category: 'Monthly & Birthday',
    filterGroup: 'milestones',
    color: '#C85A43',
    weight: 9,
    patterns: [
      /\b(\d+\s*months?(\s*old|\s*milestone)?|(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*months?(\s*old)?)\b/i,
      /\b(birthday|turns?\s+\d+|turned\s+\d+|1st birthday|first birthday|half birthday)\b/i,
    ],
  },
  {
    category: 'Firsts & Growth',
    filterGroup: 'milestones',
    color: '#2D7A5E',
    weight: 9,
    patterns: [
      /\b(first smile|first laugh|rolled over|rolling over|crawling|crawled|first step|first steps|started walking|walked|first word|first words|first tooth|teething|solid food|solids|sleeping through|slept through|sat up|sitting up|stood up|standing|daycare|preschool|first day of)\b/i,
    ],
  },
  {
    category: 'Trips & Outings',
    filterGroup: 'trips',
    color: '#287B94',
    weight: 7,
    patterns: [/\b(first flight|trip to|vacation|zoo|aquarium|beach|museum|road trip)\b/i],
  },
  {
    category: 'First Holidays',
    filterGroup: 'family',
    color: '#B84A62',
    weight: 6,
    patterns: [/\b(first christmas|first thanksgiving|first halloween|first easter|first new year)\b/i],
  },
];

const GENERAL_RULES: MilestoneRule[] = [
  {
    category: 'Big Moments',
    filterGroup: 'milestones',
    color: '#C85A43',
    weight: 8,
    patterns: [/\b(wedding|engaged|graduat|anniversary|moved in|was born)\b/i],
  },
  {
    category: 'Trips & Outings',
    filterGroup: 'trips',
    color: '#287B94',
    weight: 7,
    patterns: [/\b(trip to|vacation|road trip|camping|concert|festival)\b/i],
  },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildPersonRegex(person: PersonProfile): RegExp {
  const terms = [person.name, ...person.aliases]
    .map((t) => t.trim())
    .filter(Boolean)
    .map(escapeRegex);
  if (terms.length === 0) return /$^/;
  return new RegExp(`\\b(${terms.join('|')})\\b`, 'i');
}

function cleanSentence(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):\s*/i, '');
  return cleaned.length > 84 ? `${cleaned.slice(0, 81).trimEnd()}…` : cleaned;
}

/**
 * Splits entry text into readable sentences/clauses.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/\r?\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Checks whether a milestone rule matches in the same sentence (or immediately adjacent sentence)
 * as a mention of the person — preventing unrelated weekly log entries from matching.
 */
function findProximityRuleMatch(
  text: string,
  personRegex: RegExp,
  rules: MilestoneRule[]
): { rule: MilestoneRule; matchedSentence: string } | null {
  const sentences = splitSentences(text);
  let best: { rule: MilestoneRule; matchedSentence: string } | null = null;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (!personRegex.test(s)) continue;

    // Look at the sentence mentioning the person, plus immediate neighbor (within 1 sentence)
    const contextWindow = [sentences[i - 1] ?? '', s, sentences[i + 1] ?? '']
      .filter(Boolean)
      .join(' ');

    for (const rule of rules) {
      for (const pat of rule.patterns) {
        if (pat.test(s) || pat.test(contextWindow)) {
          // Prefer a direct same-sentence match over an adjacent-sentence match
          const directBonus = pat.test(s) ? 1 : 0;
          const effectiveWeight = rule.weight + directBonus;
          const bestWeight = best ? best.rule.weight : -1;
          if (effectiveWeight > bestWeight) {
            const bestSentence = pat.test(s)
              ? s
              : sentences[i + 1] && pat.test(sentences[i + 1])
                ? `${s} ${sentences[i + 1]}`
                : s;
            best = { rule, matchedSentence: cleanSentence(bestSentence) };
          }
          break;
        }
      }
    }
  }

  return best;
}

/**
 * Extracts a short readable snippet centered around the first mention of the person.
 */
export function extractMentionSnippet(text: string, regex: RegExp): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const match = regex.exec(cleaned);
  if (!match || match.index === undefined) {
    return cleaned.slice(0, 160);
  }
  const start = Math.max(0, match.index - 55);
  const end = Math.min(cleaned.length, match.index + match[0].length + 115);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < cleaned.length ? '…' : '';
  return `${prefix}${cleaned.slice(start, end).trim()}${suffix}`;
}

function entryHasPhoto(
  entry: JournalEntry,
  photosByUuid?: Map<string, PhotoRecord>
): boolean {
  if (!photosByUuid) return false;
  const upper = entry.uuid.toUpperCase();
  if (photosByUuid.has(upper) || photosByUuid.has(upper.replace(/-/g, ''))) return true;
  const stem = entry.fileName.replace(/\.doentry$/i, '').toUpperCase();
  return photosByUuid.has(stem) || photosByUuid.has(stem.replace(/-/g, ''));
}

function passesStartDate(entry: JournalEntry, startDate?: string): boolean {
  if (!startDate || !startDate.trim()) return true;
  return entryToDateKey(entry) >= startDate.trim();
}

export function getPersonMentions(
  entries: JournalEntry[],
  person: PersonProfile
): { entry: JournalEntry; snippet: string }[] {
  const regex = buildPersonRegex(person);
  const results: { entry: JournalEntry; snippet: string }[] = [];

  for (const entry of entries) {
    if (!passesStartDate(entry, person.startDate)) continue;
    const tagMatch = entry.tags.some((t) => regex.test(t));
    const textMatch = regex.test(entry.entryText);
    if (tagMatch || textMatch) {
      results.push({
        entry,
        snippet: extractMentionSnippet(entry.entryText, regex),
      });
    }
  }

  return results;
}

export function buildPersonHighlightReel(
  entries: JournalEntry[],
  person: PersonProfile,
  photosByUuid?: Map<string, PhotoRecord>
): {
  mentions: { entry: JournalEntry; snippet: string }[];
  milestones: MilestoneMatch[];
} {
  const personRegex = buildPersonRegex(person);
  const mentions = getPersonMentions(entries, person);
  const pinnedMap = new Map(
    person.pinnedMilestones.map((m) => [m.entryUuid.toUpperCase(), m])
  );
  const hiddenSet = new Set(person.hiddenEntryUuids.map((u) => u.toUpperCase()));

  const rules =
    person.role === 'partner'
      ? PARTNER_RULES
      : person.role === 'child'
        ? CHILD_RULES
        : GENERAL_RULES;

  const earliestMention =
    mentions.length > 0
      ? mentions.reduce((oldest, cur) =>
          cur.entry.creationDate < oldest.entry.creationDate ? cur : oldest
        )
      : null;

  const pinnedMatches: MilestoneMatch[] = [];
  const autoCandidates: MilestoneMatch[] = [];
  const seenUuids = new Set<string>();

  for (const { entry, snippet } of mentions) {
    const upperUuid = entry.uuid.toUpperCase();
    const pinned = pinnedMap.get(upperUuid);
    const isHidden = hiddenSet.has(upperUuid);
    const isFirstMention = earliestMention?.entry.uuid === entry.uuid;
    const proximity = findProximityRuleMatch(entry.entryText, personRegex, rules);
    const fallbackSentence =
      splitSentences(entry.entryText).find((s) => personRegex.test(s)) || entry.entryText;

    if (pinned) {
      pinnedMatches.push({
        entry,
        category: pinned.category || proximity?.rule.category || 'Pinned Milestone',
        filterGroup: proximity?.rule.filterGroup ?? 'milestones',
        color: proximity?.rule.color ?? '#C85A43',
        label: pinned.label,
        customPhotoKey: pinned.customPhotoKey,
        summary: pinned.label?.trim() || proximity?.matchedSentence || cleanSentence(fallbackSentence),
        isPinned: true,
        isStarred: entry.starred,
        isFirstMention,
        score: 100,
        snippet,
      });
      seenUuids.add(upperUuid);
      continue;
    }

    if (isHidden) continue;

    if (proximity) {
      autoCandidates.push({
        entry,
        category: proximity.rule.category,
        filterGroup: proximity.rule.filterGroup,
        color: proximity.rule.color,
        summary: proximity.matchedSentence,
        isPinned: false,
        isStarred: entry.starred,
        isFirstMention,
        score: proximity.rule.weight + (entry.starred ? 2 : 0) + (isFirstMention ? 2 : 0),
        snippet,
      });
      seenUuids.add(upperUuid);
    } else if (isFirstMention) {
      autoCandidates.push({
        entry,
        category: 'First Mention',
        filterGroup: 'milestones',
        color: '#1B4965',
        summary: cleanSentence(fallbackSentence),
        isPinned: false,
        isStarred: entry.starred,
        isFirstMention: true,
        score: 9,
        snippet,
      });
      seenUuids.add(upperUuid);
    } else if (entry.starred) {
      autoCandidates.push({
        entry,
        category: 'Favorite Memory',
        filterGroup: 'milestones',
        color: '#D97706',
        summary: cleanSentence(fallbackSentence),
        isPinned: false,
        isStarred: true,
        isFirstMention: false,
        score: 8,
        snippet,
      });
      seenUuids.add(upperUuid);
    }
  }

  // Also include manually pinned entries even if they don't mention the name or precede startDate
  if (pinnedMap.size > 0) {
    const entryByUpper = new Map(entries.map((e) => [e.uuid.toUpperCase(), e]));
    for (const [upperUuid, pinned] of pinnedMap.entries()) {
      if (seenUuids.has(upperUuid)) continue;
      const entry = entryByUpper.get(upperUuid);
      if (!entry) continue;
      pinnedMatches.push({
        entry,
        category: pinned.category || 'Pinned Milestone',
        filterGroup: 'milestones',
        color: '#C85A43',
        label: pinned.label,
        customPhotoKey: pinned.customPhotoKey,
        summary: pinned.label?.trim() || cleanSentence(entry.entryText),
        isPinned: true,
        isStarred: entry.starred,
        isFirstMention: false,
        score: 100,
        snippet: entry.entryText.replace(/\s+/g, ' ').trim().slice(0, 160),
      });
    }
  }

  // Cap auto-detected milestones to the top MAX_AUTO_PER_YEAR per year (preferring entries with photos)
  const autoByYear = new Map<number, MilestoneMatch[]>();
  for (const m of autoCandidates) {
    const { year } = getEntryDateParts(m.entry);
    const list = autoByYear.get(year) ?? [];
    list.push(m);
    autoByYear.set(year, list);
  }

  const trimmedAuto: MilestoneMatch[] = [];
  for (const list of autoByYear.values()) {
    list.sort((a, b) => {
      const aHasPhoto = entryHasPhoto(a.entry, photosByUuid) ? 1 : 0;
      const bHasPhoto = entryHasPhoto(b.entry, photosByUuid) ? 1 : 0;
      // Strongly prefer entries with photos (+5 effective score) so Polaroids show real pictures
      const aTotal = a.score + aHasPhoto * 5;
      const bTotal = b.score + bHasPhoto * 5;
      if (bTotal !== aTotal) return bTotal - aTotal;
      if (bHasPhoto !== aHasPhoto) return bHasPhoto - aHasPhoto;
      return b.entry.entryText.length - a.entry.entryText.length;
    });
    trimmedAuto.push(...list.slice(0, MAX_AUTO_PER_YEAR));
  }

  return {
    mentions,
    milestones: [...pinnedMatches, ...trimmedAuto],
  };
}

export function computePersonStats(
  mentions: { entry: JournalEntry; snippet: string }[],
  photosByUuid: Map<string, PhotoRecord>
): {
  totalMentions: number;
  firstDate?: string;
  latestDate?: string;
  photosCount: number;
  byYear: [number, number][];
} {
  if (mentions.length === 0) {
    return { totalMentions: 0, photosCount: 0, byYear: [] };
  }

  let firstDate = mentions[0].entry.creationDate;
  let latestDate = mentions[0].entry.creationDate;
  let photosCount = 0;
  const yearMap = new Map<number, number>();

  for (const { entry } of mentions) {
    if (entry.creationDate < firstDate) firstDate = entry.creationDate;
    if (entry.creationDate > latestDate) latestDate = entry.creationDate;
    if (photosByUuid.has(entry.uuid.toUpperCase())) photosCount++;
    const { year } = getEntryDateParts(entry);
    yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
  }

  const byYear = Array.from(yearMap.entries()).sort((a, b) => a[0] - b[0]);
  return {
    totalMentions: mentions.length,
    firstDate,
    latestDate,
    photosCount,
    byYear,
  };
}
