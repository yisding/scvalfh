/**
 * Official fixtures → MaxPreps contests (SPEC §7.8). Two matchers:
 *
 *  - 'legacy' (SCVAL): the former `applyOfficialFixtures` of lib/sources/scval-pdf.ts, moved here
 *    byte for byte — same pass order, same ordered tier 3 (league games first, then nearest date,
 *    non-league candidates capped at ±14 days) — now stamping the widened OfficialStamp
 *    (`division`, `fixtureId`, `pass`). Golden-gated (tests/golden/scval-corpus.json officialStamps).
 *  - 'two-phase' (BVAL, PCAL, MCAL): pass 1 same-date ordered for ALL fixtures, pass 2 same-date
 *    unordered for all remaining (host conflict published), pass 3 rescheduled legs assigned
 *    GLOBALLY by smallest |Δdays| (ties: fixture date, fixture id, contestId), so an early unplayed
 *    fixture can never take a later moved leg.
 *
 * Both ignore every contest `isExcluded` returns true for (postseason, MCAL tournament window,
 * contestType 2/4 in a league that excludes them): such a contest never consumes a fixture.
 * Pure: no I/O, no clock (`today` is an option).
 */

import { postseasonTag } from '../classify';
import { divisionLabel, getDivision, leagueOfDivision } from '../leagues';
import { shortDate, monthDay } from '../format';
import { getTeamBySlug, resolveTeam, sideJoinKey, unorderedPairKey } from '../teams';
import type { DivisionId, Game, GameSide, OfficialFixture, OfficialStamp, TeamSlug } from '../types';

export interface MatchOptions {
  matcher: 'legacy' | 'two-phase';
  /**
   * Contests for which this returns true are never candidates: postseasonTag(g) !== null || dateKey >= postseasonFrom
   * || contestTypes.home or .away ∈ rules.excludeContestTypes (so a ct-2/ct-4 contest never consumes a fixture).
   */
  isExcluded: (game: Game) => boolean;
  rescheduleWindowDays: 14;
  /**
   * The run's local date (RunContext.today). Two-phase only: the "excluded only candidate" league reason is
   * given for fixtures dated before it. Omitted = every unmatched fixture is considered.
   */
  today?: string;
}

export interface MatchResult {
  games: Game[];
  unmatched: OfficialFixture[];
  /** Log lines (the cron prints each through RunContext.warn). */
  warnings: string[];
  /**
   * Two-phase only: sentences published as league reasons (RunContext.degrade), rendered verbatim — the
   * excluded-contestType case and the MCAL after-the-cut-off case. Always [] for 'legacy'.
   */
  reasons: string[];
  /** Fixtures matched to a contest. */
  matched: number;
  /** Matched contests MaxPreps does NOT flag as league games: `<contestId> (<away> @ <home>) — <note>`. */
  leagueDisagreements: string[];
}

type Pass = OfficialStamp['pass'];

function orderedKey(away: string, home: string): string {
  return `${away}@${home}`;
}

function days(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function stampOf(fixture: OfficialFixture, pass: Pass): OfficialStamp {
  return {
    scheduledDate: fixture.dateKey,
    division: fixture.division,
    source: fixture.source,
    fixtureId: fixture.id,
    pass,
  };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** The legacy unmatched order: date, then the grid's AWAY@HOME spelling. */
function compareLegacy(a: OfficialFixture, b: OfficialFixture): number {
  return a.dateKey === b.dateKey
    ? `${a.awayName}@${a.homeName}`.localeCompare(`${b.awayName}@${b.homeName}`)
    : a.dateKey.localeCompare(b.dateKey);
}

/** Date, then fixture id (plain code-unit order, locale-independent). */
function compareFixtures(a: OfficialFixture, b: OfficialFixture): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Display name of a fixture side: the registry name when it resolves, else the grid spelling. */
function fixtureSideName(slug: TeamSlug | null, gridName: string): string {
  return (slug ? getTeamBySlug(slug)?.name : undefined) ?? gridName;
}

// ---------------------------------------------------------------- legacy (SCVAL)

/**
 * Today's `applyOfficialFixtures`, moved byte for byte. Three passes, each consuming at most one
 * game per fixture:
 *   1. same date, same AWAY@HOME ordering  — the normal case
 *   2. same date, home/away swapped        — matched, and WARNED. The grid is NOT the authority on
 *      the host: home/away comes only from schedule-calculated's `teams[].homeAwayType`, so a swap
 *      is never applied to the contest. It is carried onto the game as `provenance.hostConflict`,
 *      exactly as a league-flag disagreement is carried as `provenance.leagueFlagConflict`.
 *   3. same AWAY@HOME, league games first then nearest date — a rescheduled game; `scheduledDate`
 *      then differs from `dateKey`. A NON-LEAGUE candidate is capped at ±rescheduleWindowDays; a
 *      league one is not (the published De Anza grid moved ST. IGNATIUS @ LOS ALTOS 29 days).
 */
function matchLegacy(games: readonly Game[], fixtures: readonly OfficialFixture[], opts: MatchOptions): MatchResult {
  const warnings: string[] = [];
  const leagueDisagreements: string[] = [];
  /** contestId → the sentence the game itself will carry. */
  const disagreed = new Map<string, string>();
  /** contestId → "the grid has X hosting, MaxPreps has Y". Published, not just logged. */
  const hostDisagreed = new Map<string, string>();
  const official = new Map<string, OfficialStamp>();
  const consumed = new Set<string>();

  const byDateOrdered = new Map<string, Game[]>();
  const byDateUnordered = new Map<string, Game[]>();
  const byOrdered = new Map<string, Game[]>();
  for (const g of games) {
    if (opts.isExcluded(g)) continue;
    const away = sideJoinKey(g.away);
    const home = sideJoinKey(g.home);
    push(byDateOrdered, `${g.dateKey}|${orderedKey(away, home)}`, g);
    push(byDateUnordered, `${g.dateKey}|${unorderedPairKey(away, home)}`, g);
    push(byOrdered, orderedKey(away, home), g);
  }

  const take = (list: Game[] | undefined): Game | null => {
    if (!list) return null;
    for (const g of list) if (!consumed.has(g.contestId)) return g;
    return null;
  };

  const unmatched: OfficialFixture[] = [];
  let matched = 0;

  for (const fixture of fixtures) {
    if (!fixture.awaySlug || !fixture.homeSlug) {
      unmatched.push(fixture);
      continue;
    }
    const ordered = orderedKey(fixture.awaySlug, fixture.homeSlug);
    let pass: Pass = 'same-date';
    let game = take(byDateOrdered.get(`${fixture.dateKey}|${ordered}`));
    if (!game) {
      const swapped = take(byDateUnordered.get(`${fixture.dateKey}|${unorderedPairKey(fixture.awaySlug, fixture.homeSlug)}`));
      if (swapped) {
        warnings.push(
          `${fixture.dateKey} ${fixture.awayName} @ ${fixture.homeName}: ` +
            'MaxPreps has the host the other way round',
        );
        // Home/away stays MaxPreps' — but the disagreement is PUBLISHED on the game. The sentence
        // is read by a human on the game page, so it uses the display name rather than the grid's
        // UPPERCASE spelling, and carries no date (this is the same-date pass).
        const gridHost = resolveTeam(fixture.homeSlug)?.name ?? fixture.homeName;
        hostDisagreed.set(
          swapped.contestId,
          `the official ${divisionLabel(fixture.division)} grid has ${gridHost} hosting; ` +
            `MaxPreps has ${swapped.home.name}, and MaxPreps is the only source of the two that ` +
            'states home and away.',
        );
        game = swapped;
        pass = 'same-date-swapped';
      }
    }
    if (!game) {
      // A rescheduled leg. League games first, then nearest date, so the two legs of the round
      // robin cannot cross over. The distance cap applies ONLY to a candidate MaxPreps does not
      // flag as a league game (a preseason friendly between the same two schools).
      const candidates = (byOrdered.get(ordered) ?? []).filter(
        (g) =>
          !consumed.has(g.contestId) &&
          (g.isLeague || days(g.dateKey, fixture.dateKey) <= opts.rescheduleWindowDays),
      );
      candidates.sort(
        (a, b) =>
          Number(b.isLeague) - Number(a.isLeague) ||
          days(a.dateKey, fixture.dateKey) - days(b.dateKey, fixture.dateKey),
      );
      game = candidates[0] ?? null;
      if (game) {
        pass = 'rescheduled';
        warnings.push(
          `${fixture.awayName} @ ${fixture.homeName}: official ${fixture.dateKey}, ` +
            `MaxPreps ${game.dateKey}`,
        );
      }
    }
    if (!game) {
      unmatched.push(fixture);
      continue;
    }
    consumed.add(game.contestId);
    official.set(game.contestId, stampOf(fixture, pass));
    matched += 1;
    if (!game.isLeague) {
      const note =
        `the official ${divisionLabel(fixture.division)} grid has this as a league fixture ` +
        `on ${fixture.dateKey}; MaxPreps flags it non-league`;
      leagueDisagreements.push(`${game.contestId} (${fixture.awayName} @ ${fixture.homeName}) — ${note}`);
      disagreed.set(game.contestId, note);
    }
  }

  const out = games.map((g) => {
    const stamp = official.get(g.contestId);
    if (!stamp) return g;
    const note = disagreed.get(g.contestId);
    const hostNote = hostDisagreed.get(g.contestId);
    const provenance = {
      ...g.provenance,
      ...(note && !g.provenance.leagueFlagConflict ? { leagueFlagConflict: note } : {}),
      ...(hostNote ? { hostConflict: hostNote } : {}),
    };
    return { ...g, official: stamp, provenance };
  });

  unmatched.sort(compareLegacy);

  return { games: out, unmatched, warnings, reasons: [], matched, leagueDisagreements };
}

// ---------------------------------------------------------------- two-phase (BVAL, PCAL, MCAL)

/** "An MCAL", "A BVAL": the article an acronym takes when read letter by letter. */
function articleFor(acronym: string): 'A' | 'An' {
  return /^[AEFHILMNORSX]/.test(acronym) ? 'An' : 'A';
}

/** The day before a YYYY-MM-DD date. */
function dayBefore(dateKey: string): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function teamDivision(side: GameSide): DivisionId | null {
  const team = (side.teamId ? resolveTeam(side.teamId) : undefined) ?? (side.slug ? getTeamBySlug(side.slug) : undefined);
  return team?.division ?? null;
}

function excludedContestType(game: Game, excluded: readonly number[]): number | null {
  for (const t of [game.contestTypes?.home ?? null, game.contestTypes?.away ?? null]) {
    if (t !== null && excluded.includes(t)) return t;
  }
  return null;
}

function matchTwoPhase(games: readonly Game[], fixtures: readonly OfficialFixture[], opts: MatchOptions): MatchResult {
  const warnings: string[] = [];
  const reasons: string[] = [];
  const leagueDisagreements: string[] = [];
  const stamps = new Map<string, OfficialStamp>();
  const hostNotes = new Map<string, string>();
  const flagNotes = new Map<string, string>();
  const consumed = new Set<string>();
  const done = new Set<string>();
  const window = opts.rescheduleWindowDays;

  const ordered = [...fixtures].sort(compareFixtures);
  const pool = games.filter((g) => !opts.isExcluded(g));

  const byDateOrdered = new Map<string, Game[]>();
  const byDateUnordered = new Map<string, Game[]>();
  const byUnordered = new Map<string, Game[]>();
  for (const g of pool) {
    const away = sideJoinKey(g.away);
    const home = sideJoinKey(g.home);
    push(byDateOrdered, `${g.dateKey}|${orderedKey(away, home)}`, g);
    push(byDateUnordered, `${g.dateKey}|${unorderedPairKey(away, home)}`, g);
    push(byUnordered, unorderedPairKey(away, home), g);
  }
  const take = (list: Game[] | undefined): Game | null => {
    if (!list) return null;
    for (const g of list) if (!consumed.has(g.contestId)) return g;
    return null;
  };
  const league = (f: OfficialFixture) => leagueOfDivision(f.division);
  const assign = (fixture: OfficialFixture, game: Game, pass: Pass) => {
    consumed.add(game.contestId);
    done.add(fixture.id);
    stamps.set(game.contestId, stampOf(fixture, pass));
    if (!game.isLeague) {
      const l = league(fixture);
      const note =
        `the official ${l.shortName} schedule has this as a league game on ${fixture.dateKey}; ` +
        'MaxPreps flags it non-league';
      leagueDisagreements.push(`${game.contestId} (${fixture.awayName} @ ${fixture.homeName}) — ${note}`);
      flagNotes.set(game.contestId, note);
    }
  };

  const matchable = ordered.filter((f) => f.awaySlug !== null && f.homeSlug !== null);

  // Pass 1: same date, same AWAY@HOME, for every fixture.
  for (const f of matchable) {
    const g = take(byDateOrdered.get(`${f.dateKey}|${orderedKey(f.awaySlug as string, f.homeSlug as string)}`));
    if (g) assign(f, g, 'same-date');
  }

  // Pass 2: same date, host the other way round, for every fixture still open.
  for (const f of matchable) {
    if (done.has(f.id)) continue;
    const g = take(byDateUnordered.get(`${f.dateKey}|${unorderedPairKey(f.awaySlug as string, f.homeSlug as string)}`));
    if (!g) continue;
    const gridHost = fixtureSideName(f.homeSlug, f.homeName);
    warnings.push(`${f.dateKey} ${f.awayName} @ ${f.homeName}: MaxPreps has the host the other way round`);
    hostNotes.set(
      g.contestId,
      `the official ${league(f).shortName} schedule has ${gridHost} hosting; MaxPreps has ${g.home.name}, ` +
        'and MaxPreps is the only source of the two that states home and away.',
    );
    assign(f, g, 'same-date-swapped');
  }

  // Pass 3: rescheduled legs, assigned globally by smallest |Δdays|.
  const pairs: Array<{ fixture: OfficialFixture; game: Game; delta: number }> = [];
  for (const f of matchable) {
    if (done.has(f.id)) continue;
    for (const g of byUnordered.get(unorderedPairKey(f.awaySlug as string, f.homeSlug as string)) ?? []) {
      if (consumed.has(g.contestId)) continue;
      const delta = days(g.dateKey, f.dateKey);
      const members = teamDivision(g.home) === f.division && teamDivision(g.away) === f.division;
      if (delta > window && !members) continue;
      pairs.push({ fixture: f, game: g, delta });
    }
  }
  pairs.sort(
    (a, b) =>
      a.delta - b.delta ||
      compareFixtures(a.fixture, b.fixture) ||
      (a.game.contestId < b.game.contestId ? -1 : a.game.contestId > b.game.contestId ? 1 : 0),
  );
  for (const { fixture, game, delta } of pairs) {
    if (done.has(fixture.id) || consumed.has(game.contestId)) continue;
    assign(fixture, game, 'rescheduled');
    warnings.push(`${fixture.awayName} @ ${fixture.homeName}: official ${fixture.dateKey}, MaxPreps ${game.dateKey}`);
    if (delta > window) {
      warnings.push(
        `${fixture.awayName} @ ${fixture.homeName}: matched a contest ${delta} days from the official date ` +
          `(${fixture.dateKey} → ${game.dateKey}, contest ${game.contestId}); check it is the same game`,
      );
    }
  }

  const unmatched = ordered.filter((f) => !done.has(f.id));

  // Published (league reasons): an unmatched fixture whose only contests within the window were
  // excluded from matching — after the league's postseason cut-off (MCAL), or, for a fixture dated
  // before today, typed tournament/neutral (contestType 2/4) by MaxPreps.
  const reasonSeen = new Set<string>();
  const noteless = new Set<string>();
  for (const f of unmatched) {
    if (f.awaySlug === null || f.homeSlug === null) continue;
    const key = unorderedPairKey(f.awaySlug, f.homeSlug);
    const nearby = games.filter(
      (g) =>
        !consumed.has(g.contestId) &&
        unorderedPairKey(sideJoinKey(g.away), sideJoinKey(g.home)) === key &&
        days(g.dateKey, f.dateKey) <= window,
    );
    if (nearby.length === 0 || !nearby.every((g) => opts.isExcluded(g))) continue;
    const l = league(f);
    const nearest = [...nearby].sort(
      (x, y) =>
        days(x.dateKey, f.dateKey) - days(y.dateKey, f.dateKey) ||
        (x.contestId < y.contestId ? -1 : x.contestId > y.contestId ? 1 : 0),
    )[0];
    const a = fixtureSideName(f.awaySlug, f.awayName);
    const b = fixtureSideName(f.homeSlug, f.homeName);
    const ct = excludedContestType(nearest, l.rules.excludeContestTypes);
    const past = opts.today === undefined || f.dateKey < opts.today;
    let sentence: string | null = null;
    const cutoff = l.rules.postseasonFrom;
    if (cutoff !== null && nearest.dateKey >= cutoff) {
      // contestType 4 after the cut-off is the league's own tournament: nothing to publish.
      if (ct !== 4) {
        sentence =
          `${articleFor(l.shortName)} ${l.shortName} contest between ${a} and ${b} on ${shortDate(nearest.dateKey)} is after ` +
          `the league's ${monthDay(dayBefore(cutoff))} cut-off, so it is treated as tournament play. ` +
          `If it is the rescheduled league game from ${shortDate(f.dateKey)}, add its contest id to ` +
          `LEAGUES.${l.id}.rules.leagueGameOverrides.`;
      }
    } else if (ct !== null && past) {
      sentence =
        `MaxPreps marks ${a} v ${b} on ${shortDate(nearest.dateKey)} as a tournament/neutral game ` +
        `(contestType ${ct}), so it is not counted; the official ${l.shortName} schedule lists it as a league game.`;
    }
    if (sentence === null) continue;
    for (const g of nearby) noteless.add(g.contestId);
    if (!reasonSeen.has(sentence)) {
      reasonSeen.add(sentence);
      reasons.push(sentence);
      warnings.push(`${f.id}: ${sentence} (contest ${nearest.contestId})`);
    }
  }

  // Log: any fixture pair with three or more contests within the window of its fixtures.
  const pairDates = new Map<string, OfficialFixture[]>();
  for (const f of matchable) push(pairDates, unorderedPairKey(f.awaySlug as string, f.homeSlug as string), f);
  for (const [key, list] of pairDates) {
    const first = list.reduce((m, f) => (f.dateKey < m ? f.dateKey : m), list[0].dateKey);
    const last = list.reduce((m, f) => (f.dateKey > m ? f.dateKey : m), list[0].dateKey);
    const inWindow = (byUnordered.get(key) ?? []).filter(
      (g) => days(g.dateKey, first) <= window || days(g.dateKey, last) <= window || (g.dateKey >= first && g.dateKey <= last),
    );
    if (inWindow.length >= 3) {
      const f = list[0];
      warnings.push(
        `${fixtureSideName(f.awaySlug, f.awayName)} v ${fixtureSideName(f.homeSlug, f.homeName)}: ` +
          `${inWindow.length} contests between ${first} and ${last} (±${window} days) for ${list.length} official fixtures: ` +
          inWindow.map((g) => `${g.dateKey} ${g.contestId}`).join(', '),
      );
    }
  }

  // Published: a same-division final in an official-fixtures division that matched no fixture.
  const divisions = new Set(fixtures.map((f) => f.division));
  const out = games.map((g) => {
    const stamp = stamps.get(g.contestId);
    if (stamp) {
      const flag = flagNotes.get(g.contestId);
      const host = hostNotes.get(g.contestId);
      return {
        ...g,
        official: stamp,
        provenance: {
          ...g.provenance,
          ...(flag && !g.provenance.leagueFlagConflict ? { leagueFlagConflict: flag } : {}),
          ...(host ? { hostConflict: host } : {}),
        },
      };
    }
    if (
      g.status === 'final' &&
      g.leagueDivision !== null &&
      divisions.has(g.leagueDivision) &&
      !noteless.has(g.contestId) &&
      postseasonTag(g) === null
    ) {
      const l = leagueOfDivision(g.leagueDivision);
      return {
        ...g,
        provenance: { ...g.provenance, classificationNote: `Not on the official ${l.shortName} schedule; not counted.` },
      };
    }
    return g;
  });

  return { games: out, unmatched, warnings, reasons, matched: done.size, leagueDisagreements };
}

/**
 * Stamp every contest that matched an official fixture with `game.official` and return the fixtures
 * no contest matched. `fixtures` are one league's (the cron calls this once per league with that
 * league's matcher).
 */
export function matchOfficialFixtures(
  games: readonly Game[],
  fixtures: readonly OfficialFixture[],
  opts: MatchOptions,
): MatchResult {
  for (const f of fixtures) getDivision(f.division); // unknown division → throws (a build bug)
  return opts.matcher === 'legacy' ? matchLegacy(games, fixtures, opts) : matchTwoPhase(games, fixtures, opts);
}
