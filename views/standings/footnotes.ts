/**
 * The page-level footnotes under a league's standings (SPEC §10.3): the rules footnote (points,
 * then the tiebreak chain in words with its citations), the uneven-games footnote and the
 * co-leaders line, each worded from the league's config (lib/config/leagues).
 */

import { getLeague } from '@/lib/config/leagues';
import { unevenGamesSentence } from '@/lib/engine/standings';
import { ordinal } from '@/lib/format/numbers';
import type { LeagueId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { TiebreakStage } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';

import { pointsWords } from './division';

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
