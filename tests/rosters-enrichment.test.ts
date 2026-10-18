/**
 * data/rosters-enrichment.json: the overlay validates, joins cleanly onto the MaxPreps file, fills
 * only blanks, records disagreements instead of applying them, and the merged view says where each
 * value came from.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  RosterEnrichmentSchema,
  countRosters,
  type RosterEnrichment,
  type Rosters,
} from '@/lib/rosters-schema';
import {
  classOf,
  getAllEnrichedRosters,
  getEnrichedTeamRoster,
  getRosterEnrichment,
  getRosters,
  getTeamRoster,
} from '@/lib/rosters';
import { TEAMS, getTeamBySlug, teamsInLeague } from '@/lib/teams';
import { runRepoScript } from './support/cli';
import { REPO, tempDir } from './support/repo';

/**
 * The numbers pinned below are what the 2026-10-02 research found for SCVAL, the one league
 * researched then. They are asserted over SCVAL's teams only, so enrichment added for another
 * league later moves none of them.
 */
const SCVAL_SLUGS: ReadonlySet<string> = new Set(teamsInLeague('scval').map((t) => t.slug));
/** BVAL, PCAL and MCAL: researched 2026-10-03. The EAL entries hold recruiting profiles only (2026-10-04), no school-site sweep. */
const SWEPT_OTHER_SLUGS: ReadonlySet<string> = new Set(
  (['bval', 'pcal', 'mcal'] as const).flatMap((l) => teamsInLeague(l)).map((t) => t.slug),
);
const EAL_SLUGS: ReadonlySet<string> = new Set(teamsInLeague('eal').map((t) => t.slug));

/** Teams whose derived grades also come from a source other than MaxPreps' career page. */
const DERIVED_FROM_OTHER: Record<string, readonly string[]> = {
  berkeley: ['maxpreps-jv'],
  'archie-williams': ['news'],
  // 2026-10-12: an earlier season's school paper or school roster, carried forward.
  'los-altos': ['news'],
  homestead: ['news'],
  redwood: ['news'],
  'point-loma': ['news'],
  'rancho-bernardo': ['news'],
  clairemont: ['school-site'],
  'thousand-oaks': ['school-site'],
};

const base = JSON.parse(readFileSync(path.join(REPO, 'data', 'rosters.json'), 'utf8')) as Rosters;
const raw = JSON.parse(
  readFileSync(path.join(REPO, 'data', 'rosters-enrichment.json'), 'utf8'),
) as RosterEnrichment;

/** A claimed MaxPreps career page, linked by the 2026-10-13 sweep: the only profiles on that platform. */
const claimed1013 = (x: { platform: string }) => x.platform === 'maxpreps';
/** A profile the 2026-10-12 SportsRecruits address probe added: its note says so. */
const fromProbe1012 = (x: { note: string | null }) => x.note?.includes('Found by the 2026-10-12 address probe') ?? false;
/** A grade, a conflict or a record note added on 2026-10-12 from MaxPreps' career and 2025-26 pages: its note says so. */
const from1012 = (note: string | null | undefined) => (note ?? '').includes('Added 2026-10-12') || (note ?? '').endsWith('(2026-10-12).');

/**
 * The file as the captures before 2026-10-12 left it: without that day's profiles, grades,
 * conflicts and notes, without the claimed MaxPreps pages linked on 2026-10-13, and without the
 * records that hold nothing else. The tests that pin what each
 * earlier capture found read this.
 */
const pre: RosterEnrichment = {
  ...raw,
  teams: raw.teams.map((t) => ({
    ...t,
    sources: t.sources.filter((x) => x.capturedAt !== '2026-10-12'),
    players: t.players
      .map((p) => ({
        ...p,
        grade: p.grade && from1012(p.grade.note) ? null : p.grade,
        conflicts: p.conflicts.filter((c) => !from1012(c.note)),
        note: from1012(p.note) ? null : p.note,
        profiles: p.profiles.filter((x) => !fromProbe1012(x) && !claimed1013(x)),
      }))
      .filter(
        (p) =>
          p.sourceName !== null || p.level !== null || p.grade !== null || p.positions !== null || p.jersey !== null ||
          p.height !== null || p.conflicts.length > 0 || p.profiles.length > 0 || p.note !== null,
      ),
  })),
};

/** Writes `enrichment` (and `rosters`, when given) to a temp dir and names them in the loader's override variables. */
function overrideEnv(enrichment: RosterEnrichment, rosters?: Rosters): Record<string, string> {
  const dir = tempDir('enrich');
  const file = path.join(dir, 'bad.json');
  writeFileSync(file, JSON.stringify(enrichment));
  const env: Record<string, string> = { SCVAL_ROSTERS_ENRICHMENT: file };
  if (rosters) {
    env.SCVAL_ROSTERS = path.join(dir, 'rosters.json');
    writeFileSync(env.SCVAL_ROSTERS, JSON.stringify(rosters));
  }
  return env;
}

/**
 * Import lib/rosters.ts with `enrichment` swapped in and return the message it threw ('' when it
 * loaded). The load-time checks need both files, so only a real load shows them; every failure path
 * there throws (failValidation and the `fail` closures; nothing calls process.exit), so an import in
 * this process sees exactly what a child would print.
 */
async function loadError(enrichment: RosterEnrichment, rosters?: Rosters): Promise<string> {
  const env = overrideEnv(enrichment, rosters);
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  try {
    await import('@/lib/rosters');
    return '';
  } catch (err) {
    return (err as Error).message;
  } finally {
    vi.unstubAllEnvs();
  }
}

/**
 * The same load in a CHILD process, returning what it printed to stderr ('' when it loaded): the one
 * case that keeps the separate-process behaviour proven (a failing load fails the whole module).
 */
function loadErrorInChild(enrichment: RosterEnrichment): string {
  const run = runRepoScript('rosters-module', { env: { ...process.env, ...overrideEnv(enrichment) } });
  return run.status === 0 ? '' : run.stderr;
}

/** A team's enrichment record for a MaxPreps row, created empty if the file has none yet. */
function recordFor(file: RosterEnrichment, slug: string, athleteId: string, fullName: string) {
  const team = file.teams.find((t) => t.slug === slug)!;
  let record = team.players.find((p) => p.athleteId === athleteId);
  if (!record) {
    record = {
      athleteId, fullName, sourceName: null, level: null, levelSource: null, grade: null,
      positions: null, jersey: null, height: null, conflicts: [], profiles: [], note: null,
    };
    team.players.push(record);
  }
  return record;
}

describe('data/rosters-enrichment.json', () => {
  it('validates against the contract', () => {
    const parsed = RosterEnrichmentSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
  });

  it('refuses a slug that is not a registry team, a duplicate, and a missing team', () => {
    const stranger = structuredClone(raw);
    stranger.teams[0].slug = 'not-a-school';
    expect(RosterEnrichmentSchema.safeParse(stranger).success).toBe(false);
    const duplicate = structuredClone(raw);
    duplicate.teams[0].slug = duplicate.teams[1].slug;
    expect(RosterEnrichmentSchema.safeParse(duplicate).success).toBe(false);
    const short = structuredClone(raw);
    short.teams.pop();
    expect(RosterEnrichmentSchema.safeParse(short).success).toBe(false);
  });

  it('accepts any registry team, in any league, and covers all 102 plus the same season as the MaxPreps file', () => {
    expect(TEAMS).toHaveLength(102);
    expect(raw.teams.map((t) => t.slug).sort()).toEqual(TEAMS.map((t) => t.slug).sort());
    // A BVAL, PCAL or MCAL team takes a record exactly as an SCVAL one does.
    for (const slug of ['leigh', 'del-mar', 'redwood']) {
      const withRecord = structuredClone(raw);
      const team = withRecord.teams.find((t) => t.slug === slug)!;
      team.notes.push('checked the school site');
      expect(RosterEnrichmentSchema.safeParse(withRecord).success, slug).toBe(true);
    }
    expect(raw.season).toBe(base.season);
    // The overlay is stamped 2026-10-13 (SCVAL was researched 2026-10-02, BVAL, PCAL and MCAL
    // 2026-10-03, the EAL's recruiting pages 2026-10-04, Southern California's 2026-10-06, the
    // SportsRecruits probe in every sport 2026-10-12, and the claimed MaxPreps pages 2026-10-13,
    // against the roster file read 2026-10-07). The athleteId join below is what keeps the two
    // files in step.
    expect(raw.capturedAt).toBe('2026-10-13');
    expect(base.fetchedAt.slice(0, 10) <= raw.capturedAt).toBe(true);
  });

  it('joins every record onto a MaxPreps row of the same team, by athleteId', () => {
    for (const t of raw.teams) {
      const ids = new Map(base.teams.find((b) => b.slug === t.slug)!.players.map((p) => [p.athleteId, p]));
      for (const e of t.players) {
        const p = ids.get(e.athleteId);
        expect(p, `${t.slug}: ${e.fullName}`).toBeDefined();
        expect(p!.fullName).toBe(e.fullName);
      }
    }
  });

  it('only fills blanks — never a value MaxPreps already has', () => {
    for (const t of raw.teams) {
      const ids = new Map(base.teams.find((b) => b.slug === t.slug)!.players.map((p) => [p.athleteId, p]));
      for (const e of t.players) {
        const p = ids.get(e.athleteId)!;
        if (e.grade) expect(p.grade, `${e.fullName} grade`).toBeNull();
        if (e.positions) expect(p.position, `${e.fullName} position`).toBeNull();
        if (e.jersey) expect(p.jersey, `${e.fullName} jersey`).toBeNull();
        if (e.height) expect(p.height, `${e.fullName} height`).toBeNull();
      }
    }
  });

  it('records a disagreement with MaxPreps instead of applying it', () => {
    const conflicts = raw.teams.flatMap((t) => t.players.flatMap((p) => p.conflicts.map((c) => ({ t: t.slug, p, c }))));
    expect(conflicts.length).toBeGreaterThanOrEqual(10);
    for (const { t, p, c } of conflicts) {
      expect(c.kept, `${t} ${p.fullName} ${c.field}`).not.toBe(c.other);
      // https, with one pinned exception: Lick-Wilmerding's roster host (m.lwhs.org) serves a
      // certificate that does not cover it, so its page can only be cited over http.
      if (t === 'lick-wilmerding' && c.source.startsWith('http://m.lwhs.org/')) continue;
      expect(c.source).toMatch(/^https:\/\//);
    }
    // Monta Vista's school profiles disagree with MaxPreps on six numbers; MaxPreps' stay.
    const mv = raw.teams.find((t) => t.slug === 'monta-vista')!;
    const jerseyConflicts = mv.players.filter((p) => p.conflicts.some((c) => c.field === 'jersey'));
    expect(jerseyConflicts.length).toBe(6);
    expect(jerseyConflicts.every((p) => p.jersey === null)).toBe(true);
    const merged = getEnrichedTeamRoster('monta-vista')!;
    expect(new Set(merged.players.map((p) => p.jersey)).size).toBe(merged.players.length);
  });

  it('leaves a grade blank where its sources disagree, and records every one of them as a conflict', () => {
    // DATA-SOURCES: "grades whose sources disagree are left blank rather than guessed". The one
    // place a disagreement is recorded is the player's conflicts; a blank grade's conflicts carry
    // kept: null and at least two different values.
    const blanked: string[] = [];
    for (const t of raw.teams) {
      for (const p of t.players) {
        const open = p.conflicts.filter((c) => c.field === 'grade' && c.kept === null);
        if (open.length === 0) continue;
        blanked.push(`${t.slug}/${p.fullName}`);
        expect(p.grade, `${t.slug} ${p.fullName}`).toBeNull();
        expect(new Set(open.map((c) => c.other)).size, `${t.slug} ${p.fullName}`).toBeGreaterThan(1);
      }
    }
    expect(blanked.sort()).toEqual([
      'berkeley/Anisa Alejandrino',
      // 2026-10-12: a profile page that contradicts itself (Glendora), a school site against MaxPreps'
      // 2025-26 roster (Granite Hills), and two school-site profiles of one player (Salinas).
      'glendora/Paula Mata',
      'granite-hills/Brooke Flesuras',
      'granite-hills/Emma Steingraber',
      'leland/Anna Lychagina',
      'leland/Michaela Reichmuth',
      // MaxPreps' 2025-26 roster and career page disagree (2026-10-12).
      'mission-vista/Izabel Gaytan',
      'point-loma/Ellie Kay',
      'redwood/Audrey Dickerman',
      'redwood/Eloise Tonderys',
      'salinas/Ana Garcia',
      'salinas/Kaylah Arriola',
      'salinas/Mireille Gonzalez-morales',
      'salinas/Teagan Dickison Elias',
    ]);
  });

  it('says what other sources showed for every team MaxPreps lists nobody for, and validates it at load', async () => {
    const recorded = Object.fromEntries(
      (raw.teams as Array<{ slug: string; otherRosters?: { status: string } }>)
        .filter((t) => t.otherRosters)
        .map((t) => [t.slug, t.otherRosters!.status]),
    );
    expect(recorded).toEqual({
      'del-mar': 'none',
      'silver-creek': 'none',
      sobrato: 'none',
      monterey: 'none',
      'santa-catalina': 'none',
      'marin-academy': 'partial',
    });
    // The EAL has had no school-athletics sweep: Corning (empty) records no otherRosters, and its view says not-checked.
    // Neither have the four Southern California leagues nor the independents (recruiting pages only, 2026-10-06): an
    // empty SoCal roster (Chaparral, Fountain Valley, …) is not-checked too, never "none".
    const SOCAL = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
    const unswept = (slug: string) => EAL_SLUGS.has(slug) || SOCAL.has(getTeamBySlug(slug)!.league);
    for (const t of base.teams.filter((x) => x.status === 'empty' && !unswept(x.slug))) {
      expect(recorded[t.slug], t.slug).toBeDefined();
    }
    expect(getEnrichedTeamRoster('corning')!.otherRosters).toEqual({ status: 'not-checked' });
    for (const t of base.teams.filter((x) => x.status === 'empty' && SOCAL.has(getTeamBySlug(x.slug)!.league))) {
      expect(getEnrichedTeamRoster(t.slug)!.otherRosters, t.slug).toEqual({ status: 'not-checked' });
    }
    // A team the file says nothing about has not been checked, and its view says so.
    expect(getEnrichedTeamRoster('cupertino')!.otherRosters).toEqual({ status: 'not-checked' });
    // A partial list must say what it lists and link it.
    const bad = structuredClone(raw) as unknown as { teams: Array<{ slug: string; otherRosters?: unknown }> };
    bad.teams.find((t) => t.slug === 'marin-academy')!.otherRosters = { status: 'partial', checkedOn: '2026-10-03' };
    expect(await loadError(bad as unknown as RosterEnrichment)).toMatch(/otherRosters failed validation/);
  });

  it('tags every filled value with a source, a kind and a confidence', () => {
    for (const t of raw.teams) {
      for (const e of t.players) {
        for (const v of [e.grade, e.positions, e.jersey, e.height]) {
          if (!v) continue;
          expect(v.source).toMatch(/^https:\/\//);
          expect(['high', 'medium', 'low']).toContain(v.confidence);
        }
        // A derived grade is computed from a dated class year on MaxPreps' career page. Two teams
        // (2026-10-03) have one from another dated source, pinned here rather than allowed anywhere.
        if (e.grade?.derived) {
          expect(['maxpreps-career', ...(DERIVED_FROM_OTHER[t.slug] ?? [])], `${t.slug} ${e.fullName}`).toContain(e.grade.kind);
        }
      }
    }
  });

  it('what it adds for SCVAL, as captured on 2026-10-02', () => {
    const scval = pre.teams.filter((t) => SCVAL_SLUGS.has(t.slug));
    const all = scval.flatMap((t) => t.players);
    const n = (k: 'grade' | 'positions' | 'jersey' | 'height') => all.filter((p) => p[k] !== null).length;
    expect(n('grade')).toBe(133);
    expect(n('positions')).toBe(9);
    expect(n('height')).toBe(23);
    expect(n('jersey')).toBe(0);
    expect(all.filter((p) => p.level !== null).length).toBe(56);
    // The level split only exists for Los Gatos, whose MaxPreps list is the whole program.
    expect(scval.filter((t) => t.players.some((p) => p.level !== null)).map((t) => t.slug)).toEqual(['los-gatos']);
    const lg = pre.teams.find((t) => t.slug === 'los-gatos')!;
    expect(lg.players.filter((p) => p.level === 'varsity').length).toBe(27);
    expect(lg.players.filter((p) => p.level === 'jv').length).toBe(29);
  });

  it('names no coach from a rejected or unverifiable source', () => {
    for (const t of raw.teams) {
      for (const c of t.coaches) expect(c.source).not.toMatch(/si\.com/);
    }
  });

  it('refuses a record that would overwrite MaxPreps (asserted at load, not just by the schema)', () => {
    const bad = structuredClone(raw);
    const si = bad.teams.find((t) => t.slug === 'st-ignatius')!;
    // Storey Lewis has a MaxPreps grade (12); her existing record (a height) must not add one.
    const storey = base.teams.find((t) => t.slug === 'st-ignatius')!.players[0];
    expect(storey.grade).toBe(12);
    const record = si.players.find((p) => p.athleteId === storey.athleteId)!;
    record.grade = { value: 11, derived: false, kind: 'school-site', source: 'https://example.com/', confidence: 'high', note: null };
    // The schema alone accepts it (it cannot see the base file)...
    expect(RosterEnrichmentSchema.safeParse(bad).success).toBe(true);
    // ...which is why lib/rosters.ts re-checks the join at load. Exercise that check in a child
    // process with the bad file swapped in (the other load-time cases import the module in-process).
    expect(loadErrorInChild(bad)).toMatch(/grade would overwrite a MaxPreps value/);
  });
});

describe('recruiting profiles', () => {
  const storey = base.teams.find((t) => t.slug === 'st-ignatius')!.players[0];
  const ncsa = (url: string, classOf: number | null) =>
    ({ platform: 'ncsa', url, classOf, note: null }) as const;

  it('links each profile once, over https, on the platform it names', () => {
    const profiles = raw.teams.flatMap((t) => t.players.flatMap((p) => p.profiles));
    const urls = profiles.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const p of profiles) {
      expect(p.url).toMatch(/^https:\/\//);
      if (p.platform === 'ncsa') {
        expect(p.url).toMatch(
          p.sport === undefined
            ? /^https:\/\/www\.ncsasports\.org\/field-hockey-recruiting\/california\//
            : /^https:\/\/www\.ncsasports\.org\/[a-z-]+-recruiting\/california\//,
        );
      }
    }
  });

  it('agrees with the grade the roster shows wherever a profile states a class year', () => {
    for (const t of getAllEnrichedRosters()) {
      for (const p of t.players) {
        for (const x of p.profiles) {
          if (x.classOf === null || p.grade === null) continue;
          expect(x.classOf, `${t.slug} / ${p.fullName}`).toBe(classOf(base.season, p.grade));
        }
      }
    }
  });

  it('works out a class year from the season and grade', () => {
    expect(classOf('26-27', 12)).toBe(2027);
    expect(classOf('26-27', 9)).toBe(2030);
    expect(classOf('27-28', 11)).toBe(2029);
  });

  it('refuses a profile on the wrong host, a second profile on one platform, and a URL shared by two players', () => {
    const wrongHost = structuredClone(raw);
    recordFor(wrongHost, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      ncsa('https://my.sportsrecruits.com/athlete/storey_lewis', null),
    ];
    expect(RosterEnrichmentSchema.safeParse(wrongHost).success).toBe(false);

    const unparsable = structuredClone(raw);
    recordFor(unparsable, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      { platform: 'personal', url: 'https://?broken', classOf: null, note: null },
    ];
    expect(RosterEnrichmentSchema.safeParse(unparsable).success).toBe(false);

    const twice = structuredClone(raw);
    recordFor(twice, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      ncsa('https://www.ncsasports.org/a', null),
      ncsa('https://www.ncsasports.org/b', null),
    ];
    expect(RosterEnrichmentSchema.safeParse(twice).success).toBe(false);

    const shared = structuredClone(raw);
    const other = base.teams.find((t) => t.slug === 'st-ignatius')!.players[1];
    recordFor(shared, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      ncsa('https://www.ncsasports.org/same', null),
    ];
    recordFor(shared, 'st-ignatius', other.athleteId!, other.fullName).profiles = [
      ncsa('https://www.ncsasports.org/same', null),
    ];
    expect(RosterEnrichmentSchema.safeParse(shared).success).toBe(false);
  });

  it('takes one profile per platform in each sport, and never a field hockey profile that says so', () => {
    const sportsrecruits = (url: string, sport?: 'lacrosse' | 'softball') =>
      ({ platform: 'sportsrecruits', url, classOf: null, note: null, ...(sport ? { sport } : {}) }) as const;
    const two = structuredClone(raw);
    recordFor(two, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      sportsrecruits('https://nfhca.sportsrecruits.com/athlete/a'),
      sportsrecruits('https://iwlca.sportsrecruits.com/athlete/a', 'lacrosse'),
      sportsrecruits('https://sportsrecruits.com/athlete/a', 'softball'),
    ];
    expect(RosterEnrichmentSchema.safeParse(two).success).toBe(true);

    const twiceInOneSport = structuredClone(raw);
    recordFor(twiceInOneSport, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      sportsrecruits('https://iwlca.sportsrecruits.com/athlete/a', 'lacrosse'),
      sportsrecruits('https://iwlca.sportsrecruits.com/athlete/b', 'lacrosse'),
    ];
    expect(RosterEnrichmentSchema.safeParse(twiceInOneSport).success).toBe(false);

    // Field hockey is the default, never written out, so a profile's sport is never redundant.
    const explicit = structuredClone(raw);
    recordFor(explicit, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      { ...sportsrecruits('https://nfhca.sportsrecruits.com/athlete/a'), sport: 'field-hockey' } as never,
    ];
    expect(RosterEnrichmentSchema.safeParse(explicit).success).toBe(false);
  });

  it('refuses, at load, a profile whose class year disagrees with the roster', async () => {
    // Storey Lewis is a senior on MaxPreps: class of 2027, never 2028.
    expect(storey.grade).toBe(12);
    const bad = structuredClone(raw);
    recordFor(bad, 'st-ignatius', storey.athleteId!, storey.fullName).profiles = [
      ncsa('https://www.ncsasports.org/field-hockey-recruiting/california/x/y/storey-lewis', 2028),
    ];
    expect(RosterEnrichmentSchema.safeParse(bad).success).toBe(true);
    expect(await loadError(bad)).toMatch(/ncsa profile says class of 2028, the roster shows grade 12/);
  });

  it('what was found for SCVAL, as captured on 2026-10-02', () => {
    const players = pre.teams
      .filter((t) => SCVAL_SLUGS.has(t.slug))
      .flatMap((t) => t.players.filter((p) => p.profiles.length > 0));
    const profiles = players.flatMap((p) => p.profiles);
    expect(profiles.length).toBe(70);
    expect(players.length).toBe(56);
    const count = (platform: string) => profiles.filter((p) => p.platform === platform).length;
    expect([count('ncsa'), count('sportsrecruits'), count('hudl')]).toEqual([6, 37, 27]);
    // St. Ignatius' SportsRecruits team page links a profile for every rostered player.
    const si = pre.teams.find((t) => t.slug === 'st-ignatius')!;
    expect(si.players.filter((p) => p.profiles.length > 0).length).toBe(base.teams.find((t) => t.slug === 'st-ignatius')!.players.length);
    // Lizzie Moorehouse's NCSA profile is under the legal name, the SportsRecruits one under the nickname.
    const lizzie = pre.teams.find((t) => t.slug === 'los-gatos')!.players.find((p) => p.fullName === 'Lizzie Moorehouse')!;
    expect(lizzie.profiles.map((p) => p.platform)).toEqual(['ncsa', 'sportsrecruits']);
  });

  it('what was found for BVAL, PCAL and MCAL, as captured on 2026-10-03', () => {
    const others = pre.teams.filter((t) => SWEPT_OTHER_SLUGS.has(t.slug));
    expect(others.length).toBe(28);
    // Every team of the three leagues was looked at: each lists a source or a note.
    for (const t of others) expect(t.sources.length + t.notes.length, t.slug).toBeGreaterThan(0);
    const fills = (kind: 'grade' | 'positions' | 'jersey' | 'height') =>
      others.flatMap((t) => t.players).filter((p) => p[kind] !== null).length;
    // 82 grades: 85 were filled on 2026-10-03; three were then blanked because their sources
    // disagree (Leland's Michaela Reichmuth, Redwood's Audrey Dickerman and Eloise Tonderys).
    expect([fills('grade'), fills('positions')]).toEqual([82, 5]);
    // Jersey numbers and heights are never filled for these leagues (the README says so).
    expect([fills('jersey'), fills('height')]).toEqual([0, 0]);
    // A position MaxPreps lists only for the previous season is never filled.
    for (const t of others) {
      for (const p of t.players) {
        if (p.positions) expect(p.positions.kind, `${t.slug} ${p.fullName}`).not.toBe('maxpreps-career');
      }
    }
    const profiles = others.flatMap((t) => t.players.flatMap((p) => p.profiles));
    // 29 for 27 on 2026-10-03, and Kaylee and Lexi True's NCSA pages from the 2026-10-07 sweep (below).
    expect(profiles.length).toBe(31);
    expect(others.flatMap((t) => t.players).filter((p) => p.profiles.length > 0).length).toBe(29);
    // Westmont's Teya Halali: SportsRecruits says class of 2029, which a 2026-27 sophomore is.
    const teya = pre.teams.find((t) => t.slug === 'westmont')!.players.find((p) => p.fullName === 'Teya Halali')!;
    expect(teya.profiles).toEqual([
      expect.objectContaining({ platform: 'sportsrecruits', url: 'https://nfhca.sportsrecruits.com/athlete/teya_halali', classOf: 2029 }),
    ]);
    expect(base.teams.find((t) => t.slug === 'westmont')!.players.find((p) => p.fullName === 'Teya Halali')!.grade).toBe(10);
  });

  it('what was found on 2026-10-07 for the 21 rows MaxPreps added to Marin Academy and Westmont', () => {
    const rowsOf = (slug: string) => base.teams.find((t) => t.slug === slug)!.players;
    const overlay = (slug: string) => pre.teams.find((t) => t.slug === slug)!.players;
    expect(rowsOf('marin-academy')).toHaveLength(18);
    // Marin Academy: no profile for any of the 18; Julia Foulke's grade is a conflict, MaxPreps' Sr. kept.
    expect(overlay('marin-academy').map((p) => p.fullName)).toEqual(['Julia Foulke']);
    const julia = overlay('marin-academy')[0];
    expect(julia.profiles).toEqual([]);
    expect(julia.grade).toBeNull();
    expect(julia.conflicts.map((c) => [c.field, c.kept, c.other, c.kind])).toEqual([
      ['grade', '12', '11', 'school-site'],
      ['grade', '12', '11', 'maxpreps-career'],
    ]);
    // Westmont: Kaylee and Lexi True on NCSA (class of 2028, grade 11); Savannah Murdoch none.
    const westmont = Object.fromEntries(overlay('westmont').map((p) => [p.fullName, p.profiles.map((x) => [x.platform, x.classOf])]));
    expect(westmont).toEqual({
      'Kaylee True': [['ncsa', 2028]],
      'Lexi True': [['ncsa', 2028]],
      'Teya Halali': [['sportsrecruits', 2029]],
    });
    for (const name of ['Kaylee True', 'Lexi True']) {
      expect(rowsOf('westmont').find((p) => p.fullName === name)!.grade, name).toBe(11);
    }
  });

  it('what was found for the EAL, as captured on 2026-10-04: recruiting pages only, no school-site sweep', () => {
    const eal = pre.teams.filter((t) => EAL_SLUGS.has(t.slug));
    expect(eal.map((t) => t.slug)).toEqual(teamsInLeague('eal').map((t) => t.slug));
    // No coaches or sources, and no MaxPreps field filled: the school-athletics sweep has not been done.
    for (const t of eal) {
      expect([t.coaches, t.sources], t.slug).toEqual([[], []]);
      for (const p of t.players) {
        expect([p.grade, p.positions, p.jersey, p.height, p.level, p.conflicts], `${t.slug} / ${p.fullName}`).toEqual([null, null, null, null, null, []]);
        expect(p.profiles.length, `${t.slug} / ${p.fullName}`).toBeGreaterThan(0);
      }
      // Each team's notes say the recruiting pages were swept 2026-10-04 and the school-athletics sweep was not.
      expect(t.notes[0], t.slug).toMatch(/^Recruiting pages swept 2026-10-04 by the rule in docs\/DATA-SOURCES\.md: /);
      expect(t.notes.at(-1), t.slug).toBe(
        'The school-athletics roster sweep (grade, height, number, position, coaches) has still not been done, so nothing else is filled.',
      );
    }
    const byTeam = Object.fromEntries(
      eal.map((t) => {
        const profiles = t.players.flatMap((p) => p.profiles);
        const n = (k: string) => profiles.filter((x) => x.platform === k).length;
        return [t.slug, { players: t.players.length, profiles: profiles.length, ncsa: n('ncsa'), sportsrecruits: n('sportsrecruits'), hudl: n('hudl') }];
      }),
    );
    expect(byTeam).toEqual({
      'bella-vista': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0 },
      chico: { players: 13, profiles: 16, ncsa: 2, sportsrecruits: 2, hudl: 12 },
      corning: { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0 },
      davis: { players: 4, profiles: 5, ncsa: 2, sportsrecruits: 3, hudl: 0 },
      lassen: { players: 1, profiles: 1, ncsa: 1, sportsrecruits: 0, hudl: 0 },
      'pleasant-valley': { players: 11, profiles: 11, ncsa: 1, sportsrecruits: 0, hudl: 10 },
    });
    const profiles = eal.flatMap((t) => t.players.flatMap((p) => p.profiles));
    expect(profiles.length).toBe(33);
    expect(eal.flatMap((t) => t.players).length).toBe(29);
    // The other four NorCal leagues' counts are untouched: 99 profiles for 83 players (101 for 85 with
    // the two Westmont pages of the 2026-10-07 sweep).
    const earlier = pre.teams
      .filter((t) => SCVAL_SLUGS.has(t.slug) || SWEPT_OTHER_SLUGS.has(t.slug))
      .flatMap((t) => t.players.filter((p) => p.profiles.length > 0));
    expect(earlier.flatMap((p) => p.profiles).length).toBe(101);
    expect(earlier.length).toBe(85);
    // NCSA first on a row that has more than one platform.
    const kate = eal.find((t) => t.slug === 'davis')!.players.find((p) => p.fullName === 'Kate Loscutoff')!;
    expect(kate.profiles.map((p) => p.platform)).toEqual(['ncsa', 'sportsrecruits']);
    const olivia = eal.find((t) => t.slug === 'chico')!.players.find((p) => p.fullName === 'Olivia Council')!;
    expect(olivia.profiles.map((p) => p.platform)).toEqual(['ncsa', 'sportsrecruits', 'hudl']);
    // Evie Nielsen's SportsRecruits page is under the misspelled slug the school's team page links.
    const evie = eal.find((t) => t.slug === 'chico')!.players.find((p) => p.fullName === 'Evie Nielsen')!;
    expect(evie.profiles.find((p) => p.platform === 'sportsrecruits')!.url).toBe('https://nfhca.sportsrecruits.com/athlete/evelyn_nielson');
    // The page that says class of 2027 for a grade-11 player (Zolie Judge) is not linked.
    expect(profiles.map((p) => p.url)).not.toContain('https://www.hudl.com/profile/28010179');
  });

  it('what was found for Southern California, as captured on 2026-10-06: recruiting pages only, no school-site sweep', () => {
    const SOCAL = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
    const socal = pre.teams.filter((t) => SOCAL.has(getTeamBySlug(t.slug)!.league));
    expect(socal).toHaveLength(53);
    for (const t of socal) {
      expect([t.coaches, t.sources], t.slug).toEqual([[], []]);
      for (const p of t.players) {
        expect([p.grade, p.positions, p.jersey, p.height, p.level, p.conflicts], `${t.slug} / ${p.fullName}`).toEqual([null, null, null, null, null, []]);
        expect(p.profiles.length, `${t.slug} / ${p.fullName}`).toBeGreaterThan(0);
      }
      expect(t.notes[0], t.slug).toMatch(/^Recruiting pages swept 2026-10-06 by the rule in docs\/DATA-SOURCES\.md: /);
      expect(t.notes.at(-1), t.slug).toBe(
        'The school-athletics roster sweep (grade, height, number, position, coaches) has not been done, so nothing else is filled.',
      );
    }
    const byTeam = Object.fromEntries(
      socal.map((t) => {
        const profiles = t.players.flatMap((p) => p.profiles);
        const n = (k: string) => profiles.filter((x) => x.platform === k).length;
        return [
          t.slug,
          { players: t.players.length, profiles: profiles.length, ncsa: n('ncsa'), sportsrecruits: n('sportsrecruits'), hudl: n('hudl'), fieldlevel: n('fieldlevel') },
        ];
      }),
    );
    expect(byTeam).toEqual({
      'chaparral': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'edison': { players: 3, profiles: 4, ncsa: 3, sportsrecruits: 1, hudl: 0, fieldlevel: 0 },
      'fountain-valley': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'great-oak': { players: 4, profiles: 5, ncsa: 2, sportsrecruits: 3, hudl: 0, fieldlevel: 0 },
      'huntington-beach': { players: 3, profiles: 5, ncsa: 1, sportsrecruits: 3, hudl: 0, fieldlevel: 1 },
      'marina': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'newport-harbor': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'temecula-valley': { players: 3, profiles: 6, ncsa: 3, sportsrecruits: 1, hudl: 0, fieldlevel: 2 },
      'bishops': { players: 24, profiles: 37, ncsa: 3, sportsrecruits: 9, hudl: 24, fieldlevel: 1 },
      'canyon-hills': { players: 3, profiles: 4, ncsa: 1, sportsrecruits: 3, hudl: 0, fieldlevel: 0 },
      'cathedral-catholic': { players: 3, profiles: 6, ncsa: 3, sportsrecruits: 2, hudl: 1, fieldlevel: 0 },
      'la-jolla': { players: 2, profiles: 3, ncsa: 2, sportsrecruits: 1, hudl: 0, fieldlevel: 0 },
      'mission-bay': { players: 2, profiles: 4, ncsa: 2, sportsrecruits: 2, hudl: 0, fieldlevel: 0 },
      'scripps-ranch': { players: 3, profiles: 5, ncsa: 2, sportsrecruits: 2, hudl: 0, fieldlevel: 1 },
      'clairemont': { players: 3, profiles: 4, ncsa: 1, sportsrecruits: 1, hudl: 2, fieldlevel: 0 },
      'la-jolla-country-day': { players: 9, profiles: 12, ncsa: 3, sportsrecruits: 1, hudl: 8, fieldlevel: 0 },
      'mira-mesa': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'patrick-henry': { players: 3, profiles: 3, ncsa: 1, sportsrecruits: 0, hudl: 2, fieldlevel: 0 },
      'point-loma': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'university-city': { players: 13, profiles: 16, ncsa: 1, sportsrecruits: 3, hudl: 12, fieldlevel: 0 },
      'canyon-crest-academy': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'la-costa-canyon': { players: 5, profiles: 6, ncsa: 1, sportsrecruits: 1, hudl: 4, fieldlevel: 0 },
      'mt-carmel': { players: 2, profiles: 2, ncsa: 2, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'rancho-bernardo': { players: 1, profiles: 1, ncsa: 1, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'san-marcos': { players: 4, profiles: 6, ncsa: 2, sportsrecruits: 2, hudl: 0, fieldlevel: 2 },
      'torrey-pines': { players: 13, profiles: 24, ncsa: 3, sportsrecruits: 6, hudl: 12, fieldlevel: 3 },
      'del-norte': { players: 2, profiles: 2, ncsa: 2, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'fallbrook': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'mission-vista': { players: 4, profiles: 4, ncsa: 3, sportsrecruits: 1, hudl: 0, fieldlevel: 0 },
      'poway': { players: 2, profiles: 4, ncsa: 2, sportsrecruits: 2, hudl: 0, fieldlevel: 0 },
      'rancho-buena-vista': { players: 1, profiles: 1, ncsa: 1, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'san-dieguito-academy': { players: 16, profiles: 18, ncsa: 1, sportsrecruits: 1, hudl: 16, fieldlevel: 0 },
      'valley-center': { players: 5, profiles: 5, ncsa: 0, sportsrecruits: 0, hudl: 5, fieldlevel: 0 },
      'escondido': { players: 5, profiles: 5, ncsa: 3, sportsrecruits: 0, hudl: 2, fieldlevel: 0 },
      'mission-hills': { players: 6, profiles: 6, ncsa: 6, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'sage-creek': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'san-pasqual': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'vista': { players: 7, profiles: 11, ncsa: 1, sportsrecruits: 0, hudl: 7, fieldlevel: 3 },
      'westview': { players: 1, profiles: 2, ncsa: 1, sportsrecruits: 1, hudl: 0, fieldlevel: 0 },
      'bonita-vista': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'eastlake': { players: 1, profiles: 1, ncsa: 1, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'helix': { players: 3, profiles: 5, ncsa: 1, sportsrecruits: 3, hudl: 0, fieldlevel: 1 },
      'olympian': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'otay-ranch': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'el-capitan': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'granite-hills': { players: 2, profiles: 2, ncsa: 1, sportsrecruits: 1, hudl: 0, fieldlevel: 0 },
      'hilltop': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'southwest': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'bonita': { players: 9, profiles: 9, ncsa: 1, sportsrecruits: 0, hudl: 8, fieldlevel: 0 },
      'chaminade': { players: 12, profiles: 13, ncsa: 1, sportsrecruits: 0, hudl: 12, fieldlevel: 0 },
      'glendora': { players: 0, profiles: 0, ncsa: 0, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
      'harvard-westlake': { players: 22, profiles: 25, ncsa: 1, sportsrecruits: 5, hudl: 19, fieldlevel: 0 },
      'thousand-oaks': { players: 1, profiles: 1, ncsa: 1, sportsrecruits: 0, hudl: 0, fieldlevel: 0 },
    });
    const profiles = socal.flatMap((t) => t.players.flatMap((p) => p.profiles));
    expect(profiles).toHaveLength(267);
    expect(socal.flatMap((t) => t.players)).toHaveLength(202);
    // MaxPreps lists Téa Hunnius twice (Téa and Tea): her Hudl page is linked once, on the row it spells.
    const hw = socal.find((t) => t.slug === 'harvard-westlake')!;
    expect(hw.players.map((p) => p.fullName)).toContain('Téa Hunnius');
    expect(hw.players.map((p) => p.fullName)).not.toContain('Tea Hunnius');
    // A hometown with no state is not California: Alexis Andersen's page ("Thousand Oaks", no school) is not linked.
    expect(profiles.map((p) => p.url)).not.toContain('https://nfhca.sportsrecruits.com/athlete/alexis_andersen');
  });

  it('what MaxPreps\' career and earlier-season pages added on 2026-10-12: grades MaxPreps\' own roster leaves blank', () => {
    const records = raw.teams.flatMap((t) => t.players.map((p) => ({ slug: t.slug, p })));
    const added = records.filter(({ p }) => p.grade !== null && p.grade.kind === 'maxpreps-career' && from1012(p.grade.note));
    expect(added).toHaveLength(136);
    for (const { slug, p } of added) {
      expect([p.grade!.kind, p.grade!.derived, p.grade!.confidence], `${slug} / ${p.fullName}`).toEqual(['maxpreps-career', true, 'medium']);
      expect(p.grade!.source, `${slug} / ${p.fullName}`).toMatch(/^https:\/\/www\.maxpreps\.com\//);
    }
    const SOCAL = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
    expect(added.filter(({ slug }) => SOCAL.has(getTeamBySlug(slug)!.league))).toHaveLength(127);
    // Where those pages disagree the grade stays blank and both are conflicts.
    const blanked = records
      .filter(({ p }) => p.conflicts.some((c) => from1012(c.note) && c.kind === 'maxpreps-career'))
      .map(({ slug, p }) => `${slug}/${p.fullName}`);
    // Gaytan's and Kay's MaxPreps pages disagree; Steingraber's and Flesuras' disagree with their school's site.
    expect(blanked.sort()).toEqual([
      'granite-hills/Brooke Flesuras',
      'granite-hills/Emma Steingraber',
      'mission-vista/Izabel Gaytan',
      'point-loma/Ellie Kay',
    ]);
  });

  it('what school sites and papers added on 2026-10-12 for the rows still ungraded', () => {
    const added = raw.teams.flatMap((t) =>
      t.players.filter((p) => p.grade !== null && p.grade.kind !== 'maxpreps-career' && from1012(p.grade.note)).map((p) => ({ t, p })),
    );
    expect(added).toHaveLength(113);
    const n = (k: string) => added.filter(({ p }) => p.grade!.kind === k).length;
    expect([n('school-site'), n('news')]).toEqual([95, 18]);
    // Every page a grade rests on is among its team's sources: the page itself, or, for a school site's
    // player pages (Glendora, Granite Hills, Southwest), that site's roster page, which the team page
    // links in their place. Only school sites fold that way; a story must be listed itself, since a
    // paper's other stories on the same host say nothing about it.
    const host = (url: string) => new URL(url).hostname;
    for (const { t, p } of added) {
      const g = p.grade!;
      const listed = t.sources.some(
        (s) => s.url === g.source || (g.kind === 'school-site' && s.kind === 'school-site' && host(s.url) === host(g.source)),
      );
      expect(listed, `${t.slug} / ${p.fullName}`).toBe(true);
    }
  });

  it('what the 2026-10-12 SportsRecruits probe found, in every sport', () => {
    const records = raw.teams.flatMap((t) => t.players.map((p) => ({ t, p })));
    const probe = records.flatMap(({ t, p }) => p.profiles.filter(fromProbe1012).map((x) => ({ slug: t.slug, name: p.fullName, x })));
    expect(probe).toHaveLength(118);
    expect(new Set(probe.map((r) => `${r.slug} ${r.name}`)).size).toBe(116);
    const bySport = (s: string | undefined) => probe.filter((r) => r.x.sport === s).length;
    expect([bySport('lacrosse'), bySport('softball'), bySport(undefined), bySport('soccer'), bySport('track-and-field')]).toEqual([91, 15, 6, 5, 1]);
    for (const r of probe) {
      expect(r.x.platform, r.name).toBe('sportsrecruits');
      expect(r.x.classOf, r.name).not.toBeNull();
    }
    // The other class-of-2027 Phoebe Miller, in San Francisco, is a namesake: her soccer page is not linked.
    expect(probe.map((r) => r.x.url)).not.toContain('https://sportsrecruits.com/athlete/phoebe_miller4');
    // A lacrosse page beside a field hockey one on the same platform, as Sofie Stiefel's is.
    const sofie = raw.teams.find((t) => t.slug === 'st-ignatius')!.players.find((p) => p.fullName === 'Sofie Stiefel')!;
    expect(sofie.profiles.filter((x) => x.platform === 'sportsrecruits').map((x) => x.sport)).toEqual([undefined, 'lacrosse']);
  });

  it('what the 2026-10-13 read of every MaxPreps career page found: the claimed ones', () => {
    const rows = new Map(base.teams.flatMap((t) => t.players.map((p) => [`${t.slug} ${p.athleteId}`, p])));
    const claimed = raw.teams.flatMap((t) =>
      t.players.flatMap((p) => p.profiles.filter(claimed1013).map((x) => ({ slug: t.slug, p, x }))),
    );
    // 260 of the 1,702 rows (one, Marin Catholic's Alexandra Schmidt, answered 403 and is not linked).
    expect(claimed).toHaveLength(260);
    expect(new Set(claimed.map((r) => `${r.slug} ${r.p.athleteId}`)).size).toBe(260);
    expect(new Set(claimed.map((r) => r.slug)).size).toBe(73);
    // 159 players have no other profile.
    expect(claimed.filter((r) => r.p.profiles.length === 1)).toHaveLength(159);
    for (const { slug, p, x } of claimed) {
      // The row's own career page, never a namesake's: it needs no name match.
      expect(x.url, `${slug} / ${p.fullName}`).toBe(rows.get(`${slug} ${p.athleteId}`)!.careerUrl);
      expect(x.sport, p.fullName).toBeUndefined();
      expect(x.note, p.fullName).toMatch(/MaxPreps marks claimed \(isClaimed\) by the player or a parent; read 2026-10-13\.$/);
    }
    // The page's graduatingClass, where it gives one: 221 of the 260.
    expect(claimed.filter((r) => r.x.classOf !== null)).toHaveLength(221);
    const names = (slug: string) => claimed.filter((r) => r.slug === slug).map((r) => r.p.fullName).sort();
    expect(names('st-ignatius')).toEqual(['Samantha Brunsell', 'Stella Kwok', 'Stella Strain']);
    expect(names('marin-catholic')).not.toContain('Alexandra Schmidt');
  });

  it("refuses a MaxPreps profile that is not the row's own career page, or that names a sport", async () => {
    const [mine, other] = base.teams.find((t) => t.slug === 'st-ignatius')!.players;
    const maxpreps = (url: string) => ({ platform: 'maxpreps', url, classOf: null, note: null }) as const;

    const ok = structuredClone(raw);
    recordFor(ok, 'st-ignatius', mine.athleteId!, mine.fullName).profiles = [maxpreps(mine.careerUrl!)];
    expect(await loadError(ok)).toBe('');

    const namesake = structuredClone(raw);
    recordFor(namesake, 'st-ignatius', mine.athleteId!, mine.fullName).profiles = [maxpreps(other.careerUrl!)];
    expect(RosterEnrichmentSchema.safeParse(namesake).success).toBe(true);
    expect(await loadError(namesake)).toMatch(/maxpreps profile .* is not this row's career page/);

    const withSport = structuredClone(raw);
    recordFor(withSport, 'st-ignatius', mine.athleteId!, mine.fullName).profiles = [
      { ...maxpreps(mine.careerUrl!), sport: 'lacrosse' },
    ];
    expect(RosterEnrichmentSchema.safeParse(withSport).success).toBe(false);

    const offHost = structuredClone(raw);
    recordFor(offHost, 'st-ignatius', mine.athleteId!, mine.fullName).profiles = [maxpreps('https://www.ncsasports.org/x')];
    expect(RosterEnrichmentSchema.safeParse(offHost).success).toBe(false);
  });

  it('reaches the merged view', () => {
    for (const t of raw.teams) {
      const merged = new Map(getEnrichedTeamRoster(t.slug)!.players.map((p) => [p.athleteId, p]));
      for (const e of t.players) expect(merged.get(e.athleteId)!.profiles).toEqual(e.profiles);
    }
  });
});

describe('the load-time rules hold for every league, not just SCVAL', () => {
  // A rosters file in which a BVAL, a PCAL and an MCAL team carry rows (copied from SCVAL's), so
  // the overlay's join, blank-only and conflict rules can be exercised on them.
  // Their real overlay records are cleared first: the copied rows carry other athlete ids.
  const cleanRaw = structuredClone(raw);
  for (const slug of ['leigh', 'del-mar', 'redwood']) cleanRaw.teams.find((t) => t.slug === slug)!.players = [];
  const donor = base.teams.find((t) => t.slug === 'cupertino')!;
  const blank = donor.players.find((p) => p.grade === null && p.athleteId !== null)!;
  const rosters = structuredClone(base);
  for (const slug of ['leigh', 'del-mar', 'redwood']) {
    const t = rosters.teams.find((x) => x.slug === slug)!;
    Object.assign(t, {
      status: 'ok',
      maxprepsTeamId: t.teamId,
      athleteCount: donor.athleteCount,
      staffCount: donor.staffCount,
      players: donor.players,
      fetchedAt: base.fetchedAt,
    });
  }
  // One row that already has a grade, so an overlay record for it would overwrite MaxPreps.
  const withGrade = base.teams.find((t) => t.slug === 'st-ignatius')!.players.find((p) => p.grade !== null)!;
  rosters.teams.find((t) => t.slug === 'redwood')!.players.push(withGrade);
  rosters.teams.find((t) => t.slug === 'redwood')!.athleteCount! += 1;
  rosters.counts = countRosters(rosters.teams);
  const sourced = { kind: 'school-site', source: 'https://example.com/roster', confidence: 'high', note: null } as const;
  const record = (grade: unknown) => ({
    athleteId: blank.athleteId!, fullName: blank.fullName, sourceName: null, level: null, levelSource: null,
    grade, positions: null, jersey: null, height: null, conflicts: [], profiles: [], note: null,
  });

  it('loads a record that fills a blank on a team of any league', async () => {
    for (const slug of ['leigh', 'del-mar', 'redwood']) {
      const file = structuredClone(cleanRaw);
      file.teams.find((t) => t.slug === slug)!.players.push(record({ value: 11, derived: false, ...sourced }) as never);
      expect(await loadError(file, rosters), slug).toBe('');
    }
  });

  it('refuses a record for a player the team does not list, or one that would overwrite MaxPreps', async () => {
    const stranger = structuredClone(cleanRaw);
    stranger.teams.find((t) => t.slug === 'leigh')!.players.push(
      { ...record({ value: 11, derived: false, ...sourced }), athleteId: 'not-an-athlete' } as never,
    );
    expect(await loadError(stranger, rosters)).toMatch(/not a MaxPreps row of this team/);
    // A record for a team whose roster is still pending has no row to join to.
    const pending = structuredClone(cleanRaw);
    pending.teams.find((t) => t.slug === 'carmel')!.players.push(record({ value: 11, derived: false, ...sourced }) as never);
    expect(await loadError(pending, rosters)).toMatch(/not a MaxPreps row of this team/);
    const overwrite = structuredClone(cleanRaw);
    overwrite.teams.find((t) => t.slug === 'redwood')!.players.push(
      { ...record({ value: 10, derived: false, ...sourced }), athleteId: withGrade.athleteId!, fullName: withGrade.fullName } as never,
    );
    expect(await loadError(overwrite, rosters)).toMatch(/grade would overwrite a MaxPreps value/);
  });
});

describe('lib/rosters.ts merged view', () => {
  it('fills blanks from the overlay and says where each value came from', () => {
    const cup = getEnrichedTeamRoster('cupertino')!;
    expect(getTeamRoster('cupertino')!.players.every((p) => p.grade === null)).toBe(true);
    expect(cup.players.every((p) => p.grade !== null)).toBe(true);
    for (const p of cup.players) {
      expect(p.provenance.grade).not.toBe('maxpreps');
      expect(p.provenance.grade).not.toBeNull();
      expect((p.provenance.grade as { kind: string }).kind).toBe('school-site');
      expect(p.gradeClass).toBe((['Fr.', 'So.', 'Jr.', 'Sr.'] as const)[p.grade! - 9]);
    }
    const si = getEnrichedTeamRoster('st-ignatius')!;
    const storey = si.players.find((p) => p.fullName === 'Storey Lewis')!;
    expect(storey.provenance.grade).toBe('maxpreps');
    expect(storey.height).toMatch(/^\d'\d{1,2}"$/);
    expect((storey.provenance.height as { kind: string }).kind).toBe('school-site');
    const gigi = si.players.find((p) => p.fullName === 'Gigi Colant')!;
    expect(gigi.sourceName).toBe('Gabriella Colant');
  });

  it('keeps MaxPreps where a source disagrees, and exposes the disagreement', () => {
    const mv = getEnrichedTeamRoster('monta-vista')!;
    const weafer = mv.players.find((p) => p.fullName === 'Elizabeth Weafer')!;
    expect(weafer.jersey).toBe('6');
    expect(weafer.conflicts).toEqual([
      expect.objectContaining({ field: 'jersey', kept: '6', other: '9', kind: 'school-site' }),
    ]);
    const paly = getEnrichedTeamRoster('palo-alto')!;
    const ella = paly.players.find((p) => p.fullName === 'Ella Renazco-Sperling')!;
    expect(ella.position).toBe('F');
    expect(ella.conflicts[0]).toEqual(expect.objectContaining({ field: 'position', other: 'M', kind: 'news' }));
  });

  it('carries the Los Gatos squad split and the coaches', () => {
    const lg = getEnrichedTeamRoster('los-gatos')!;
    expect(lg.players.length).toBe(58);
    expect(lg.players.filter((p) => p.level === 'varsity').length).toBe(27);
    expect(lg.players.filter((p) => p.level === 'jv').length).toBe(29);
    expect(lg.players.filter((p) => p.level === null).length).toBe(2);
    expect(lg.coaches.map((c) => c.role)).toContain('Head Coach');
  });

  it('coverage after the overlay, for SCVAL', () => {
    const scvalBase = getRosters().teams.filter((t) => SCVAL_SLUGS.has(t.slug)).flatMap((t) => t.players);
    const all = getAllEnrichedRosters().filter((t) => SCVAL_SLUGS.has(t.slug)).flatMap((t) => t.players);
    expect(all.length).toBe(scvalBase.length);
    const n = (ps: ReadonlyArray<{ grade: number | null; position: string | null; height: string | null }>, k: 'grade' | 'position' | 'height') =>
      ps.filter((p) => p[k] !== null).length;
    // 133 from the 2026-10-02 research; on 2026-10-12, 8 more from MaxPreps' career and earlier-season pages
    // and 7 from school papers and Saratoga's athletics site.
    expect(n(all, 'grade')).toBe(n(scvalBase, 'grade') + 148);
    expect(n(all, 'position')).toBe(n(scvalBase, 'position') + 9);
    expect(n(all, 'height')).toBe(n(scvalBase, 'height') + 23);
    expect(getRosterEnrichment().teams.length).toBe(TEAMS.length);
    // Every team of every league has a merged view, whatever was found for it.
    expect(getAllEnrichedRosters()).toHaveLength(TEAMS.length);
  });
});
