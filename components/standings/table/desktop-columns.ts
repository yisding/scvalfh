/**
 * The desktop standings table's columns (DesktopStandingsTable.tsx): their widths, their order and
 * their heads.
 */

/** Extra columns read from the standing context: GP (both variants), LEFT and MAX (desktop). */
export type StandingsColumn = 'gp' | 'left' | 'max';

/*
 * The desktop table's column widths, lg tier then xl (brief §4.14). `.sx-table-wide` is
 * `table-layout: fixed`, so these are the ONLY widths the browser uses: each one includes the
 * cell's own padding (6px a side at lg, 10px from 1280, and 20px at the card's two inner edges),
 * and Team takes whatever is left — about 170px of the 976px table at 1024, 200px at 1280.
 * Every head fits its column at 12px sans caps: "LEAGUE" ≈ 46px and "OVERALL" ≈ 55px are why
 * those two columns are wider than their numerals need.
 */
export const COL = {
  place: 'w-[3rem] xl:w-[3.5rem]', // #
  team: '', // Team (auto)
  gp: 'w-[3.25rem] xl:w-[3.75rem]', // GP: "12/16" is five 13px mono glyphs
  pts: 'w-[3rem] xl:w-[3.5rem]', // PTS
  left: 'w-[3rem] xl:w-[3.5rem]', // LEFT
  max: 'w-[3rem] xl:w-[3.5rem]', // MAX
  league: 'w-[3.75rem] xl:w-[4.5rem]', // League (a † hangs in the right padding: LeagueRecord)
  pct: 'w-[3.25rem] xl:w-[4rem]', // Pct
  overall: 'w-[4.25rem] xl:w-[5rem]', // Overall
  gf: 'w-[2.5rem] xl:w-[3rem]', // GF
  ga: 'w-[2.5rem] xl:w-[3rem]', // GA
  gd: 'w-[6.75rem] xl:w-[7.5rem]', // GD: 64 track + 4 + 28 numeral
  stk: 'w-[2.75rem] xl:w-[3.25rem]', // Stk
  home: 'w-[3.25rem] xl:w-[4rem]', // Home
  away: 'w-[3.25rem] xl:w-[4rem]', // Away
  neut: 'w-[3.25rem] xl:w-[4rem]', // Neut
  l5: 'w-[8.875rem] xl:w-[9.25rem]', // Last 5: five 20px chips, 4px apart, right-aligned
} as const;
export type DesktopCol = keyof typeof COL;

/**
 * The desktop columns in order. With GP / LEFT / MAX on, the Home / Away / Neutral splits go (the
 * team page has them): three 3rem columns in, three 3.25rem out, so Team keeps ≈170px at 1024.
 */
export function desktopCols(gp: boolean, left: boolean, max: boolean): DesktopCol[] {
  const extended = gp || left || max;
  return [
    'place',
    'team',
    ...(gp ? (['gp'] as const) : []),
    'pts',
    ...(left ? (['left'] as const) : []),
    ...(max ? (['max'] as const) : []),
    'league',
    'pct',
    'overall',
    'gf',
    'ga',
    'gd',
    'stk',
    ...(extended ? [] : (['home', 'away', 'neut'] as const)),
    'l5',
  ];
}

/**
 * Each desktop head: `long` (when set) is what a screen reader hears with every cell of the column
 * (`Abbr`). GP, Left and Max carry a `title` instead and stay plain words. The team head is the
 * table's own name (`tableName`), filled in per render: see the phone head (PhoneStandingsTable.tsx).
 */
export const DESKTOP_HEAD: Record<DesktopCol, { label: string; right: boolean; title?: string; long?: string }> = {
  place: { label: '#', right: false },
  team: { label: 'Team', right: false },
  gp: { label: 'GP', right: true, title: 'League games counted of those scheduled' },
  pts: { label: 'Pts', right: true, long: 'Points' },
  left: { label: 'Left', right: true, title: 'League games with no counted result yet' },
  max: { label: 'Max', right: true, title: 'The most points still reachable' },
  league: { label: 'League', right: true },
  pct: { label: 'Pct', right: true, long: 'Win percentage' },
  overall: { label: 'Overall', right: true },
  gf: { label: 'GF', right: true, long: 'Goals for' },
  ga: { label: 'GA', right: true, long: 'Goals against' },
  gd: { label: 'GD', right: true, long: 'Goal difference' },
  stk: { label: 'Stk', right: true, long: 'Streak' },
  home: { label: 'Home', right: true },
  away: { label: 'Away', right: true },
  neut: { label: 'Neut', right: true, long: 'Neutral site' },
  // Right-aligned, head and strip: a team with fewer than five results then ends on its NEWEST
  // chip at the same x as every other row.
  l5: { label: 'Last 5', right: true },
};
