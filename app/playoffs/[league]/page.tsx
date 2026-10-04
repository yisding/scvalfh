import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE } from '../../../components/layout/site-url';
import LeagueTournament from '../../../components/playoffs/LeagueTournament';
import { buildTournamentView, type TournamentView } from '../../../components/playoffs/playoff-view';
import Arrow from '../../../components/ui/Arrow';
import ExternalLink from '../../../components/ui/ExternalLink';
import LeagueHealthNote from '../../../components/ui/LeagueHealthNote';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  getCcsField,
  getLeagueSummary,
  getLeagueTournament,
  getSections,
  getStandingContext,
  getStandings,
  getTeamById,
  getTeamBySlug,
  getTournamentLeagueIds,
} from '../../../lib/data';
import type { LeagueSummary } from '../../../lib/data';
import { shortDate } from '../../../lib/format';
import { getDivision, getLeague } from '../../../lib/leagues';
import type { LeagueConfig } from '../../../lib/leagues';
import { outcomesFor, playoffOutcomeLabel } from '../../../lib/standings';
import type { Team } from '../../../lib/types';

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
  return getTournamentLeagueIds().map((league) => ({ league }));
}

type TournamentConfig = Extract<LeagueConfig['postseason'], { kind: 'league-tournament' }>;

/** The league and its tournament config, or undefined for any param that is not a tournament league. */
function tournamentLeague(id: string): { summary: LeagueSummary; config: LeagueConfig; ps: TournamentConfig } | undefined {
  if (!getTournamentLeagueIds().includes(id)) return undefined;
  const summary = getLeagueSummary(id);
  if (!summary) return undefined;
  const config = getLeague(summary.id);
  if (config.postseason.kind !== 'league-tournament') return undefined;
  return { summary, config, ps: config.postseason };
}

function roundDate(ps: TournamentConfig, round: string): string | null {
  return ps.rounds.find((r) => r.round === round)?.date ?? null;
}

/** 'Marin County Athletic League · 6 teams · Quarterfinals Mon Oct 26 · Final Fri Oct 30' */
function headerMeta(summary: LeagueSummary, ps: TournamentConfig): string {
  const qf = roundDate(ps, 'quarterfinal');
  const final = roundDate(ps, 'final');
  return [
    summary.name,
    `${ps.qualifiers} teams`,
    ...(qf ? [`Quarterfinals ${shortDate(qf)}`] : []),
    ...(final ? [`Final ${shortDate(final)}`] : []),
  ].join(' · ');
}

export async function generateMetadata({ params }: PageProps<'/playoffs/[league]'>): Promise<Metadata> {
  const { league } = await params;
  const found = tournamentLeague(league);
  if (!found) return { title: 'Page not found' };
  const { summary, ps } = found;
  const title = ps.name;
  const description = `${headerMeta(summary, ps)}. Seeds from the ${summary.shortName} table, the play-in rule and the bracket, computed from published results; unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/playoffs/${summary.id}` },
    openGraph: { ...OG_BASE, title, description, url: `/playoffs/${summary.id}` },
  };
}

function viewFor(summary: LeagueSummary, ps: TournamentConfig): TournamentView {
  const projection = getLeagueTournament(summary.id);
  const rows = summary.divisions.flatMap((d) => {
    const context = getStandingContext(d.id);
    return getStandings(d.id).flatMap((standing) => {
      const team = getTeamById(standing.teamId);
      if (!team) return [];
      const ctx = context.get(standing.teamId);
      return [
        {
          team,
          standing,
          counted: ctx?.counted ?? standing.computed.gp,
          scheduled: ctx?.scheduled ?? getDivision(d.id).gamesPerTeam,
          label: playoffOutcomeLabel(d.id, outcomesFor(standing)),
        },
      ];
    });
  });
  // A league tournament is single-division (MCAL); its one division's ladder line is the tournament line.
  const division = getDivision(summary.divisions[0].id);
  return buildTournamentView({
    projection,
    rows,
    teamOf: (slug): Team | undefined => getTeamBySlug(slug),
    lastPlace: ps.lastSpot.place,
    ladderLine: division.ladderLine,
  });
}

export default async function LeagueTournamentPage({ params }: PageProps<'/playoffs/[league]'>) {
  const { league } = await params;
  const found = tournamentLeague(league);
  if (!found) notFound();
  const { summary, config, ps } = found;
  const section = getSections().find((s) => s.id === summary.section.id);
  const view = viewFor(summary, ps);
  const ccsLeagues = getCcsField().byLeague.map((l) => l.shortName);
  const playInRound = ps.rounds.find((r) => r.round === 'play-in');

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={ps.name}
        description={headerMeta(summary, ps)}
        meta={
          ccsLeagues.length > 0 ? (
            <Link href="/playoffs" className="sx-action text-meta text-accent hover:underline">
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
        standingsHref={`/standings/${summary.id}`}
        beforeSeeds={<LeagueHealthNote leagueId={summary.id} className="mb-4" />}
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
