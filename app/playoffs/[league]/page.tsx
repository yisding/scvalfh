import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import PageHeader from '@/components/layout/PageHeader';
import LeagueTournament from '@/components/playoffs/LeagueTournament';
import Arrow from '@/components/ui/Arrow';
import ExternalLink from '@/components/ui/ExternalLink';
import LeagueHealthNote from '@/components/ui/LeagueHealthNote';
import SectionHeader from '@/components/ui/SectionHeader';
import { SECTIONS } from '@/lib/config/leagues';
import { getLeagueHealth } from '@/lib/queries/leagues';
import { getCcsField } from '@/lib/queries/postseason';
import { playoffsHref, standingsHref } from '@/lib/shared/routes';
import { tournamentHeaderMeta, tournamentPageView } from '@/views/playoffs/tournament-page';
import { tournamentParam, tournamentStaticParams } from '@/views/playoffs/tournament-route';
import { missingMetadata, pageMetadata } from '@/views/site/page-metadata';

/**
 * /playoffs/<league> — a league's own tournament (SPEC §6.2, §6.3, §10.7): "MCAL tournament — who
 * do we play?". Only league-tournament leagues have this page (`TOURNAMENT_LEAGUE_IDS`, today
 * `mcal`); every other param 404s (`dynamicParams = false`), including the CCS leagues, whose
 * postseason lives on /playoffs.
 *
 * Seven blocks: header (with the link to the CCS page), "Not a section playoff" (the section's
 * no-championship note), "Seeds" (if the season ended today), "Play-in" (only when needed or
 * possible), "Bracket" (vertical rounds with their dates), "How it works" (the league's citations,
 * the qualifier-count conflict, titles, sources); the OG card is `opengraph-image.tsx`.
 *
 * Inside `<main>` this page carries no CCS concept (SPEC §10.9): "CCS" appears only in the
 * `CCS playoffs (…) →` link. Static: no search params, nothing derived from `Date.now()`.
 */
export const dynamicParams = false;

export function generateStaticParams(): { league: string }[] {
  return tournamentStaticParams();
}

export async function generateMetadata({ params }: PageProps<'/playoffs/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const found = tournamentParam(league);
  if (!found) return missingMetadata('Page not found');
  const { summary, ps } = found;
  const title = ps.name;
  const description = `${tournamentHeaderMeta(summary, ps)}. Seeds from the ${summary.shortName} table, the play-in rule and the bracket, computed from published results; unofficial.`;
  return pageMetadata({
    path: playoffsHref(summary.id),
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    card: 'own',
  });
}

export default async function LeagueTournamentPage({ params }: PageProps<'/playoffs/[league]'>) {
  const { league } = await params;
  const found = tournamentParam(league);
  if (!found) notFound();
  const { summary, config, ps } = found;
  const section = SECTIONS.find((s) => s.id === summary.section.id);
  const view = tournamentPageView(summary, ps);
  const ccsLeagues = getCcsField().byLeague.map((l) => l.shortName);
  const playInRound = ps.rounds.find((r) => r.round === 'play-in');

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={ps.name}
        description={tournamentHeaderMeta(summary, ps)}
        meta={
          ccsLeagues.length > 0 ? (
            <Link href={playoffsHref()} className="sx-action text-meta text-accent hover:underline">
              {`CCS playoffs (${ccsLeagues.join(', ')})`} <Arrow />
            </Link>
          ) : null
        }
      />

      {section?.noChampionshipNote ? (
        <section id="section" className="mt-8 md:mt-10">
          <SectionHeader kicker="Not a section playoff" />
          <p className="m-0 max-w-prose text-body text-ink-2">{section.noChampionshipNote}</p>
        </section>
      ) : null}

      <LeagueTournament
        view={view}
        leagueShort={summary.shortName}
        standingsHref={standingsHref(summary.id)}
        beforeSeeds={<LeagueHealthNote health={getLeagueHealth(summary.id)} className="mb-4" />}
        playInRule={playInRound ? `${playInRound.pairing}.` : null}
      />

      <section id="how-it-works" className="mt-section md:mt-section-lg">
        <SectionHeader kicker="How it works" />
        <div className="sx-prose">
          <ul className="list-disc">
            <li>Format: {ps.citations.format}.</li>
            <li>Seeding: {ps.citations.seeding}.</li>
            <li>Semifinals: {ps.citations.semifinal}.</li>
            <li>Last place: {ps.citations.lastSpot}.</li>
          </ul>
          <p>{ps.citations.qualifiersConflict}</p>
          <p>{ps.titleNote}</p>
          {config.rules.citations.incomplete ? (
            <p className="text-meta text-ink-2">
              If the season ends with games unplayed: {config.rules.citations.incomplete}. The seeds above
              follow points until then.
            </p>
          ) : null}
          <p className="text-meta text-ink-2">
            <ExternalLink href={ps.sourceUrl}>{ps.name} play-off sheet (PDF)</ExternalLink>
            {config.links
              .filter((l) => l.href !== ps.sourceUrl)
              .map((l) => (
                <span key={l.href}>
                  {' · '}
                  <ExternalLink href={l.href}>{l.label}</ExternalLink>
                </span>
              ))}
            {' · '}
            <Link href={`/about#rules-${summary.id}`} className="text-accent hover:underline">
              How {summary.shortName} standings are computed
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
