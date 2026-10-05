import { findDivision, findLeague } from '../../lib/leagues';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import type { GameModel } from './game-view';

/**
 * The source blocks of a game page.
 *
 * `GameSourceLine` is owner decision D2's transparency rule on one contest: when the published score
 * is High School on SI's (si.com) — MaxPreps had no contest for an official fixture, had the
 * contest with no score, or its row was clearly wrong — the page says so, with the rule's own note:
 * `Score via High School on SI (si.com): <rule note>.` Both sources are linked, but a link that is
 * already one of the final's result pills directly above (`GameModel.resultLinks`, where si.com's
 * game page is the accent pill) is not repeated here.
 *
 * `SourceDisagreement` is the site's credibility mechanism applied to one contest (DESIGN §9,
 * SPEC §5.7): when MaxPreps and si.com publish different numbers we show which one we publish and
 * why, say so on the page, and link both sources so a reader can check. It sits directly under the
 * scoreboard, because a disagreement buried in a footer is a disagreement hidden.
 *
 * `GameElsewhere` is the per-page half of the attribution posture: the layout's footer credits the
 * sources site-wide, and this block carries the deep links for these two schools (DESIGN §7.15).
 * The links for THIS contest are not repeated here (F-71c): a final's result links sit under the
 * recap (`GameModel.resultLinks`), and every other per-game link is in DETAILS and the source
 * line. Each link has one home, except in this file's two disagreement notes: SourceDisagreement
 * cites both sources' pages and ResultFlagConflict MaxPreps' page beside their sentences, even
 * when that page is also a result pill under the recap.
 *
 * The cross-check sentence follows the game's league config: a game counted in a division with no
 * official schedule (`official.mode` 'none', spec D23), or a league-postseason game or a game between
 * two members of a league none of whose divisions has one, is "a league game", never "an official" one,
 * and a game between two members of a league that decides a level game on 1 v 1s
 * (`rules.leagueOvertime` 'shootout') adds the backfill's D24 exception: a level si.com score is
 * never used there.
 */

export interface GameSourceLineProps {
  model: GameModel;
  className?: string;
}

export function GameSourceLine({ model, className }: GameSourceLineProps) {
  const { source } = model;
  if (!source) return null;
  // Each link has one home (F-71c): a source page that is already a result pill stays there.
  const pills = new Set(model.resultLinks.map((link) => link.href));
  const sbliveUrl = source.sbliveUrl && !pills.has(source.sbliveUrl) ? source.sbliveUrl : null;
  const maxprepsUrl =
    source.maxprepsUrl && !pills.has(source.maxprepsUrl) ? source.maxprepsUrl : null;
  return (
    <aside
      className={['sx-inset max-w-prose text-ink', className].filter(Boolean).join(' ')}
      aria-label="Where this score comes from"
    >
      <p className="m-0">
        <span aria-hidden="true">&dagger; </span>
        {source.text}
      </p>
      {sbliveUrl || maxprepsUrl ? (
        <p className="m-0 flex flex-wrap gap-x-4">
          {sbliveUrl ? (
            <ExternalLink href={sbliveUrl} className="sx-action no-underline">
              si.com&rsquo;s page
            </ExternalLink>
          ) : null}
          {maxprepsUrl ? (
            <ExternalLink href={maxprepsUrl} className="sx-action no-underline">
              MaxPreps&rsquo; page
            </ExternalLink>
          ) : null}
        </p>
      ) : null}
    </aside>
  );
}

export interface SourceDisagreementProps {
  model: GameModel;
  className?: string;
}

export function SourceDisagreement({ model, className }: SourceDisagreementProps) {
  const { conflict } = model;
  if (!conflict) return null;
  return (
    <aside
      className={['sx-inset max-w-prose text-ink', className].filter(Boolean).join(' ')}
      aria-label="Sources disagree on this score"
    >
      <p className="m-0">
        <span aria-hidden="true">&#9873; </span>
        {/* The sentence is written by the pipeline and carries both numbers already. */}
        {conflict.note}
      </p>
      {conflict.sbliveUrl || conflict.maxprepsUrl ? (
        <p className="m-0 flex flex-wrap gap-x-4">
          {conflict.sbliveUrl ? (
            <ExternalLink href={conflict.sbliveUrl} className="sx-action no-underline">
              si.com&rsquo;s page
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

/**
 * MaxPreps' own result flags contradict the score it published (a 0-0 game flagged W/L, most
 * likely a shootout), and no si.com score replaced it: say so under the scoreboard, and what the
 * site counts, so "Tie" here never silently disagrees with MaxPreps or the recap.
 */
export function ResultFlagConflict({ model, className }: SourceDisagreementProps) {
  if (!model.resultConflictNote) return null;
  const url = model.game.urls.maxpreps;
  return (
    <aside
      className={['sx-inset max-w-prose text-ink', className].filter(Boolean).join(' ')}
      aria-label="MaxPreps’ result flags disagree with the score"
    >
      <p className="m-0">
        <span aria-hidden="true">&#9873; </span>
        {model.resultConflictNote}
      </p>
      {url ? (
        <p className="m-0">
          <ExternalLink href={url} className="sx-action no-underline">
            MaxPreps&rsquo; page
          </ExternalLink>
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
  // D24 (lib/backfill.ts): the league BOTH sides belong to, when it decides a level game on 1 v 1s.
  // Lookups here never throw: the snapshot schema checks a tag's league id only for shape, so an id
  // no longer configured reads as no league (and the page renders) rather than failing the build.
  const pairLeague =
    home.team && away.team && home.team.league === away.team.league ? (findLeague(home.team.league) ?? null) : null;
  const shootout = pairLeague?.rules.leagueOvertime === 'shootout' ? pairLeague : null;
  // D23: a game with no schedule document behind it has league games, but no official ones. A
  // counted game reads its division; any other reads the league of its league-postseason tag (the
  // EAL Super Regional), else the league both sides belong to, when none of its divisions has one.
  const tag = model.game.postseason;
  const ownLeague =
    tag?.kind === 'league-postseason' && tag.leagueId !== null ? (findLeague(tag.leagueId) ?? pairLeague) : pairLeague;
  const unscheduled =
    model.division !== null
      ? findDivision(model.division)?.official.mode === 'none'
      : ownLeague !== null && ownLeague.divisions.every((d) => d.official.mode === 'none');
  const leagueGame = unscheduled ? 'a league game' : 'an official league game';
  // One string, so a page outside both cases renders the same markup as before.
  const crossCheck =
    `Scores come from MaxPreps and are cross-checked against High School on SI (si.com). When MaxPreps has no result for ${leagueGame}, or its row is clearly wrong, we publish si.com\u2019s score and mark it; when both have a score and disagree, we publish MaxPreps\u2019 and show the disagreement rather than choosing quietly.` +
    (shootout
      ? ` A level si.com score between two ${shootout.shortName} teams is never used: a varsity game there is decided on 1 v 1s, and si.com does not say who won them.`
      : '');

  return (
    <section className={className} aria-labelledby="game-sources-kicker">
      <SectionHeader kicker="Elsewhere" as="h2" id="game-sources-kicker" />
      {teamRows.length > 0 ? (
        <div className="sx-card sx-flush sx-bleed">
          {/* One row per school, so the links scan by team instead of repeating each school's
              name in four equal-weight pills. The visible name is the SHORT one (F-26c): a long full
              name ("Convent of the Sacred Heart") wrapped its row at 390, and the full name is still
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
                      className="sx-pill sx-pill-ring"
                    >
                      <span className="sr-only">{side.name} on </span>MaxPreps
                    </ExternalLink>
                  ) : null}
                  {side.sbliveUrl ? (
                    <ExternalLink
                      href={side.sbliveUrl}
                      className="sx-pill sx-pill-ring"
                    >
                      <span className="sr-only">{side.name} on </span>si.com
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
          {crossCheck}
        </p>
      ) : null}
    </section>
  );
}

export default GameElsewhere;
