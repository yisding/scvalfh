import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE } from '../../../components/layout/site';
import LeagueTournament from '../../../components/playoffs/LeagueTournament';
import {
  titleSentence,
  tournamentLeague,
  tournamentStaticParams,
  tournamentView,
} from '../../../components/playoffs/tournament-league';
import Arrow from '../../../components/ui/Arrow';
import ExternalLink from '../../../components/ui/ExternalLink';
import LeagueHealthNote from '../../../components/ui/LeagueHealthNote';
import SectionHeader from '../../../components/ui/SectionHeader';
import { getCcsField, getLeagueTournament, getSections } from '../../../lib/data';
import type { LeagueSummary } from '../../../lib/data';
import { shortDate } from '../../../lib/format';
import type { LeagueConfig, TournamentConfig } from '../../../lib/league-config/shape';
import { getLeague } from '../../../lib/leagues';
import { tournamentHeadline } from '../../../lib/postseason/postseason';

/**
 * /playoffs/<league> — a league's own tournament (SPEC §6.2, §6.3, §10.7): "MCAL tournament — who
 * do we play?". Only league-tournament leagues have this page (`getTournamentLeagueIds()`, today
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

function roundDate(ps: TournamentConfig, round: string): string | null {
  return ps.rounds.find((r) => r.round === round)?.date ?? null;
}

/**
 * 'Marin County Athletic League · 6 teams · Quarterfinals Mon Oct 26 · Final Fri Oct 30' while the picture is
 * projected; once the tournament is under way, the next round's matchups ('… · Final Fri Oct 30, 4 PM PT at
 * Tamalpais: 3 Redwood at 1 Tamalpais') and, after the final, the champion (lib/postseason/postseason.ts tournamentHeadline).
 */
function headerMeta(summary: LeagueSummary, ps: TournamentConfig, config: LeagueConfig, opts: { live?: boolean } = {}): string {
  const headline = tournamentHeadline(getLeagueTournament(summary.id), config);
  // The page header leaves the live line to the headline section right under it (said once, DESIGN §32.3); the
  // metadata description, read alone in a search result or a link preview, keeps it.
  const live =
    opts.live === false ? null : headline.champion ? `Champion: ${headline.champion.replace(/\.$/, '')}` : headline.next;
  const qf = roundDate(ps, 'quarterfinal');
  const final = roundDate(ps, 'final');
  return [
    summary.name,
    `${ps.qualifiers} teams`,
    ...(live ? [live] : [...(qf ? [`Quarterfinals ${shortDate(qf)}`] : []), ...(final ? [`Final ${shortDate(final)}`] : [])]),
  ].join(' · ');
}

export async function generateMetadata({ params }: PageProps<'/playoffs/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const found = tournamentLeague(league);
  if (!found) return { title: 'Page not found' };
  const { summary, ps } = found;
  const title = ps.name;
  const description = `${headerMeta(summary, ps, getLeague(summary.id))}. Seeds from the ${summary.shortName} table, the play-in rule and the bracket, computed from published results; unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/playoffs/${summary.id}` },
    openGraph: { ...OG_BASE, title, description, url: `/playoffs/${summary.id}` },
  };
}

export default async function LeagueTournamentPage({ params }: PageProps<'/playoffs/[league]'>) {
  const { league } = await params;
  const found = tournamentLeague(league);
  if (!found) notFound();
  const { summary, config, ps } = found;
  const section = getSections().find((s) => s.id === summary.section.id);
  const view = tournamentView(summary, ps, config);
  const headline = tournamentHeadline(getLeagueTournament(summary.id), config);
  const projection = getLeagueTournament(summary.id);
  const ccsLeagues = getCcsField().byLeague.map((l) => l.shortName);
  const playInRound = ps.rounds.find((r) => r.round === 'play-in');

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={ps.name}
        description={headerMeta(summary, ps, config, { live: false })}
        meta={
          ccsLeagues.length > 0 ? (
            <Link href="/playoffs" className="sx-action text-meta text-accent hover:underline">
              {`CCS playoffs (${ccsLeagues.join(', ')})`} <Arrow />
            </Link>
          ) : null
        }
      />

      {/* The result a fan came for, first (DESIGN §24.13): the champion once the final has a winner, with the
          league's title rule applied (the regular-season points leader is MCAL Champion; a different tournament
          winner also receives a pennant), else the next round's matchups. Nothing while the picture is projected. */}
      {headline.champion || headline.next ? (
        <section id="headline" className="mt-8 md:mt-10">
          <SectionHeader kicker={headline.champion ? 'Champion' : 'Next'} />
          <p className="m-0 max-w-prose text-lead text-ink">{headline.champion ?? `${headline.next}.`}</p>
          {headline.champion && projection.champion ? (
            <p className="mt-2 mb-0 max-w-prose text-body text-ink-2">{titleSentence(projection, ps)}</p>
          ) : null}
        </section>
      ) : null}

      <LeagueTournament
        view={view}
        leagueShort={summary.shortName}
        standingsHref={`/standings/${summary.id}`}
        beforeSeeds={<LeagueHealthNote leagueId={summary.id} className="mb-4" />}
        playInRule={playInRound ? `${playInRound.pairing}.` : null}
      />

      {/* Why there is no section bracket, under the league's own (it used to sit above the seeds and the bracket). */}
      {section?.noChampionshipNote ? (
        <section id="section" className="mt-section md:mt-section-lg">
          <SectionHeader kicker="Not a section playoff" />
          <p className="m-0 max-w-prose text-body text-ink-2">{section.noChampionshipNote}</p>
        </section>
      ) : null}

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
          <p>{`${ps.titleNote} Source: ${ps.citations.pennant}.`}</p>
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
