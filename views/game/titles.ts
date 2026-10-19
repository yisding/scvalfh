/**
 * The /game/[id] strings that leave the page: the `<title>`, OG title and `<h1>` (`gameTitle`), the
 * result sentence (`gameRecap`), the `<meta name="description">` and OG description
 * (`gameDescription`) and the OG card's kicker and date line (`gameKicker`, `gameCardWhen`). One
 * composer each, read by the page, its metadata, views/site/structured-data.ts and the OG card
 * (components/og/GameCard.tsx), so a link preview and the page cannot disagree.
 */

import { leagueSportWords } from '@/lib/config/leagues/labels';
import { SEASON_DISPLAY } from '@/lib/config/season';
import { dateWithYear, timeOfDayPT } from '@/lib/format/dates';
import { matchupJoiner } from '@/lib/format/score';
import { indefiniteArticle } from '@/lib/format/words';
import { gameContextNoun, resultSentence } from '@/views/shared/describe-game';

import type { GameView } from './game-view';

/**
 * The page title, the OG title and the `<h1>` — one composer, so they cannot drift.
 *
 * A final names the WINNER first, because that is the headline a reader pastes into a group chat;
 * every other state keeps the site's away-then-home order. The numbers are `SideView.glyph`, so an
 * unreported game reads `—` and never `0`.
 *
 * It names the sport, once, inside the first ~60 characters a search result shows: "Canyon Hills 3,
 * Bishop's 2 — field hockey, Sep 29, 2026", "Helix vs Sage Creek field hockey — Oct 17, 2026, 4:00 PM
 * PT". People search a matchup as "<school> <school> field hockey", and the site-name suffix that
 * used to be the only "field hockey" in the title was the part a result cut off.
 */
export function gameTitle(model: GameView): string {
  const { display, game, away, home } = model;
  const date = dateWithYear(game.dateLocal);
  if (display.kind === 'final') {
    // Winner first on a decided game; a draw keeps the site's away-then-home order.
    const [first, second] = home.view.weight === 'winner' ? [home, away] : [away, home];
    const decider = display.deciderTag ? ` (${display.deciderTag})` : '';
    return `${first.label} ${first.view.glyph}, ${second.label} ${second.view.glyph}${decider} — field hockey, ${date}`;
  }
  const joiner = matchupJoiner(game);
  const suffix =
    display.kind === 'scheduled'
      ? game.isTimeTba
        ? 'time TBA'
        : timeOfDayPT(game.dateLocal)
      : display.statusLabel.toLowerCase();
  return `${away.label} ${joiner} ${home.label} field hockey — ${date}, ${suffix}`;
}

/** `De Anza Division league game` | `MCAL league game` | `MCAL semifinal` | `non-league game`. */
function contextNoun(model: GameView): string {
  // The postseason's round label ('MCAL semifinal'); 'Postseason' is the label of an independents'
  // postseason game, a common noun mid-sentence.
  return gameContextNoun(model.game, model.contextLabel === 'Postseason' ? 'postseason' : model.contextLabel);
}

/**
 * The page's result sentence, winner first ('Point Loma won their home non-league game against Helix
 * 7–1.'), with the page's own context noun (`resultSentence`); null for anything but a final.
 */
export function gameRecap(model: GameView): string | null {
  return resultSentence(model.game, contextNoun(model));
}

/** The `<meta name="description">` and the OG description: `… in <League name> girls varsity field hockey, Fall 2026` (SEASON_DISPLAY). */
export function gameDescription(model: GameView): string {
  const { game, display, away, home, league } = model;
  const context = contextNoun(model);
  const where = `${league ? leagueSportWords(league.id) : 'girls varsity field hockey'}, ${SEASON_DISPLAY}`;
  const recap = gameRecap(model);
  if (recap) {
    // Dated: the sentence carries no date, so a rematch with the same score would have the same
    // description as the first meeting. It already names the context, so the tail names the league.
    return `${dateWithYear(game.dateLocal)}: ${recap} ${where.charAt(0).toUpperCase()}${where.slice(1)} — ${
      model.source ? 'score via High School on SI (si.com); unofficial.' : 'unofficial, rebuilt twice daily from MaxPreps.'
    }`;
  }
  const joiner = matchupJoiner(game);
  return `${away.name} ${joiner} ${home.name}, ${model.whenLabel} — ${indefiniteArticle(
    context,
    { mode: 'vowel-or-acronym' },
  )} ${context} in ${where}. ${
    display.kind === 'unreported'
      ? 'Played; no score reported yet.'
      : model.source
        ? 'Score via High School on SI (si.com); standings rebuilt twice daily. Unofficial.'
        : 'Scores and standings rebuilt twice daily from MaxPreps. Unofficial.'
  }`;
}

/** The date line on the OG card: `Sep 24, 2026 · 4:00 PM PT` | `Sep 24, 2026 · time TBA`. */
export function gameCardWhen(model: GameView): string {
  const { game } = model;
  return game.isTimeTba
    ? `${dateWithYear(game.dateLocal)} · time TBA`
    : `${dateWithYear(game.dateLocal)} · ${timeOfDayPT(game.dateLocal)}`;
}

/** The kicker line on the OG card: `FINAL · BVAL · Santa Teresa`, `FINAL · Non-league`, `FINAL · MCAL semifinal`. */
export function gameKicker(model: GameView): string {
  const parts = [model.display.statusLabel];
  if (model.display.deciderTag) parts.push(model.display.deciderTag);
  parts.push(model.contextLabel);
  return parts.join(' · ');
}
