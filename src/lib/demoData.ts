import type { JournalEntry, PhotoRecord } from '../types';
import { createNewEntry } from './doentry';

function isoOnDate(yearOffset: number, monthOffset: number, dayOffset: number, hour = 18): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearOffset);
  d.setMonth(d.getMonth() + monthOffset);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 25, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function createSamplePhotoBlob(title: string, c1: string, c2: string): Blob {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="750" fill="url(#sky)"/>
    <circle cx="920" cy="190" r="90" fill="#FEF08A" fill-opacity="0.85"/>
    <path d="M0 540 Q280 390 560 490 T1200 450 L1200 750 L0 750 Z" fill="#0F172A" fill-opacity="0.32"/>
    <path d="M0 610 Q380 480 740 570 T1200 540 L1200 750 L0 750 Z" fill="#0F172A" fill-opacity="0.52"/>
    <text x="64" y="690" fill="#FFFFFF" fill-opacity="0.9" font-family="system-ui, sans-serif" font-size="36" font-weight="600">${title}</text>
  </svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

export function buildDemoJournal(): { entries: JournalEntry[]; photos: PhotoRecord[] } {
  const photoEntry1 = createNewEntry({
    creationDate: isoOnDate(0, 0, 0, 9),
    entryText:
      'Morning coffee & setting up my new journal\n\nFinally moving my decade of .doentry files into a clean cross-platform app that works on both my Mac and my Pixel. Feels great to be able to search ten years of memories instantaneously and see On This Day entries again.',
    starred: true,
    tags: ['personal', 'projects'],
    location: { placeName: 'Home Desk', locality: 'Austin', country: 'United States' },
    weather: { fahrenheit: '64', celsius: '18', description: 'Clear Morning' },
  });

  const onThisDay1 = createNewEntry({
    creationDate: isoOnDate(1, 0, 0, 19),
    entryText:
      'Crisp evening walk around the neighborhood\n\nThe air turned properly chilly tonight. Stopped by the corner bakery for sourdough and spent an hour reading by the window. Grateful for slow evenings like this.',
    starred: true,
    tags: ['gratitude', 'daily'],
    location: { locality: 'Austin', country: 'United States' },
    weather: { fahrenheit: '52', celsius: '11', description: 'Crisp & Clear' },
  });

  const onThisDay2 = createNewEntry({
    creationDate: isoOnDate(3, 0, 0, 14),
    entryText:
      'Road trip through the hills\n\nDrove out past the lake before noon. Zero cell service for three hours, just winding roads, pine trees, and a thermos of hot tea. Need to remember to take more unplugged weekends.',
    starred: false,
    tags: ['travel', 'nature'],
    location: { placeName: 'Overlook Trail', locality: 'Hill Country', country: 'United States' },
    weather: { fahrenheit: '58', celsius: '14', description: 'Partly Cloudy' },
  });

  const onThisDay3 = createNewEntry({
    creationDate: isoOnDate(6, 0, 0, 21),
    entryText:
      'Reflections on switching from Day One to Journaley\n\nExported all my .doentry files into Google Drive today so I own my journal forever in plain XML plist files. Future me will thank present me for keeping an open format.',
    starred: true,
    tags: ['personal', 'reflection'],
    weather: { fahrenheit: '47', celsius: '8', description: 'Light Rain' },
  });

  const recent1 = createNewEntry({
    creationDate: isoOnDate(0, 0, -2, 20),
    entryText:
      'Dinner with old friends\n\nCaught up with Sam and Maya over ramen. Talked for three hours straight about books, travel plans for next spring, and how quickly the last five years flew by.',
    starred: false,
    tags: ['friends', 'food'],
    location: { placeName: 'Ramen Tatsu-Ya', locality: 'Austin', country: 'United States' },
  });

  const recent2 = createNewEntry({
    creationDate: isoOnDate(0, 0, -6, 8),
    entryText:
      'Early 5K run before work\n\nLegs felt heavy for the first mile, then found a steady rhythm along the river trail. Sunrise over the water made the 6:30 AM alarm completely worth it.',
    starred: false,
    tags: ['fitness', 'daily'],
  });

  const older1 = createNewEntry({
    creationDate: isoOnDate(0, -1, -3, 17),
    entryText:
      'Finished reading "Four Thousand Weeks"\n\nBest takeaway: you will never clear the entire to-do list, so choose what actually matters today and let the rest wait without guilt.',
    starred: true,
    tags: ['books', 'reflection'],
  });

  const entries = [
    photoEntry1,
    onThisDay1,
    onThisDay2,
    onThisDay3,
    recent1,
    recent2,
    older1,
  ].sort((a, b) => b.creationDate.localeCompare(a.creationDate));

  const photos: PhotoRecord[] = [
    {
      uuid: photoEntry1.uuid,
      fileName: `${photoEntry1.uuid}.svg`,
      mimeType: 'image/svg+xml',
      blob: createSamplePhotoBlob('Morning Light — Sample Journal Photo', '#38BDF8', '#1D4ED8'),
    },
    {
      uuid: onThisDay2.uuid,
      fileName: `${onThisDay2.uuid}.svg`,
      mimeType: 'image/svg+xml',
      blob: createSamplePhotoBlob('Overlook Trail — 3 Years Ago', '#F97316', '#7C3AED'),
    },
  ];

  return { entries, photos };
}
