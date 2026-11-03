import Link from 'next/link';
import { Fragment } from 'react';

import Arrow from '../ui/Arrow';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { leaderLine } from '../standings/standings-page-view';
import { getTeams, getToday } from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { getSdsBrackets, getSdsBracketsSource } from '../../lib/postseason/sds-bracket';
import { dateSpan } from '../../lib/format';
import type { LeagueConfig } from '../../lib/league-config/shape';
import { getLeague } from '../../lib/leagues';

import DateList from './DateList';
import SdsBracket from './SdsBracket';
import { sectionBracketSentence, sectionRoundRows } from './playoff-view';

/**
 * The San Diego Section's playoffs (DESIGN-socal §2.4): the Section's rule from config, where its
 * dates come from, its power rankings and when its brackets come, then one card per conference. No
 * seed and no projection: the Section places teams from its power rankings, and the one place a
 * league table decides (a designated champion's play-in) is the league's to designate. The Section's
 * own brackets, once transcribed (lib/postseason/sds-bracket.ts getSdsBrackets, null on the placeholder), are drawn
 * between the round dates and the cards (plan final-08, 2026-10-30).
 */
export default function SectionPlayoffs({
  ps,
  seeding,
  leagues,
}: {
  ps: Extract<LeagueConfig['postseason'], { kind: 'section-playoffs' }>;
  seeding: string | null;
  leagues: LeagueSummary[];
}) {
  const brackets = getSdsBrackets();
  const bracketSource = getSdsBracketsSource();
  const drawn = brackets !== null && bracketSource !== null;
  return (
    <section aria-labelledby="sds-playoffs" className="mt-section md:mt-section-lg">
      <SectionHeader
        id="sds-playoffs"
        kicker={ps.name}
        meta={`${dateSpan(ps.dates.first, ps.dates.last)} · ${ps.divisions.map((d) => `${d.name} ${d.teams}`).join(', ')}`}
      />
      <div className="max-w-prose text-body text-ink-2">
        <p className="m-0">{ps.qualificationLine}</p>
        {/* Date-aware (getToday, never Date.now): the "until then" of Oct 29 would read as if the Section had not
            published from Nov 1 on. The brackets' own link appears once the owner pastes the sheet's URL. */}
        <p className="mb-0">
          {sectionBracketSentence(ps, seeding, getToday(), drawn)}{' '}
          {ps.citations.roundDates}
        </p>
        <p className="mb-0 flex flex-wrap gap-x-4 gap-y-1 text-meta">
          {ps.bracketSheetUrl ? (
            <ExternalLink href={ps.bracketSheetUrl} className="sx-action gap-1">
              Official CIF-SDS brackets (Google Sheet)
            </ExternalLink>
          ) : null}
          <ExternalLink href={ps.bracketsPageUrl} className="sx-action gap-1">
            CIF-SDS field hockey page (brackets are posted here)
          </ExternalLink>
          <ExternalLink href={ps.calendarUrl} className="sx-action gap-1">
            SDFHOA playoff calendar
          </ExternalLink>
          <ExternalLink href={ps.sourceUrl} className="sx-action gap-1">
            {ps.sourceLabel}
          </ExternalLink>
          <ExternalLink href={ps.powerRankingsUrl} className="sx-action gap-1">
            CIF-SDS power rankings
          </ExternalLink>
        </p>
      </div>
      {/* The Section's round calendar (config `rounds`, the officials' association's), the SoCal counterpart of
          the CCS key dates: a fan reads "Quarterfinals, Division II · Fri Nov 6" and the finals' times and site
          here instead of in the docs. */}
      <section id="sds-round-dates" className="mt-section">
        <SectionHeader as="h3" kicker="Round dates" meta="all times PT" />
        <DateList rows={sectionRoundRows(ps)} className="max-w-3xl" />
      </section>
      {/* The Section's published brackets with MaxPreps' results, once the owner has transcribed its sheet; nothing on
          the placeholder file. */}
      {drawn ? <SdsBracket divisions={brackets} source={bracketSource} today={getToday()} className="mt-section" /> : null}
      {leagues.map((league) => (
        <SectionPlayoffsLeagueCard key={league.id} summary={league} />
      ))}
      {/* Said once for the three cards (it was repeated in each until 2026-10-29): where the divisions come from,
          and that a league, not its table, names the champion the Green Book guarantees a play-in. */}
      <p className="mt-4 mb-0 max-w-prose text-meta text-ink-3">
        {'Each team’s playoff division is from the Section’s 2026 Divisions sheet; the Open Division’s eight are drawn from Division I at the end of the regular season. A designated league champion (not co-champions) is guaranteed at least a play-in game, and each league names its champion, not its table.'}
      </p>
    </section>
  );
}

/**
 * Team names as `listWords` words them ("A, B and C"), each one a link to its team page, as the
 * same teams are in the NorCal leagues' rows on this page (PlayoffProjection) and the standings
 * tables. A name with no slug prints as text.
 */
function TeamNames({ teams, conj }: { teams: ReadonlyArray<{ name: string; slug?: string }>; conj: 'and' | '&' }) {
  return teams.map((team, i) => (
    <Fragment key={team.slug ?? team.name}>
      {i === 0 ? null : i === teams.length - 1 ? ` ${conj} ` : ', '}
      {team.slug ? (
        <Link href={`/teams/${team.slug}`} prefetch={false} className="text-inherit hover:underline">
          {team.name}
        </Link>
      ) : (
        team.name
      )}
    </Fragment>
  ));
}

/**
 * One San Diego conference's card (`id=<league>`, the target of its chip and jump link): per division,
 * the table's leaders as things stand, and each team's playoff division from the Section's 2026 Divisions
 * sheet. Open Division teams are drawn from Division I at the end of the regular season, so the card
 * names Division I and Division II only, and never an Open place.
 */
function SectionPlayoffsLeagueCard({ summary }: { summary: LeagueSummary }) {
  const ps = getLeague(summary.id).postseason;
  if (ps.kind !== 'section-playoffs') return null;
  return (
    <div id={summary.id} className="sx-card mt-6 p-5 md:p-6">
      <h3 className="m-0 text-lead text-ink">{`${summary.shortName} — ${summary.name}`}</h3>
      <div className="mt-2 grid gap-5 md:grid-cols-2">
        {summary.divisions.map((d) => {
          const leaders = leaderLine(d.id, d.heading);
          const teams = getTeams(d.id);
          const byDivision = (which: 'I' | 'II') =>
            teams
              .filter((t) => ps.playoffDivisionOf[t.slug] === which)
              .map((t) => ({ name: t.shortName, slug: t.slug }));
          return (
            <div key={d.id} className="min-w-0">
              {d.heading ? <h4 className="m-0 text-body font-semibold text-ink">{d.heading}</h4> : null}
              <p className="mt-1 mb-0 text-meta text-ink-2">
                {leaders.teams.length > 0 ? (
                  <>
                    <TeamNames teams={leaders.teams} conj="&" />
                    {` ${leaders.teams.length === 1 ? 'leads' : 'lead'} the table, ${leaders.teams[0].pts} pts.`}
                  </>
                ) : (
                  'No league results yet.'
                )}{' '}
                <Link href={`/standings/${summary.id}#${d.id}`} prefetch={false} className="text-accent hover:underline">
                  Table <Arrow />
                </Link>
              </p>
              <dl className="mt-2 mb-0 text-meta">
                {(['I', 'II'] as const).map((which) =>
                  byDivision(which).length > 0 ? (
                    <div key={which} className="mt-1 flex flex-wrap gap-x-2">
                      <dt className="font-semibold text-ink">{`Division ${which}:`}</dt>
                      <dd className="m-0 text-ink-2">
                        <TeamNames teams={byDivision(which)} conj="and" />
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
