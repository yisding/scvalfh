import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import type { GameModel } from './game-model';

/**
 * The two source blocks of a game page.
 *
 * `SourceDisagreement` is the site's credibility mechanism applied to one contest (DESIGN §9,
 * SPEC §5.7): when MaxPreps and SBLive publish different numbers we show MaxPreps', say so on the
 * page, and link both sources so a reader can check. It sits directly under the scoreboard, because
 * a disagreement buried in a footer is a disagreement hidden.
 *
 * `GameElsewhere` is the per-page half of the attribution posture: the layout's footer credits the
 * sources site-wide, and this block carries the deep links for THIS contest and these two schools
 * (DESIGN §7.15).
 */

export interface SourceDisagreementProps {
  model: GameModel;
  className?: string;
}

export function SourceDisagreement({ model, className }: SourceDisagreementProps) {
  const { conflict } = model;
  if (!conflict) return null;
  return (
    <aside
      className={`sx-inset max-w-prose text-ink${className ? ` ${className}` : ''}`}
      aria-label="Sources disagree on this score"
    >
      <p className="m-0">
        <span aria-hidden="true">&#9873; </span>
        {/* The sentence is written by lib/crosscheck.ts and carries both numbers already. */}
        {conflict.note}
      </p>
      {conflict.sbliveUrl || conflict.maxprepsUrl ? (
        <p className="m-0 flex flex-wrap gap-x-4">
          {conflict.sbliveUrl ? (
            <ExternalLink href={conflict.sbliveUrl} className="sx-action no-underline">
              SBLive&rsquo;s page
            </ExternalLink>
          ) : null}
          {conflict.maxprepsUrl ? (
            <ExternalLink href={conflict.maxprepsUrl} className="sx-action no-underline">
              MaxPreps&rsquo; page
            </ExternalLink>
          ) : null}
        </p>
      ) : null}
    </aside>
  );
}

export interface GameElsewhereProps {
  model: GameModel;
  className?: string;
}

export function GameElsewhere({ model, className }: GameElsewhereProps) {
  const { game, away, home } = model;
  const sides = [away, home].flatMap((side) =>
    side.team
      ? [{ name: side.name, maxprepsUrl: side.team.external.maxprepsTeamUrl, sbliveUrl: side.sbliveUrl }]
      : [],
  );
  const teamRows = sides.filter((side) => side.maxprepsUrl || side.sbliveUrl);

  // This contest first — the box score is the one accent pill — then one row per school, so the
  // links scan by team instead of repeating each school's name in four equal-weight pills.
  const gameLinks: Array<{ href: string; label: string; accent?: boolean }> = [];
  if (game.urls.maxpreps) {
    gameLinks.push({ href: game.urls.maxpreps, label: 'MaxPreps box score for this game', accent: true });
  }
  if (game.urls.sblive) gameLinks.push({ href: game.urls.sblive, label: 'SBLive/SI page for this game' });

  return (
    <section className={className} aria-labelledby="game-sources-kicker">
      <SectionHeader kicker="Elsewhere" as="h2" id="game-sources-kicker" />
      {gameLinks.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {gameLinks.map((link) => (
            <li key={link.href}>
              <ExternalLink
                href={link.href}
                // ExternalLink adds a `text-accent` utility, which would beat the pill's
                // accent-ink (accent on the wash is 4.37:1 in dark); `!` keeps accent-ink.
                className={link.accent ? 'sx-pill sx-pill-accent text-accent-ink!' : 'sx-pill'}
              >
                {link.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      ) : null}
      {teamRows.length > 0 ? (
        <div className={`sx-card sx-flush sx-bleed${gameLinks.length > 0 ? ' mt-4' : ''}`}>
          <ul className="sx-list">
            {teamRows.map((side) => (
              <li
                key={side.name}
                className="flex min-h-row-1 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2"
              >
                <span className="mr-auto min-w-0 text-body text-ink">{side.name}</span>
                <span className="flex flex-wrap gap-2">
                  {side.maxprepsUrl ? (
                    <ExternalLink href={side.maxprepsUrl} className="sx-pill">
                      <span className="sr-only">{side.name} on </span>MaxPreps
                    </ExternalLink>
                  ) : null}
                  {side.sbliveUrl ? (
                    <ExternalLink href={side.sbliveUrl} className="sx-pill">
                      <span className="sr-only">{side.name} on </span>SBLive/SI
                    </ExternalLink>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
        Scores come from MaxPreps and are cross-checked against SBLive/SI. When the two disagree we
        publish MaxPreps&rsquo; number and show the disagreement rather than choosing quietly.
      </p>
    </section>
  );
}

export default GameElsewhere;
