/**
 * A final's off-site result links on /game/[id] (`GameView.resultLinks`).
 */

import type { Game } from '@/lib/model/game';

import type { GameLink } from './types';

/**
 * A final's result links (`GameView.resultLinks`). The accent pill is the source the score came
 * from: si.com's game page when the published score is si.com's (D2), else the MaxPreps box score.
 */
export function resultLinksFor(game: Game): GameLink[] {
  if (game.status !== 'final') return [];
  const links: GameLink[] = [];
  const sbliveScored = game.provenance.scores === 'sblive';
  if (sbliveScored && game.urls.sblive) {
    links.push({ href: game.urls.sblive, label: 'si.com game', accent: true });
  }
  if (game.urls.maxpreps) {
    // Beside a si.com score, MaxPreps' contest page may carry no score (or a wrong one): it is the
    // contest page, not "the box score", and never the accent pill.
    links.push(
      sbliveScored
        ? { href: game.urls.maxpreps, label: 'MaxPreps game' }
        : { href: game.urls.maxpreps, label: 'MaxPreps box score', accent: true },
    );
  }
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  return links;
}
