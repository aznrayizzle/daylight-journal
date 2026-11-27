import type { JournalEntry, PersonProfile, PinnedMilestone } from '../types';
import { entryToDateKey } from './dateUtils';
import { getPersonMentions } from './peopleMilestones';

interface AiMilestoneItem {
  uuid: string;
  summary: string;
  category: string;
}

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-2.5-flash'];

/**
 * Uses the user's own Gemini API key (client-side, directly to Google AI) to read entries
 * mentioning a person, pick the true major life milestones, and write crisp 1-sentence summaries.
 */
export async function curateMilestonesWithGemini(
  apiKey: string,
  entries: JournalEntry[],
  person: PersonProfile
): Promise<PinnedMilestone[]> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error('Add your free Gemini API key in Settings first.');
  }

  const mentions = getPersonMentions(entries, person);
  if (mentions.length === 0) {
    throw new Error(`No entries found mentioning ${person.name}.`);
  }

  // Build a compact chronological digest of entries mentioning this person
  const chronological = [...mentions].sort((a, b) =>
    a.entry.creationDate.localeCompare(b.entry.creationDate)
  );

  const validUuids = new Set(chronological.map((m) => m.entry.uuid.toUpperCase()));
  const digestLines = chronological.map(({ entry }) => {
    const date = entryToDateKey(entry);
    // Keep up to 900 chars per entry so even 400+ entries fit comfortably in Gemini 2.5 Flash's 1M context
    const text = entry.entryText.replace(/\s+/g, ' ').trim().slice(0, 900);
    return `[${entry.uuid.toUpperCase()}] (${date}) ${text}`;
  });

  const roleGuidance =
    person.role === 'partner'
      ? `This is the author's romantic partner/spouse (${person.name}). Focus ONLY on real relationship & family milestones with ${person.name}: how they met, first date, becoming official, moving in, major trips/vacations together, meeting family, engagement, wedding, buying a home, pregnancy/having a baby, and special anniversaries. NEVER include mundane work weeks, routine errands, or other people's events.`
      : person.role === 'child'
        ? `This is the author's child (${person.name}). Focus ONLY on real childhood milestones for ${person.name}: birth/arrival, monthly & birthday milestones, first smile/laugh/roll/crawl/step/word/solid food, first trips/outings, and special family firsts. NEVER include mundane work logs.`
        : `Focus ONLY on genuinely meaningful life milestones, trips, and special moments involving ${person.name}. Skip routine/mundane entries.`;

  const prompt = `You are curating a personal photo-book timeline highlight reel for ${person.name} from a private journal.
${roleGuidance}

Rules:
1. Pick ONLY the biggest, most memorable highlights — aim for roughly 2 to 5 core memories per year (skipping years that have no major milestones, and never picking routine work/grocery weeks).
2. For each selected entry, write a crisp, warm, human ONE-LINE summary (4 to 11 words) describing what actually happened — like "Engagement at the Grand Canyon", "First coffee date downtown", "Autumn trip to Kyoto", "Cayden is born", "Cayden's 8-month milestone & crawling". Do NOT copy raw journal prose or "Monday: Woke up..." lines.
3. Assign each milestone one clean category from: "How We Met", "Trip", "Engagement", "Wedding", "Home", "Family", "Birth", "Firsts", "Monthly Milestone", "Anniversary", "Big Moment".
4. Only return UUIDs that appear verbatim in the input list below.

Return strictly a JSON array of objects with keys: "uuid", "summary", "category".

Entries:
${digestLines.join('\n')}`;

  let res: Response | null = null;
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const attempt = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    });
    if (attempt.ok) {
      res = attempt;
      break;
    }
    const errBody = await attempt.text().catch(() => '');
    lastErr = `Gemini API error (${attempt.status} on ${model}): ${errBody.slice(0, 200) || attempt.statusText}`;
    // Only fall back to the next model on 404 / deprecated model errors
    if (attempt.status !== 404 && attempt.status !== 400) {
      throw new Error(lastErr);
    }
  }

  if (!res) {
    throw new Error(lastErr || 'Gemini API request failed.');
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  let parsed: AiMilestoneItem[];
  try {
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned) as AiMilestoneItem[];
  } catch {
    throw new Error('Could not parse Gemini milestone JSON. Please try again.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected response format from Gemini.');
  }

  // Preserve any existing custom Polaroid photos the user already picked
  const existingByUuid = new Map(
    person.pinnedMilestones.map((m) => [m.entryUuid.toUpperCase(), m])
  );

  const curated: PinnedMilestone[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item.uuid !== 'string') continue;
    const upper = item.uuid.trim().toUpperCase();
    if (!validUuids.has(upper) || seen.has(upper)) continue;
    seen.add(upper);

    const prev = existingByUuid.get(upper);
    curated.push({
      entryUuid: upper,
      label: typeof item.summary === 'string' && item.summary.trim() ? item.summary.trim() : prev?.label,
      category:
        typeof item.category === 'string' && item.category.trim()
          ? item.category.trim()
          : prev?.category || 'Big Moment',
      customPhotoKey: prev?.customPhotoKey,
    });
  }

  // Also retain any milestones where the user manually attached a custom Polaroid photo
  for (const [upper, prev] of existingByUuid.entries()) {
    if (prev.customPhotoKey && !seen.has(upper)) {
      curated.push(prev);
    }
  }

  if (curated.length === 0) {
    throw new Error(`Gemini did not find any major milestones for ${person.name}.`);
  }

  return curated;
}
