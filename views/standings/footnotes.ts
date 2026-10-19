/**
 * The page-level footnotes under a league's standings (SPEC §10.3): the rules footnote (points,
 * then the tiebreak chain in words with its citations), the uneven-games footnote and the
 * co-leaders line, each worded from the league's config (lib/config/leagues); and each division's
 * comparison with MaxPreps' table as the Notes block lists it (`mismatchItems`, DivisionView.noteItems).
 */

import { getLeague } from '@/lib/config/leagues';
import { unevenGamesSentence } from '@/lib/engine/standings';
import { ordinal } from '@/lib/format/numbers';
import type { LeagueId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { Standing, TiebreakStage } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';

import type { FlagLine, MismatchItem, MismatchNote, StandingsRowData } from './types';

/** `3-1-0`: the league's points for a win, a tie and a loss, from config (never typed into copy). */
export function pointsWords(league: LeagueConfig): string {
  const { win, tie, loss } = league.rules.points;
  return `${win}-${tie}-${loss}`;
}


const STAGE_WORDS: Readonly<Record<TiebreakStage, string>> = {
  points: 'points',
  'head-to-head': 'head-to-head',
  'division-wins': 'division wins',
  'h2h-goals-against': 'fewest goals given up between the tied teams',
  'h2h-goal-diff': 'head-to-head goal differential',
  'division-goals-against': 'fewest goals allowed in division play',
  'record-vs-higher-placed': 'record against each higher-placed team',
  'record-vs-lower-placed': 'record against each lower-placed team',
  'h2h-win-pct': 'head-to-head winning percentage',
  'record-above-tie': 'record against the teams above the tie',
  'draw-number': 'spring draw numbers',
  'ccs-points': 'the CCS-points step, then a coin flip or blind draw',
  'coin-flip': 'a coin flip',
  'no-rule': 'no tiebreak',
  'play-in': 'a play-in',
};

function chainWords(chain: readonly TiebreakStage[]): string {
  return chain.map((stage) => STAGE_WORDS[stage]).join(', then ');
}

/**
 * The stage citations, compacted: the trailing parenthetical dropped and a shared document named
 * once (`Article VI §3, §4, §5, §6, §7`; `MCAL Tie-Breaking Criteria (rev. 3/26) step 1, step 2`).
 */
function chainCitations(league: LeagueConfig, stages: readonly TiebreakStage[]): string {
  const bases: string[] = [];
  for (const stage of stages) {
    const text = league.rules.citations.stages[stage];
    if (!text) continue;
    const base = text.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '').trim();
    if (/§|\bstep\b/.test(base) && !bases.includes(base)) bases.push(base);
  }
  const parts = bases.map((b) => b.match(/^(.*?)\s((?:§|step )\S+)$/));
  if (parts.length > 0 && parts.every((p) => p !== null)) {
    const prefixes = new Set(parts.map((p) => p![1]));
    if (prefixes.size === 1) return `${parts[0]![1]} ${parts.map((p) => p![2]).join(', ')}`;
  }
  return bases.join('; ');
}

/**
 * `PTS: <citations.points>. Ties: <chain in words> (<citations>).` — the rules footnote under a
 * league's last table (SPEC §10.3). A league with chains by points-bucket (PCAL) names each.
 */
export function rulesFootnote(leagueId: LeagueId): string {
  const league = getLeague(leagueId);
  const { tiebreaks, citations } = league.rules;
  const byStart = Object.entries(tiebreaks.byBucketStart ?? {})
    .filter((entry): entry is [string, readonly TiebreakStage[]] => entry[1] !== undefined)
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  let ties: string;
  let stages: TiebreakStage[];
  if (byStart.length === 0) {
    ties = chainWords(tiebreaks.default);
    stages = [...tiebreaks.default];
  } else {
    const last = Number(byStart[byStart.length - 1][0]);
    ties = [
      ...byStart.map(([start, chain]) => `for ${ordinal(Number(start))}, ${chainWords(chain)}`),
      `below ${ordinal(last)}, ${chainWords(tiebreaks.default)}`,
    ].join('; ');
    stages = [...byStart.flatMap(([, chain]) => chain), ...tiebreaks.default];
  }
  const cites = chainCitations(league, stages);
  return `PTS: ${citations.points}. Ties: ${ties}${cites ? ` (${cites})` : ''}.`;
}

/** The uneven-GP footnote's last sentence: whose order the table is, by `rules.orderScope`. */
function unevenOrderSentence(league: LeagueConfig): string {
  switch (league.rules.orderScope) {
    case 'table':
      return `The order is points, as ${league.shortName} rules require.`;
    case 'title':
      return `The order is points, which ${league.shortName} uses to decide its title.`;
    case 'site':
      // Never "rules require": no Southern California league publishes a points rule (copy-rules).
      return `The order is this site’s ${pointsWords(league)} points; no ${league.shortName} rule orders the table.`;
  }
}

/**
 * The uneven-GP footnote (SPEC §10.3), or null when every team has played within one game of the
 * others. MCAL adds its incomplete-schedule rule; a league whose points decide only its title (EAL)
 * does not say its rules require the order, and a 'site' league says the order is the site's. A league
 * with no fixed schedule (`scheduled` null: the Sunset) has no LEFT or MAX column, so its footnote
 * explains neither; its first sentence is lib/engine/standings/uneven.ts unevenGamesSentence's no-"of N" variant.
 */
export function unevenGpFootnote(
  leagueId: LeagueId,
  spread: { min: number; max: number; scheduled: number | null },
): string | null {
  const games = unevenGamesSentence(leagueId, spread);
  if (games === null) return null;
  const league = getLeague(leagueId);
  const columns =
    spread.scheduled === null
      ? ''
      : ' LEFT is league games with no counted result yet — still to play, or played and not reported. MAX is the most points a team could reach if it won all of them.';
  const base = `${games}${columns} ${unevenOrderSentence(league)}`;
  const incomplete = league.rules.citations.incomplete;
  return incomplete
    ? `${base} If the season ends with games unplayed, ${incomplete}; we will show that order then.`
    : base;
}

/** `Level on points at the top: Leigh & Branham` — the co-leaders line (label per SPEC §5.10). */
export function coLeadersLine(coLeaders: { label: string; teams: readonly Pick<Team, 'shortName'>[] } | null): string | null {
  if (!coLeaders || coLeaders.teams.length < 2) return null;
  return `${coLeaders.label}: ${coLeaders.teams.map((t) => t.shortName).join(' & ')}.`;
}

// ---------------------------------------------------------------- the comparison with MaxPreps' table

/** lib/engine/standings/maxpreps-crosscheck.ts `buildCrossCheck` field names: the place row starts with "place". */
const isPlaceField = (field: string) => field.startsWith('place');

/** One line per team, keeping every field's figures. */
function byTeam(mismatches: readonly MismatchNote[]): FlagLine[] {
  const lines = new Map<string, FlagLine>();
  for (const note of mismatches) {
    const line = lines.get(note.slug) ?? {
      slug: note.slug,
      name: note.name,
      place: null,
      items: [],
      urls: [],
    };
    const ours = Number(note.ours);
    if (isPlaceField(note.field) && Number.isInteger(ours)) {
      const theirs = Number(note.theirs);
      line.place = { ours, theirs: Number.isInteger(theirs) ? theirs : null };
    } else {
      line.items.push({ field: note.field, ours: note.ours, theirs: note.theirs });
    }
    if (!line.urls.includes(note.url)) line.urls.push(note.url);
    lines.set(note.slug, line);
  }
  return [...lines.values()];
}

type Paired = { kind: 'swap'; key: string; a: FlagLine; b: FlagLine } | { kind: 'team'; key: string; line: FlagLine };

/** Pair every reciprocal place swap (A ours 1 / theirs 2, B ours 2 / theirs 1) into one item. */
function toItems(lines: FlagLine[]): Paired[] {
  const paired = new Set<string>();
  const items: Paired[] = [];
  for (const line of lines) {
    if (paired.has(line.slug)) continue;
    const p = line.place;
    const partner =
      p && p.theirs !== null && p.theirs !== p.ours
        ? lines.find(
            (other) =>
              other.slug !== line.slug &&
              !paired.has(other.slug) &&
              other.place?.ours === p.theirs &&
              other.place.theirs === p.ours,
          )
        : undefined;
    if (partner) {
      paired.add(line.slug);
      paired.add(partner.slug);
      const [a, b] = p!.ours < partner.place!.ours ? [line, partner] : [partner, line];
      items.push({ kind: 'swap', key: `${a.slug}+${b.slug}`, a, b });
    } else {
      items.push({ kind: 'team', key: line.slug, line });
    }
  }
  return items;
}

/** Win percentages to the three places both tables print, so .8333 and .833 are the same. */
const pct3 = (s: Standing) => Math.round(s.computed.winPct * 1000);

/**
 * Does MaxPreps' win-percentage ordering explain a place difference? Only if it points the same
 * way: MaxPreps puts the team LOWER than we do only if a team between the two places has a higher
 * win percentage, and HIGHER only if one has a lower percentage. A percentage that merely differs
 * does not establish the cause (the gap could be a game one table counts and the other does not),
 * and then no reason is given. Unknown (no rows, no MaxPreps place) claims nothing.
 */
function winPctExplains(
  slug: string,
  place: { ours: number; theirs: number | null },
  rows: readonly StandingsRowData[],
): boolean {
  const theirs = place.theirs;
  if (theirs === null || theirs === place.ours) return false;
  const self = rows.find((r) => r.team.slug === slug)?.standing;
  if (!self) return false;
  const lo = Math.min(place.ours, theirs);
  const hi = Math.max(place.ours, theirs);
  const outranksOnPct = (other: Standing) =>
    theirs > place.ours ? pct3(other) > pct3(self) : pct3(other) < pct3(self);
  return rows.some(
    (r) =>
      r.team.slug !== slug &&
      r.standing.hasReportedResults &&
      r.standing.computed.place >= lo &&
      r.standing.computed.place <= hi &&
      outranksOnPct(r.standing),
  );
}

/** A per-team MaxPreps link only when it is NOT the division table linked below. */
function teamLinks(lines: readonly FlagLine[], sourceUrl: string | null): string[] {
  return [...new Set(lines.flatMap((line) => line.urls))].filter((url) => url !== sourceUrl);
}

/**
 * The Notes block's comparison list (components/standings/StandingsNotes.tsx): the cross-check
 * log's differences for this division, one item per team, a RECIPROCAL place swap (we have A 1st
 * and B 2nd, MaxPreps the other way round) paired into one item naming both, because it is one
 * fact. `rows` are the division's, for the facts a sentence needs (is the place shared, do the win
 * percentages explain it); `sourceUrl` is the division's MaxPreps table, which the block links once.
 */
export function mismatchItems(
  mismatches: readonly MismatchNote[],
  rows: readonly StandingsRowData[],
  sourceUrl: string | null,
): MismatchItem[] {
  return toItems(byTeam(mismatches)).map((item): MismatchItem => {
    if (item.kind === 'swap') {
      return {
        ...item,
        byWinPct: winPctExplains(item.a.slug, item.a.place!, rows),
        links: teamLinks([item.a, item.b], sourceUrl),
      };
    }
    const p = item.line.place;
    return {
      ...item,
      shared: rows.find((r) => r.team.slug === item.line.slug)?.standing.tiebreak.shared ?? false,
      byWinPct: p ? winPctExplains(item.line.slug, p, rows) : false,
      links: teamLinks([item.line], sourceUrl),
    };
  });
}
