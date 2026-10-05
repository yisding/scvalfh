/**
 * Team search (SPEC §9.1-§9.2): a pure, zero-network matcher over a pre-serialized 49-team index.
 *
 * Client-safe: its one runtime import is lib/format's `plural`, itself client-safe. Result order is
 * the index order (`LEAGUES` order, then registry order, as `getTeamSearchIndex()` builds it) within
 * a score. A league or division label NEVER
 * matches a team: those are separate group entries ("Divisions and leagues").
 */

import { plural } from './format';
import type { SectionConfig } from './leagues';
import type { TeamColors } from './types';

export interface TeamSearchEntry {
  kind: 'team';
  slug: string; name: string; shortName: string; abbr: string;
  city: string; mascot: string;
  leagueId: string; leagueShort: string; sectionShort: SectionConfig['shortName'];
  /** null for single-division leagues. */
  divisionLabel: string | null;
  colors: Pick<TeamColors, 'primary' | 'onPrimary'>;
  /** Normalized keys. NEVER league or division labels. No acronyms, no grid codes. */
  keys: { whole: string[]; nameTokens: string[]; cityTokens: string[]; mascotTokens: string[] };
}
export interface GroupSearchEntry {
  kind: 'league' | 'division';
  id: string;
  label: string;              // 'Santa Teresa' | 'MCAL'
  detail: string;             // 'BVAL division · 6 teams' | 'Marin County Athletic League · NCS · 9 teams'
  href: string;               // '/standings/bval#santa-teresa' | '/standings/mcal'
  keys: string[];             // normalized: label, searchAliases, league full name
}
export interface NotCoveredEntry { kind: 'not-covered'; name: string; reason: string; keys: string[] }
export interface SearchIndex { teams: TeamSearchEntry[]; groups: GroupSearchEntry[]; notCovered: NotCoveredEntry[] }

export interface SearchInputTeam {
  slug: string; name: string; shortName: string; abbr: string; city: string; mascot: string;
  aliases: string[]; leagueId: string; division: string;
  colors: Pick<TeamColors, 'primary' | 'onPrimary'>;
}

export interface SearchResult {
  teams: Array<{ entry: TeamSearchEntry; score: number; why: 'name' | 'alias' | 'abbr' | 'city' | 'mascot' }>;
  groups: GroupSearchEntry[];
  notCovered: NotCoveredEntry[];
}

const DROPPABLE = new Set(['high', 'school', 'hs', 'the']);

/** Tokens of `s` (§9.2): NFKD, diacritics stripped, lowercase, & → and, punctuation → space, st/st. → saint. */
function tokensOf(s: string): string[] {
  const words = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w === 'st' ? 'saint' : w));
  const kept = words.filter((w) => !DROPPABLE.has(w));
  return kept.length > 0 ? kept : words;
}

/** `compact` = the tokens joined with no separator; `tokens` as above. */
export function normalizeQuery(q: string): { compact: string; tokens: string[] } {
  const tokens = tokensOf(q);
  return { compact: tokens.join(''), tokens };
}

const compactOf = (s: string): string => normalizeQuery(s).compact;

function unique(xs: Iterable<string>): string[] {
  return [...new Set(xs)].filter(Boolean);
}

export function buildSearchIndex(
  teams: readonly SearchInputTeam[],
  leagues: ReadonlyArray<{ id: string; shortName: string; name: string; sectionShort: SectionConfig['shortName'];
    divisions: ReadonlyArray<{ id: string; label: string; heading: string | null; searchAliases: readonly string[]; teamCount: number }> }>,
  notCovered: ReadonlyArray<{ name: string; keys: readonly string[]; reason: string }>,
): SearchIndex {
  const leagueById = new Map(leagues.map((l) => [l.id, l]));
  const out: TeamSearchEntry[] = [];
  // Index order: LEAGUES order, then the caller's (registry) order within a league.
  for (const league of leagues) {
    for (const t of teams) {
      if (t.leagueId !== league.id) continue;
      const division = league.divisions.find((d) => d.id === t.division);
      const spellings = [t.name, t.shortName, ...t.aliases];
      out.push({
        kind: 'team',
        slug: t.slug, name: t.name, shortName: t.shortName, abbr: t.abbr,
        city: t.city, mascot: t.mascot,
        leagueId: league.id, leagueShort: league.shortName, sectionShort: league.sectionShort,
        divisionLabel: division?.heading ?? null,
        colors: { primary: t.colors.primary, onPrimary: t.colors.onPrimary },
        keys: {
          whole: unique(spellings.map(compactOf)),
          nameTokens: unique(spellings.flatMap(tokensOf)),
          cityTokens: unique(tokensOf(t.city)),
          mascotTokens: unique(tokensOf(t.mascot)),
        },
      });
    }
  }
  for (const t of teams) {
    if (!leagueById.has(t.leagueId)) throw new Error(`lib/search.ts: team ${t.slug} has unknown league ${t.leagueId}`);
  }

  const groups: GroupSearchEntry[] = [];
  for (const league of leagues) {
    const teamCount = league.divisions.reduce((n, d) => n + d.teamCount, 0);
    const single = league.divisions.length === 1;
    const leagueKeys = [league.shortName, league.name];
    // A single-division league's division IS the league: its label and aliases find the league group.
    if (single) for (const d of league.divisions) leagueKeys.push(d.label, ...d.searchAliases);
    groups.push({
      kind: 'league',
      id: league.id,
      label: league.shortName,
      detail: `${league.name} · ${league.sectionShort} · ${plural(teamCount, 'team')}`,
      href: `/standings/${league.id}`,
      keys: unique(leagueKeys.map((k) => tokensOf(k).join(' '))),
    });
    if (single) continue;
    for (const d of league.divisions) {
      const label = d.heading ?? d.label;
      groups.push({
        kind: 'division',
        id: d.id,
        label,
        detail: `${league.shortName} division · ${plural(d.teamCount, 'team')}`,
        href: `/standings/${league.id}#${d.id}`,
        keys: unique([label, ...d.searchAliases].map((k) => tokensOf(k).join(' '))),
      });
    }
  }

  return {
    teams: out,
    groups,
    notCovered: notCovered.map((n) => ({
      kind: 'not-covered',
      name: n.name,
      reason: n.reason,
      keys: unique([n.name, ...n.keys].map(compactOf)),
    })),
  };
}

/** Every query token is a prefix of a DISTINCT candidate token (bipartite match; tiny sizes). */
function prefixesOfDistinct(query: readonly string[], candidates: readonly string[]): boolean {
  const used = new Array<boolean>(candidates.length).fill(false);
  const place = (i: number): boolean => {
    if (i === query.length) return true;
    for (let j = 0; j < candidates.length; j++) {
      if (used[j] || !candidates[j].startsWith(query[i])) continue;
      used[j] = true;
      if (place(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return place(0);
}

type Why = SearchResult['teams'][number]['why'];

function scoreTeam(e: TeamSearchEntry, raw: string, q: { compact: string; tokens: string[] }): { score: number; why: Why } | null {
  const nameWhole = unique([e.name, e.shortName].map(compactOf));
  const nameTokens = unique([e.name, e.shortName].flatMap(tokensOf));
  // 100: the compact query equals a whole key.
  if (e.keys.whole.includes(q.compact)) return { score: 100, why: nameWhole.includes(q.compact) ? 'name' : 'alias' };
  // 90: the RAW trimmed query is two letters and equals the abbr (before 'st' → 'saint').
  if (/^[a-z]{2}$/i.test(raw) && raw.toUpperCase() === e.abbr.toUpperCase()) return { score: 90, why: 'abbr' };
  // 80: a whole key starts with the compact query (≥ 3 characters).
  if (q.compact.length >= 3 && e.keys.whole.some((k) => k.startsWith(q.compact))) {
    return { score: 80, why: nameWhole.some((k) => k.startsWith(q.compact)) ? 'name' : 'alias' };
  }
  // 70: every query token is a prefix of a distinct name token.
  if (prefixesOfDistinct(q.tokens, e.keys.nameTokens)) {
    return { score: 70, why: prefixesOfDistinct(q.tokens, nameTokens) ? 'name' : 'alias' };
  }
  // 40: every query token (≥ 3 characters each) is a prefix of a city token.
  if (q.tokens.every((t) => t.length >= 3 && e.keys.cityTokens.some((c) => c.startsWith(t)))) return { score: 40, why: 'city' };
  // 30: every query token equals a mascot token, plural-insensitive.
  if (q.tokens.every((t) => e.keys.mascotTokens.some((m) => m === t || m === `${t}s` || `${m}s` === t))) {
    return { score: 30, why: 'mascot' };
  }
  return null;
}

export function searchTeams(index: SearchIndex, query: string, opts?: { limit?: number }): SearchResult {
  const raw = query.trim();
  const q = normalizeQuery(raw);
  // A 1-character query ('&' normalizes to 'and') and a compact form under 2 characters return nothing.
  if (raw.length < 2 || q.compact.length < 2) return { teams: [], groups: [], notCovered: [] };

  const scored: SearchResult['teams'] = [];
  for (const entry of index.teams) {
    const hit = scoreTeam(entry, raw, q);
    if (hit) scored.push({ entry, score: hit.score, why: hit.why });
  }
  // Array.prototype.sort is stable: equal scores keep index order.
  scored.sort((a, b) => b.score - a.score);
  const limit = opts?.limit;
  const teams = limit === undefined ? scored : scored.slice(0, Math.max(0, limit));

  const groups = q.compact.length >= 3
    ? index.groups.filter((g) => g.keys.some((k) => prefixesOfDistinct(q.tokens, k.split(' '))))
    : [];
  const notCovered = index.notCovered.filter((n) => n.keys.includes(q.compact));
  return { teams, groups, notCovered };
}
