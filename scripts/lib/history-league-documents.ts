/**
 * A league's entry of data/<sport>/history-2025-26.json built from that league's own end-of-season documents, as
 * it publishes them, transcribed into data/<sport>/official/<league>-2025-26.json (scripts/build-history.ts calls
 * this for the WCAL and the WBAL in the soccer and volleyball builds, added 2026-11-16, and for the PAL in the soccer
 * and basketball builds and the WCAL and the WBAL in basketball, added 2026-11-21):
 *
 *   WCAL  wcalsports.org: the 2025-2026 standings archive PDF (wcalsports.org/standings/) and the 2025-26
 *         all-league PDF (wcalsports.org/awardsrecords/)
 *   WBAL  hs.wbalsports.org: last season's standings page and all-league page, linked from its history page
 *   PAL   pal.smcoe.org/standings: one PDF a sport and level (on Google Drive), standings only
 *
 * Neither league's documents follow a layout another league's parser reads, and both are published once a year, so
 * the file keeps each row as printed and this module only reads the record, turns the year into a grade and the
 * school into its slug, and fails on anything it cannot read. It returns the entry and the problems found;
 * build-history validates the whole file and writes nothing on any problem.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { divisionsOf, getLeague } from '../../lib/leagues';
import { SPORT } from '../../lib/sports/current';
import { TEAMS, resolveTeam, teamsInLeague } from '../../lib/teams';
import type { LeagueId } from '../../lib/types';
import { gradeOf } from './history-scval-documents';

/** One standings row as printed: the place (the one above it, for a row the league ranks level), the school, the records. */
interface TranscribedRow {
  place: number;
  name: string;
  /** "11-0-1" (W-L-T) or "12-0" (W-L, volleyball). */
  league: string;
  /** The season record the document prints beside it, or null when it prints none. */
  overall: string | null;
}

/** One listed player: [player, school, position, year], each as printed ('' where the document prints none). */
type TranscribedPlayer = [player: string, school: string, position: string, year: string];

interface TranscribedAwards {
  overall: Array<{ award: string; player: string; school: string; position: string; year: string }>;
  firstTeam: TranscribedPlayer[];
  secondTeam: TranscribedPlayer[];
  thirdTeam?: TranscribedPlayer[];
  honorableMention: TranscribedPlayer[];
}

interface Document {
  url: string;
  kind: 'pdf' | 'page';
  /** The league's page that links it. */
  index: string;
}

export interface LeagueTranscription {
  season: string;
  sport: string;
  league: LeagueId;
  /** The site the documents are on, as the page's source line names it. */
  publisher: string;
  /** The day the documents were read. */
  retrievedOn: string;
  standings: Document;
  allLeague: Document | null;
  transcription: string;
  notes: string[];
  /**
   * Schools in this league's 2025-26 tables that are in another league of this build now (Presentation: the WCAL
   * then, the WBAL's Foothill now). Their rows keep their slug; nothing else outside the league is let through.
   */
  formerMembers: string[];
  /** Schools of this league now that were in none of its 2025-26 tables (Presentation, in the WBAL). */
  joinedSince: string[];
  /**
   * Schools in this league's 2025-26 tables that are in no league of this build now, by the name the tables print
   * (the PAL's Oceana, in the PSAL since 2026-27). Their rows are kept, with no slug; nothing else unresolved is let
   * through.
   */
  leftBuild?: string[];
  /** A school a document spells past what the registry resolves ("Mercy"), and the school it is. */
  schoolSpellings: Readonly<Record<string, string>>;
  divisions: Array<{
    division: string;
    standings: { varsity: TranscribedRow[]; jv: TranscribedRow[] };
    awards: { varsity: TranscribedAwards | null; jv: TranscribedAwards | null };
  }>;
}

export function leagueTranscriptionPath(dataDir: string, leagueId: LeagueId): string {
  return path.join(process.cwd(), dataDir, 'official', `${leagueId}-2025-26.json`);
}

export function readLeagueTranscription(dataDir: string, leagueId: LeagueId): LeagueTranscription {
  return JSON.parse(readFileSync(leagueTranscriptionPath(dataDir, leagueId), 'utf8')) as LeagueTranscription;
}

const RECORD = /^(\d+)-(\d+)(?:-(\d+))?$/;

export function buildLeagueDocumentsHistory(
  leagueId: LeagueId,
  tr: LeagueTranscription,
  season: string,
): { entry: Record<string, unknown>; problems: string[] } {
  const problems: string[] = [];
  const say = (p: string) => problems.push(`${leagueId}: ${p}`);
  if (tr.league !== leagueId) say(`the transcription is of league "${tr.league}"`);
  if (tr.season !== season) say(`the transcription is of season ${tr.season}, the archive of ${season}`);

  const own = new Set(teamsInLeague(leagueId).map((t) => t.slug));
  const buildSlugs = new Set(TEAMS.map((t) => t.slug));
  for (const slug of tr.formerMembers) {
    if (!buildSlugs.has(slug) || own.has(slug)) say(`former member "${slug}" is no team of another league of this build`);
  }
  for (const slug of tr.joinedSince) {
    if (!own.has(slug)) say(`"${slug}" (joinedSince) is no team of this league`);
  }
  const left = new Set(tr.leftBuild ?? []);
  for (const name of left) {
    if (resolveTeam(tr.schoolSpellings[name] ?? name)) say(`"${name}" (leftBuild) is a team of this build`);
  }
  const allowed = new Set([...own, ...tr.formerMembers]);
  const slugOf = (name: string): string | null => {
    const team = resolveTeam(tr.schoolSpellings[name] ?? name);
    return team && allowed.has(team.slug) ? team.slug : null;
  };

  const expected = divisionsOf(leagueId).map((d) => d.id);
  const got = tr.divisions.map((d) => d.division);
  if (expected.join() !== got.join()) say(`the transcription's divisions are [${got.join(', ')}], expected [${expected.join(', ')}]`);

  const row = (r: TranscribedRow, where: string) => {
    const slug = slugOf(r.name);
    if (!slug && !left.has(r.name)) say(`standings name "${r.name}" (${where}) resolves to no team of the league or its former members`);
    const m = RECORD.exec(r.league);
    if (!m) say(`league record "${r.league}" of ${r.name} (${where}) is not W-L or W-L-T`);
    if (r.overall !== null && !RECORD.test(r.overall)) say(`overall record "${r.overall}" of ${r.name} (${where}) is not a record`);
    // A record with no ties field: unpublished (null) in a sport with ties, none to publish (0) in one without.
    if (m && m[3] === undefined && SPORT.scoring.allowsTies) say(`league record "${r.league}" of ${r.name} (${where}) has no ties field`);
    return {
      place: r.place,
      name: r.name,
      slug,
      leagueRecord: r.league,
      w: m ? Number(m[1]) : 0,
      l: m ? Number(m[2]) : 0,
      t: m ? Number(m[3] ?? 0) : 0,
      overallRecord: r.overall,
    };
  };

  const player = ([name, school, position, year]: TranscribedPlayer, where: string) => {
    const slug = slugOf(school);
    const grade = year.trim() === '' ? null : gradeOf(year);
    if (!slug) say(`all-league school "${school}" (${where}) resolves to no team of the league or its former members`);
    if (year.trim() !== '' && grade === null) say(`all-league year "${year}" of ${name} (${where}) is not a grade`);
    return { player: name, school, slug, position: position.trim() || null, year: grade };
  };

  const awards = (a: TranscribedAwards | null, division: string, level: 'varsity' | 'jv') => {
    if (!a) return null;
    const where = `${division}/${level}`;
    for (const o of a.overall) {
      if (!slugOf(o.school)) say(`all-league school "${o.school}" (${where} ${o.award}) resolves to no team of the league`);
      if (o.year.trim() !== '' && gradeOf(o.year) === null) say(`all-league year "${o.year}" of ${o.player} (${where}) is not a grade`);
    }
    return {
      division,
      level,
      // "Player, School, Position, Grade", as SCVAL's are stored (components/history/history-view.ts
      // splitOverallValue reads it); a part the document does not print is left out.
      overall: a.overall.map((o) => ({
        award: o.award,
        value: [o.player, o.school, o.position.trim(), o.year.trim() === '' ? '' : String(gradeOf(o.year) ?? o.year)]
          .filter(Boolean)
          .join(', '),
      })),
      firstTeam: a.firstTeam.map((p) => player(p, where)),
      secondTeam: a.secondTeam.map((p) => player(p, where)),
      ...(a.thirdTeam && a.thirdTeam.length > 0 ? { thirdTeam: a.thirdTeam.map((p) => player(p, where)) } : {}),
      honorableMention: a.honorableMention.map((p) => player(p, where)),
    };
  };

  // A school named in `leftBuild` must be a row of the tables: the list declares the rows that keep no slug, so a
  // name no row prints (a typo, a stale entry) is an error, not a silent exception.
  const printed = new Set(tr.divisions.flatMap((d) => [...d.standings.varsity, ...d.standings.jv].map((r) => r.name)));
  for (const name of left) {
    if (!printed.has(name)) say(`"${name}" (leftBuild) is in no standings table`);
  }

  const divisions = divisionsOf(leagueId).map(({ id: division, label }) => {
    const d = tr.divisions.find((x) => x.division === division);
    return {
      division,
      label,
      standings: {
        varsity: (d?.standings.varsity ?? []).map((r) => row(r, `${division}/varsity`)),
        jv: (d?.standings.jv ?? []).map((r) => row(r, `${division}/jv`)),
      },
      awards: { varsity: awards(d?.awards.varsity ?? null, division, 'varsity'), jv: awards(d?.awards.jv ?? null, division, 'jv') },
    };
  });

  // Every team of the league then is in exactly one varsity table, and in at most one JV table.
  for (const level of ['varsity', 'jv'] as const) {
    const slugs = divisions.flatMap((d) => d.standings[level].map((r) => r.slug)).filter((s): s is string => s !== null);
    for (const slug of new Set(slugs)) {
      const n = slugs.filter((s) => s === slug).length;
      if (n > 1) say(`${slug} is in ${n} ${level} tables`);
    }
    if (level === 'varsity') {
      for (const slug of [...own, ...tr.formerMembers]) {
        const placed = slugs.includes(slug);
        if (!placed && !tr.joinedSince.includes(slug)) say(`team ${slug} is in no 2025-26 varsity table and is not listed as joinedSince`);
        if (placed && tr.joinedSince.includes(slug)) say(`team ${slug} is listed as joinedSince and is in a 2025-26 varsity table`);
      }
    }
  }

  const league = getLeague(leagueId);
  const entry = {
    status: 'available',
    league: league.name,
    provenance: {
      source: 'league-documents',
      builtBy: 'scripts/build-history.ts',
      publisher: tr.publisher,
      standings: { url: tr.standings.url, kind: tr.standings.kind },
      allLeague: tr.allLeague ? { url: tr.allLeague.url, kind: tr.allLeague.kind } : null,
      retrievedOn: tr.retrievedOn,
      extraction: tr.transcription,
      notes: [
        `${league.shortName} ${tr.sport.toLowerCase()} ${tr.season}, from ${tr.publisher}: the standings linked from ${tr.standings.index}${tr.allLeague ? ` and the all-league teams linked from ${tr.allLeague.index}` : ''}. Rows are in the league's own order; nothing is recomputed.`,
        ...tr.notes,
      ],
    },
    divisions,
  };
  return { entry, problems };
}
