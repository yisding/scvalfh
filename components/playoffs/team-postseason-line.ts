/**
 * The team card's postseason copy (SPEC §10.5): one label, one sentence, a link and the honesty line for a
 * team's postseason, by its league's postseason kind. Read by the team view (components/teams/team-view.ts,
 * which wraps it in its pairing- and bracket-aware lines) and the home page's pinned cards (components/home/team-card.ts);
 * its phase lead (components/home/phase-lead.ts) uses `playInClause`. Server-only: it reads the snapshot through lib/data.
 */

import { getLeaguePairings, getLeagueTournament, getStandingFor, getToday } from '../../lib/data';
import { dateSpan, leagueClock, numberWord, ordinalWord, shortDate } from '../../lib/format';
import { CCS } from '../../lib/league-config/sections';
import type { LeagueConfig, PairingConfig, PostseasonConfig } from '../../lib/league-config/shape';
import { findLeague, getDivision, outsideTournamentOf, pairingWindow } from '../../lib/leagues';
import { tournamentOutcome, tournamentOutcomeCopy } from '../../lib/postseason/postseason';
import { postseasonHref } from '../../lib/postseason/postseason-kind';
import { ccsOutcomeFor } from '../../lib/postseason/postseason-outcomes';
import { outcomesFor, pairingDatesLabel, playoffOutcomeLabel } from '../../lib/standings/ladder';
import { getTeamById, getTeamBySlug } from '../../lib/teams';

export interface TeamPostseasonLine {
  label: string;
  sentence: string;
  href: string;
  linkText: string;
  /**
   * The honesty line under the card, or null where nothing is projected: 'Projected from the table today;
   * nothing here is official.' for a CCS ladder and for a league tournament still projected from the table;
   * 'From the results as posted; nothing here is official.' once that tournament has results; for a CCS ladder
   * team whose play-in or crossover is final, 'From the results as posted; CCS’s bracket is the official record.'
   * (lib/postseason/postseason-outcomes.ts, plan final-10, 2026-10-30); null for the EAL (every team is in; nothing is
   * projected), a San Diego league (the Section places teams) and the Sunset.
   */
  caveat: string | null;
}

const PROJECTED_CAVEAT = 'Projected from the table today; nothing here is official.';
const RESULTS_CAVEAT = 'From the results as posted; nothing here is official.';
// A CCS league's own play-in or crossover result is a fact, not a projection; the berth it leads to is still the
// CCS committee's to record, and its bracket is where that record is (plan final-10, 2026-10-30).
const CCS_RESULTS_CAVEAT = 'From the results as posted; CCS’s bracket is the official record.';

/**
 * §10.5 copy; null for an unknown ref AND for a team with gp 0 (never placed by merit), except in a league
 * with no postseason at all (the Sunset), where the line is the league's note whatever the team has played:
 * it says no place leads anywhere, which is as true before a team's first game as after its last.
 */
export function getTeamPostseasonLine(ref: string): TeamPostseasonLine | null {
  const team = getTeamBySlug(ref) ?? getTeamById(ref);
  if (!team) return null;
  const row = getStandingFor(team.slug);
  if (!row) return null;
  const league = findLeague(team.league);
  if (!league) return null;
  const ps = league.postseason;
  if (ps.kind === 'no-postseason') {
    // The Sunset and the LA independents: the CIF Southern Section holds no field hockey championship
    // (Blue Book 2026-27 Bylaws 2011.1 and 3500.2), so their postseason is the section's outside tournament (the
    // Tournament of Champions, DESIGN §24.13). One rung covers every place; the label says whether this team is
    // one of the tournament's entrants, and the sentence is the config note (which names the event) plus one
    // sentence saying so. Never a "top N": the field is the organizer's, not a table's.
    const event = outsideTournamentOf(league.sectionId);
    const entrant = event !== null && event.entrants.includes(team.slug);
    const count = event ? numberWord(event.entrants.length) : '';
    return {
      label: event
        ? `${entrant ? 'In' : 'Not in'} the ${event.name}`
        : playoffOutcomeLabel(row.division, outcomesFor(row)),
      sentence: event
        ? `${ps.note} ${team.name} ${entrant ? 'is' : 'is not'} one of its ${count} teams.`
        : ps.note,
      href: event ? `/playoffs#${event.id}` : postseasonHref(league),
      linkText: event ? event.name : 'Postseason',
      caveat: null,
    };
  }
  if (row.computed.gp === 0) return null;
  const statuses = outcomesFor(row);
  const label = playoffOutcomeLabel(row.division, statuses);

  switch (ps.kind) {
    case 'section-playoffs': {
      // The San Diego Section's playoffs (Green Book 2026-27 Bylaw 2000.1): the Section places teams from its
      // power rankings, so a league place is no route except 1st (a designated champion's play-in). The
      // sentence is the config's one qualification line, then the team's own playoff division from the
      // Section's 2026 Divisions sheet; never the EAL's "top N" template, and no seed.
      const division = ps.playoffDivisionOf[team.slug];
      const divisionSentence = division
        ? ` The Section lists ${team.name} in Division ${division}; Open Division teams are drawn from Division I at the end of the regular season.`
        : '';
      return {
        label,
        sentence: `${ps.qualificationLine}${divisionSentence}`,
        href: postseasonHref(league),
        linkText: ps.name,
        caveat: null,
      };
    }
    case 'league-tournament': {
      const round = (id: string) => ps.rounds.find((r) => r.id === id);
      const qf = round('qf-1');
      const playIn = round('play-in');
      const final = round('final');
      const qualifiers = numberWord(ps.qualifiers);
      const byes = ps.byes.length === 2 ? `${ps.byes[0]}-${ps.byes[1]}` : ps.byes.join(', ');
      // The table's words while the picture is projected from it; once the tournament is seeded or under way, the
      // team's own outcome from the results (lib/postseason/postseason.ts tournamentOutcome: in the final, lost in the
      // semifinal, champion…, DESIGN §24.13). The optional play-in clause is dropped once its day has passed.
      const projection = getLeagueTournament(league.id);
      const playInClause = playIn && getToday() <= playIn.date ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : '';
      const ladder = {
        label,
        sentence:
          `Top ${qualifiers} make the ${ps.name}: quarterfinals ${qf ? shortDate(qf.date) : ''}` +
          `${playInClause}, final ` +
          `${final ? shortDate(final.date) : ''} at ${ps.finalSite.label}; seeds ${byes} get byes to the semifinals.`,
      };
      const words = tournamentOutcomeCopy(tournamentOutcome(projection, team.slug), team.slug, league, ladder);
      return {
        ...words,
        href: postseasonHref(league),
        linkText: ps.name,
        // A projection only until the first tournament result is in; then the picture is the results'.
        caveat: projection.status === 'projected' ? PROJECTED_CAVEAT : RESULTS_CAVEAT,
      };
    }
    case 'unbracketed-tournament':
      // The EAL's Super Regional: the rule and the dates, never a bracket or a seed (DESIGN §22).
      return {
        label,
        sentence: ps.site
          ? `The top ${numberWord(ps.qualifiers)} schools play the ${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)}, and every ${league.shortName} team is one of the ${numberWord(ps.qualifiers)}; ${ps.site.basis} has the games at ${ps.site.label} on ${shortDate(ps.site.day)}.`
          : `The top ${numberWord(ps.qualifiers)} schools play the ${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)}; its format and site are not published yet.`,
        href: postseasonHref(league),
        linkText: 'Postseason',
        caveat: null,
      };
    case 'ccs-ladder': {
      // A final play-in is the team's outcome, its own label and sentence ('Won the play-in', 'Lost the play-in';
      // lib/postseason/postseason-outcomes.ts); a final crossover keeps the ladder's label and adds its result to the sentence.
      const outcome = ccsOutcomeFor(team.slug, { pairings: getLeaguePairings(league.id) });
      if (outcome?.kind === 'play-in' && outcome.label) {
        return {
          label: outcome.label,
          sentence: outcome.sentence,
          href: postseasonHref(league),
          linkText: 'CCS playoffs',
          caveat: CCS_RESULTS_CAVEAT,
        };
      }
      const crossover = ps.pairings.find((p) => p.tag === 'scval-crossover');
      const playIn = ps.pairings.find((p) => p.tag === 'bval-play-in');
      // The crossover sentence is for a team those games are about: an automatic berth (the crossover orders
      // them), the 4th-place play-in, or the 5th-place at-large candidate. A team below that (SCVAL 'out', 6th or
      // lower: Cupertino, 7th in De Anza on 2026-10-29) has no game left that changes its place, so it reads the
      // ladder's own words instead (lib/league-config/scval.ts SCVAL rung 'No automatic berth'; DESIGN §15.8 "never eliminat…").
      const candidate = statuses.some((s) => s === 'aq' || s === 'play-in' || s === 'at-large');
      let sentence: string;
      if (crossover && candidate) {
        // 'Thu Oct 29 and Fri Oct 30' in 2026: two of the four crossovers moved a day ahead of the schedule.
        // 'were' once the last day of the window has passed (the tense rule of the team page's league copy).
        const over = ps.pairings.every((p) => getToday() > pairingWindow(p).last);
        sentence = `The ${league.shortName} crossover and the 4th-place play-in ${over ? 'were' : 'are'} ${pairingDatesLabel(ps.pairings)}.`;
        // 'Archbishop Mitty beat St. Ignatius 2–0 in the #1 v #1 crossover on Thu Oct 29; CCS uses it when it seeds.'
        if (outcome?.kind === 'crossover') sentence = `${sentence} ${outcome.sentence}`;
      } else if (playIn && statuses.includes('play-in')) {
        sentence = `${playInClause(league, ps, playIn)}.`;
      } else if (statuses[0] === 'no-aq-route' || statuses[0] === 'out') {
        sentence = 'No automatic berth; at-large berths are the CCS committee’s call.';
      } else {
        // An automatic-berth place (BVAL Mt. Hamilton 1-3, PCAL 1-2): the spec gives no league sentence.
        sentence = `${league.shortName}’s automatic CCS berths go by final place; CCS seeds the field on ${shortDate(CCS.keyDates.seedingMeeting)}.`;
      }
      return {
        label,
        sentence,
        href: postseasonHref(league),
        linkText: 'CCS playoffs',
        caveat: outcome ? CCS_RESULTS_CAVEAT : PROJECTED_CAVEAT,
      };
    }
  }
}

/**
 * The BVAL-style play-in, as one clause with no closing stop: 'Mt. Hamilton #4 plays at the Santa
 * Teresa champion Sat Oct 31, 11 AM, for BVAL’s fourth automatic CCS berth', the ordinal from the
 * league's configured `autoBerths`. The team page ends it
 * with a period; the home page's phase lead adds the CCS seeding meeting.
 */
export function playInClause(
  league: Pick<LeagueConfig, 'shortName'>,
  ps: Extract<PostseasonConfig, { kind: 'ccs-ladder' }>,
  playIn: PairingConfig,
): string {
  return (
    `${playIn.seatLabels[1]} plays at the ${getDivision(playIn.seats[0].division).label} champion ` +
    `${shortDate(playIn.date)}${playIn.time ? `, ${leagueClock(playIn.time)}` : ''}, for ${league.shortName}’s ` +
    `${ordinalWord(ps.autoBerths)} automatic CCS berth`
  );
}
