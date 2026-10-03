#!/usr/bin/env tsx
/**
 * Build data/history-2025-26.json from the two official SCVAL end-of-season PDFs.
 *
 *   pnpm exec tsx scripts/build-history.ts
 *   pnpm exec tsx scripts/build-history.ts --from tests/fixtures/scval   # offline, from .txt
 *   pnpm exec tsx scripts/build-history.ts --dry-run
 *
 * Run once per season, by hand — NOT from the cron. The two PDFs are published once a year and the
 * file they produce is committed, because prior-season standings exist nowhere else: MaxPreps' league
 * URL year segment is cosmetic and always serves the current table (SPEC §1.1h).
 *
 * The output is deliberately record-only. No points column and no recomputed ranking: the PDF has no
 * game-level data, so its "SCHOOL by finish" order is the only ordering that can be published
 * honestly, and the 3-points-a-win system is only ASSUMED for 2025-26 (BYLAWS-ADDENDUM note 6).
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
import { divisionsOf } from '../lib/leagues';

interface Args {
  from: string | null;
  out: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    from: null,
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
    else if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--dry-run') out.dryRun = true;
    else throw new Error(`unknown flag: ${arg}`);
  }
  return out;
}

/** Keys sorted at every level, so re-running produces a byte-identical file. */
function stableStringify(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        const v = (node as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      return out;
    }
    return node;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
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

  // History is SCVAL-only (SPEC §7.13): never ALL_DIVISIONS.
  const divisions = divisionsOf('scval').map(({ id: division, label }) => ({
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

  const history = {
    season: '2025-26',
    sport: 'Girls Field Hockey',
    league: 'Santa Clara Valley Athletic League',
    /** How this file was made, and what it deliberately does not contain. */
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
    divisions,
  };

  console.log('');
  for (const d of divisions) {
    console.log(
      `${d.label.padEnd(10)} varsity ${String(d.standings.varsity.length).padStart(2)} rows · ` +
        `jv ${String(d.standings.jv.length).padStart(2)} rows · ` +
        `awards V ${d.awards.varsity ? `${d.awards.varsity.overall.length} overall / ${d.awards.varsity.firstTeam.length} first / ${d.awards.varsity.secondTeam.length} second / ${d.awards.varsity.honorableMention.length} hm` : 'none'} · ` +
        `awards JV ${d.awards.jv ? `${d.awards.jv.firstTeam.length} first / ${d.awards.jv.secondTeam.length} second / ${d.awards.jv.honorableMention.length} hm` : 'none'}`,
    );
    console.log(`  ${d.standings.varsity.map((r) => `${r.name} ${r.leagueRecord}`).join(' · ')}`);
  }

  if (args.dryRun) {
    console.log('\ndry run: nothing written');
    return problems.length ? 1 : 0;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(history), 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return problems.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
