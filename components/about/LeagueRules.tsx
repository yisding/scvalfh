import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import ExternalLink from '@/components/ui/ExternalLink';
import { statusLegend } from '@/lib/engine/standings';
import { ordinal } from '@/lib/format/numbers';
import type { LeagueConfig } from '@/lib/model/league-config';
import { playoffsHref } from '@/lib/shared/routes';
import { MULTI_TEAM_WORDS, chainItems, ruleCountSentence } from '@/views/about/about-view';

/**
 * One league's rules block on /about (`#rules-<league>`, components/about/AboutStandingsRules.tsx): SCVAL's
 * by-laws quoted verbatim (QuotedRules), every other league's generated from its config citations
 * (GeneratedRules, with its postseason by kind in GeneratedPostseason).
 */

/**
 * A quoted by-law: a card with a straight 3px rule down its left edge. The rule is a pseudo-element
 * inset 16px from the top and bottom (the card's corner radius), so it stays straight; an inset
 * box-shadow would curve around the corners like a bracket.
 */
const QUOTE =
  "sx-card relative not-italic p-5 pl-6 text-body text-ink-2 before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-rule before:content-['']";

/** A sub-heading inside a league's rules block (the league itself is the h3). */
const H4 = 'm-0 mt-8 text-body font-semibold text-ink';

/**
 * A generated league's rules: points and order, which games count (`ruleCountSentence`), the tiebreak
 * chain (per bucket where the league has one), how a multi-team tie is worked, the postseason and the
 * league's own links.
 */
export function GeneratedRules({ league }: { league: LeagueConfig }) {
  const { rules } = league;
  const byBucket = rules.tiebreaks.byBucketStart ?? {};
  const bucketStarts = Object.keys(byBucket)
    .map(Number)
    .sort((a, b) => a - b);
  // The multi-team paragraph describes how a separating step is applied; a chain with none (the EAL's
  // lone 'no-rule') has nothing to apply, so the paragraph would describe a procedure the rules lack.
  const anyStepSeparates = bucketStarts.length > 0 || rules.tiebreaks.default.some((s) => s !== 'no-rule');
  return (
    <div className="sx-prose">
      <h4 className={H4}>Points &amp; standings order</h4>
      <ul className="list-disc">
        <li>{rules.citations.points}.</li>
        <li>{rules.citations.order}.</li>
        <li>{rules.citations.doubleRoundRobin}.</li>
        <li>{rules.citations.overtime}.</li>
        <li>{rules.citations.coChampions}.</li>
      </ul>
      <p>{ruleCountSentence(league)}</p>

      <h4 className={H4}>If teams are tied on points</h4>
      {bucketStarts.length > 0 ? (
        <>
          {bucketStarts.map((start) => (
            <div key={start}>
              <p className="m-0">A tie whose group starts at {ordinal(start)}:</p>
              <ol className="mt-2 list-decimal">
                {chainItems(league, byBucket[start] ?? []).map((text) => (
                  <li key={text}>{text}.</li>
                ))}
              </ol>
            </div>
          ))}
          <p>Any other tie: {chainItems(league, rules.tiebreaks.default).join('; ')}.</p>
        </>
      ) : (
        <ol className="list-decimal">
          {chainItems(league, rules.tiebreaks.default).map((text) => (
            <li key={text}>{text}.</li>
          ))}
        </ol>
      )}
      {anyStepSeparates ? <p>{MULTI_TEAM_WORDS[rules.multiTeam]}</p> : null}
      <p className="text-meta text-ink-3">
        A step this site cannot compute (a coin flip, a draw, a play-in) leaves the teams level at the
        same place, with a footnote citing the rule. Our display order is not a league ruling.
      </p>
      {rules.citations.incomplete ? <p>If the season ends with games unplayed: {rules.citations.incomplete}.</p> : null}

      <h4 className={H4}>Postseason</h4>
      <GeneratedPostseason league={league} />
      <p className="text-meta text-ink-2">
        {league.links.map((l, i) => (
          <span key={l.href}>
            {i > 0 ? ' · ' : ''}
            <ExternalLink href={l.href}>{l.label}</ExternalLink>
          </span>
        ))}
      </p>
    </div>
  );
}

/** A generated league's postseason, by kind: the CCS ladder, a league tournament, or an unbracketed tournament. */
function GeneratedPostseason({ league }: { league: LeagueConfig }) {
  const { postseason } = league;
  switch (postseason.kind) {
    case 'ccs-ladder':
      return (
        <>
          <p>{postseason.citation}.</p>
          <ul className="list-disc">
            {league.divisions.flatMap((d) =>
              postseason.ladder
                .filter((r) => r.divisions === '*' || r.divisions.includes(d.id))
                .filter((r) => r.divisions !== '*' || d === league.divisions[0])
                .map((r) => (
                  <li key={`${d.id}-${r.status}-${r.places[0]}`}>
                    {r.divisions !== '*' && league.divisions.length > 1 ? `${d.label}: ` : ''}
                    {statusLegend(d.id, r.status)}.
                  </li>
                )),
            )}
          </ul>
        </>
      );
    case 'league-tournament':
      return (
        <>
          <ul className="list-disc">
            <li>{postseason.citations.format}.</li>
            <li>{postseason.citations.seeding}.</li>
            <li>{postseason.citations.semifinal}.</li>
            <li>{postseason.citations.lastSpot}.</li>
          </ul>
          <p>{postseason.citations.qualifiersConflict}</p>
          <p>{postseason.titleNote}</p>
          <p>
            <Link href={playoffsHref(league.id)} prefetch={false} className="sx-action min-h-11 text-accent hover:underline">
              {postseason.name} <Arrow />
            </Link>
          </p>
        </>
      );
    case 'unbracketed-tournament':
      // The written rule and dates only: no bracket and no seeding is computed (the seeding text is
      // quoted, never applied).
      return (
        <>
          <ul className="list-disc">
            <li>{postseason.citations.qualification}.</li>
            <li>{postseason.citations.format}.</li>
            <li>{postseason.citations.seeding}.</li>
            <li>{postseason.citations.eligibility}.</li>
            <li>{postseason.citations.noFurtherPath}.</li>
          </ul>
          <p>{postseason.note}</p>
        </>
      );
    case 'no-postseason':
      // The Sunset: the Section's bylaws, quoted in the citation, and the note; no ladder to explain.
      return (
        <>
          <ul className="list-disc">
            <li>{postseason.citations.noPlayoffs}.</li>
          </ul>
          <p>
            {postseason.note} <ExternalLink href={postseason.sourceUrl}>{postseason.sourceLabel}</ExternalLink>
          </p>
        </>
      );
    case 'section-playoffs':
      // The San Diego Section's playoffs: the Green Book's rule and the ladder's two rungs. No bracket and
      // no seed is computed; `seeding` is the config's paraphrase (the bylaw's play-in sentence is never quoted).
      return (
        <>
          <p>{postseason.qualificationLine}</p>
          <ul className="list-disc">
            <li>{postseason.citations.qualification}.</li>
            <li>{postseason.citations.seeding}.</li>
            <li>{postseason.citations.format}.</li>
            {league.divisions
              .slice(0, 1)
              .flatMap((d) => postseason.ladder.map((r) => <li key={`${d.id}-${r.status}`}>{statusLegend(d.id, r.status)}.</li>))}
          </ul>
          <p>
            {postseason.note} {postseason.citations.roundDates}
          </p>
          <p>
            <Link href={`/playoffs#${league.id}`} prefetch={false} className="sx-action min-h-11 text-accent hover:underline">
              {postseason.name} <Arrow />
            </Link>
          </p>
        </>
      );
  }
}

/** SCVAL's by-laws, quoted verbatim (unchanged from the single-league site). */
export function QuotedRules({ league }: { league: LeagueConfig }) {
  const stages = league.rules.citations.stages;
  const qualification = league.postseason.kind === 'ccs-ladder' ? league.postseason.citation : '';
  return (
    <div className="sx-prose">
      <p>
        League membership is a list we maintain from the official {league.shortName} alignment, not
        whatever happens to appear in the MaxPreps feed that day. De Anza has 7 teams this season:
        the official grid still lists Wilcox, but Wilcox is not fielding a team, so it is not shown
        anywhere on the site and its grid fixtures are not counted. The rules are quoted below,
        verbatim, from the SCVAL Field Hockey By-Laws 2026-27.
      </p>

      <h4 className={H4}>Points &amp; standings order</h4>
      <blockquote className={QUOTE}>
        &ldquo;A team shall be awarded 3 points for a win, 1 point for a tie. The division
        placement/standings will be the order of team points. The team with the greatest number of
        points will be declared the champion and higher in the standings. If there is a tie at the
        top both teams shall be declared division champions.&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article VI, Section 2</cite>
      </blockquote>
      <p>
        We implement that literally: <code>points = 3 &times; wins + 1 &times; ties</code> from
        league games only (Article VI, Section 1 &mdash; a double round robin, division games only
        counting to the division record), and the PTS column on every standings table is the actual
        ordering key, not a secondary stat.
      </p>

      <h4 className={H4}>If teams are tied on points</h4>
      <p>
        The by-laws set out one tiebreak chain, applied by &ldquo;working to bring one team
        out&rdquo; of the tied group and then restarting the whole chain for whoever is left:
      </p>
      <ol className="list-decimal">
        <li>Better head-to-head record among the tied teams ({stages['head-to-head']}).</li>
        <li>Greater number of wins in division play ({stages['division-wins']}).</li>
        <li>Least goals given up between the head-to-head tied teams ({stages['h2h-goals-against']}).</li>
        <li>Goal differential between the head-to-head tied teams ({stages['h2h-goal-diff']}).</li>
        <li>
          A coin flip. This site cannot know how a coin flip fell, so teams that reach this step show as{' '}
          <b className="font-semibold text-ink">tied at the same place</b> (a shared &ldquo;T6&rdquo;
          instead of a 6th and a 7th), with a footnote citing this rule. ({stages['coin-flip']})
        </li>
      </ol>
      <p className="text-meta text-ink-3">
        Our display order is not a league ruling &mdash; if {league.shortName} settles a coin flip we
        have no way to know, the official standings remain the source of truth.
      </p>

      <h4 className={H4}>Overtime</h4>
      <blockquote className={QUOTE}>
        &ldquo;Varsity: four 15-minute quarters. After a regulation tie (league AND non-league varsity
        games): ONE 7-minute sudden-victory period, 7-a-side. If still tied after that one period, the
        game ends in a tie (no shootout in league play).&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article IV</cite>
      </blockquote>
      <p>
        An overtime win counts as a full win, shown with an OT tag. Because league play never has a
        shootout, you will not see a shootout result in {league.shortName} league play; if one is ever
        reported, it is shown with an SO tag.
      </p>

      <h4 className={H4}>CCS qualification</h4>
      <blockquote className={QUOTE}>
        &ldquo;16-team CCS tournament: SCVAL 7, BVAL 4, PCAL 2, at-large 3.&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article VII, Section 1</cite>
      </blockquote>
      <blockquote className={QUOTE}>
        &ldquo;The first three teams in each division are awarded automatic qualifiers (AQ) to CCS
        playoffs (ties broken by Article VI, Sections 2-7). Fourth place teams play a play-in game; the
        winner receives the SCVAL 7th AQ. The losing 4th-place team and both 5th-place teams are
        submitted to CCS for at-large consideration. #1 v #1, #2 v #2, #3 v #3 crossover games are
        played after the season to help CCS ordering (home site by coin flip). Per the official
        schedule PDFs these crossover/play-in games are Friday, October 30, 2026.&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article VII, Section 2</cite>
      </blockquote>
      <p>
        {qualification}. Live, team-by-team status is on the{' '}
        <Link href={`/playoffs#${league.id}`} prefetch={false} className="text-accent hover:underline">
          CCS playoffs
        </Link>{' '}
        page.
      </p>
      <p className="text-meta text-ink-2">
        {league.links.map((l, i) => (
          <span key={l.href}>
            {i > 0 ? ' · ' : ''}
            <ExternalLink href={l.href}>{l.label}</ExternalLink>
          </span>
        ))}
      </p>
    </div>
  );
}
