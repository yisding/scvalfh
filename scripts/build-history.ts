#!/usr/bin/env tsx
/**
 * Build data/history-2025-26.json: one entry per league.
 *
 *   SCVAL  the two official scval.com end-of-season PDFs (standings, all-league)
 *   BVAL   the official BVAL standings Google Sheet and the two all-league documents, as linked
 *          from bval.org/standings and bval.org/all-league
 *   PCAL, MCAL, EAL  'unavailable', with the reason (below): we found no official 2025-26 final standings
 *
 *   pnpm build-history
 *   pnpm build-history --from tests/fixtures/scval \
 *     --bval-from tests/fixtures/bval --retrieved-on 2026-10-03          # fully offline, from fixtures
 *   pnpm build-history --dry-run
 *   pnpm build-history --out <path>                                     # write somewhere else
 *
 * --retrieved-on is the day the BVAL documents were read. A live run defaults it to today; with
 * --bval-from it is required (YYYY-MM-DD), because only the person who saved the fixtures knows it.
 *
 * Nothing is written unless the assembled file passes lib/history-schema.ts' schema and the build
 * found no problem (an unresolved school, a missing block): it exits 1 instead.
 *
 * Run once per season, by hand — NOT from the cron. These documents are published once a year and
 * the file they produce is committed, because prior-season standings exist nowhere else: MaxPreps'
 * league URL year segment is cosmetic and always serves the current table (SPEC §1.1h).
 *
 * The output is deliberately record-only. No points column and no recomputed ranking: the PDF has no
 * game-level data, so its "SCHOOL by finish" order is the only ordering that can be published
 * honestly, and the 3-points-a-win system is only ASSUMED for 2025-26 (BYLAWS-ADDENDUM note 6).
 * BVAL's sheet adds an overall record, kept as published; its JV records (one JV place in the whole
 * sheet) are not a standings table and are not stored.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  SCVAL_HISTORY_PDFS,
  ScvalClient,
  hasPdftotext,
  parseAllLeaguePdfText,
  parseStandingsPdfText,
  type AllLeagueBlock,
  type HistoryStandingsBlock,
} from '../lib/sources/scval-pdf';
import {
  BVAL_HISTORY_SOURCES,
  bvalDocExportUrl,
  bvalRegistrySlugs,
  parseAllLeagueHtml,
  parseStandingsCsv,
  type BvalAllLeagueBlock,
  type BvalStandingsBlock,
} from '../lib/sources/bval-sheet';
import { HttpClient } from '../lib/sources/http';
import { HistorySchema } from '../lib/history-schema';
import { divisionsOf, getLeague } from '../lib/leagues';
import { isCalendarDate } from '../lib/schema-primitives';
import { stableStringify } from '../lib/stable-json';
import { runCli } from './cli';

interface Args {
  from: string | null;
  bvalFrom: string | null;
  retrievedOn: string;
  out: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Omit<Args, 'retrievedOn'> & { retrievedOn: string | null } = {
    from: null,
    bvalFrom: null,
    retrievedOn: null,
    out: path.join(process.cwd(), 'data', 'history-2025-26.json'),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--from') out.from = path.resolve(next());
    else if (arg === '--bval-from') out.bvalFrom = path.resolve(next());
    else if (arg === '--retrieved-on') out.retrievedOn = next();
    else if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--dry-run') out.dryRun = true;
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (out.retrievedOn !== null && !isCalendarDate(out.retrievedOn)) {
    throw new Error(`--retrieved-on must be a date written YYYY-MM-DD, got "${out.retrievedOn}"`);
  }
  // Offline, the documents were read whenever the fixtures were saved; today would be a guess.
  if (out.bvalFrom && out.retrievedOn === null) {
    throw new Error('--bval-from needs --retrieved-on YYYY-MM-DD: the day those BVAL files were read');
  }
  return { ...out, retrievedOn: out.retrievedOn ?? new Date().toISOString().slice(0, 10) };
}

function pick<T extends { division: string; level: string }>(
  blocks: readonly T[],
  division: string,
  level: string,
): T | null {
  return blocks.find((b) => b.division === division && b.level === level) ?? null;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  let standings: HistoryStandingsBlock[];
  let allLeague: AllLeagueBlock[];
  if (args.from) {
    standings = parseStandingsPdfText(
      readFileSync(path.join(args.from, 'standings-2025-26.txt'), 'utf8'),
    );
    allLeague = parseAllLeaguePdfText(
      readFileSync(path.join(args.from, 'all-league-2025-26.txt'), 'utf8'),
    );
    console.log(`build-history: offline, from ${args.from}`);
  } else {
    if (!hasPdftotext()) {
      console.error('FAILED: pdftotext (poppler-utils) is required. apt install poppler-utils');
      return 1;
    }
    console.log('build-history: downloading the two scval.com PDFs');
    const res = await new ScvalClient({ onLog: (l) => console.log(`  ${l}`) }).getHistory();
    standings = res.standings;
    allLeague = res.allLeague;
  }

  // The PDF has exactly four blocks in each file; anything else means the format changed.
  const problems: string[] = [];
  if (standings.length !== 4) problems.push(`standings PDF yielded ${standings.length} blocks, expected 4`);
  if (allLeague.length !== 4) problems.push(`all-league PDF yielded ${allLeague.length} blocks, expected 4`);
  // Four blocks is not enough: each division/level must appear exactly once, or a duplicated block
  // would hide a missing one and `pick` below would quietly write it as empty.
  const expectedBlocks = divisionsOf('scval').flatMap(({ id }) => [`${id}/varsity`, `${id}/jv`]);
  for (const [name, blocks] of [
    ['standings', standings],
    ['all-league', allLeague],
  ] as const) {
    const keys = blocks.map(({ division, level }) => `${division}/${level}`);
    for (const key of new Set(keys)) {
      if (keys.filter((k) => k === key).length > 1) problems.push(`${name} PDF has more than one ${key} block`);
    }
    for (const key of expectedBlocks) {
      if (!keys.includes(key)) problems.push(`${name} PDF has no ${key} block`);
    }
  }
  for (const block of standings) {
    if (block.rows.length === 0) problems.push(`${block.division}/${block.level} standings block is empty`);
    for (const row of block.rows) {
      if (!row.slug) problems.push(`standings name "${row.name}" resolves to no registry team`);
    }
  }
  for (const block of allLeague) {
    for (const player of [...block.firstTeam, ...block.secondTeam, ...block.honorableMention]) {
      if (!player.slug) problems.push(`all-league school "${player.school}" resolves to no registry team`);
    }
  }
  for (const p of problems) console.warn(`WARN ${p}`);
  const scvalProblems = problems.length;

  // ---- SCVAL: only its own two divisions, never ALL_DIVISIONS.
  const scvalDivisions = divisionsOf('scval').map(({ id: division, label }) => ({
    division,
    label,
    standings: {
      varsity: pick(standings, division, 'varsity')?.rows ?? [],
      jv: pick(standings, division, 'jv')?.rows ?? [],
    },
    awards: {
      varsity: pick(allLeague, division, 'varsity'),
      jv: pick(allLeague, division, 'jv'),
    },
  }));

  const scval = {
    status: 'available',
    league: getLeague('scval').name,
    /** How this entry was made, and what it deliberately does not contain. */
    provenance: {
      source: 'scval-pdf',
      builtBy: 'scripts/build-history.ts',
      standingsPdf: SCVAL_HISTORY_PDFS.standings,
      allLeaguePdf: SCVAL_HISTORY_PDFS.allLeague,
      extraction: 'pdftotext -layout',
      notes: [
        'Rows are in the PDF\'s own "SCHOOL by finish" order. We do not recompute a ranking: the PDF carries no game-level data.',
        'The PDF\'s "Overall record" column is EMPTY in the 2025-26 file, so every overallRecord is null.',
        'No points column: the 3-points-a-win system is only assumed for 2025-26 (SCVAL By-Laws revision history), and the PDF prints W-L-T alone.',
        'JV membership differs from varsity: De Anza JV has 6 teams (no Valley Christian, no Wilcox) and El Camino JV has 6 (no Saratoga, no Presentation).',
        'De Anza varsity had SEVEN teams in 2025-26 — Wilcox is new to the 2026-27 grid.',
        'School spellings are the PDFs\' own and are inconsistent even within one file ("St Ignatius" in the awards block, "Saint Ignatius" in the team table). `slug` is the join key.',
        'Overall-award values are stored verbatim: De Anza writes "School- Player", El Camino writes "Player School Year" and "Player, Position, School". Splitting all three shapes would mean guessing.',
      ],
    },
    divisions: scvalDivisions,
  };

  // ---- BVAL: the official sheet and the two all-league documents.
  let bvalStandings: BvalStandingsBlock[];
  const bvalAllLeague: BvalAllLeagueBlock[] = [];
  const bvalDocUrls = BVAL_HISTORY_SOURCES.allLeagueDocs;
  if (args.bvalFrom) {
    bvalStandings = parseStandingsCsv(readFileSync(path.join(args.bvalFrom, 'standings-2025-26.csv'), 'utf8'));
    for (const division of Object.keys(bvalDocUrls)) {
      bvalAllLeague.push(
        parseAllLeagueHtml(
          readFileSync(path.join(args.bvalFrom, `all-league-${division}-2025-26.html`), 'utf8'),
          division,
        ),
      );
    }
    console.log(`build-history: BVAL offline, from ${args.bvalFrom} (retrieved-on ${args.retrievedOn})`);
  } else {
    console.log('build-history: downloading the BVAL sheet and the two all-league documents');
    const http = new HttpClient({ onLog: (l) => console.log(`  ${l}`) });
    bvalStandings = parseStandingsCsv((await http.text(BVAL_HISTORY_SOURCES.standingsSheet, 'text/csv,*/*')).body);
    for (const [division, editUrl] of Object.entries(bvalDocUrls)) {
      bvalAllLeague.push(parseAllLeagueHtml((await http.text(bvalDocExportUrl(editUrl))).body, division));
    }
  }
  const bvalDivisions = divisionsOf('bval').map(({ id: division, label }) => {
    const block = bvalStandings.find((b) => b.division === division);
    const awards = bvalAllLeague.find((b) => b.division === division);
    if (!block || block.rows.length === 0) problems.push(`BVAL sheet has no ${division} block`);
    if (!awards) problems.push(`BVAL all-league document for ${division} is missing`);
    for (const row of block?.rows ?? []) {
      if (!row.slug) problems.push(`BVAL standings name "${row.name}" resolves to no registry team`);
    }
    for (const player of awards ? [...awards.firstTeam, ...awards.secondTeam, ...awards.honorableMention] : []) {
      if (!player.slug) problems.push(`BVAL all-league school "${player.school}" resolves to no registry team`);
    }
    return {
      division,
      label,
      standings: { varsity: block?.rows ?? [], jv: [] },
      awards: {
        varsity: awards
          ? {
              division,
              level: 'varsity',
              overall: awards.overall,
              firstTeam: awards.firstTeam,
              secondTeam: awards.secondTeam,
              honorableMention: awards.honorableMention,
            }
          : null,
        jv: null,
      },
    };
  });
  const bvalPlaced = bvalDivisions.flatMap((d) => d.standings.varsity.map((r) => r.slug));
  for (const slug of bvalRegistrySlugs()) {
    if (!bvalPlaced.includes(slug)) problems.push(`BVAL registry team ${slug} is in no 2025-26 standings block`);
  }
  const emptyRows = bvalAllLeague.flatMap((b) => b.emptyRows.map((e) => `${b.division}/${e.team}/${e.school}`));

  const bval = {
    status: 'available',
    league: getLeague('bval').name,
    provenance: {
      source: 'bval-sheet',
      builtBy: 'scripts/build-history.ts',
      standingsSheet: BVAL_HISTORY_SOURCES.standingsSheet,
      standingsSheetView: BVAL_HISTORY_SOURCES.standingsSheetView,
      standingsIndex: BVAL_HISTORY_SOURCES.standingsIndex,
      allLeagueDocs: bvalDocUrls,
      retrievedOn: args.retrievedOn,
      extraction:
        'Google Sheets CSV export of the standings sheet; Google Docs HTML export of the two all-league documents (table cells).',
      notes: [
        'Official BVAL sheet titled "BVAL Field Hockey / 2025-26 Team Standings", linked from bval.org/standings. Varsity order is the sheet\'s own "Place".',
        'Records only: the sheet has Overall and League Record per school and no points, goals or tiebreak data, so none are stored or computed.',
        'Division membership is the 2025-26 sheet as printed: Leland is in Santa Teresa and Prospect in Mt. Hamilton, although lib/registry/bval.ts lists leland under mt-hamilton and prospect under santa-teresa (the 2026-27 alignment). The registry is not changed; the page says both teams moved.',
        'Sobrato\'s league and overall record is printed "4 - 6" with no ties field. It is stored as published ("4-6"), t is null (unpublished), and nothing assumes 0 ties.',
        'JV is not stored: the sheet has a JV Record column, but a JV Place for Leigh only, so there is no JV standings order to publish.',
        'All-league awards come from the two official BVAL documents linked from bval.org/all-league (Field Hockey: Mt. Hamilton, Santa Teresa). Overall award values are "Name, School, Position" from the three table cells.',
        'Santa Teresa writes the year as a word (Senior, Junior, Sophomore, "Sophmore" sic); it is stored as the grade 12, 11, 10. Names are as typed in the documents, including any typos.',
        'An empty position cell is stored as null. Rows that name a school but no player (the documents\' own placeholders) are skipped: ' +
          (emptyRows.length ? emptyRows.join(', ') : 'none') +
          '.',
        'Mt. Hamilton names no Freshman of the Year; Santa Teresa names no Sophomore of the Year. Neither document has an honorable-mention table.',
      ],
    },
    divisions: bvalDivisions,
  };

  // ---- PCAL, MCAL and EAL: no official final standings, so no table is shown.
  const pcal = {
    status: 'unavailable',
    league: getLeague('pcal').name,
    reason:
      'No official 2025-26 final standings were reachable. pcalathletics.org lists only the current schedules for field hockey, and its history pages stop at the 2024-25 season, with no 2025-26 standings page or document. We do not show standings or awards from third-party sources.',
    checkedOn: '2026-10-03',
    checked: [
      'https://pcalathletics.org/field-hockey/ (current-season schedules only)',
      'pcalathletics.org History pages (latest listing is 2024-25; no 2025-26 page or document)',
    ],
  };
  // mcalsports.org loads (a first request sometimes gets a Sucuri redirect; the cron reads its
  // Schedir.htm), but MCAL posts no standings of its own: the field hockey page's standings link is
  // MaxPreps' current-season table. The official 2025 All-MCAL team IS on that page (#FH25). It is
  // linked, not stored: the schema has no awards-only state. (The card's text avoids the words
  // assert-copy forbids on an unavailable league, such as "all-league": it links awards, shows none.)
  const mcal = {
    status: 'unavailable',
    league: getLeague('mcal').name,
    reason:
      'MCAL published no 2025-26 final standings of its own. Its field hockey page links "League Standings" to MaxPreps\' current-season table, and it posts no 2025 play-off sheet. The league\'s official 2025 All-MCAL team is posted on the same page and is linked here, not reproduced: this archive shows a league\'s awards only beside its official final standings. We do not show standings from newspapers or third-party sites.',
    checkedOn: '2026-10-03',
    checked: [
      'https://www.mcalsports.org/FieldHockey.htm (loads; its "League Standings" link is MaxPreps\' 2026-27 table, and no 2025 standings are posted)',
      'https://www.mcalsports.org/ (no standings or results archive)',
      'https://www.mcalsports.org/Playoffs/FieldHockeyPlayoffs_25.pdf (404; the name follows the 2026 sheet, FieldHockeyPlayoffs_26.pdf, and the singular FieldHockeyPlayoff_25.pdf is a 404 too)',
    ],
    alsoPublished: [
      { label: '2025 All-MCAL Field Hockey Team', url: 'https://www.mcalsports.org/FieldHockey.htm#FH25' },
    ],
  };

  // The EAL has no league website, and the CIF Northern Section's field hockey page and Playoff Center post no
  // field hockey standings or results (checked 2026-10-04).
  const eal = {
    status: 'unavailable',
    league: getLeague('eal').name,
    reason:
      'The EAL published no 2025-26 final standings of its own. We found no EAL league website, and the CIF Northern Section’s field hockey page and Playoff Center post no field hockey standings or results. We do not show standings from newspapers or third-party sites.',
    checkedOn: '2026-10-04',
    checked: [
      'https://www.cifns.org/sports/fh/index (the Section’s field hockey page: guidelines and announcements; its standings panel is empty)',
      'https://www.cifns.org/guidelines-playoffs-Divisions-archives/playoff-center/index (2025-26 points and brackets list no field hockey)',
      'https://fieldhockeyumpires.org/ (the EAL/SRL umpires’ site: schedules and assignments, no standings)',
    ],
  };

  const history = {
    season: '2025-26',
    sport: 'Girls Field Hockey',
    leagues: { scval, bval, pcal, mcal, eal },
  };
  const divisions = [...scvalDivisions, ...bvalDivisions];
  for (const p of problems.slice(scvalProblems)) console.warn(`WARN ${p}`);

  console.log('');
  for (const d of divisions) {
    console.log(
      `${d.label.padEnd(12)} varsity ${String(d.standings.varsity.length).padStart(2)} rows · ` +
        `jv ${String(d.standings.jv.length).padStart(2)} rows · ` +
        `awards V ${d.awards.varsity ? `${d.awards.varsity.overall.length} overall / ${d.awards.varsity.firstTeam.length} first / ${d.awards.varsity.secondTeam.length} second / ${d.awards.varsity.honorableMention.length} hm` : 'none'} · ` +
        `awards JV ${d.awards.jv ? `${d.awards.jv.firstTeam.length} first / ${d.awards.jv.secondTeam.length} second / ${d.awards.jv.honorableMention.length} hm` : 'none'}`,
    );
    console.log(`  ${d.standings.varsity.map((r) => `${r.name} ${r.leagueRecord}`).join(' · ')}`);
  }
  console.log('PCAL, MCAL, EAL: unavailable (see reasons in the file)');

  // Validate against the contract before anything is written. lib/history-schema.ts does not load
  // the committed file (lib/history.ts does), so a broken committed file cannot block the rebuild
  // that replaces it.
  const json = stableStringify(history);
  const parsed = HistorySchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 10)) {
      problems.push(`schema: ${i.path.join('.') || '(root)'}: ${i.message}`);
    }
  }

  if (problems.length) {
    console.error(`\nFAILED: ${problems.length} problem(s), nothing written:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  if (args.dryRun) {
    console.log('\ndry run: valid, nothing written');
    return 0;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, json, 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return 0;
}

runCli(main);
