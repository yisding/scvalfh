import { shootoutPhrases } from '../../lib/format';
import { LEAGUES, findDivision, findLeague } from '../../lib/leagues';
import { shootoutGroupName, shootoutSectionOf } from '../ui/describe-game';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import type { GameModel } from './game-view';

/** Whether any league of this build takes a score from si.com (LeagueConfig.sblive.backfill). */
const READS_SBLIVE = LEAGUES.some((l) => l.sblive.backfill);

/**
 * The source blocks of a game page.
 *
 * `GameSourceLine` is owner decision D2's transparency rule on one contest: when the published score
 * is High School on SI's (si.com) — MaxPreps had no contest for an official fixture, had the
 * contest with no score, or its row was clearly wrong — the page says so, with the rule's own note:
 * `Score via High School on SI (si.com): <rule note>.` A San Diego Section playoff score from the Section's
 * bracket sheet (MaxPreps had no contest, or no score) says so the same way, and links the sheet. Both sources are linked, but a link that is
 * already one of the final's result links in DETAILS (`GameModel.resultLinks`) is not repeated here.
 *
 * `SourceDisagreement` is the site's credibility mechanism applied to one contest (DESIGN §9,
 * SPEC §5.7): when MaxPreps and si.com publish different numbers we show which one we publish and
 * why, say so on the page, and link both sources so a reader can check. It sits directly under the
 * scoreboard, because a disagreement buried in a footer is a disagreement hidden.
 *
 * `GameElsewhere` is the cross-check method sentence for one game. Since DESIGN §33 method text lives
 * on /about and the game page does NOT render this block; each school's pages on the two sources
 * moved to DETAILS (GameDetails). It is kept because the sentence is the one place the league-aware
 * wording is written and tested (D23, D24). Each link has one home (DETAILS), except in this file's
 * two disagreement notes: SourceDisagreement cites both sources' pages and ResultFlagConflict
 * MaxPreps' page beside their sentences.
 *
 * The cross-check sentence follows the game's league config: a game counted in a division with no
 * official schedule (`official.mode` 'none', spec D23), or a league-postseason game or a game between
 * two members of a league none of whose divisions has one, is "a league game", never "an official" one,
 * and a game between two teams of a section that ends a level game with a shootout
 * (SectionConfig.shootout: the EAL's 1 v 1s; the San Diego Section's shootout, which covers a game
 * between two of its conferences too) adds the backfill's D24 exception: a level si.com score is
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
  const sheetUrl = source.sheetUrl && !pills.has(source.sheetUrl) ? source.sheetUrl : null;
  return (
    <aside
      className={['sx-inset max-w-prose text-ink', className].filter(Boolean).join(' ')}
      aria-label="Where this score comes from"
    >
      <p className="m-0">
        {source.marked ? <span aria-hidden="true">&dagger; </span> : null}
        {source.text}
      </p>
      {sbliveUrl || maxprepsUrl || sheetUrl ? (
        <p className="m-0 flex flex-wrap gap-x-4">
          {sheetUrl ? (
            <ExternalLink href={sheetUrl} className="sx-link">
              The Section&rsquo;s bracket sheet
            </ExternalLink>
          ) : null}
          {sbliveUrl ? (
            <ExternalLink href={sbliveUrl} className="sx-link">
              si.com&rsquo;s page
            </ExternalLink>
          ) : null}
          {maxprepsUrl ? (
            <ExternalLink href={maxprepsUrl} className="sx-link">
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
        {/* The sentence is written by the pipeline and carries both numbers already. */}
        {conflict.note}
      </p>
      {conflict.sbliveUrl || conflict.maxprepsUrl ? (
        <p className="m-0 flex flex-wrap gap-x-4">
          {conflict.sbliveUrl ? (
            <ExternalLink href={conflict.sbliveUrl} className="sx-link">
              si.com&rsquo;s page
            </ExternalLink>
          ) : null}
          {conflict.maxprepsUrl ? (
            <ExternalLink href={conflict.maxprepsUrl} className="sx-link">
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
        {model.resultConflictNote}
      </p>
      {url ? (
        <p className="m-0">
          <ExternalLink href={url} className="sx-link">
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
  // The cross-check sentence is about a SCORE, so it only belongs on a game that has one.
  const isFinal = display.kind === 'final';
  if (!isFinal) return null;
  // D24 (lib/crosscheck/backfill.ts): the section BOTH sides are teams of, when it ends a level game with a shootout
  // (keyed on the section, as lib/pipeline/normalize.ts keys decider 'SO'). Lookups here never throw: the snapshot
  // schema checks a tag's league id only for shape, so an id no longer configured reads as no league (and
  // the page renders) rather than failing the build.
  const pairLeague =
    home.team && away.team && home.team.league === away.team.league ? (findLeague(home.team.league) ?? null) : null;
  const shootout = shootoutSectionOf(model.game);
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
  const crossCheck = !READS_SBLIVE
    ? // A build that reads no si.com page (soccer, basketball: every league's `sblive.backfill` is off) has no
      // second score to publish; its one cross-check is the Sections' own widget, listed on /about.
      'Scores come from MaxPreps. They are compared with the scores schools enter on cifsshome.org, and every difference is listed on the About page; MaxPreps’ score is the one shown.'
    : `Scores come from MaxPreps and are cross-checked against High School on SI (si.com). When MaxPreps has no result for ${leagueGame}, or its row is clearly wrong, we publish si.com\u2019s score and mark it; when both have a score and disagree, we publish MaxPreps\u2019 and show the disagreement rather than choosing quietly.` +
    (shootout?.shootout
      ? ` A level si.com score between two ${shootoutGroupName(shootout)} teams is never used: a varsity game there${
          // The SDFHOA procedures do not cover invitational tournaments (SectionConfig.shootout.
          // coversTournaments false), where San Diego games have ended level; the EAL's sentence is unchanged.
          shootout.shootout.coversTournaments ? '' : ' outside a tournament'
        } is ${
          // The rule, not this game: 'decided by a shootout' whatever the section's inference.
          shootoutPhrases(shootout.shootout.words).decidedOn
        }, and si.com does not say who won ${shootoutPhrases(shootout.shootout.words).pronoun}.`
      : '');

  return (
    <section className={className} aria-labelledby="game-sources-kicker">
      <SectionHeader kicker="About this score" as="h2" id="game-sources-kicker" />
      <p className="sx-note">{crossCheck}</p>
    </section>
  );
}

export default GameElsewhere;
