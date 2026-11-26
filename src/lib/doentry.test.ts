import { describe, it, expect } from 'vitest';
import {
  createNewEntry,
  parseDoentryXml,
  serializeDoentryXml,
  splitEntryTitleAndPreview,
} from './doentry';
import { computeWritingStreak, countWords } from './dateUtils';
import { buildPersonHighlightReel } from './peopleMilestones';
import { DEFAULT_PEOPLE } from './db';

const SAMPLE_DOENTRY = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Activity</key>
\t<string>Walking</string>
\t<key>Creation Date</key>
\t<date>2018-11-22T15:42:10Z</date>
\t<key>Creator</key>
\t<dict>
\t\t<key>Device Agent</key>
\t\t<string>iPhone/iPhone10,3</string>
\t\t<key>Software Agent</key>
\t\t<string>Day One (iOS)/1.17</string>
\t</dict>
\t<key>Entry Text</key>
\t<string>Thanksgiving morning walk &amp; coffee!

Saw the frost on the trees &lt;3</string>
\t<key>Location</key>
\t<dict>
\t\t<key>Country</key>
\t\t<string>United States</string>
\t\t<key>Latitude</key>
\t\t<real>41.8781</real>
\t\t<key>Locality</key>
\t\t<string>Chicago</string>
\t\t<key>Longitude</key>
\t\t<real>-87.6298</real>
\t\t<key>Place Name</key>
\t\t<string>Lincoln Park</string>
\t</dict>
\t<key>Starred</key>
\t<true/>
\t<key>Tags</key>
\t<array>
\t\t<string>family</string>
\t\t<string>holidays</string>
\t</array>
\t<key>Time Zone</key>
\t<string>America/Chicago</string>
\t<key>UUID</key>
\t<string>A1B2C3D4E5F60718293A4B5C6D7E8F90</string>
\t<key>Weather</key>
\t<dict>
\t\t<key>Celsius</key>
\t\t<string>4</string>
\t\t<key>Description</key>
\t\t<string>Partly Cloudy</string>
\t\t<key>Fahrenheit</key>
\t\t<string>39</string>
\t</dict>
</dict>
</plist>
`;

describe('doentry XML parser and lossless serializer', () => {
  it('parses standard Day One / Journaley .doentry XML', () => {
    const entry = parseDoentryXml(SAMPLE_DOENTRY, {
      fileId: 'drive-file-1',
      fileName: 'A1B2C3D4E5F60718293A4B5C6D7E8F90.doentry',
    });

    expect(entry.uuid).toBe('A1B2C3D4E5F60718293A4B5C6D7E8F90');
    expect(entry.creationDate).toBe('2018-11-22T15:42:10Z');
    expect(entry.entryText).toBe('Thanksgiving morning walk & coffee!\n\nSaw the frost on the trees <3');
    expect(entry.starred).toBe(true);
    expect(entry.tags).toEqual(['family', 'holidays']);
    expect(entry.timeZone).toBe('America/Chicago');
    expect(entry.location?.locality).toBe('Chicago');
    expect(entry.location?.placeName).toBe('Lincoln Park');
    expect(entry.location?.latitude).toBe(41.8781);
    expect(entry.weather?.fahrenheit).toBe('39');
    expect(entry.weather?.description).toBe('Partly Cloudy');
  });

  it('preserves unknown metadata keys (Location, Weather, Creator, Activity) when saving edits', () => {
    const entry = parseDoentryXml(SAMPLE_DOENTRY, {
      fileName: 'A1B2C3D4E5F60718293A4B5C6D7E8F90.doentry',
    });

    const edited = {
      ...entry,
      entryText: 'Updated text with <xml> & "quotes" & emojis 🍂',
      starred: false,
      tags: ['family', 'gratitude'],
    };

    const updatedXml = serializeDoentryXml(edited);

    // Unknown keys remain preserved
    expect(updatedXml).toContain('<key>Activity</key>');
    expect(updatedXml).toContain('<string>Walking</string>');
    expect(updatedXml).toContain('<key>Location</key>');
    expect(updatedXml).toContain('<string>Lincoln Park</string>');
    expect(updatedXml).toContain('<key>Weather</key>');
    expect(updatedXml).toContain('<string>Partly Cloudy</string>');
    expect(updatedXml).toContain('<key>Creator</key>');
    expect(updatedXml).toContain('<string>Day One (iOS)/1.17</string>');

    // Re-parsing yields exact updated values
    const reparsed = parseDoentryXml(updatedXml, { fileName: edited.fileName });
    expect(reparsed.entryText).toBe('Updated text with <xml> & "quotes" & emojis 🍂');
    expect(reparsed.starred).toBe(false);
    expect(reparsed.tags).toEqual(['family', 'gratitude']);
    expect(reparsed.location?.placeName).toBe('Lincoln Park');
    expect(reparsed.weather?.fahrenheit).toBe('39');
  });

  it('creates valid brand-new .doentry files', () => {
    const fresh = createNewEntry({
      entryText: 'First entry in Daylight',
      starred: true,
      tags: ['personal'],
    });

    expect(fresh.uuid).toMatch(/^[A-F0-9]{32}$/);
    expect(fresh.fileName).toBe(`${fresh.uuid}.doentry`);
    const reparsed = parseDoentryXml(fresh.rawXml, { fileName: fresh.fileName });
    expect(reparsed.entryText).toBe('First entry in Daylight');
    expect(reparsed.starred).toBe(true);
    expect(reparsed.tags).toEqual(['personal']);
  });

  it('splits entry title and preview cleanly', () => {
    const res = splitEntryTitleAndPreview('# Morning Coffee\n\nWatched the sunrise from the porch.\nIt was quiet.');
    expect(res.title).toBe('Morning Coffee');
    expect(res.preview).toBe('Watched the sunrise from the porch. It was quiet.');
  });

  it('losslessly updates Location metadata while preserving coordinates', () => {
    const entry = parseDoentryXml(SAMPLE_DOENTRY, {
      fileName: 'A1B2C3D4E5F60718293A4B5C6D7E8F90.doentry',
    });

    const edited = {
      ...entry,
      location: {
        ...entry.location,
        placeName: 'Millennium Park',
      },
    };
    const xml = serializeDoentryXml(edited);
    const reparsed = parseDoentryXml(xml, { fileName: edited.fileName });
    expect(reparsed.location?.placeName).toBe('Millennium Park');
    expect(reparsed.location?.locality).toBe('Chicago');
    expect(reparsed.location?.latitude).toBe(41.8781);
    expect(reparsed.location?.longitude).toBe(-87.6298);
  });

  it('counts words accurately while ignoring pure markdown punctuation', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('## Morning Walk\n\n- Saw **three** cranes\n> Nice day!')).toBe(7);
  });

  it('computes consecutive-day writing streaks', () => {
    const ref = new Date(2026, 10, 22, 12, 0, 0); // Nov 22, 2026
    const e1 = createNewEntry({ creationDate: new Date(2026, 10, 22, 9, 0).toISOString() });
    const e2 = createNewEntry({ creationDate: new Date(2026, 10, 21, 9, 0).toISOString() });
    const e3 = createNewEntry({ creationDate: new Date(2026, 10, 20, 9, 0).toISOString() });
    const eGap = createNewEntry({ creationDate: new Date(2026, 10, 18, 9, 0).toISOString() });

    expect(computeWritingStreak([e1, e2, e3, eGap], ref)).toBe(3);
    // Yesterday still keeps streak alive if today has no entry yet
    expect(computeWritingStreak([e2, e3, eGap], ref)).toBe(2);
    // Gap breaks streak
    expect(computeWritingStreak([eGap], ref)).toBe(0);
  });

  it('detects partner and child milestones for Lucy and Cayden', () => {
    const lucy = DEFAULT_PEOPLE.find((p) => p.id === 'lucy')!;
    const cayden = DEFAULT_PEOPLE.find((p) => p.id === 'cayden')!;

    const eMet = createNewEntry({
      creationDate: '2019-04-12T18:00:00Z',
      entryText: 'First date with Lucy at a coffee shop downtown.',
    });
    const eEngaged = createNewEntry({
      creationDate: '2022-09-10T18:00:00Z',
      entryText: 'Proposed to Lucy on the hike and she said yes! Officially engaged!',
    });
    const eRoutine = createNewEntry({
      creationDate: '2023-03-01T18:00:00Z',
      entryText: 'Picked up groceries with Lucy after work.',
    });
    const eCayden8m = createNewEntry({
      creationDate: '2026-10-25T12:00:00Z',
      entryText: "Monday: It's Cayden's 8 month milestone today and he started crawling!",
    });

    const lucyReel = buildPersonHighlightReel([eMet, eEngaged, eRoutine, eCayden8m], lucy);
    expect(lucyReel.mentions).toHaveLength(3);
    expect(lucyReel.milestones.map((m) => m.entry.uuid)).toContain(eMet.uuid);
    expect(lucyReel.milestones.map((m) => m.entry.uuid)).toContain(eEngaged.uuid);
    expect(lucyReel.milestones.map((m) => m.entry.uuid)).not.toContain(eRoutine.uuid);
    expect(lucyReel.milestones.find((m) => m.entry.uuid === eEngaged.uuid)?.category).toBe(
      'Engagement'
    );

    const caydenReel = buildPersonHighlightReel([eMet, eEngaged, eRoutine, eCayden8m], cayden);
    expect(caydenReel.mentions).toHaveLength(1);
    expect(caydenReel.milestones).toHaveLength(1);
    expect(caydenReel.milestones[0].entry.uuid).toBe(eCayden8m.uuid);
  });
});
