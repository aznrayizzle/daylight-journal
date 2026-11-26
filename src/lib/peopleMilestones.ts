import type { JournalEntry, PersonProfile, PhotoRecord } from '../types';
import { getEntryDateParts } from './dateUtils';

export interface MilestoneMatch {
  entry: JournalEntry;
  category: string;
  label?: string;
  isPinned: boolean;
  isStarred: boolean;
  isFirstMention: boolean;
  score: number;
  snippet: string;
}

interface MilestoneRule {
  category: string;
  weight: number;
  patterns: RegExp[];
}

const PARTNER_RULES: MilestoneRule[] = [
  {
    category: 'Wedding & Marriage',
    weight: 10,
    patterns: [
      /\b(wedding|married|marriage|honeymoon|ceremony|vows|eloped|courthouse wedding)\b/i,
    ],
  },
  {
    category: 'Engagement',
    weight: 10,
    patterns: [/\b(engaged|engagement|proposed|proposal|fianc[eé]e?|she said yes|engagement ring)\b/i],
  },
  {
    category: 'Baby & Family',
    weight: 9,
    patterns: [
      /\b(pregnant|pregnancy|ultrasound|due date|baby shower|gender reveal|gave birth|delivery room|newborn)\b/i,
    ],
  },
  {
    category: 'How We Met & Dating',
    weight: 8,
    patterns: [
      /\b(first date|asked her out|asked him out|started dating|official|girlfriend|boyfriend|met on hinge|met on bumble|met on coffee)\b/i,
    ],
  },
  {
    category: 'Home & Moving',
    weight: 8,
    patterns: [
      /\b(moved in|moving in|bought a house|new house|closed on the house|got the keys|new apartment|moving day)\b/i,
    ],
  },
  {
    category: 'Trips & Adventures',
    weight: 6,
    patterns: [
      /\b(vacation|road trip|flew to|flight to|airport|honeymoon|national park|trip to|europe|japan|hawaii|cancun|italy|paris|iceland|mexico|alaska|cruise)\b/i,
    ],
  },
  {
    category: 'Anniversaries & Celebrations',
    weight: 6,
    patterns: [/\b(anniversary|birthday|valentine'?s|new year'?s|christmas|thanksgiving)\b/i],
  },
];

const CHILD_RULES: MilestoneRule[] = [
  {
    category: 'Birth & Arrival',
    weight: 10,
    patterns: [/\b(was born|born today|birth|delivery|came home from the hospital|newborn|arrived)\b/i],
  },
  {
    category: 'Monthly & Birthday',
    weight: 9,
    patterns: [
      /\b(\d+\s*months?(\s*old)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*months?\b/i,
      /\b(birthday|turns?\s+\d+|turned\s+\d+|1st birthday|first birthday|half birthday)\b/i,
    ],
  },
  {
    category: 'Firsts & Growth',
    weight: 9,
    patterns: [
      /\b(first smile|first laugh|rolled over|rolling over|crawling|crawled|first step|first steps|started walking|walked|first word|first words|first tooth|teething|solid food|solids|sleeping through|slept through|sat up|sitting up|stood up|standing|daycare|preschool|first day of|pediatrician|checkup)\b/i,
    ],
  },
  {
    category: 'Trips & Outings',
    weight: 6,
    patterns: [
      /\b(first flight|trip|vacation|zoo|aquarium|beach|museum|road trip|airport|flew)\b/i,
    ],
  },
  {
    category: 'Holidays & Celebrations',
    weight: 5,
    patterns: [/\b(christmas|thanksgiving|halloween|easter|lunar new year|new year|party)\b/i],
  },
];

const GENERAL_RULES: MilestoneRule[] = [
  {
    category: 'Big Moments',
    weight: 8,
    patterns: [
      /\b(wedding|engaged|graduat|birthday|anniversary|new job|promotion|moved|born|baby)\b/i,
    ],
  },
  {
    category: 'Trips & Outings',
    weight: 6,
    patterns: [/\b(trip|vacation|flight|road trip|camping|concert|festival)\b/i],
  },
  {
    category: 'Celebrations',
    weight: 5,
    patterns: [/\b(christmas|thanksgiving|new year|celebrat|reunion)\b/i],
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

export function getPersonMentions(
  entries: JournalEntry[],
  person: PersonProfile
): { entry: JournalEntry; snippet: string }[] {
  const regex = buildPersonRegex(person);
  const results: { entry: JournalEntry; snippet: string }[] = [];

  for (const entry of entries) {
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
  person: PersonProfile
): {
  mentions: { entry: JournalEntry; snippet: string }[];
  milestones: MilestoneMatch[];
} {
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

  // Earliest entry mentioning this person is always a special milestone
  const earliestMention =
    mentions.length > 0
      ? mentions.reduce((oldest, cur) =>
          cur.entry.creationDate < oldest.entry.creationDate ? cur : oldest
        )
      : null;

  const milestones: MilestoneMatch[] = [];
  const seenUuids = new Set<string>();

  for (const { entry, snippet } of mentions) {
    const upperUuid = entry.uuid.toUpperCase();
    const pinned = pinnedMap.get(upperUuid);
    const isHidden = hiddenSet.has(upperUuid);
    const isFirstMention = earliestMention?.entry.uuid === entry.uuid;

    if (pinned) {
      milestones.push({
        entry,
        category: pinned.category || 'Pinned Milestone',
        label: pinned.label,
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

    let bestCategory = '';
    let bestScore = 0;

    for (const rule of rules) {
      for (const pat of rule.patterns) {
        if (pat.test(entry.entryText) || entry.tags.some((t) => pat.test(t))) {
          if (rule.weight > bestScore) {
            bestScore = rule.weight;
            bestCategory = rule.category;
          }
          break;
        }
      }
    }

    if (isFirstMention) {
      bestScore = Math.max(bestScore, 9);
      if (!bestCategory) bestCategory = 'First Mention';
    } else if (entry.starred && bestScore === 0) {
      bestScore = 7;
      bestCategory = 'Favorite Memory';
    }

    if (bestScore > 0) {
      milestones.push({
        entry,
        category: bestCategory,
        isPinned: false,
        isStarred: entry.starred,
        isFirstMention,
        score: bestScore,
        snippet,
      });
      seenUuids.add(upperUuid);
    }
  }

  // Also include any manually pinned entry even if it doesn't explicitly contain the person's name
  if (pinnedMap.size > 0) {
    const entryByUpper = new Map(entries.map((e) => [e.uuid.toUpperCase(), e]));
    for (const [upperUuid, pinned] of pinnedMap.entries()) {
      if (seenUuids.has(upperUuid)) continue;
      const entry = entryByUpper.get(upperUuid);
      if (!entry) continue;
      milestones.push({
        entry,
        category: pinned.category || 'Pinned Milestone',
        label: pinned.label,
        isPinned: true,
        isStarred: entry.starred,
        isFirstMention: false,
        score: 100,
        snippet: entry.entryText.replace(/\s+/g, ' ').trim().slice(0, 160),
      });
    }
  }

  return { mentions, milestones };
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
