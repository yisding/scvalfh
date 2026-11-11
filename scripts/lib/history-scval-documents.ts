/**
 * The SCVAL entry of data/<sport>/history-2025-26.json for a sport whose 2025-26 documents are not field
 * hockey's (scripts/build-history.ts calls this for the soccer and basketball builds, where SCVAL is the only
 * league). Two inputs:
 *
 *   standings  scval.com's end-of-season standings PDF, the same layout as field hockey's, read by the same
 *              parser (lib/sources/scval-pdf.ts parseStandingsPdfText): downloaded, or `<from>/standings-2025-26.txt`
 *              offline (tests/fixtures/<sport>/scval-history/)
 *   awards     data/<sport>/official/scval-all-league-2025-26.json, transcribed by hand from scval.com's all-league
 *              PDFs. Each sport's documents are laid out differently (the girls soccer De Anza PDF's text comes
 *              out of pdftotext with letters split from their words), so no parser reads them; the file keeps
 *              each row as printed and this module only normalizes the grade and resolves the school.
 *
 * It returns the entry and the problems found; build-history validates the whole file and writes nothing
 * on any problem.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { divisionsOf, getLeague } from '../../lib/leagues';
import { HttpClient } from '../../lib/sources/http';
import { hasPdftotext, parseStandingsPdfText, pdfToText } from '../../lib/sources/scval-pdf';
import { SPORT_SEASON } from '../../lib/sports/current';
import { resolveTeam, teamsInLeague } from '../../lib/teams';

/** One row of the transcription: [player, school, position, year], each as printed. */
type TranscribedRow = [player: string, school: string, position: string, year: string];

interface TranscribedBlock {
  division: string;
  level: 'varsity' | 'jv';
  /** The all-league PDF this block is in. */
  pdf: string;
  overall: Array<{ award: string; player: string; school: string; position: string; year: string }>;
  firstTeam: TranscribedRow[];
  secondTeam: TranscribedRow[];
  thirdTeam: TranscribedRow[];
  honorableMention: TranscribedRow[];
}

export interface Transcription {
  season: string;
  sport: string;
  /** The day the PDFs were read. */
  retrievedOn: string;
  standingsPdf: string;
  transcription: string;
  /** Sport-specific facts for the provenance notes. */
  notes: string[];
  blocks: TranscribedBlock[];
}

/** The grade a document's year cell means: "Jr", "Junior", "SO", "Frosh", "Fresh", "10". */
const YEAR_WORDS: Readonly<Record<string, number>> = {
  fr: 9, frosh: 9, fresh: 9, freshman: 9,
  so: 10, soph: 10, sophomore: 10,
  jr: 11, junior: 11,
  sr: 12, senior: 12,
};

export function gradeOf(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (/^(9|10|11|12)$/.test(t)) return Number(t);
  return YEAR_WORDS[t] ?? null;
}

export function transcriptionPath(dataDir: string): string {
  return path.join(process.cwd(), dataDir, 'official', 'scval-all-league-2025-26.json');
}

export async function buildScvalDocumentsHistory(opts: {
  /** A folder holding standings-2025-26.txt (pdftotext -layout of the standings PDF), or null to download it. */
  from: string | null;
  transcription: Transcription;
  log: (line: string) => void;
}): Promise<{ entry: Record<string, unknown>; problems: string[] }> {
  const { transcription: tr, log } = opts;
  const problems: string[] = [];

  let text: string;
  if (opts.from) {
    text = readFileSync(path.join(opts.from, 'standings-2025-26.txt'), 'utf8');
    log(`build-history: SCVAL standings offline, from ${opts.from}`);
  } else {
    if (!hasPdftotext()) throw new Error('pdftotext (poppler-utils) is required. apt install poppler-utils');
    log('build-history: downloading the SCVAL standings PDF');
    const res = await new HttpClient({ onLog: (l) => log(`  ${l}`) }).bytes(tr.standingsPdf);
    text = pdfToText(res.body);
  }
  const standings = parseStandingsPdfText(text);

  const scvalSlugs = new Set(teamsInLeague('scval').map((t) => t.slug));
  const slugOf = (name: string): string | null => {
    const team = resolveTeam(name);
    return team && scvalSlugs.has(team.slug) ? team.slug : null;
  };

  const expected = divisionsOf('scval').flatMap(({ id }) => [`${id}/varsity`, `${id}/jv`]);
  for (const [what, keys] of [
    ['standings PDF', standings.map((b) => `${b.division}/${b.level}`)],
    ['all-league transcription', tr.blocks.map((b) => `${b.division}/${b.level}`)],
  ] as const) {
    for (const key of expected) {
      const n = keys.filter((k) => k === key).length;
      if (n !== 1) problems.push(`${what} has ${n} ${key} blocks, expected 1`);
    }
    if (keys.length !== expected.length) problems.push(`${what} has ${keys.length} blocks, expected ${expected.length}`);
  }
  for (const block of standings) {
    if (block.rows.length === 0) problems.push(`${block.division}/${block.level} standings block is empty`);
    for (const row of block.rows) {
      // The parser resolves globally; the archive keys a row only to a team of this league.
      if (!row.slug || !scvalSlugs.has(row.slug)) problems.push(`standings name "${row.name}" resolves to no registry team`);
    }
  }
  const placed = standings.filter((b) => b.level === 'varsity').flatMap((b) => b.rows.map((r) => r.slug));
  for (const slug of scvalSlugs) {
    if (!placed.includes(slug)) problems.push(`registry team ${slug} is in no 2025-26 varsity standings block`);
  }

  const player = ([name, school, position, year]: TranscribedRow, where: string) => {
    const slug = slugOf(school);
    const grade = gradeOf(year);
    if (!slug) problems.push(`all-league school "${school}" (${where}) resolves to no registry team`);
    if (grade === null) problems.push(`all-league year "${year}" of ${name} (${where}) is not a grade`);
    return { player: name, school, slug, position: position.trim() || null, year: grade ?? 0 };
  };

  const awardsOf = (division: string, level: 'varsity' | 'jv') => {
    const b = tr.blocks.find((x) => x.division === division && x.level === level);
    if (!b) return null;
    const where = `${division}/${level}`;
    for (const o of b.overall) {
      if (!slugOf(o.school)) problems.push(`all-league school "${o.school}" (${where} ${o.award}) resolves to no registry team`);
      if (gradeOf(o.year) === null) problems.push(`all-league year "${o.year}" of ${o.player} (${where}) is not a grade`);
    }
    return {
      division,
      level,
      // "Player, School, Position, Grade": the four table cells, so the page splits it like a team-list line
      // (components/history/history-view.ts splitOverallValue).
      overall: b.overall.map((o) => ({
        award: o.award,
        value: [o.player, o.school, o.position, String(gradeOf(o.year) ?? o.year)].filter(Boolean).join(', '),
      })),
      firstTeam: b.firstTeam.map((r) => player(r, where)),
      secondTeam: b.secondTeam.map((r) => player(r, where)),
      ...(b.thirdTeam.length > 0 ? { thirdTeam: b.thirdTeam.map((r) => player(r, where)) } : {}),
      honorableMention: b.honorableMention.map((r) => player(r, where)),
    };
  };

  const divisions = divisionsOf('scval').map(({ id: division, label }) => ({
    division,
    label,
    standings: {
      varsity: standings.find((b) => b.division === division && b.level === 'varsity')?.rows ?? [],
      jv: standings.find((b) => b.division === division && b.level === 'jv')?.rows ?? [],
    },
    awards: { varsity: awardsOf(division, 'varsity'), jv: awardsOf(division, 'jv') },
  }));

  const allLeaguePdfs = Object.fromEntries(
    divisionsOf('scval').map(({ id }) => [
      id,
      {
        varsity: tr.blocks.find((b) => b.division === id && b.level === 'varsity')?.pdf ?? null,
        jv: tr.blocks.find((b) => b.division === id && b.level === 'jv')?.pdf ?? null,
      },
    ]),
  );

  const entry = {
    status: 'available',
    league: getLeague('scval').name,
    provenance: {
      source: 'scval-documents',
      builtBy: 'scripts/build-history.ts',
      standingsPdf: tr.standingsPdf,
      allLeaguePdfs,
      retrievedOn: tr.retrievedOn,
      extraction: `Standings: pdftotext -layout. All-league awards: ${tr.transcription}`,
      notes: [
        `SCVAL ${SPORT_SEASON.gender} ${SPORT_SEASON.sport.noun}, from scval.com/standings. Rows are in the PDF's own "SCHOOL by finish" order; nothing is recomputed, since the PDF carries no game-level data.`,
        'The PDF\'s "Overall record" column is empty, so every overallRecord is null.',
        'Division membership is the 2025-26 PDF\'s, which is not the 2026-27 alignment; the page says which teams moved.',
        'School spellings are the documents\' own ("Mt. View", "Monta VIsta"); `slug` is the join key.',
        'Grades are stored as 9-12 whatever the document wrote ("Jr", "Junior", "Soph", "Frosh", "11").',
        'An overall award is stored as "Player, School, Position, Grade" from the document\'s four cells. Two players named for one award are two entries under the same title.',
        ...tr.notes,
      ],
    },
    divisions,
  };
  return { entry, problems };
}
