import type { Metadata } from 'next';
import Link from 'next/link';

import AvailableLeague from '../../../components/history/AvailableLeague';
import SectionBracketBlock from '../../../components/history/SectionBracketBlock';
import TournamentBracketBlock from '../../../components/history/TournamentBracketBlock';
import UnavailableLeague from '../../../components/history/UnavailableLeague';
import {
  AVAILABLE,
  BRACKETS,
  BRACKET_WORDS,
  GROUPS_SENTENCE,
  HISTORY_LEAGUES,
  SEASON,
  TOURNAMENTS,
  UNAVAILABLE_SUBJECT,
  leagueShortName,
} from '../../../components/history/history-page-view';
import PageHeader from '../../../components/layout/PageHeader';
import { leagueChips } from '../../../components/layout/league-chips';
import ScopeBar from '../../../components/prefs/ScopeBar';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import { listWords } from '../../../lib/format';
import { SPORT, SPORT_SEASON } from '../../../lib/sports/current';

/**
 * `/history/2025-26` (DESIGN §1.1, §3.9; SPEC §10.8; refresh spec §5.6) — last season's final standings: the
 * title, the league row (`ScopeBar`, anchor tabs scoped by region, no Updated stamp: an archive does not
 * change), then one section per league (`#scval #bval #pcal #mcal #eal #sunset #city #north-county #metro
 * #independents`), each carrying its region's `data-region-scope` (DESIGN-socal §2.4).
 *
 * A league whose own end-of-season documents we could read (SCVAL's two PDFs, BVAL's Google Sheet and
 * all-league documents) shows its divisions in pairs: varsity standings (row 1 bold, with the plain label
 * "Champion"), JV standings, all-league awards. A league we found no official 2025-26 final standings for
 * says "No standings available", with the reason, any official document it did publish (MCAL's all-league
 * team) and what was checked (data/history-2025-26.json), and shows no table in its place. Everything is
 * built once by `scripts/build-history.ts`. After each section's last league comes that section's 2025
 * playoff bracket (`#ccs` after PCAL, `#sds` after Metro: data/history-brackets-2025-26.json, transcribed
 * from the sections' own pages), so SoCal, where no league published standings, still has last season's
 * results; the unavailable leagues' sections point to it. After the LA independents comes the 2025
 * Tournament of Champions (`#toc`), the postseason the Sunset and the LA independents share, which no CIF
 * section runs (DESIGN §24.13): one unseeded bracket assembled from a school newspaper and MaxPreps'
 * schedules, since its organizer publishes none; their sections point to it. MaxPreps cannot serve a prior
 * season at all — the year segment of its league URL is cosmetic and always returns the CURRENT table (SPEC
 * §1.1h) — so this page is the only place last season's numbers live, and it is not part of the snapshot
 * the scheduled update rebuilds.
 *
 * The soccer and basketball builds cover SCVAL alone: their archive (data/<sport>/history-2025-26.json) is
 * SCVAL's two divisions from its standings and all-league PDFs, with no bracket, and the league row is not
 * drawn (a row of one tab goes nowhere).
 *
 * The leagues, divisions and notes all come from `data/history-2025-26.json` and lib/leagues.ts, never from
 * a literal list, so a league cannot be dropped or invented here. The title has no sentence under it: what
 * the page covers is the metadata description's, and provenance sits in each league's source note.
 */

const OWN_DOCUMENTS = HISTORY_LEAGUES.length === 1 ? 'the league’s own documents' : 'each league’s own documents';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = `${SEASON} final standings`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description:
    `Final ${listWords(AVAILABLE.map((l) => leagueShortName(l.id)))} ${SPORT_SEASON.gender} ${SPORT.noun} standings` +
    ` and all-league awards from the ${SEASON} season, from ${OWN_DOCUMENTS}` +
    (BRACKET_WORDS ? `, and ${BRACKET_WORDS}.` : '.') +
    (UNAVAILABLE_SUBJECT
      ? ` ${UNAVAILABLE_SUBJECT} marked unavailable: we found no official ${SEASON} final standings.`
      : '') +
    (GROUPS_SENTENCE ? ` ${GROUPS_SENTENCE}` : ''),
  alternates: { canonical: '/history/2025-26' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/history/2025-26' },
};

export default function HistoryPage() {
  // The league row: every league of the archive, each tab an anchor to its section; the lists are
  // region-scoped (DESIGN-socal §2.4), so a reader sees their region's leagues. No stamp: an archive
  // does not update. A one-league archive (the soccer and basketball builds: SCVAL) draws no row.
  const ids = new Set<string>(HISTORY_LEAGUES.map((l) => l.id));
  const chips = leagueChips().filter((chip) => ids.has(chip.id));
  const hrefs: Record<string, string> = Object.fromEntries(chips.map((chip) => [chip.id, `#${chip.id}`]));

  return (
    <div className="pb-section-lg">
      <PageHeader title={PAGE_TITLE} />
      <ScopeBar league={{ mode: 'anchor', label: 'Leagues', leagues: chips, hrefs }} />

      {/* A plain block wrapper, so the first section is a first child and sits close under the league row. */}
      <div>
      {HISTORY_LEAGUES.flatMap(({ id, entry }) => [
        entry.status === 'available' ? (
          <AvailableLeague key={id} leagueId={id} entry={entry} season={SEASON} />
        ) : (
          <UnavailableLeague key={id} leagueId={id} entry={entry} season={SEASON} />
        ),
        ...BRACKETS.filter((b) => b.afterLeague === id).map((b) => (
          <SectionBracketBlock key={b.id} id={b.id} bracket={b.bracket} season={SEASON} />
        )),
        ...TOURNAMENTS.filter((t) => t.afterLeague === id).map((t) => (
          <TournamentBracketBlock key={t.id} bracket={t.bracket} leagues={t.leagues} season={SEASON} />
        )),
      ])}
      </div>

      <p className="sx-linkrow mt-8">
        <Link href="/about" prefetch={false} className="sx-action">
          About this data
        </Link>
      </p>
    </div>
  );
}
