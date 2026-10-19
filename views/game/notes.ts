/**
 * The /game/[id] lines worded from a league's or a section's own rules: the score note for a
 * shootout or an overtime count the feed cannot state plainly (D7), the head-to-head note under the
 * season series, and the "Counts as" line of a game outside the postseason.
 */

import { leagueOfDivision } from '@/lib/config/leagues';
import { divisionHeading } from '@/lib/config/leagues/labels';
import { shootoutPhrases } from '@/lib/format/score';
import type { Game } from '@/lib/model/game';
import type { DivisionId } from '@/lib/model/ids';
import type { TiebreakStage } from '@/lib/model/standings';
import { sideOutcome } from '@/lib/shared/game';
import {
  overtimeInDoubt,
  shootoutCitationParts,
  shootoutGroupName,
  shootoutSectionOf,
} from '@/views/shared/describe-game';
import type { GameDisplay } from '@/views/shared/game-display-client';

import type { CountsAs, GameSideModel } from './types';

/**
 * `scoreNote` (D7): what this site does with a score the feed cannot state plainly. The rule it
 * cites is the section's (SectionConfig.shootout, keyed on the section as lib/pipeline/reconcile/normalize.ts keys decider
 * 'SO'): the Northern Section's Guidelines for the EAL (a 10-minute sudden-victory period, then 1 v 1s)
 * and the San Diego Field Hockey Officials Association's procedures for the San Diego Section (a
 * 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts), whose rule covers a game between two of
 * its conferences too. The EAL's sentences are unchanged, word for word. Goals come from the view's
 * glyphs, never from the score fields.
 */
export function scoreNoteFor(
  game: Game,
  display: GameDisplay,
  away: GameSideModel,
  home: GameSideModel,
): string | null {
  const section = shootoutSectionOf(game);
  if (!section?.shootout) return null;
  const group = shootoutGroupName(section);
  const phrases = shootoutPhrases(section.shootout.words);
  const { source, procedure } = shootoutCitationParts(section.shootout.citation);
  const notes: string[] = [];
  if (display.kind === 'final' && game.decider === 'SO' && game.shootout === null) {
    const outcome = sideOutcome(game, 'home');
    if (outcome === 'W' || outcome === 'L') {
      const winner = outcome === 'W' ? home.name : away.name;
      if (section.shootout.inference === 'unverified') {
        // The San Diego Section (SectionConfig.shootout.inference): the rule is cited, the shootout is not
        // asserted. si.com and the Section's power rankings record Mt. Carmel–Poway (Sep 11) as 2-0 where
        // MaxPreps has 0-0 marked W/L, so this note says what MaxPreps lists and why the win counts, then
        // what the other sources record (`disagreement`). "Outside a tournament": the SDFHOA procedures do
        // not cover invitational tournaments (coversTournaments false), and lib/pipeline/reconcile/normalize.ts reads no 'SO'
        // from a tournament row.
        const scope = section.shootout.coversTournaments ? '' : ' outside a tournament';
        notes.push(
          `MaxPreps lists ${display.home.glyph}\u2013${display.away.glyph} with no tally and marks ${winner} the winner; a level ${group} varsity game${scope} goes to a sudden-victory period and then ${section.shootout.words} (${source}), so this site counts it as ${winner}\u2019s win.${
            section.shootout.disagreement ? ` ${section.shootout.disagreement}` : ''
          }`,
        );
      } else {
        const rule = procedure ? `a level varsity game goes to ${procedure}: ${source}` : source;
        notes.push(
          `Level at ${display.home.glyph}\u2013${display.away.glyph}; MaxPreps marks ${winner} the winner, which under the ${group}\u2019s rules means ${phrases.decidedIt} (${rule}). This site counts it as ${winner}\u2019s win and does not show ${phrases.tally}.`,
        );
      }
    }
  }
  if (overtimeInDoubt(game)) {
    // Both sections with a shootout rule play one 10-minute overtime period before it (NS Guidelines
    // §VII.E.4; SDFHOA 2026 procedures), so the count is the same words for both. overtimeInDoubt leaves out
    // postseason games and, where the rule does not reach them, tournament rows; the San Diego sentence
    // says so ("in a regular-season game outside a tournament": the SDFHOA playoff procedure plays two
    // 10-minute periods). The EAL's sentence is unchanged.
    const scope = section.shootout.coversTournaments ? '' : ' in a regular-season game outside a tournament';
    notes.push(
      `MaxPreps records ${game.otPeriods} overtime periods for this game, but the ${group} plays one 10-minute overtime period and then ${section.shootout.words}${scope} (${source}), so MaxPreps may have recorded ${phrases.win} as a goal. The score is shown as MaxPreps has it.`,
    );
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

const H2H_STAGES: readonly TiebreakStage[] = ['head-to-head', 'h2h-win-pct'];

/**
 * The head-to-head note for a counted game, citing THIS league's stage: SCVAL Article VI §3, BVAL
 * §6b, MCAL's head-to-head winning percentage, PCAL §23.3 (which applies to its top two places
 * only). null when the league's chains have no head-to-head stage.
 */
export function tiebreakNoteFor(division: DivisionId): string | null {
  const league = leagueOfDivision(division);
  const { tiebreaks, citations } = league.rules;
  const first = tiebreaks.default.find((s) => s !== 'points');
  if (first && H2H_STAGES.includes(first) && citations.stages[first]) {
    return `Head-to-head is the first tiebreak when two teams finish level on points — ${citations.stages[first]}.`;
  }
  for (const chain of Object.values(tiebreaks.byBucketStart ?? {})) {
    const stage = chain?.find((s) => H2H_STAGES.includes(s));
    if (stage && citations.stages[stage]) {
      return `Head-to-head breaks a tie for the top places — ${citations.stages[stage]}.`;
    }
  }
  return null;
}

/**
 * A division heading as a noun: 'De Anza Division', 'Mt. Hamilton Division'; a San Diego division's label
 * alone ('City Western', 'Avocado'), because there "Division" names the Section's PLAYOFF divisions (Open,
 * Division I, Division II: Green Book 2000.1) and the Section calls these leagues, not divisions. null for a
 * single-division league, which has no heading.
 */
function divisionNoun(division: DivisionId): string | null {
  const heading = divisionHeading(division);
  if (heading === null) return null;
  return leagueOfDivision(division).postseason.kind === 'section-playoffs' ? heading : `${heading} Division`;
}

export function countsAsFor(game: Game): CountsAs {
  if (game.countsFor !== null) {
    const league = leagueOfDivision(game.countsFor);
    const heading = divisionHeading(game.countsFor);
    const noun = divisionNoun(game.countsFor);
    return {
      label: noun ? `League game · ${noun}` : `League game · ${league.shortName}`,
      detail: `Counts toward the ${heading ?? league.shortName} standings — ${league.rules.citations.points}.`,
      classificationNote: null,
    };
  }
  return {
    label: 'Non-league game',
    detail: 'Counts in the overall record only, never in a league table.',
    classificationNote: game.provenance.classificationNote ?? null,
  };
}
