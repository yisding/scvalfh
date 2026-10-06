import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import {
  buildTeamPageView,
  gameHeadline,
  nextOfficialFixture,
  officialFixtureHeadline,
  placeScope,
} from '../../../components/teams/team-view';
import { OG, OG_SIZE } from '../../../components/layout/og-theme';
import { SITE_NAME } from '../../../components/layout/site';
import { getFetchedAt, getTeamSlugs } from '../../../lib/data';
import {
  EM_DASH,
  formatStamp,
  ordinal,
  recordString,
  signedGd,
  streakString,
} from '../../../lib/format';

/**
 * The per-team OG card (DESIGN §1.1, §3.7).
 *
 * TEXT ONLY, like the root card: no logo file, no mascot image, no third-party request. The one
 * school-color concession is the monogram square, drawn with the cron's measured `onPrimary` ink —
 * the same guardrail TeamMonogram uses, never a hue picked by eye (DESIGN §7.1, §12.4).
 *
 * The card carries the facts a link preview can usefully hold: the identity line (mascot · division
 * heading · league · city), the place in the team's table, league record, points, games counted,
 * goals, streak, the last result and the next game (SPEC §8.4). A team with no reported results says so instead of
 * showing `0-0-0` — a shared link is the most damaging place to get the never-0-0 rule wrong
 * (DESIGN §5.3). Both game lines come from `gameHeadline`, which is built on `describeGame`, so
 * this image cannot disagree with the page it belongs to.
 */
/**
 * `alt` is a static export, so it describes what every card CONTAINS rather than naming one team;
 * the per-team fact is in the OG title that sits beside it. A per-team alt would need
 * `generateImageMetadata`, which changes the image URL shape.
 */
export const alt =
  'Team card: league and division, place, league record, points, goals for and against, streak, last result and next game';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return getTeamSlugs().map((slug) => ({ slug }));
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div
        style={{
          display: 'flex',
          fontSize: 20,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: OG.TEXT_3,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', marginTop: 8, fontSize: 38, fontWeight: 600, color: OG.TEXT }}>
        {value}
      </div>
      {note ? (
        <div style={{ display: 'flex', marginTop: 4, fontSize: 20, color: OG.TEXT_2 }}>{note}</div>
      ) : null}
    </div>
  );
}

/**
 * `dynamicParams` cannot reach a metadata route — Next's metadata-route loader filters it out of
 * the re-exported config — so an unknown param still reaches this handler. It answers the way the
 * page beside it does, with a 404: rendering a generic card instead handed crawlers an unbounded
 * set of 200-OK image URLs whose pages do not exist.
 */
export default async function Image({ params }: PageProps<'/teams/[slug]'>) {
  const { slug } = await params;
  const view = buildTeamPageView(slug);
  if (!view) notFound();

  const { team, standing, hasResults, last, next } = view;
  // A team that plays no league games (the Southern Section independents, DESIGN §24.9): no place, points
  // or GP; its card prints its overall figures and says "all games" where the others say "league games".
  const independent = view.league.classification === 'independent';
  const overall = standing && standing.overall.gp > 0 ? standing.overall : null;
  const known = hasResults && standing ? standing : null;
  const record = known ? recordString(known.computed) : EM_DASH;
  // `<place> of <N> in <division heading or league short>`; a team with no results is never
  // placed (SPEC §8.4). A shared place is a real tiebreak outcome, so it says so.
  const placeLine = independent
    ? 'Independent: no league games, so no league table'
    : known
      ? `${ordinal(known.computed.place)} ${placeScope(view.divisionSize, view.scopeLabel)}${
          known.tiebreak.shared ? ' (tied)' : ''
        }`
      : 'No results reported yet';
  // `6/12`, or the bare count where the league has no fixed schedule (the Sunset: no "of N").
  const gp = view.context
    ? view.context.scheduled === null
      ? `${view.context.counted}`
      : `${view.context.counted}/${view.context.scheduled}`
    : EM_DASH;
  const points = known ? `${known.computed.pts}` : EM_DASH;
  const goals = known ? `${known.computed.gf} / ${known.computed.ga}` : EM_DASH;
  const diff = known ? signedGd(known.computed.gd) : EM_DASH;
  const streak = known ? streakString(known.computed.streak) : EM_DASH;
  const lastLine = last ? gameHeadline(last, team) : 'No results reported';
  const upcomingFixture = next ? null : nextOfficialFixture(view.officialFixtures, view.today);
  const nextLine = next
    ? gameHeadline(next, team)
    : upcomingFixture
      ? officialFixtureHeadline(upcomingFixture, team)
      : 'No games left on the published schedule';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: OG.BG,
          color: OG.TEXT,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 118,
              height: 118,
              borderRadius: 16,
              background: `#${team.colors.primary}`,
              color: team.colors.onPrimary,
              border: `2px solid ${OG.RULE}`,
              fontSize: 50,
              fontWeight: 600,
            }}
          >
            {team.abbr}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 58, fontWeight: 600 }}>{team.name}</div>
            <div style={{ display: 'flex', marginTop: 8, fontSize: 28, color: OG.TEXT_2 }}>
              {view.identityLine}
            </div>
            <div style={{ display: 'flex', marginTop: 8, fontSize: 30, color: OG.TEXT }}>{placeLine}</div>
          </div>
        </div>

        {independent ? (
          <div style={{ display: 'flex', gap: 32, borderTop: `2px solid ${OG.RULE}`, paddingTop: 24 }}>
            <Stat label="Overall" value={overall ? recordString(overall) : EM_DASH} />
            <Stat label="Goals F / A" value={overall ? `${overall.gf} / ${overall.ga}` : EM_DASH} />
            <Stat label="Diff" value={overall ? signedGd(overall.gd) : EM_DASH} />
            <Stat label="Streak" value={overall ? streakString(overall.streak) : EM_DASH} />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 32, borderTop: `2px solid ${OG.RULE}`, paddingTop: 24 }}>
            <Stat label="League" value={record} />
            <Stat label="Pts" value={points} />
            <Stat label="GP" value={gp} />
            <Stat label="Goals F / A" value={goals} />
            <Stat label="Diff" value={diff} />
            <Stat label="Streak" value={streak} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', fontSize: 30, color: OG.TEXT }}>Last: {lastLine}</div>
          <div style={{ display: 'flex', fontSize: 30, color: OG.TEXT_2 }}>Next: {nextLine}</div>
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: OG.TEXT_3 }}>
          As of {formatStamp(getFetchedAt())} &middot; {independent ? 'all games' : 'league games only'} &middot; unofficial
          &middot; {SITE_NAME}
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
