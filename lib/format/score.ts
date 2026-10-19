/**
 * Score copy: the never-0-0 rule (`renderScore`), the screen-reader result sentence and the
 * shootout phrases. Every outcome goes through `sideOutcome` (lib/shared/game.ts). Pure and
 * client-safe.
 */

import type { Decider, Game, Outcome } from '@/lib/model/game';
// Type-only: erased at build, so this module stays client-safe (it never loads the league config).
import type { ShootoutInference } from '@/lib/model/league-config';
import { sideOutcome } from '@/lib/shared/game';

import { timeOfDay } from './dates';
import { EN_DASH } from './words';

// ---------- render support (DESIGN §5.2) ----------

export type ScoreView =
  | {
      kind: 'final';
      home: number;
      away: number;
      /** Outcome relative to the HOME side. */
      outcome: Outcome;
      decider: Decider;
      shootout: { home: number; away: number } | null;
    }
  | { kind: 'scheduled'; time: string | null }
  | { kind: 'unreported' }
  | { kind: 'postponed'; newDate: string | null };

/** A real 0 is '0'; a null is an en dash (DESIGN §5.3). NEVER coerce. */
export function scoreGlyph(score: number | null): string {
  return score === null ? EN_DASH : String(score);
}

/**
 * The single place the never-0-0 rule lives (DESIGN §5.2). Nothing else in the UI should read
 * `home.score` / `away.score` directly. `outcome` is relative to the HOME side (`sideOutcome`).
 */
export function renderScore(g: Game): ScoreView {
  if (g.status === 'postponed') return { kind: 'postponed', newDate: null };
  if (g.status === 'score-pending') return { kind: 'unreported' };
  const outcome = sideOutcome(g, 'home');
  if (outcome === null || g.home.score === null || g.away.score === null) {
    return { kind: 'scheduled', time: g.isTimeTba ? null : timeOfDay(g.dateLocal) };
  }
  return {
    kind: 'final',
    home: g.home.score,
    away: g.away.score,
    outcome,
    decider: g.decider ?? 'REG',
    shootout: g.shootout,
  };
}

/**
 * The phrases copy builds around a section's shootout words (SectionConfig.shootout.words in
 * lib/config/leagues.ts, which this client-safe module cannot import, so callers pass the words in):
 *
 *   words        noun        onPhrase          wonOn               decidedOn               decidedIt               win               tally
 *   '1 v 1s'     '1 v 1'     'on 1 v 1s'       'won on 1 v 1s'     'decided on 1 v 1s'     '1 v 1s decided it'     'a 1 v 1 win'     'the 1 v 1 tally'
 *   'a shootout' 'shootout'  'in a shootout'   'won in a shootout' 'decided by a shootout' 'a shootout decided it' 'a shootout win'  'the shootout tally'
 *
 * The Northern Section's words are a plural series of duels ("1 v 1s", NS Guidelines §VII.E.4), so a
 * team wins ON them, as every EAL string has always said (pinned by tests); the San Diego Section's
 * are one event with its article ("a shootout", SDFHOA 2026 procedures), so a team wins IN it. The
 * article is what tells the two apart: no other preposition table is needed while those are the only
 * two shapes, and a third section's words would be one of them.
 *
 * `inference` (SectionConfig.shootout.inference) decides what the phrases that describe ONE game may say.
 * 'verified' (the default; the Northern Section, whose box score shows an 'SO Win' column) gives the table
 * above, unchanged. 'unverified' (the San Diego Section: si.com and the Section's power rankings record
 * Mt. Carmel–Poway, Sep 11, as 2-0 where MaxPreps has 0-0 marked W and L) never says a shootout decided the
 * game, only that MaxPreps credits the win on a level score:
 *
 *   onPhrase 'on a level score'   wonOn 'credited with the win'   decidedOn 'credited as a win on a level score'
 *   decidedIt 'MaxPreps credits the win on a level score'
 *
 * noun, win, tally and pronoun do not describe what happened in a game ('no shootout winner flagged', 'may
 * have recorded a shootout win as a goal'), so they stay the rule's words. A sentence that states the RULE
 * ('a varsity game there outside a tournament is decided by a shootout', components/game/GameSources.tsx;
 * lib/pipeline/reconcile/backfill.ts's D24 note) calls this with the default: the rule is sourced whatever MaxPreps recorded.
 */
export interface ShootoutPhrases {
  /** '1 v 1' | 'shootout': the thing itself, singular, no article ('no 1 v 1 winner flagged'). */
  noun: string;
  /**
   * 'on 1 v 1s' | 'in a shootout': the phrase that follows a verb and a score, for a line that says
   * who won or lost without the word 'won' ('Earlier: lost 1–1 on 1 v 1s at home',
   * views/teams/team-view.ts). For a 'verified' section `wonOn` is 'won ' + this.
   */
  onPhrase: string;
  wonOn: string;
  decidedOn: string;
  decidedIt: string;
  win: string;
  tally: string;
  /** 'them' (the 1 v 1s) | 'it' (the shootout): 'si.com does not say who won them'. */
  pronoun: 'it' | 'them';
}

export function shootoutPhrases(words: string, inference: ShootoutInference = 'verified'): ShootoutPhrases {
  const single = /^an? /.exec(words);
  if (inference === 'unverified') {
    const noun = single ? words.slice(single[0].length) : words.replace(/s$/, '');
    return {
      noun,
      onPhrase: 'on a level score',
      wonOn: 'credited with the win',
      decidedOn: 'credited as a win on a level score',
      decidedIt: 'MaxPreps credits the win on a level score',
      win: single ? `${single[0]}${noun} win` : `a ${noun} win`,
      tally: `the ${noun} tally`,
      pronoun: single ? 'it' : 'them',
    };
  }
  if (single) {
    const noun = words.slice(single[0].length);
    return {
      noun,
      onPhrase: `in ${words}`,
      wonOn: `won in ${words}`,
      decidedOn: `decided by ${words}`,
      decidedIt: `${words} decided it`,
      win: `${single[0]}${noun} win`,
      tally: `the ${noun} tally`,
      pronoun: 'it',
    };
  }
  const noun = words.replace(/s$/, '');
  return {
    noun,
    onPhrase: `on ${words}`,
    wonOn: `won on ${words}`,
    decidedOn: `decided on ${words}`,
    decidedIt: `${words} decided it`,
    win: `a ${noun} win`,
    tally: `the ${noun} tally`,
    pronoun: 'them',
  };
}

/** The words a sentence uses when its caller names no section ('a shootout': true of every 'SO' game). */
const GENERIC_SHOOTOUT_WORDS = 'a shootout';

/**
 * 'Saint Francis 7, Homestead 0, final.' — the screen-reader sentence (DESIGN §10.6). A final
 * decided by a shootout with no stored tally (decider 'SO') names the winner instead, in the words
 * of the section's rule (`shootoutWords`, SectionConfig.shootout.words: views/shared/describe-game.ts
 * passes them): 'Chico 1, Davis 1, final; Chico won on 1 v 1s.' for the EAL, '<home> 0, <away> 0,
 * final; <winner> won in a shootout.' for a section whose shootouts are verified. A caller that names
 * no section gets the generic 'won in a shootout', true of every 'SO' game. With `shootoutInference`
 * 'unverified' (the San Diego Section) it names no shootout: '<home> 0, <away> 0, final; <winner>
 * credited with the win (MaxPreps lists 0–0 with no tally).' `quietOvertime` drops " after overtime"
 * (the view sets it when MaxPreps' overtime count cannot be right for the league).
 */
export function scoreSentence(
  g: Game,
  opts: { quietOvertime?: boolean; shootoutWords?: string | null; shootoutInference?: ShootoutInference | null } = {},
): string {
  const view = renderScore(g);
  switch (view.kind) {
    case 'final': {
      const head = `${g.home.name} ${view.home}, ${g.away.name} ${view.away}, final`;
      if (view.decider === 'SO' && view.shootout === null && view.outcome !== 'T') {
        const inference = opts.shootoutInference ?? 'verified';
        const { wonOn } = shootoutPhrases(opts.shootoutWords ?? GENERIC_SHOOTOUT_WORDS, inference);
        const winner = view.outcome === 'W' ? g.home.name : g.away.name;
        return inference === 'unverified'
          ? `${head}; ${winner} ${wonOn} (MaxPreps lists ${view.home}${EN_DASH}${view.away} with no tally).`
          : `${head}; ${winner} ${wonOn}.`;
      }
      return `${head}${
        !opts.quietOvertime && (view.decider === 'OT' || view.decider === '2OT') ? ' after overtime' : ''
      }${view.decider === 'FORFEIT' ? ' by forfeit' : ''}.`;
    }
    case 'unreported':
      return `${g.away.name} at ${g.home.name}: score not reported.`;
    case 'postponed':
      return `${g.away.name} at ${g.home.name}: postponed.`;
    case 'scheduled':
      return `${g.away.name} ${matchupJoiner(g)} ${g.home.name}: ${
        view.time ? `${view.time} PT` : 'time to be announced'
      }.`;
  }
}

/**
 * The word between the away and the home side of a matchup: 'vs' at a neutral site, 'at'
 * otherwise ('Fremont at Cupertino'). One team's own 'vs' / 'at' is `describeGame(...).versus`.
 */
export function matchupJoiner(game: Pick<Game, 'site'>): 'vs' | 'at' {
  return game.site === 'neutral' ? 'vs' : 'at';
}
