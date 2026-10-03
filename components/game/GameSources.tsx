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
 * sources site-wide, and this block carries the deep links for these two schools (DESIGN §7.15).
 * The links for THIS contest are not repeated here (F-71c): a final's box score and stream sit
 * under the recap, and every other per-game link is in DETAILS. Each link has one home, except this
 * file's own pair: a disagreement cites both sources even when the box score is also linked under
 * the recap.
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
  const { display, away, home } = model;
  const teamRows = [away, home].flatMap((side) =>
    side.team && (side.team.external.maxprepsTeamUrl || side.sbliveUrl)
      ? [
          {
            slug: side.team.slug,
            name: side.name,
            shortName: side.team.shortName,
            maxprepsUrl: side.team.external.maxprepsTeamUrl,
            sbliveUrl: side.sbliveUrl,
          },
        ]
      : [],
  );
  // The cross-check sentence is about a SCORE, so it only belongs on a game that has one.
  const isFinal = display.kind === 'final';
  if (teamRows.length === 0 && !isFinal) return null;

  return (
    <section className={className} aria-labelledby="game-sources-kicker">
      <SectionHeader kicker="Elsewhere" as="h2" id="game-sources-kicker" />
      {teamRows.length > 0 ? (
        <div className="sx-card sx-flush sx-bleed">
          {/* One row per school, so the links scan by team instead of repeating each school's
              name in four equal-weight pills. The visible name is the SHORT one (F-26c): the full
              "St. Ignatius College Preparatory" wrapped its row at 390, and the full name is still
              what each pill announces. The pills are raised to the surface with the hairline
              ring, the site's capsule for a secondary link (F-56g). */}
          <ul className="sx-list">
            {teamRows.map((side) => (
              <li
                key={side.slug}
                className="flex min-h-row-1 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2"
              >
                <span className="mr-auto min-w-0 text-body text-ink">{side.shortName}</span>
                <span className="flex flex-wrap gap-2">
                  {side.maxprepsUrl ? (
                    <ExternalLink
                      href={side.maxprepsUrl}
                      className="sx-pill bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
                    >
                      <span className="sr-only">{side.name} on </span>MaxPreps
                    </ExternalLink>
                  ) : null}
                  {side.sbliveUrl ? (
                    <ExternalLink
                      href={side.sbliveUrl}
                      className="sx-pill bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
                    >
                      <span className="sr-only">{side.name} on </span>SBLive/SI
                    </ExternalLink>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {isFinal ? (
        <p
          className={
            teamRows.length > 0
              ? 'mt-3 mb-0 max-w-prose text-meta text-ink-3'
              : 'm-0 max-w-prose text-meta text-ink-3'
          }
        >
          Scores come from MaxPreps and are cross-checked against SBLive/SI. When the two disagree
          we publish MaxPreps&rsquo; number and show the disagreement rather than choosing quietly.
        </p>
      ) : null}
    </section>
  );
}

export default GameElsewhere;
