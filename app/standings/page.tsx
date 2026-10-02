import type { Metadata } from 'next';
import Link from 'next/link';

import LeagueSwitcher from '../../components/layout/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE } from '../../components/layout/site-url';
import CompactStandingsTable from '../../components/standings/CompactStandingsTable';
import SectionHeader from '../../components/ui/SectionHeader';
import { shortDate } from '../../lib/format';

import { getStandingsOverviewData, leaderClause, leagueChips, leagueHrefs } from './standings-data';

/**
 * /standings — "Where does everyone stand?" (SPEC §8.1, §10.3): every division of every league as
 * a COMPACT full table (place, team, GP, W-L-T, PTS), grouped section → league → division.
 *
 * The old SCVAL anchors keep resolving with no JavaScript and no redirect: `#de-anza` and
 * `#el-camino` are real elements here, as are `#ccs`/`#ncs` (sections), every league id and every
 * division id. A single-division league whose division id equals its league id (PCAL) has ONE
 * element carrying the id; every id on the page is unique.
 *
 * Heading outline (SPEC §10.0): each section is a `<section aria-labelledby>` with an h2 → each
 * league an h3 → each division a plain h4 (omitted for a single-division league). Each table
 * links its league's full page, `/standings/<league>#<division>`.
 *
 * No sticky table head, no GD bars, no form strips, no disclosures: this page is the light index.
 * Static: no search params, nothing derived from `Date.now()`.
 */
export function generateMetadata(): Metadata {
  const { leaders, throughDate } = getStandingsOverviewData();
  const summary = leaders
    .map(({ league, lines }) => `${league.shortName}: ${leaderClause(lines)}`)
    .join('. ');
  const description = `Every division, ordered on points (3 a win, 1 a tie). ${summary}.${
    throughDate ? ` League games through ${shortDate(throughDate)}.` : ''
  } Computed from published results; unofficial.`;
  return {
    title: 'Standings',
    description,
    alternates: { canonical: '/standings' },
    openGraph: { ...OG_BASE, title: 'Standings — every league', description, url: '/standings' },
  };
}

/** 'SCVAL, BVAL, PCAL and MCAL' */
function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export default function StandingsPage() {
  const { leagues, sections } = getStandingsOverviewData();

  return (
    <div className="pb-section-lg">
      <PageHeader
        title="Standings"
        description={`Every division in ${listWords(leagues.map((l) => l.shortName))} · league games only`}
      />

      {/* Jump links: shown before paint only for the remembered league (league-scope CSS). */}
      <p className="m-0 mt-4 flex flex-wrap gap-2">
        {leagues.map((league) => (
          <a
            key={league.id}
            href={`#${league.id}`}
            className={`sx-jump sx-jump-${league.id} sx-pill min-h-11`}
          >
            Jump to {league.shortName} &darr;
          </a>
        ))}
      </p>

      <LeagueSwitcher mode="anchor" label="Leagues" leagues={leagueChips()} hrefs={leagueHrefs(null)} className="mt-4" />

      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={section.id}
          className="mt-section md:mt-section-lg"
        >
          <SectionHeader id={section.id} kicker={section.name} />
          {section.leagues.map((league) => (
            <section key={league.id} aria-labelledby={league.id} className="mt-8">
              <SectionHeader as="h3" id={league.id} kicker={league.title} />
              {league.divisions.map((division) => (
                <div key={division.division} id={division.anchorId ?? undefined} className="mt-6">
                  {division.heading ? (
                    <h4 className="m-0 mb-3 text-lead text-ink">{division.heading}</h4>
                  ) : null}
                  <CompactStandingsTable
                    rows={division.rows}
                    ladderLine={division.ladderLine}
                    caption={division.caption}
                  />
                  <p className="m-0 mt-2">
                    <Link
                      href={division.fullHref}
                      prefetch={false}
                      className="sx-action text-meta font-medium text-accent hover:underline"
                    >
                      {division.fullLabel} &rarr;
                    </Link>
                  </p>
                </div>
              ))}
            </section>
          ))}
        </section>
      ))}

      <p className="mt-section mb-0 max-w-prose text-meta text-ink-3 md:mt-section-lg">
        Places, GP and W-L-T count league games only; PTS is 3 for a win and 1 for a tie in every
        league. Each league&rsquo;s full page has its tiebreak rules, GD, form, and the games still
        to play.{' '}
        <Link href="/about" prefetch={false} className="font-medium text-accent hover:underline">
          How standings are computed
        </Link>
      </p>
    </div>
  );
}
