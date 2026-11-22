import type { EntryLocation, EntryWeather, JournalEntry } from '../types';

const PLIST_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">`;

/**
 * Generates a Day One Classic / Journaley style 32-character uppercase hex UUID.
 */
export function generateDoentryUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').toUpperCase();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatIsoUtc(dateInput: string | Date): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getDirectElementChildren(el: Element): Element[] {
  const children: Element[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === 1) {
      children.push(node as Element);
    }
  }
  return children;
}

function parseDictToMap(dictEl: Element): Map<string, Element> {
  const map = new Map<string, Element>();
  const children = getDirectElementChildren(dictEl);
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.tagName === 'key' && i + 1 < children.length) {
      const keyName = (child.textContent ?? '').trim();
      map.set(keyName, children[i + 1]);
      i++;
    }
  }
  return map;
}

function parsePlistString(el?: Element): string | undefined {
  if (!el) return undefined;
  return el.textContent ?? '';
}

function parsePlistNumber(el?: Element): number | undefined {
  if (!el) return undefined;
  const num = Number(el.textContent);
  return Number.isNaN(num) ? undefined : num;
}

function parsePlistBoolean(el?: Element): boolean {
  if (!el) return false;
  return el.tagName === 'true';
}

function parsePlistStringArray(el?: Element): string[] {
  if (!el || el.tagName !== 'array') return [];
  return getDirectElementChildren(el)
    .filter((c) => c.tagName === 'string')
    .map((c) => (c.textContent ?? '').trim())
    .filter(Boolean);
}

function parseLocation(el?: Element): EntryLocation | undefined {
  if (!el || el.tagName !== 'dict') return undefined;
  const map = parseDictToMap(el);
  const loc: EntryLocation = {
    placeName: parsePlistString(map.get('Place Name')),
    locality: parsePlistString(map.get('Locality')),
    administrativeArea: parsePlistString(map.get('Administrative Area')),
    country: parsePlistString(map.get('Country')),
    latitude: parsePlistNumber(map.get('Latitude')),
    longitude: parsePlistNumber(map.get('Longitude')),
  };
  if (
    !loc.placeName &&
    !loc.locality &&
    !loc.administrativeArea &&
    !loc.country &&
    loc.latitude === undefined
  ) {
    return undefined;
  }
  return loc;
}

function parseWeather(el?: Element): EntryWeather | undefined {
  if (!el || el.tagName !== 'dict') return undefined;
  const map = parseDictToMap(el);
  const weather: EntryWeather = {
    celsius: parsePlistString(map.get('Celsius')),
    fahrenheit: parsePlistString(map.get('Fahrenheit')),
    description: parsePlistString(map.get('Description')),
    iconName: parsePlistString(map.get('IconName')),
  };
  if (!weather.celsius && !weather.fahrenheit && !weather.description) {
    return undefined;
  }
  return weather;
}

/**
 * Serializes a plist XML DOM element cleanly with Apple-style tab indentation.
 */
function serializePlistElement(el: Element, indent: string): string {
  const tag = el.tagName;
  if (tag === 'true' || tag === 'false') {
    return `${indent}<${tag}/>`;
  }
  if (tag === 'dict') {
    const children = getDirectElementChildren(el);
    if (children.length === 0) {
      return `${indent}<dict/>`;
    }
    const inner: string[] = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.tagName === 'key' && i + 1 < children.length) {
        inner.push(`${indent}\t<key>${escapeXml(child.textContent ?? '')}</key>`);
        inner.push(serializePlistElement(children[i + 1], `${indent}\t`));
        i++;
      } else {
        inner.push(serializePlistElement(child, `${indent}\t`));
      }
    }
    return `${indent}<dict>\n${inner.join('\n')}\n${indent}</dict>`;
  }
  if (tag === 'array') {
    const children = getDirectElementChildren(el);
    if (children.length === 0) {
      return `${indent}<array/>`;
    }
    const inner = children.map((c) => serializePlistElement(c, `${indent}\t`));
    return `${indent}<array>\n${inner.join('\n')}\n${indent}</array>`;
  }
  // Leaf node: string, date, integer, real, data, key
  const content = el.textContent ?? '';
  return `${indent}<${tag}>${escapeXml(content)}</${tag}>`;
}

/**
 * Parses a Day One Classic / Journaley `.doentry` XML plist string into a JournalEntry.
 */
export function parseDoentryXml(
  xml: string,
  meta: {
    fileId?: string;
    fileName: string;
    modifiedTime?: string;
    md5Checksum?: string;
  }
): JournalEntry {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Invalid .doentry XML in ${meta.fileName}: ${parseError.textContent}`);
  }

  const rootDict = doc.querySelector('plist > dict');
  if (!rootDict) {
    throw new Error(`Missing root <dict> in ${meta.fileName}`);
  }

  const map = parseDictToMap(rootDict);
  const fileStem = meta.fileName.replace(/\.doentry$/i, '').toUpperCase();
  const uuid = (parsePlistString(map.get('UUID'))?.trim() || fileStem).toUpperCase();
  const creationDate = formatIsoUtc(
    parsePlistString(map.get('Creation Date'))?.trim() || meta.modifiedTime || new Date().toISOString()
  );
  const entryText = parsePlistString(map.get('Entry Text')) ?? '';
  const starred = parsePlistBoolean(map.get('Starred'));
  const tags = parsePlistStringArray(map.get('Tags'));
  const timeZone =
    parsePlistString(map.get('Time Zone'))?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC';

  return {
    uuid,
    creationDate,
    entryText,
    starred,
    tags,
    timeZone,
    location: parseLocation(map.get('Location')),
    weather: parseWeather(map.get('Weather')),
    rawXml: xml,
    fileId: meta.fileId,
    fileName: meta.fileName,
    modifiedTime: meta.modifiedTime,
    md5Checksum: meta.md5Checksum,
  };
}

/**
 * Updates a `.doentry` XML string losslessly — preserving all unknown Day One / Journaley keys
 * (Location, Weather, Creator, Music, Activity, etc.) while updating editable fields.
 */
export function serializeDoentryXml(entry: JournalEntry): string {
  const parser = new DOMParser();
  let doc: Document;
  let rootDict: Element | null = null;

  if (entry.rawXml && entry.rawXml.trim().length > 0) {
    doc = parser.parseFromString(entry.rawXml, 'application/xml');
    if (!doc.querySelector('parsererror')) {
      rootDict = doc.querySelector('plist > dict');
    }
  }

  if (!rootDict) {
    doc = parser.parseFromString(`${PLIST_HEADER}\n<dict/>\n</plist>`, 'application/xml');
    rootDict = doc.querySelector('plist > dict')!;
  }

  const setKey = (keyName: string, createValueEl: () => Element | null) => {
    const children = getDirectElementChildren(rootDict!);
    let existingKeyEl: Element | null = null;
    let existingValEl: Element | null = null;

    for (let i = 0; i < children.length; i++) {
      if (children[i].tagName === 'key' && (children[i].textContent ?? '').trim() === keyName) {
        existingKeyEl = children[i];
        existingValEl = children[i + 1] ?? null;
        break;
      }
    }

    const newValEl = createValueEl();
    if (!newValEl) {
      // Remove key & value if present
      if (existingValEl) rootDict!.removeChild(existingValEl);
      if (existingKeyEl) rootDict!.removeChild(existingKeyEl);
      return;
    }

    if (existingKeyEl && existingValEl) {
      rootDict!.replaceChild(newValEl, existingValEl);
    } else if (existingKeyEl) {
      rootDict!.appendChild(newValEl);
    } else {
      const keyEl = doc.createElement('key');
      keyEl.textContent = keyName;
      rootDict!.appendChild(keyEl);
      rootDict!.appendChild(newValEl);
    }
  };

  setKey('Creation Date', () => {
    const el = doc.createElement('date');
    el.textContent = formatIsoUtc(entry.creationDate);
    return el;
  });

  setKey('Entry Text', () => {
    const el = doc.createElement('string');
    el.textContent = entry.entryText;
    return el;
  });

  setKey('Starred', () => doc.createElement(entry.starred ? 'true' : 'false'));

  const cleanTags = Array.from(new Set(entry.tags.map((t) => t.trim()).filter(Boolean)));
  setKey('Tags', () => {
    if (cleanTags.length === 0) return null;
    const arr = doc.createElement('array');
    for (const tag of cleanTags) {
      const s = doc.createElement('string');
      s.textContent = tag;
      arr.appendChild(s);
    }
    return arr;
  });

  setKey('Time Zone', () => {
    const el = doc.createElement('string');
    el.textContent = entry.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return el;
  });

  setKey('UUID', () => {
    const el = doc.createElement('string');
    el.textContent = entry.uuid.toUpperCase();
    return el;
  });

  const dictXml = serializePlistElement(rootDict, '');
  return `${PLIST_HEADER}\n${dictXml}\n</plist>\n`;
}

/**
 * Creates a brand-new Day One Classic / Journaley compatible JournalEntry with fresh XML.
 */
export function createNewEntry(overrides?: Partial<JournalEntry>): JournalEntry {
  const uuid = (overrides?.uuid ?? generateDoentryUuid()).toUpperCase();
  const now = formatIsoUtc(overrides?.creationDate ?? new Date());
  const timeZone =
    overrides?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

  const base: JournalEntry = {
    uuid,
    creationDate: now,
    entryText: overrides?.entryText ?? '',
    starred: overrides?.starred ?? false,
    tags: overrides?.tags ?? [],
    timeZone,
    location: overrides?.location,
    weather: overrides?.weather,
    fileName: overrides?.fileName ?? `${uuid}.doentry`,
    fileId: overrides?.fileId,
    modifiedTime: overrides?.modifiedTime ?? now,
    rawXml: '',
  };

  // Seed Creator metadata just like Day One / Journaley
  const creatorXml = `${PLIST_HEADER}
<dict>
\t<key>Creator</key>
\t<dict>
\t\t<key>Device Agent</key>
\t\t<string>Web Browser</string>
\t\t<key>Generation Date</key>
\t\t<date>${now}</date>
\t\t<key>Software Agent</key>
\t\t<string>Daylight Journal/1.0</string>
\t</dict>
</dict>
</plist>`;

  base.rawXml = creatorXml;
  base.rawXml = serializeDoentryXml(base);
  return base;
}

/**
 * Extracts a clean display title and body preview from a Day One entry's text.
 */
export function splitEntryTitleAndPreview(text: string): { title: string; preview: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { title: 'Untitled Entry', preview: '' };
  }

  const firstLine = lines[0].replace(/^#+\s*/, '');
  const rest = lines.slice(1).join(' ');
  return {
    title: firstLine.slice(0, 120),
    preview: rest.slice(0, 220),
  };
}
