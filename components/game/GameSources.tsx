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
      className={`rounded-card px-3 py-2 text-meta text-ink${className ? ` ${className}` : ''}`}
      style={{ background: 'var(--sx-accent-wash)' }}
      aria-label="Sources disagree on this score"
    >
      <span aria-hidden="true">&#9873; </span>
      {/* The sentence is written by lib/crosscheck.ts and carries both numbers already. */}
      {conflict.note}{' '}
      {conflict.sbliveUrl ? (
        <ExternalLink href={conflict.sbliveUrl} className="text-accent-ink">
          SBLive&rsquo;s page
        </ExternalLink>
      ) : null}
      {conflict.sbliveUrl && conflict.maxprepsUrl ? ' · ' : null}
      {conflict.maxprepsUrl ? (
        <ExternalLink href={conflict.maxprepsUrl} className="text-accent-ink">
          MaxPreps&rsquo; page
        </ExternalLink>
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
    side.team ? [{ name: side.name, team: side.team, sbliveUrl: side.sbliveUrl }] : [],
  );

  return (
    <section className={className} aria-labelledby="game-sources-kicker">
      <SectionHeader kicker="Elsewhere" as="h2" id="game-sources-kicker" />
      <ul className="mt-2 mb-0 list-none space-y-1.5 p-0 text-meta">
        {/* Every link in this list is a standalone target, so each takes its own 24px box
            (WCAG 2.5.8) instead of the 17-18px line box of the text. */}
        {game.urls.maxpreps ? (
          <li>
            <ExternalLink href={game.urls.maxpreps} className="sx-action">
              MaxPreps box score for this game
            </ExternalLink>
          </li>
        ) : null}
        {game.urls.sblive ? (
          <li>
            <ExternalLink href={game.urls.sblive} className="sx-action">
              SBLive/SI page for this game
            </ExternalLink>
          </li>
        ) : null}
        {sides.map((side) => (
          <li key={side.team.slug} className="flex flex-wrap items-center gap-x-3">
            <span className="text-ink-2">{side.name}:</span>
            {side.team.external.maxprepsTeamUrl ? (
              <ExternalLink href={side.team.external.maxprepsTeamUrl} className="sx-action">
                MaxPreps
              </ExternalLink>
            ) : null}
            {side.sbliveUrl ? (
              <ExternalLink href={side.sbliveUrl} className="sx-action">
                SBLive/SI
              </ExternalLink>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-3">
        Scores come from MaxPreps and are cross-checked against SBLive/SI. When the two disagree we
        publish MaxPreps&rsquo; number and show the disagreement rather than choosing quietly.
      </p>
    </section>
  );
}

export default GameElsewhere;
