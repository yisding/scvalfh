import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE } from '../../../components/layout/site';
import LeagueTournament from '../../../components/playoffs/LeagueTournament';
import { buildTournamentView, type TournamentView } from '../../../components/playoffs/playoff-view';
import {
  tournamentLeague,
  tournamentStaticParams,
  type TournamentConfig,
} from '../../../components/playoffs/tournament-league';
import Arrow from '../../../components/ui/Arrow';
import ExternalLink from '../../../components/ui/ExternalLink';
import LeagueHealthNote from '../../../components/ui/LeagueHealthNote';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  getCcsField,
  getLeagueTournament,
  getSections,
  getStandingContext,
  getStandings,
  getTeamById,
  getTeamBySlug,
} from '../../../lib/data';
import type { LeagueSummary } from '../../../lib/data';
import { shortDate } from '../../../lib/format';
import { getDivision, getLeague, type LeagueConfig } from '../../../lib/leagues';
import { tournamentHeadline, tournamentOutcome, tournamentOutcomeCopy } from '../../../lib/postseason';
import { outcomesFor, playoffOutcomeLabel } from '../../../lib/standings';
import type { LeagueTournamentProjection, Team } from '../../../lib/types';

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
 * The league's title rule applied to the result (config `titleNote`, MCAL General Rules Pennants 1–3): the
 * regular-season points leader (seed 1) is MCAL Champion; when a different team wins the tournament it also
 * receives a pennant, and the sentence names both.
 */
function titleSentence(projection: LeagueTournamentProjection, ps: TournamentConfig): string {
  const champion = projection.champion;
  if (!champion) return ps.titleNote;
  const leader = projection.seeds.find((s) => s.seed === 1)?.seat;
  const leaderSlug = leader && leader.length === 1 ? leader[0].slug : null;
  const leaderName = leaderSlug ? (getTeamBySlug(leaderSlug)?.name ?? leaderSlug) : null;
  const championName = getTeamBySlug(champion.slug)?.name ?? champion.slug;
  const title = ps.name.replace(/ tournament$/, '');
  if (leaderName && leaderSlug === champion.slug) {
    return `${championName} is the regular-season ${title} Champion (the points leader) and the tournament champion.`;
  }
  if (leaderName) {
    return `${leaderName} is the regular-season ${title} Champion (the points leader); ${championName} won the tournament and also receives a pennant.`;
  }
  return ps.titleNote;
}

/**
 * 'Marin County Athletic League · 6 teams · Quarterfinals Mon Oct 26 · Final Fri Oct 30' while the picture is
 * projected; once the tournament is under way, the next round's matchups ('… · Final Fri Oct 30, 4 PM PT at
 * Tamalpais: 3 Redwood at 1 Tamalpais') and, after the final, the champion (lib/postseason.ts tournamentHeadline).
 */
function headerMeta(summary: LeagueSummary, ps: TournamentConfig, config: LeagueConfig): string {
  const headline = tournamentHeadline(getLeagueTournament(summary.id), config);
  const live = headline.champion ? `Champion: ${headline.champion.replace(/\.$/, '')}` : headline.next;
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

function viewFor(summary: LeagueSummary, ps: TournamentConfig, config: LeagueConfig): TournamentView {
  const projection = getLeagueTournament(summary.id);
  const rows = summary.divisions.flatMap((d) => {
    const context = getStandingContext(d.id);
    return getStandings(d.id).flatMap((standing) => {
      const team = getTeamById(standing.teamId);
      if (!team) return [];
      const ctx = context.get(standing.teamId);
      // The status column reads the results once the tournament is under way ('In the MCAL final', 'Lost in the
      // semifinal'); the table's ladder rung ('Semifinal bye') only while the picture is projected (DESIGN §24.13).
      const ladderLabel = playoffOutcomeLabel(d.id, outcomesFor(standing));
      const label = tournamentOutcomeCopy(tournamentOutcome(projection, team.slug), team.slug, config, { label: ladderLabel, sentence: '' }).label;
      return [
        {
          team,
          standing,
          counted: ctx?.counted ?? standing.computed.gp,
          scheduled: ctx?.scheduled ?? getDivision(d.id).gamesPerTeam,
          label,
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
    finalSite: ps.finalSite,
  });
}

export default async function LeagueTournamentPage({ params }: PageProps<'/playoffs/[league]'>) {
  const { league } = await params;
  const found = tournamentLeague(league);
  if (!found) notFound();
  const { summary, config, ps } = found;
  const section = getSections().find((s) => s.id === summary.section.id);
  const view = viewFor(summary, ps, config);
  const headline = tournamentHeadline(getLeagueTournament(summary.id), config);
  const projection = getLeagueTournament(summary.id);
  const ccsLeagues = getCcsField().byLeague.map((l) => l.shortName);
  const playInRound = ps.rounds.find((r) => r.round === 'play-in');

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={ps.name}
        description={headerMeta(summary, ps, config)}
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
