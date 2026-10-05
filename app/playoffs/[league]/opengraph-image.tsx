import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';

import { OG, OG_SIZE } from '../../../components/layout/og-theme';
import { SITE_NAME } from '../../../components/layout/site';
import { ROUND_TITLES, type TournamentRoundView } from '../../../components/playoffs/playoff-view';
import { tournamentLeague, tournamentStaticParams } from '../../../components/playoffs/tournament-league';
import { getLeagueTournament, getTeamBySlug } from '../../../lib/data';
import { listWords, shortDate } from '../../../lib/format';

/**
 * The `/playoffs/<league>` OG card (SPEC §8.4): "MCAL tournament", the six seeds, the round dates.
 * TEXT ONLY, like every card on this site (DESIGN §12.4).
 *
 * `dynamicParams` does not reach a metadata route (see app/teams/[slug]/opengraph-image.tsx), so this
 * file states its own `generateStaticParams` — the page's own `tournamentStaticParams` — and checks
 * the param with the page's `tournamentLeague` (components/playoffs/tournament-league.ts) BEFORE
 * `getLeagueTournament`, which throws for a CCS league: `/playoffs/scval/opengraph-image` and
 * `/playoffs/nope/opengraph-image` answer 404 (SPEC §8.1). The round titles are the page's
 * `ROUND_TITLES` and a shared seat reads `A, B or C` as on the page. The alt is static: a per-league alt would
 * need `generateImageMetadata`, which changes the image URL shape.
 */
export const alt = 'League tournament card: the seeds from the league table and the round dates';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams(): { league: string }[] {
  return tournamentStaticParams();
}

export default async function Image({ params }: PageProps<'/playoffs/[league]'>) {
  const { league } = await params;
  const found = tournamentLeague(league);
  if (!found) notFound();
  const { summary, ps } = found;
  const projection = getLeagueTournament(league);
  const seeds = projection.seeds.map((s) => ({
    seed: s.seed,
    names:
      s.seat.length === 0
        ? 'TBD'
        : listWords(s.seat.map((x) => getTeamBySlug(x.slug)?.shortName ?? x.slug), 'or'),
  }));
  const rounds = ps.rounds
    .filter((r) => !r.optional)
    .reduce<Array<{ round: TournamentRoundView['round']; date: string }>>((out, r) => {
      if (r.round !== 'play-in' && !out.some((o) => o.round === r.round)) out.push({ round: r.round, date: r.date });
      return out;
    }, [])
    .map((r) => `${ROUND_TITLES[r.round]} ${shortDate(r.date)}${r.round === 'final' ? ` at ${ps.finalSite.label}` : ''}`);
  const sub = projection.status === 'projected' ? 'Seeds if the season ended today' : 'Seeds';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: OG.BG,
          color: OG.TEXT,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 60, fontWeight: 600 }}>{ps.name}</div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 28, color: OG.TEXT_3 }}>{sub}</div>
          <div style={{ display: 'flex', marginTop: 16, height: 2, background: OG.RULE }} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {seeds.length === 0 ? (
            <div style={{ display: 'flex', fontSize: 36, color: OG.TEXT_3 }}>No league results yet</div>
          ) : (
            seeds.map((s) => (
              <div key={s.seed} style={{ display: 'flex', width: '50%', paddingTop: 12, fontSize: 36 }}>
                <div style={{ display: 'flex', width: 48, color: OG.TEXT_3 }}>{s.seed}</div>
                <div style={{ display: 'flex' }}>{s.names}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, color: OG.TEXT }}>{rounds.join(' · ')}</div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 22, color: OG.TEXT_3 }}>
            {SITE_NAME} · {summary.shortName} · unofficial
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
