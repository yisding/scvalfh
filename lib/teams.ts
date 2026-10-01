/**
 * The 16-team SCVAL membership registry.
 *
 * THIS is the league, not the feed. MaxPreps' De Anza standings table has SEVEN rows —
 * Wilcox is absent, not 0-0-0 (SPEC §3, DESIGN §12.1) — so every table is built from this
 * constant and left-joined against the feed.
 *
 * Division membership comes exclusively from the two official SCVAL PDFs (SPEC §3):
 *   De Anza  : https://scval.com/fallSports/26-27%20SCVAL%20FH%20DA%20Final.pdf
 *   El Camino: https://scval.com/fallSports/26-27%20SCVAL%20FH%20EC%20Final.pdf
 *
 * ids are MaxPreps GUIDs re-read from the captured league standings payloads (SPEC §2.1).
 * Slugs and 2-letter abbrs are OURS and are never derived by string munging (DESIGN §12.9).
 */

import type { Division, Team, TeamId, TeamSlug } from './types';

const MP = 'https://www.maxpreps.com';
const SI = 'https://www.si.com/high-school/stats/california/field-hockey';
const VNN = 'https://mmboltapi.azurewebsites.net/api/v2/events/calendar';

/** Relative luminance per WCAG 2.x, on a 6-digit hex without '#'. */
function relativeLuminance(hex: string): number {
  const v = hex.replace(/[^0-9a-f]/gi, '').padEnd(6, '0').slice(0, 6);
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ink for a monogram filled with `hex`, computed at build (DESIGN §12.4) — never eyeballed.
 * Picks whichever of the two site inks has the greater contrast on the fill.
 */
export function onPrimaryInk(hex: string): '#0e1116' | '#ffffff' {
  const l = relativeLuminance(hex);
  const dark = contrast(l, relativeLuminance('0e1116'));
  const light = contrast(l, relativeLuminance('ffffff'));
  return dark >= light ? '#0e1116' : '#ffffff';
}

interface Seed {
  id: TeamId;
  slug: TeamSlug;
  name: string;
  shortName: string;
  abbr: string;
  acronym: string;
  mascot: string;
  city: string;
  division: Division;
  dataCoverage: Team['dataCoverage'];
  /** hex without '#', from the standings payload's schoolColor1 / schoolColor2. */
  colors: [string, string];
  colorSource: Team['colors']['source'];
  maxprepsPath: string | null;
  aliases: string[];
  sbliveTeamId?: string;
  /**
   * si.com URL slug. Never guessed (SPEC §2.1 / §7.3). All 16 were harvested on 2026-09-29 from
   * live payloads: `query.organization.teamStandings[].team.webPath` on the two si.com league
   * standings pages, plus `opponent.team.webPath` on the Los Altos and Saratoga team pages
   * (Santa Clara 496839 is absent from both standings pages and came from Saratoga's).
   */
  sbliveSlug?: string;
  vnnSiteId?: string;
}

/**
 * Aliases cover: MaxPreps `schoolName`, the SCVAL PDF grid UPPERCASE forms, the SCVAL prose /
 * standings PDF forms, SBLive / si.com names, and the VNN ICS "X High School" forms (SPEC §2.3).
 */
const SEEDS: readonly Seed[] = [
  // ----- De Anza (official 8; MaxPreps has 7) -----
  {
    id: '1dc4836b-4daf-4573-b525-27b474bd5366',
    slug: 'st-ignatius',
    name: 'St. Ignatius College Preparatory',
    shortName: 'St Ignatius',
    abbr: 'SI',
    acronym: 'SICP',
    mascot: 'Wildcats',
    city: 'San Francisco',
    division: 'de-anza',
    dataCoverage: 'full',
    colors: ['CC0022', '034CB2'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-francisco/st-ignatius-college-preparatory-wildcats/field-hockey/',
    aliases: [
      'St. Ignatius College Preparatory', 'ST. IGNATIUS', 'Saint Ignatius', 'St. Ignatius',
      'St Ignatius', 'SICP', 'St. Ignatius College Prep', 'St. Ignatius Wildcats',
      'St. Ignatius College Preparatory High School',
    ],
    sbliveTeamId: '456831',
    sbliveSlug: '456831-st-ignatius-wildcats',
  },
  {
    id: 'de6d3780-e8f6-4a2a-93f2-b5d89499f9b0',
    slug: 'saint-francis',
    name: 'Saint Francis',
    shortName: 'St Francis',
    abbr: 'SF',
    acronym: 'SFHS',
    mascot: 'Lancers',
    city: 'Mountain View',
    division: 'de-anza',
    dataCoverage: 'full',
    colors: ['503604', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/mountain-view/saint-francis-lancers/field-hockey/',
    aliases: [
      'Saint Francis', 'ST. FRANCIS', 'St. Francis', 'St Francis', 'Saint Francis Lancers',
      'Saint Francis High School', 'Saint Francis (Mountain View)',
    ],
    sbliveTeamId: '457982',
    sbliveSlug: '457982-saint-francis-lancers',
  },
  {
    id: '0279f2de-d5ce-484d-b210-2286ded42058',
    slug: 'los-altos',
    name: 'Los Altos',
    shortName: 'Los Altos',
    abbr: 'LA',
    acronym: 'LAHS',
    mascot: 'Eagles',
    city: 'Los Altos',
    division: 'de-anza',
    dataCoverage: 'full',
    colors: ['034CB2', '454444'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/los-altos/los-altos-eagles/field-hockey/',
    aliases: ['Los Altos', 'LOS ALTOS', 'Los Altos Eagles', 'Los Altos High School'],
    sbliveTeamId: '458850',
    sbliveSlug: '458850-los-altos-eagles',
  },
  {
    id: '8a8c04d2-5606-44cf-9993-34db55474240',
    slug: 'valley-christian',
    name: 'Valley Christian',
    shortName: 'Valley Chr.',
    abbr: 'VC',
    acronym: 'VCHS',
    mascot: 'Warriors',
    city: 'San Jose',
    division: 'de-anza',
    dataCoverage: 'full',
    colors: ['022C66', '046DFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-jose/valley-christian-warriors/field-hockey/',
    aliases: [
      'Valley Christian', 'VALLEY CHRISTIAN', 'Valley Christian Warriors',
      'Valley Christian High School', 'Valley Christian (San Jose)',
    ],
    sbliveTeamId: '480709',
    sbliveSlug: '480709-valley-christian-warriors',
  },
  {
    id: 'a97c219c-2fbe-4fa4-9a0c-cc18502a8d24',
    slug: 'fremont',
    name: 'Fremont',
    shortName: 'Fremont',
    abbr: 'FR',
    acronym: 'FHS',
    mascot: 'Firebirds',
    city: 'Sunnyvale',
    division: 'de-anza',
    dataCoverage: 'full',
    colors: ['CC0022', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/sunnyvale/fremont-firebirds/field-hockey/',
    aliases: [
      'Fremont', 'FREMONT', 'Fremont Firebirds', 'Fremont High School', 'Fremont (Sunnyvale)',
    ],
    sbliveTeamId: '496836',
    sbliveSlug: '496836-fremont-firebirds',
  },
  {
    id: '97ffffbe-54ba-4c25-86bb-41332627f64e',
    slug: 'cupertino',
    name: 'Cupertino',
    shortName: 'Cupertino',
    abbr: 'CU',
    acronym: 'CHS',
    mascot: 'Pioneers',
    city: 'Cupertino',
    division: 'de-anza',
    dataCoverage: 'full',
    colors: ['CC0022', '454444'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/cupertino/cupertino-pioneers/field-hockey/',
    aliases: ['Cupertino', 'CUPERTINO', 'Cupertino Pioneers', 'Cupertino High School'],
    sbliveTeamId: '458665',
    sbliveSlug: '458665-cupertino-pioneers',
  },
  {
    id: '738a2432-7acb-4ad6-b041-115ec0f331c2',
    slug: 'homestead',
    name: 'Homestead',
    shortName: 'Homestead',
    abbr: 'HM',
    acronym: 'HHS',
    mascot: 'Mustangs',
    city: 'Cupertino',
    division: 'de-anza',
    dataCoverage: 'full',
    colors: ['00824B', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/cupertino/homestead-mustangs/field-hockey/',
    aliases: ['Homestead', 'HOMESTEAD', 'Homestead Mustangs', 'Homestead High School'],
    sbliveTeamId: '458667',
    sbliveSlug: '458667-homestead-mustangs',
  },
  {
    // In the official De Anza grid (e.g. "WILCOX @ VALLEY CHRISTIAN", Wed Sep 9) but absent
    // from MaxPreps' standings AND from every captured payload, so no GUID exists yet.
    // Stable placeholder id; dataCoverage 'none' (SPEC §3.2, ADDENDUM §4).
    id: 'wilcox',
    slug: 'wilcox',
    name: 'Wilcox',
    shortName: 'Wilcox',
    abbr: 'WX',
    acronym: 'WHS',
    mascot: 'Chargers',
    city: 'Santa Clara',
    division: 'de-anza',
    dataCoverage: 'none',
    // No upstream row exists; a neutral placeholder, explicitly flagged, beats an invented hue.
    colors: ['454444', 'FFFFFF'],
    colorSource: 'placeholder',
    maxprepsPath: '/ca/santa-clara/wilcox-chargers/field-hockey/',
    aliases: [
      'Wilcox', 'WILCOX', 'Wilcox Chargers', 'Wilcox High School', 'Adrian Wilcox',
      'Adrian Wilcox High School',
    ],
    sbliveTeamId: '485528',
    sbliveSlug: '485528-wilcox-chargers',
  },

  // ----- El Camino (official 8; MaxPreps 8) -----
  {
    id: '0f63870a-34f3-4d5b-9dbf-653c8410f969',
    slug: 'mitty',
    name: 'Archbishop Mitty',
    shortName: 'Mitty',
    abbr: 'MI',
    acronym: 'AMHS',
    mascot: 'Monarchs',
    city: 'San Jose',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['222222', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-jose/archbishop-mitty-monarchs/field-hockey/',
    aliases: [
      'Archbishop Mitty', 'MITTY', 'Mitty', 'Archbishop Mitty Monarchs',
      'Archbishop Mitty High School', 'Mitty High School',
    ],
    sbliveTeamId: '464806',
    sbliveSlug: '464806-archbishop-mitty-monarchs',
  },
  {
    id: 'bdb0b593-ef7f-4c69-8c2a-e0a48c934ca7',
    slug: 'los-gatos',
    name: 'Los Gatos',
    shortName: 'Los Gatos',
    abbr: 'LG',
    acronym: 'LGHS',
    mascot: 'Wildcats',
    city: 'Los Gatos',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['D5350B', '222222'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/los-gatos/los-gatos-wildcats/field-hockey/',
    aliases: ['Los Gatos', 'LOS GATOS', 'Los Gatos Wildcats', 'Los Gatos High School'],
    sbliveTeamId: '458802',
    sbliveSlug: '458802-los-gatos-wildcats',
    vnnSiteId: '2634860',
  },
  {
    id: 'a38a628c-c65f-487f-a65e-7264b6804ce0',
    slug: 'palo-alto',
    name: 'Palo Alto',
    shortName: 'Palo Alto',
    abbr: 'PA',
    acronym: 'PAHS',
    mascot: 'Vikings',
    city: 'Palo Alto',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['005B34', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/palo-alto/palo-alto-vikings/field-hockey/',
    aliases: [
      'Palo Alto', 'PALO ALTO', 'Paly', 'Palo Alto Vikings', 'Palo Alto High School',
    ],
    sbliveTeamId: '480707',
    sbliveSlug: '480707-palo-alto-vikings',
    vnnSiteId: '2635290',
  },
  {
    id: 'e1db3a4f-3bcf-4281-a574-d313212296a1',
    slug: 'presentation',
    name: 'Presentation',
    shortName: 'Presentation',
    abbr: 'PR',
    acronym: 'PHS',
    mascot: 'Panthers',
    city: 'San Jose',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['034CB2', 'C8880A'],
    colorSource: 'maxpreps-standings',
    // NB: the HTML schedule page under this path serves LOS GATOS data (SPEC §2.1, verdict 30).
    // We only ever read this team through the API, keyed on the GUID.
    maxprepsPath: '/ca/san-jose/presentation-panthers/field-hockey/',
    aliases: [
      'Presentation', 'PRESENTATION', 'Presentation Panthers', 'Presentation High School',
      // The 2025-26 all-league PDF writes "Presentation HS" in two places.
      'Presentation HS',
    ],
    sbliveTeamId: '457986',
    sbliveSlug: '457986-presentation-panthers',
  },
  {
    id: '17fad4fb-c82b-4b5a-8a31-3ce13c0ede13',
    slug: 'santa-clara',
    name: 'Santa Clara',
    shortName: 'Santa Clara',
    abbr: 'SC',
    acronym: 'SCHS',
    mascot: 'Bruins',
    city: 'Santa Clara',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['034CB2', 'FFC005'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/santa-clara/santa-clara-bruins/field-hockey/',
    aliases: [
      'Santa Clara', 'SANTA CLARA', 'Santa Clara Bruins', 'Santa Clara High School',
    ],
    sbliveTeamId: '496839',
    sbliveSlug: '496839-santa-clara-bruins',
  },
  {
    id: '12a470ab-e17d-4e5a-b74b-055d1f46d46b',
    slug: 'saratoga',
    name: 'Saratoga',
    shortName: 'Saratoga',
    // 'SG', not 'SA' or 'SC': the one abbr collision that needed resolving (DESIGN §12.9).
    abbr: 'SG',
    acronym: 'SHS',
    mascot: 'Falcons',
    city: 'Saratoga',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['CC0022', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/saratoga/saratoga-falcons/field-hockey/',
    aliases: ['Saratoga', 'SARATOGA', 'Saratoga Falcons', 'Saratoga High School'],
    sbliveTeamId: '458805',
    sbliveSlug: '458805-saratoga-falcons',
  },
  {
    id: 'd7c7f7a1-06be-44fb-a4a2-64599519aa4c',
    slug: 'lynbrook',
    name: 'Lynbrook',
    shortName: 'Lynbrook',
    abbr: 'LY',
    acronym: 'LHS',
    mascot: 'Vikings',
    city: 'San Jose',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['022C66', 'FFFFFF'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/san-jose/lynbrook-vikings/field-hockey/',
    aliases: ['Lynbrook', 'LYNBROOK', 'Lynbrook Vikings', 'Lynbrook High School'],
    sbliveTeamId: '458669',
    sbliveSlug: '458669-lynbrook-vikings',
  },
  {
    id: '405614ad-a015-4270-b527-18e899c90824',
    slug: 'monta-vista',
    name: 'Monta Vista',
    shortName: 'Monta Vista',
    abbr: 'MV',
    acronym: 'MVHS',
    mascot: 'Matadors',
    city: 'Cupertino',
    division: 'el-camino',
    dataCoverage: 'full',
    colors: ['754ACC', 'C8880A'],
    colorSource: 'maxpreps-standings',
    maxprepsPath: '/ca/cupertino/monta-vista-matadors/field-hockey/',
    aliases: ['Monta Vista', 'MONTA VISTA', 'Monta Vista Matadors', 'Monta Vista High School'],
    sbliveTeamId: '458672',
    sbliveSlug: '458672-monta-vista-matadors',
  },
];

function toTeam(s: Seed): Team {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    shortName: s.shortName,
    abbr: s.abbr,
    acronym: s.acronym,
    mascot: s.mascot,
    city: s.city,
    aliases: s.aliases,
    division: s.division,
    isScvalMember: true,
    dataCoverage: s.dataCoverage,
    colors: {
      primary: s.colors[0],
      secondary: s.colors[1],
      onPrimary: onPrimaryInk(s.colors[0]),
      source: s.colorSource,
    },
    // The mascot gif is deliberately not read: no hotlinking (DESIGN §12.4).
    mascotUrl: null,
    external: {
      maxprepsTeamId: s.id,
      maxprepsTeamUrl: s.maxprepsPath ? MP + s.maxprepsPath : null,
      maxprepsScheduleUrl: s.maxprepsPath ? `${MP + s.maxprepsPath}schedule/` : null,
      ...(s.sbliveTeamId ? { sbliveTeamId: s.sbliveTeamId } : {}),
      ...(s.sbliveSlug ? { sbliveGamesUrl: `${SI}/teams/${s.sbliveSlug}/games` } : {}),
      ...(s.vnnSiteId
        ? { vnnSiteId: s.vnnSiteId, vnnIcsUrl: `${VNN}/${s.vnnSiteId}/0/calendar.ics` }
        : {}),
    },
  };
}

/** The registry, in official-PDF order: De Anza 8 then El Camino 8. */
export const TEAMS: readonly Team[] = SEEDS.map(toTeam);

/** Teams whose games MaxPreps actually publishes — the 15 schedule requests (SPEC §5.1). */
export const FETCHABLE_TEAMS: readonly Team[] = TEAMS.filter(
  (t) => t.dataCoverage !== 'none',
);

// ---------- build-time asserts ----------

function assertRegistry(): void {
  const fail = (m: string): never => {
    throw new Error(`lib/teams.ts: ${m}`);
  };
  if (TEAMS.length !== 16) fail(`expected 16 teams, got ${TEAMS.length}`);
  const columns: Array<[string, string[]]> = [
    ['id', TEAMS.map((t) => t.id)],
    ['slug', TEAMS.map((t) => t.slug as string)],
    ['acronym', TEAMS.map((t) => t.acronym)],
    ['abbr', TEAMS.map((t) => t.abbr)],
  ];
  for (const [label, values] of columns) {
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    if (dupes.length) fail(`duplicate ${label}: ${[...new Set(dupes)].join(', ')}`);
  }
  for (const d of ['de-anza', 'el-camino'] as const) {
    const n = TEAMS.filter((t) => t.division === d).length;
    // Official SCVAL alignment is 8 + 8 (SPEC §3).
    if (n !== 8) fail(`${d} has ${n} teams, expected 8`);
  }
  if (FETCHABLE_TEAMS.length !== 15) {
    fail(`expected 15 fetchable teams, got ${FETCHABLE_TEAMS.length}`);
  }
}
assertRegistry();

// ---------- lookups ----------

/** Case-, punctuation- and "High School"-insensitive key. */
export function normalizeTeamKey(input: string): string {
  const flat = input.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return flat.endsWith('highschool') ? flat.slice(0, -'highschool'.length) : flat;
}

const BY_ID = new Map<string, Team>(TEAMS.map((t) => [t.id, t]));
const BY_SLUG = new Map<string, Team>(TEAMS.map((t) => [t.slug, t]));

const BY_KEY = new Map<string, Team>();
for (const t of TEAMS) {
  for (const raw of [t.id, t.slug, t.name, t.shortName, t.acronym, ...t.aliases]) {
    const key = normalizeTeamKey(raw);
    if (!key) continue;
    const prior = BY_KEY.get(key);
    if (prior && prior.id !== t.id) {
      throw new Error(
        `lib/teams.ts: alias "${raw}" (${key}) maps to both ${prior.slug} and ${t.slug}`,
      );
    }
    BY_KEY.set(key, t);
  }
}

export function getTeamById(id: TeamId): Team | undefined {
  return BY_ID.get(id);
}

export function getTeamBySlug(slug: string): Team | undefined {
  return BY_SLUG.get(slug);
}

/** Resolve a MaxPreps GUID, our slug, an acronym or ANY known spelling to a Team. */
export function resolveTeam(nameOrId: string | null | undefined): Team | undefined {
  if (!nameOrId) return undefined;
  return BY_ID.get(nameOrId) ?? BY_KEY.get(normalizeTeamKey(nameOrId));
}

export function isScvalTeamId(id: string | null | undefined): boolean {
  return !!id && BY_ID.has(id);
}

export function teamsInDivision(division: Division): readonly Team[] {
  return TEAMS.filter((t) => t.division === division);
}
