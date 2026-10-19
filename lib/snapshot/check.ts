/**
 * SPEC §4.1 checkAgainstConfig: the snapshot-level half of the contract in lib/schema/snapshot.ts.
 * The shapes there validate ids as strings; this check holds them to the config and the registry,
 * and every failure is a named issue with a path. `SnapshotSchema` is the shapes plus this check,
 * and is what lib/snapshot/load.ts parses with.
 */

import type { z } from 'zod';

import {
  CCS, CCS_LEAGUE_IDS, LEAGUES, SECTIONS, findDivision, findLeague, getSection, statusesOf,
} from '@/lib/config/leagues';
import { classifyGame } from '@/lib/engine/classify';
import { type DivisionId } from '@/lib/model/ids';
import { type Snapshot } from '@/lib/model/snapshot';
import { type TiebreakStage } from '@/lib/model/standings';
import { TEAMS, getTeamBySlug } from '@/lib/registry/teams';
import { SnapshotObject } from '@/lib/schema/snapshot';
import { isSbliveContestId } from '@/lib/shared/contest-id';

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Every chain stage a league may print as `resolvedBy`, plus 'points' (and 'play-in' for a tournament league). */
function allowedStages(leagueId: string): ReadonlySet<TiebreakStage> {
  const league = findLeague(leagueId);
  const out = new Set<TiebreakStage>(['points']);
  if (!league) return out;
  for (const s of league.rules.tiebreaks.default) out.add(s);
  for (const chain of Object.values(league.rules.tiebreaks.byBucketStart ?? {})) {
    for (const s of chain ?? []) out.add(s);
  }
  if (league.postseason.kind === 'league-tournament') out.add('play-in');
  return out;
}

/** SPEC §4.1 checkAgainstConfig, items 1-10. */
function checkAgainstConfig(s: z.infer<typeof SnapshotObject>, ctx: Ctx): void {
  // 1. teams = the registry, as sets AND in order; slug and abbr unique.
  const ids = s.teams.map((t) => t.id);
  const registry = TEAMS.map((t) => t.id);
  const missing = registry.filter((x) => !ids.includes(x));
  const extra = ids.filter((x) => !registry.includes(x));
  if (missing.length || extra.length || ids.join('|') !== registry.join('|')) {
    const slugOf = (x: string) => TEAMS.find((t) => t.id === x)?.slug ?? x;
    issue(
      ctx,
      ['teams'],
      `teams do not equal the registry (missing: ${missing.map(slugOf).join(', ') || 'none'}, extra: ${extra.join(', ') || 'none'}${missing.length || extra.length ? '' : '; order differs'})`,
    );
  }
  if (new Set(s.teams.map((t) => t.slug)).size !== s.teams.length) issue(ctx, ['teams'], 'duplicate team slug');
  if (new Set(s.teams.map((t) => t.abbr)).size !== s.teams.length) issue(ctx, ['teams'], 'duplicate team abbr');

  // 2. leagues, divisions, sections, per-division counts.
  const perDivision = new Map<string, number>();
  s.teams.forEach((t, i) => {
    const league = findLeague(t.league);
    if (!league) {
      issue(ctx, ['teams', i, 'league'], `unknown league ${t.league}`);
      return;
    }
    if (!league.divisions.some((d) => d.id === t.division)) {
      issue(ctx, ['teams', i, 'division'], `division ${t.division} is not in ${t.league}`);
    }
    if (t.section !== league.sectionId) issue(ctx, ['teams', i, 'section'], `section ${t.section} is not ${league.sectionId}`);
    perDivision.set(t.division, (perDivision.get(t.division) ?? 0) + 1);
  });
  for (const league of LEAGUES) {
    for (const d of league.divisions) {
      const n = perDivision.get(d.id) ?? 0;
      if (n !== d.expectedTeams) issue(ctx, ['teams'], `${d.id} has ${n} teams, expected ${d.expectedTeams}`);
    }
  }

  // 3. standings: one per team, division, points under the team's league, resolvedBy, status.
  const teamById = new Map(s.teams.map((t) => [t.id, t]));
  if (s.standings.length !== s.teams.length) issue(ctx, ['standings'], 'standings row count != team count');
  const seenStanding = new Set<string>();
  s.standings.forEach((r, i) => {
    if (seenStanding.has(r.teamId)) issue(ctx, ['standings', i], `duplicate standings row for ${r.slug}`);
    seenStanding.add(r.teamId);
    const team = teamById.get(r.teamId);
    if (!team) {
      issue(ctx, ['standings', i], `standings rows do not match the team registry (${r.slug})`);
      return;
    }
    if (r.division !== team.division) issue(ctx, ['standings', i, 'division'], `${r.slug}: division ${r.division} != ${team.division}`);
    const league = findLeague(team.league);
    if (!league) return;
    const p = league.rules.points;
    for (const key of ['computed', 'overall'] as const) {
      const c = r[key];
      if (c.pts !== p.win * c.w + p.tie * c.t + p.loss * c.l) {
        issue(ctx, ['standings', i, key, 'pts'], `pts is not ${p.win}w + ${p.tie}t under ${league.id}`);
      }
    }
    if (!allowedStages(team.league).has(r.tiebreak.resolvedBy)) {
      issue(ctx, ['standings', i, 'tiebreak', 'resolvedBy'], `${r.slug}: ${r.tiebreak.resolvedBy} is not a ${league.id} stage`);
    }
    if (r.hasReportedResults && !statusesOf(league.id).includes(r.playoffStatus)) {
      issue(ctx, ['standings', i, 'playoffStatus'], `${r.slug}: ${r.playoffStatus} is not a ${league.id} status`);
    }
  });
  for (const t of s.teams) {
    if (!seenStanding.has(t.id)) issue(ctx, ['standings'], `standings rows do not match the team registry (missing ${t.slug})`);
  }

  // 4. games.
  const degraded = new Set<DivisionId>();
  for (const h of s.leagueHealth) {
    for (const d of h.divisions) if (d.classification === 'fallback-contest-type') degraded.add(d.divisionId);
  }
  const contestIds = new Set<string>();
  const countedFixtures = new Map<string, string>();
  s.games.forEach((g, i) => {
    if (contestIds.has(g.contestId)) issue(ctx, ['games', i, 'contestId'], `duplicate contestId in games (${g.contestId})`);
    contestIds.add(g.contestId);
    for (const side of ['home', 'away'] as const) {
      const slug = g[side].slug;
      if (slug !== null && !getTeamBySlug(slug)) issue(ctx, ['games', i, side, 'slug'], `game side references an unknown slug (${slug})`);
    }
    if (g.leagueDivision !== null) {
      const ok = [g.home, g.away].every((side) => {
        const t = side.slug ? getTeamBySlug(side.slug) : undefined;
        return t?.division === g.leagueDivision;
      });
      if (!ok) issue(ctx, ['games', i, 'leagueDivision'], `leagueDivision ${g.leagueDivision} but a side is not a member`);
    }
    const expected = classifyGame(g, { degradedDivisions: degraded });
    if (g.countsFor !== expected) {
      issue(ctx, ['games', i, 'countsFor'], `countsFor ${g.countsFor} != classifyGame ${expected} (${g.contestId})`);
    }
    if (g.countsFor !== null && g.countsFor !== g.leagueDivision) {
      issue(ctx, ['games', i, 'countsFor'], 'countsFor differs from leagueDivision');
    }
    if (g.official) {
      const d = findDivision(g.official.division);
      if (!d) issue(ctx, ['games', i, 'official', 'division'], `unknown division ${g.official.division}`);
      else if (d.official.mode === 'none') {
        issue(ctx, ['games', i, 'official', 'division'], `${d.id} publishes no official schedule; a game cannot carry an official stamp for it`);
      } else if (g.official.source !== d.official.source) {
        issue(ctx, ['games', i, 'official', 'source'], `official source ${g.official.source} is not ${d.official.source}`);
      }
    }
    // 'SO' only between two teams of a section that decides a level varsity game by shootout (SectionConfig.
    // shootout: the Northern Section's 1 v 1s, the San Diego Section's shootout, which covers games between its
    // conferences too); without a tally, a level score flagged W/L. Keyed on the section, as lib/pipeline/reconcile/normalize.ts is.
    if (g.decider === 'SO') {
      const home = g.home.slug ? getTeamBySlug(g.home.slug) : undefined;
      const away = g.away.slug ? getTeamBySlug(g.away.slug) : undefined;
      const section = home && away && home.section === away.section ? getSection(home.section) : undefined;
      if (!section?.shootout) {
        issue(ctx, ['games', i, 'decider'], `decider SO but the sides are not two teams of a section that decides level games by shootout (${g.contestId})`);
      } else if (!section.shootout.coversTournaments && (g.contestTypes?.home === 2 || g.contestTypes?.away === 2)) {
        // The San Diego procedures do not cover invitational tournaments; lib/pipeline/reconcile/normalize.ts reads no 'SO' there.
        issue(ctx, ['games', i, 'decider'], `decider SO on a tournament row, which the ${section.name}'s shootout rule does not cover (${g.contestId})`);
      }
      if (g.shootout === null) {
        const flags = [g.home.result, g.away.result].sort().join('');
        if (g.home.score !== g.away.score || flags !== 'LW') {
          issue(ctx, ['games', i, 'decider'], `decider SO without a tally needs a level score flagged W/L (${g.contestId})`);
        }
      }
    }
    if (isSbliveContestId(g.contestId)) {
      if (g.provenance.scores !== 'sblive') issue(ctx, ['games', i, 'provenance', 'scores'], 'a sblive: game must carry sblive scores');
      if (g.urls.maxpreps !== null) issue(ctx, ['games', i, 'urls', 'maxpreps'], 'a sblive: game has no MaxPreps URL');
      if (!g.urls.sblive) issue(ctx, ['games', i, 'urls', 'sblive'], 'a sblive: game needs its si.com URL');
      if (g.provenance.backfill?.rule !== 'absent-fixture') {
        issue(ctx, ['games', i, 'provenance', 'backfill'], "a sblive: game needs backfill rule 'absent-fixture'");
      }
    }
    if (g.provenance.backfill && g.provenance.scores !== 'sblive') {
      issue(ctx, ['games', i, 'provenance', 'scores'], 'a backfilled game must carry sblive scores');
    }
    // One official fixture is one game: where the official schedule decides what counts, two counted
    // games stamped with the same fixture would count it twice.
    if (g.countsFor !== null && g.official) {
      const d = findDivision(g.countsFor);
      const league = d ? findLeague(d.leagueId) : undefined;
      if (league?.rules.classification === 'official-fixtures') {
        const prior = countedFixtures.get(g.official.fixtureId);
        if (prior !== undefined) {
          issue(
            ctx,
            ['games', i, 'official', 'fixtureId'],
            `official fixture ${g.official.fixtureId} is counted twice (${prior} and ${g.contestId})`,
          );
        } else countedFixtures.set(g.official.fixtureId, g.contestId);
      }
    }
  });

  // 5. official fixtures.
  (s.officialFixtures ?? []).forEach((f, i) => {
    const d = findDivision(f.division);
    if (!d) {
      issue(ctx, ['officialFixtures', i, 'division'], `unknown division ${f.division}`);
      return;
    }
    if (f.league !== d.leagueId) issue(ctx, ['officialFixtures', i, 'league'], `${f.league} is not the league of ${f.division}`);
    for (const key of ['awaySlug', 'homeSlug'] as const) {
      const slug = f[key];
      if (slug !== null && getTeamBySlug(slug)?.division !== f.division) {
        issue(ctx, ['officialFixtures', i, key], `${slug} is not a member of ${f.division}`);
      }
    }
    if (d.official.mode === 'none') {
      issue(ctx, ['officialFixtures', i, 'division'], `${d.id} publishes no official schedule; there is no official fixture for it`);
    } else if (f.source !== d.official.source) {
      issue(ctx, ['officialFixtures', i, 'source'], `source ${f.source} is not ${d.official.source}`);
    }
  });

  // 6. season = config (order included).
  const sectionIds = s.season.sections.map((x) => x.id).join('|');
  if (sectionIds !== SECTIONS.map((x) => x.id).join('|')) issue(ctx, ['season', 'sections'], 'season sections differ from config');
  if (s.season.leagues.map((l) => l.id).join('|') !== LEAGUES.map((l) => l.id).join('|')) {
    issue(ctx, ['season', 'leagues'], 'season leagues differ from config');
  }
  s.season.leagues.forEach((l, i) => {
    const league = findLeague(l.id);
    if (!league) return;
    if (l.divisions.map((d) => d.id).join('|') !== league.divisions.map((d) => d.id).join('|')) {
      issue(ctx, ['season', 'leagues', i, 'divisions'], `${l.id} divisions differ from config`);
    }
    l.divisions.forEach((d, j) => {
      const cfg = league.divisions.find((x) => x.id === d.id);
      if (cfg && cfg.maxprepsLeagueId !== d.maxprepsLeagueId) {
        issue(ctx, ['season', 'leagues', i, 'divisions', j, 'maxprepsLeagueId'], `${d.id} maxprepsLeagueId differs from config`);
      }
    });
    if (l.postseasonKind !== league.postseason.kind) {
      issue(ctx, ['season', 'leagues', i, 'postseasonKind'], `${l.id} postseasonKind differs from config`);
    }
  });

  // 7. the CCS field.
  const aq = s.playoffs.format.autoQualifiers;
  const keys = Object.keys(aq).sort().join('|');
  const expectedKeys = [...CCS_LEAGUE_IDS, 'atLarge', 'total'].sort().join('|');
  if (keys !== expectedKeys) issue(ctx, ['playoffs', 'format', 'autoQualifiers'], `autoQualifiers keys ${keys} != ${expectedKeys}`);
  let sum = aq.atLarge ?? 0;
  for (const leagueId of CCS_LEAGUE_IDS) {
    if (aq[leagueId] !== CCS.autoQualifiers[leagueId]) {
      issue(ctx, ['playoffs', 'format', 'autoQualifiers', leagueId], `${leagueId} has ${aq[leagueId]} berths, config ${CCS.autoQualifiers[leagueId]}`);
    }
    sum += aq[leagueId] ?? 0;
  }
  if (sum !== aq.total) issue(ctx, ['playoffs', 'format', 'autoQualifiers'], `autoQualifiers sum ${sum} != total ${aq.total}`);

  // 8. one leagueHealth row per league, config order, with that league's divisions.
  if (s.leagueHealth.map((h) => h.leagueId).join('|') !== LEAGUES.map((l) => l.id).join('|')) {
    issue(ctx, ['leagueHealth'], 'leagueHealth rows must be one per configured league, config order');
  }
  s.leagueHealth.forEach((h, i) => {
    const league = findLeague(h.leagueId);
    if (!league) return;
    if (h.divisions.map((d) => d.divisionId).join('|') !== league.divisions.map((d) => d.id).join('|')) {
      issue(ctx, ['leagueHealth', i, 'divisions'], `${h.leagueId} health rows differ from its divisions`);
    }
  });

  // 9. cross-check slugs.
  s.crossCheck.forEach((r, i) => {
    if (!getTeamBySlug(r.slug)) issue(ctx, ['crossCheck', i, 'slug'], `unknown slug ${r.slug}`);
  });

  // 10. superseded si.com games.
  for (const [from, to] of Object.entries(s.supersededGames)) {
    if (!isSbliveContestId(from)) issue(ctx, ['supersededGames', from], 'a superseded key must be sblive:<digits>');
    if (contestIds.has(from)) issue(ctx, ['supersededGames', from], 'a superseded game is still in games');
    if (!contestIds.has(to)) issue(ctx, ['supersededGames', from], `superseding contest ${to} is not in games`);
  }

  // counts in step with the arrays.
  if (s.counts.teams !== s.teams.length) issue(ctx, ['counts', 'teams'], 'counts.teams is stale');
  if (s.counts.games !== s.games.length) issue(ctx, ['counts', 'games'], 'counts.games is stale');
}

export const SnapshotSchema: z.ZodType<Snapshot> = SnapshotObject.superRefine(checkAgainstConfig);
