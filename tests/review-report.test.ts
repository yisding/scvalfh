/**
 * lib/players/review-report.ts: the review list as a person reads it, from a registry built of
 * made-up rows shaped like the 2026-11 volleyball pairs.
 */
import { describe, expect, it } from 'vitest';

import { buildRegistry, nameKey, type Sighting } from '../lib/players/registry-build';
import { PlayerIdentitySchema, type Observation, type PlayerIdentity } from '../lib/players/registry-schema';
import { buildReviewReport, formatReviewReport } from '../lib/players/review-report';

const NO_IDENTITY: PlayerIdentity = { notes: [], sameAs: [], rowSplits: [], distinct: [], notSame: [], names: [] };

function row(name: string, over: Partial<Sighting>, obs: Partial<Observation> & Pick<Observation, 'src'>): Sighting {
  return {
    sport: 'volleyball',
    season: '26-27',
    team: 'alpha',
    level: 'varsity',
    careerIds: [],
    nameKeys: [nameKey(name)],
    ...over,
    observations: [{ name, ...obs }],
  };
}

function report(sightings: Sighting[], identity: PlayerIdentity = NO_IDENTITY, careerUrls?: Map<string, string>) {
  const pairs = new Map(sightings.map((s) => [`${s.sport} ${s.season}`, { sport: s.sport, season: s.season }]));
  const file = buildRegistry({ previous: null, identity, built: [...pairs.values()], sightings, builtBy: 'test' });
  return buildReviewReport(file, identity, { careerUrls, today: '2026-11-16' });
}

const ROWS: Sighting[] = [
  // Two lists, one season: the MaxPreps JV roster and the school's own list.
  row('Callie Popok', { level: 'jv', careerIds: ['c1'] }, { src: 'maxpreps-jv-roster', jersey: '6', grade: 10 }),
  row('Callie Popek', { level: 'jv' }, { src: 'school-jv-roster', jersey: '6', grade: 10, url: 'https://school.test/roster' }),
  // A returning player under a new career.
  row('Caylee Chin', { season: '25-26', careerIds: ['c2'], softLevel: true }, { src: 'maxpreps-stats', jersey: '20', grade: 10 }),
  row('Caylee Chinn', { careerIds: ['c3'] }, { src: 'maxpreps-roster', jersey: '20', grade: 11 }),
  // Sisters, varsity and JV in the same season.
  row('Chelsie Chinn', { level: 'jv', careerIds: ['c4'] }, { src: 'maxpreps-jv-roster', jersey: '3', grade: 10 }),
  // One name under two careers on one team: joined by a rule.
  row('Rocco Loverme', { careerIds: ['c5'] }, { src: 'maxpreps-roster', grade: 11 }),
  row('Rocco Loverme', { level: 'jv', careerIds: ['c6'] }, { src: 'maxpreps-jv-roster', grade: 11 }),
];

describe('the review report', () => {
  const r = report(ROWS, NO_IDENTITY, new Map([['c1', 'https://www.maxpreps.test/athletes/callie-popok/?careerid=c1']]));

  it('puts questions by pattern, most likely one player first, and keeps what a rule decided apart', () => {
    expect(r.questions.map((q) => `${q.pattern}: ${q.item.names.join(' / ')}`)).toEqual([
      'two-lists: Callie Popok / Callie Popek',
      'new-career: Caylee Chin / Caylee Chinn',
      'concurrent: Caylee Chinn / Chelsie Chinn',
    ]);
    expect(r.questions.map((q) => q.verdict)).toEqual(['likely one player', 'likely one player', 'likely two players']);
    expect(r.decided.map((d) => d.kind)).toEqual(['same-name-two-careers']);
  });

  it('lays out each side with its number, class year, career link and source pages', () => {
    const [popok] = r.questions;
    expect(popok.facts).toEqual(['both #6', 'both class of 2029', 'one MaxPreps career']);
    expect(popok.sides.map((s) => ({ spelling: s.spelling, careers: s.careers, sources: s.stints.flatMap((e) => e.sources), urls: s.stints.flatMap((e) => e.urls) }))).toEqual([
      { spelling: 'Callie Popok', careers: [{ careerId: 'c1', url: 'https://www.maxpreps.test/athletes/callie-popok/?careerid=c1' }], sources: ['MaxPreps JV roster'], urls: [] },
      { spelling: 'Callie Popek', careers: [], sources: ['school JV list'], urls: ['https://school.test/roster'] },
    ]);
  });

  it('drafts an answer for each, which the curation file refuses until a person rewrites it', () => {
    expect(r.drafts.sameAs.map((e) => ({ sport: e.sport, team: e.team, name: e.name, careerId: e.careerId }))).toEqual([
      { sport: 'volleyball', team: 'alpha', name: 'Callie Popek', careerId: 'c1' },
      { sport: 'volleyball', team: 'alpha', name: 'Caylee Chin', careerId: 'c3' },
    ]);
    expect(r.drafts.sameAs[0].basis).toBe(
      'DRAFT — One player. "Callie Popok": volleyball 26-27 jv #6 grade 10 (MaxPreps JV roster). "Callie Popek": volleyball 26-27 jv #6 grade 10 (school JV list). Same school, both class of 2029. No other player of the team has either name. Decided 2026-11-16.',
    );
    expect(r.drafts.notSame.map((e) => e.names)).toEqual([['Caylee Chinn', 'Chelsie Chinn']]);
    const asFiled = PlayerIdentitySchema.safeParse({ ...NO_IDENTITY, sameAs: r.drafts.sameAs.slice(0, 1) });
    expect(asFiled.success).toBe(false);
    expect(asFiled.error?.issues[0].message).toMatch(/draft basis/);
    const rewritten = { ...r.drafts.sameAs[0], basis: r.drafts.sameAs[0].basis.replace(/^DRAFT — /, '') };
    expect(PlayerIdentitySchema.safeParse({ ...NO_IDENTITY, sameAs: [rewritten] }).success).toBe(true);
  });

  it('lists an official name the sources split evenly on, until a person says which is right', () => {
    const tie = [
      { ...row('Peri Teper', { level: 'jv', careerIds: ['c7'] }, { src: 'maxpreps-jv-roster' }), observations: [{ src: 'maxpreps-jv-roster' as const, name: 'Peri Teper' }, { src: 'enrichment' as const, name: 'Peri Tepper' }] },
    ];
    const open = report(tie);
    expect(open.ties.map((t) => `${t.name} over ${t.others.map((o) => o.name).join()} by ${t.decidedBy}`)).toEqual(['Peri Tepper over Peri Teper by source']);
    expect(open.drafts.names).toEqual([expect.objectContaining({ name: 'Peri Tepper', official: 'Peri Tepper', basis: expect.stringMatching(/^DRAFT/) })]);
    const settled = report(tie, { ...NO_IDENTITY, names: [{ sport: 'volleyball', team: 'alpha', name: 'Peri Teper', official: 'Peri Tepper', basis: 'the school site' }] });
    expect(settled.ties).toEqual([]);
  });

  it('prints the three sections', () => {
    const text = formatReviewReport(r);
    expect(text).toMatch(/^for review: 3 question\(s\) to answer · 1 decided by a rule, listed to check · 0 official name\(s\) chosen on a tie/);
    expect(text).toContain('QUESTIONS');
    expect(text).toContain('likely one player · two lists, one season');
    expect(text).toContain('DECIDED BY A RULE');
    expect(text).toContain('OFFICIAL NAMES CHOSEN ON A TIE');
    expect(text).toContain('26-27 jv #6 grade 10 — school JV list https://school.test/roster');
  });
});
