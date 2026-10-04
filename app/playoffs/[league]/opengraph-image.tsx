import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';

import { SITE_NAME } from '../../../components/layout/site-url';
import { getLeagueSummary, getLeagueTournament, getTeamBySlug, getTournamentLeagueIds } from '../../../lib/data';
import { listWords, shortDate } from '../../../lib/format';
import { getLeague } from '../../../lib/leagues';

/**
 * The `/playoffs/<league>` OG card (SPEC §8.4): "MCAL tournament", the six seeds, the round dates.
 * TEXT ONLY, like every card on this site (DESIGN §12.4).
 *
 * `dynamicParams` does not reach a metadata route (see app/teams/[slug]/opengraph-image.tsx), so this
 * file states its own `generateStaticParams` — EXACTLY the page's — and checks the param BEFORE
 * `getLeagueTournament`, which throws for a CCS league: `/playoffs/scval/opengraph-image` and
 * `/playoffs/nope/opengraph-image` answer 404 (SPEC §8.1). The alt is static: a per-league alt would
 * need `generateImageMetadata`, which changes the image URL shape.
 */
export const alt = 'League tournament card: the seeds from the league table and the round dates';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#f2f5f8';
const MUTED = '#919ba5';
const RULE = '#3d444d';

export function generateStaticParams(): { league: string }[] {
  return getTournamentLeagueIds().map((league) => ({ league }));
}

export default async function Image({ params }: PageProps<'/playoffs/[league]'>) {
  const { league } = await params;
  if (!getTournamentLeagueIds().includes(league)) notFound();
  const summary = getLeagueSummary(league);
  const config = getLeague(league);
  if (!summary || config.postseason.kind !== 'league-tournament') notFound();
  const ps = config.postseason;
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
    .reduce<Array<{ round: string; date: string }>>((out, r) => {
      if (!out.some((o) => o.round === r.round)) out.push({ round: r.round, date: r.date });
      return out;
    }, [])
    .map((r) => {
      const title = r.round === 'quarterfinal' ? 'Quarterfinals' : r.round === 'semifinal' ? 'Semifinals' : 'Final';
      return `${title} ${shortDate(r.date)}${r.round === 'final' ? ` at ${ps.finalSite.label}` : ''}`;
    });
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
          background: '#0b0d10',
          color: INK,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 60, fontWeight: 600 }}>{ps.name}</div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 28, color: MUTED }}>{sub}</div>
          <div style={{ display: 'flex', marginTop: 16, height: 2, background: RULE }} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {seeds.length === 0 ? (
            <div style={{ display: 'flex', fontSize: 36, color: MUTED }}>No league results yet</div>
          ) : (
            seeds.map((s) => (
              <div key={s.seed} style={{ display: 'flex', width: '50%', paddingTop: 12, fontSize: 36 }}>
                <div style={{ display: 'flex', width: 48, color: MUTED }}>{s.seed}</div>
                <div style={{ display: 'flex' }}>{s.names}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, color: INK }}>{rounds.join(' · ')}</div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 22, color: MUTED }}>
            {SITE_NAME} · {summary.shortName} · unofficial
          </div>
        </div>
      </div>
    ),
    size,
  );
}
