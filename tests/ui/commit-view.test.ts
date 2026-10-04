/**
 * `components/commits/commit-view.ts` and /commits over the committed data/commits.json,
 * data/rosters.json and data/rosters-enrichment.json (SPEC §1.1j3, DESIGN §21), plus the team
 * roster's commitment line.
 *
 * The page makes promises a test can hold it to:
 *   - privacy: only players on the tracked varsity rosters are named, by the roster's spelling, and
 *     nothing the data file keeps but never renders (a quote, a basis, a confidence) reaches a
 *     page — checked with scripts/copy-rules.ts `commitmentLeaks`, the rule assert-copy applies to
 *     the build; no title or description names a player;
 *   - honesty: "Signed" only where the file says signed, a date only "as of", and every row links
 *     the pages it rests on, labelled by kind and host, never by path;
 *   - order: classes earliest first, then school and name; colleges with the most players first.
 *
 * The data is hand research that changes only with a new sweep (tests/commits-file.test.ts): the
 * per-row checks below run over whatever the file holds, and the pinned words sit in their own block.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AboutPage from '../../app/about/page';
import CommitsPage, { metadata as commitsMetadata } from '../../app/commits/page';
import TeamPage from '../../app/teams/[slug]/page';
import TeamsPage from '../../app/teams/page';
import {
  DIVISION_WORDS,
  SPORT_WORDS,
  buildCommitsView,
  ledeWords,
  collegeAnchor,
  commitAnchor,
  playerCommitLine,
  sourceLabel,
  sportLabel,
  statusWords,
} from '../../components/commits/commit-view';
import { buildRosterView } from '../../components/teams/roster-view';
import { COLLEGE_DIVISIONS, COMMIT_SPORTS } from '../../lib/commits-schema';
import {
  collegeDisplayName,
  commitClassOf,
  commitProgram,
  getCollege,
  getColleges,
  getCommitments,
  getCommitsFile,
  getCommittedPlayer,
  type College,
} from '../../lib/commits';
import { getRosters } from '../../lib/rosters';
import { TEAMS } from '../../lib/teams';
import { commitmentLeaks } from '../../scripts/copy-rules';
import { PUBLIC_TERMS } from '../../scripts/public-terms';
import { textOf } from './html-text';

const file = getCommitsFile();
const view = buildCommitsView();
const renderIndex = () => renderToStaticMarkup(createElement(CommitsPage));
async function renderTeam(slug: string): Promise<string> {
  return renderToStaticMarkup(await TeamPage({ params: Promise.resolve({ slug }) } as never));
}

/** Heading levels in document order. */
const headings = (html: string) => [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

const COLLEGE: College = {
  slug: 'example-college',
  name: 'Example College',
  shortName: 'Example',
  city: 'Somewhere',
  state: 'PA',
  programs: [
    { sport: 'field-hockey', division: 'ncaa-d3', conference: null, url: 'https://athletics.example.edu/sports/field-hockey' },
    { sport: 'lacrosse', division: 'ncaa-d3', conference: null, url: 'https://athletics.example.edu/sports/womens-lacrosse' },
  ],
  sources: [{ url: 'https://athletics.example.edu/sports/field-hockey', what: 'Field hockey home page' }],
  checkedOn: '2026-10-03',
};

describe('status words (DESIGN §21.3)', () => {
  it.each([
    ['committed', null, 'Committed'],
    ['committed', '2026-06-15', 'Committed, as of Jun 15, 2026'],
    ['committed', '2026-06', 'Committed, as of Jun 2026'],
    ['committed', '2026', 'Committed, as of 2026'],
    ['signed', null, 'Signed'],
    ['signed', '2026-11-12', 'Signed, as of Nov 12, 2026'],
  ] as const)('%s, asOf %s → %s', (status, asOf, words) => {
    expect(statusWords({ status, asOf })).toBe(words);
  });
});

describe('source labels: the kind and the host, never the path', () => {
  const label = (url: string, kind: Parameters<typeof sourceLabel>[0]['kind']) => sourceLabel({ url, kind }, COLLEGE);

  it('names the recruiting platforms by page type', () => {
    expect(label('https://nfhca.sportsrecruits.com/athlete/pat_example', 'sportsrecruits')).toBe('SportsRecruits profile');
    expect(label('https://nfhca.sportsrecruits.com/organization/example', 'sportsrecruits')).toBe('SportsRecruits page');
    expect(
      label('https://sportsrecruits.com/athletic-scholarships/womens-field-hockey/new-york/example_college', 'sportsrecruits'),
    ).toBe('SportsRecruits college page');
    expect(label('https://www.ncsasports.org/field-hockey-recruiting/california/x/y/pat-example', 'ncsa')).toBe('NCSA profile');
    expect(label('https://www.hudl.com/profile/123', 'hudl')).toBe('Hudl profile');
    expect(label('https://www.maxpreps.com/ca/x/y/athletes/pat-example/?careerid=abc', 'maxpreps')).toBe('MaxPreps profile');
    expect(label('https://www.maxpreps.com/news/abc/story.htm', 'maxpreps')).toBe('MaxPreps page');
  });

  it('names the college’s own site by the college, and any other college host by the host', () => {
    expect(label('https://athletics.example.edu/news/2026/11/12/signing-class', 'college')).toBe('Example athletics');
    expect(label('https://news.other.edu/story', 'college')).toBe('news.other.edu');
  });

  it('names a club’s site by the club, and a known outlet by its name', () => {
    expect(label('https://sfyouthfieldhockey.com/player-accomplishments/', 'club-site')).toBe('SF Hawks site');
    expect(label('https://www.sticktogetherfh.com/some-post/', 'news')).toBe('Stick Together');
    expect(label('https://maxfh.longstreth.com/collegecommitments-2027s/', 'event')).toBe('MAX Field Hockey');
    expect(label('https://www.fhcollegepath.com/class-of-2028.html', 'event')).toBe('FH College Path');
    expect(label('https://lahstalon.org/a-story/', 'news')).toBe('The Talon');
    expect(label('https://siwildcats.com/news/2026/10/1/a-report.aspx', 'school-site')).toBe('St. Ignatius athletics');
    expect(label('https://saratogafalcon.org/1/sports/a-story/', 'news')).toBe('The Saratoga Falcon');
    expect(label('https://www.lacrossemasters.com/girls-college-commits', 'other')).toBe('Lacrosse Masters');
    expect(label('https://unknown.example.org/pat-example-commits', 'news')).toBe('unknown.example.org');
  });

  it('names another sport’s club by the club', () => {
    expect(label('https://stepscalifornia.com/college-commitments/', 'club-site')).toBe('STEPS California site');
    expect(label('https://www.advnclacrosse.com/alumnicommits', 'club-site')).toBe('ADVNC Lacrosse site');
    expect(label('https://unknown-club.example.org/commits', 'club-site')).toBe('unknown-club.example.org');
  });
});

describe('the lede counts players, schools, colleges, programs per level and sports', () => {
  type Pick = Parameters<typeof ledeWords>[1][number];
  const at = (teamSlug: string, college: string, division: Pick['division'], sport: Pick['sport'] = 'field-hockey'): Pick => ({
    teamSlug,
    college,
    sport,
    division,
  });
  const tail = (picks: Pick[]) => ledeWords(43, picks).split('the college and the sport. ')[1];

  it('says when nothing is found', () => {
    expect(ledeWords(43, [])).toBe(
      'Which players on this site’s 43 varsity rosters have committed to play a sport in college, field hockey or any other, according to public pages that name the player, the college and the sport. No public page we found shows a commitment by a player here yet.',
    );
  });

  it('one player', () => {
    expect(tail([at('a', 'x', 'ncaa-d1')])).toBe('1 player from 1 school has committed to 1 college, an NCAA Division I field hockey program.');
  });

  it('several players at one program, or at several of one level', () => {
    expect(tail([at('a', 'x', 'ncaa-d1'), at('a', 'x', 'ncaa-d1')])).toBe(
      '2 players from 1 school have committed to 1 college, an NCAA Division I field hockey program.',
    );
    expect(tail([at('a', 'x', 'ncaa-d3'), at('b', 'y', 'ncaa-d3')])).toBe(
      '2 players from 2 schools have committed to 2 colleges, all NCAA Division III field hockey programs.',
    );
  });

  it('several levels, in division order, each counted by its programs', () => {
    expect(
      tail([at('a', 'x', 'ncaa-d3'), at('a', 'x', 'ncaa-d1'), at('b', 'x', 'ncaa-d1'), at('b', 'y', 'ncaa-d1'), at('c', 'z', 'naia')]),
    ).toBe(
      '5 players from 3 schools have committed to 3 colleges. Of them, 3 committed to NCAA Division I field hockey programs, 1 to an NCAA Division III field hockey program and 1 to an NAIA field hockey program.',
    );
    expect(tail([at('a', 'x', 'ncaa-d1'), at('b', 'x', 'ncaa-d1'), at('c', 'w', 'ncaa-d2')])).toBe(
      '3 players from 3 schools have committed to 2 colleges. Of them, 2 committed to an NCAA Division I field hockey program and 1 to an NCAA Division II field hockey program.',
    );
  });

  it('one sport other than field hockey goes in the level words', () => {
    expect(tail([at('a', 'x', 'ncaa-d3', 'lacrosse')])).toBe('1 player from 1 school has committed to 1 college, an NCAA Division III lacrosse program.');
  });

  it('several sports: levels without the sport, then a sentence by sport, the most players first', () => {
    expect(
      tail([
        at('a', 'x', 'ncaa-d1'),
        at('b', 'y', 'ncaa-d1', 'soccer'),
        at('c', 'x', 'ncaa-d1', 'lacrosse'),
        at('d', 'z', 'ncaa-d3', 'lacrosse'),
      ]),
    ).toBe(
      '4 players from 4 schools have committed to 3 colleges. Of them, 3 committed to NCAA Division I programs and 1 to an NCAA Division III program. By sport, 2 in lacrosse, 1 in field hockey and 1 in soccer.',
    );
    // Two sports at one college are two programs.
    expect(tail([at('a', 'x', 'ncaa-d1'), at('b', 'x', 'ncaa-d1', 'lacrosse')])).toBe(
      '2 players from 2 schools have committed to 1 college, all NCAA Division I programs. By sport, 1 in field hockey and 1 in lacrosse.',
    );
  });
});

describe('sport words', () => {
  it('words every sport the schema allows, and capitalizes it to start a line', () => {
    for (const sport of COMMIT_SPORTS) {
      expect(SPORT_WORDS[sport]).toMatch(/^[a-z][a-z ]+$/);
      expect(sportLabel(sport)).toBe(SPORT_WORDS[sport][0].toUpperCase() + SPORT_WORDS[sport].slice(1));
    }
    expect(sportLabel('field-hockey')).toBe('Field hockey');
    expect(sportLabel('swimming-and-diving')).toBe('Swimming and diving');
  });

  it('names a college’s own site by the college for any of its programs', () => {
    expect(sourceLabel({ url: 'https://athletics.example.edu/sports/womens-lacrosse/roster', kind: 'college' }, COLLEGE)).toBe(
      'Example athletics',
    );
  });
});

describe('buildCommitsView (/commits)', () => {
  it('answers the question in the lede, and says so when nothing is found', () => {
    expect(view.lede).toContain(`this site’s ${getRosters().teams.length} varsity rosters`);
    if (file.commitments.length === 0) {
      expect(view.lede).toContain('No public page we found shows a commitment by a player here yet.');
      expect(view.classes).toEqual([]);
      expect(view.colleges).toEqual([]);
    } else {
      expect(view.lede).toMatch(/committed to \d+ colleges?/);
    }
  });

  it('groups every commitment by class, earliest first, each row once', () => {
    const rows = view.classes.flatMap((g) => g.rows);
    expect(rows).toHaveLength(file.commitments.length);
    expect(new Set(rows.map((r) => r.anchor)).size).toBe(rows.length);
    const years = view.classes.map((g) => (g.id === 'class-unknown' ? Infinity : Number(g.id.slice(6))));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    for (const g of view.classes) expect(g.meta).toMatch(/^\d+ players?$/);
  });

  it('shows each player under the roster’s spelling, with the college, the status and every source once', () => {
    for (const c of getCommitments()) {
      const row = view.classes.flatMap((g) => g.rows).find((r) => r.anchor === commitAnchor(c))!;
      const { college, program } = commitProgram(c);
      expect(row.name).toBe(getCommittedPlayer(c).fullName);
      expect(row.school.href).toBe(`/teams/${c.teamSlug}#roster`);
      expect(row.college.name).toBe(collegeDisplayName(college));
      expect(row.college.sport).toBe(sportLabel(c.sport));
      expect(row.college.division).toBe(DIVISION_WORDS[program.division]);
      expect(row.status).toBe(statusWords(c));
      expect(row.status.startsWith(c.status === 'signed' ? 'Signed' : 'Committed')).toBe(true);
      expect(row.sources.map((s) => s.url)).toEqual([...new Set(c.sources.map((s) => s.url))]);
      expect(new Set(row.sources.map((s) => s.label)).size).toBe(row.sources.length);
      const cls = commitClassOf(c);
      expect(view.classes.find((g) => g.rows.includes(row))!.heading).toBe(cls === null ? 'Class year not listed' : `Class of ${cls}`);
    }
  });

  it('lists every college once, the most players first, with each program’s sport and level, and its schools', () => {
    expect(view.colleges.map((c) => c.slug)).toEqual(getColleges().map((c) => c.slug));
    for (const row of view.colleges) {
      const college = getCollege(row.slug)!;
      expect(row.anchor).toBe(collegeAnchor(row.slug));
      expect(row.place).toBe(`${college.city}, ${college.state}`);
      expect(row.programs.map((p) => p.sport)).toEqual(college.programs.map((p) => p.sport));
      row.programs.forEach((p, i) => {
        expect(p.facts.slice(0, 2)).toEqual([sportLabel(p.sport), DIVISION_WORDS[college.programs[i].division]]);
        expect(p.link?.url ?? null).toBe(college.programs[i].url);
        if (p.link) expect(p.link.label).toBe(`${collegeDisplayName(college)} ${SPORT_WORDS[p.sport]}`);
      });
      expect(row.schools.length).toBeGreaterThan(0);
    }
  });

  it('carries nothing the data file keeps but never renders', () => {
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/"(quote|basis|confidence|statedSchool|statedClassYear)"/);
    for (const c of file.commitments) {
      expect(json).not.toContain(c.basis);
      for (const s of c.sources) expect(json).not.toContain(s.quote);
    }
  });

  it('words every level the schema allows', () => {
    for (const d of COLLEGE_DIVISIONS) expect(DIVISION_WORDS[d]).toMatch(/^(NCAA Division I{1,3}|NAIA)$/);
  });
});

describe('the roster’s commitment line', () => {
  it('appears on exactly the committed players’ rows, linking their row on /commits', () => {
    for (const team of TEAMS) {
      const roster = buildRosterView(team.slug)!;
      const committed = new Set(getCommitments().filter((c) => c.teamSlug === team.slug).map((c) => c.athleteId));
      for (const row of roster.rows) {
        if (committed.has(row.key)) {
          const c = getCommitments().find((x) => x.teamSlug === team.slug && x.athleteId === row.key)!;
          expect(row.commitment).toEqual(playerCommitLine(team.slug, row.key));
          expect(row.commitment!.college.href).toBe(`/commits#${commitAnchor(c)}`);
          expect(row.commitment!.label).toBe(c.status === 'signed' ? 'Signed' : 'Committed');
          // Field hockey goes without saying on the roster; any other sport is named.
          expect(row.commitment!.sport).toBe(c.sport === 'field-hockey' ? null : SPORT_WORDS[c.sport]);
          expect(row.commitment!.srLabel).toBe(
            `college ${c.sport === 'field-hockey' ? '' : `${SPORT_WORDS[c.sport]} `}${c.status === 'signed' ? 'signing' : 'commitment'}`,
          );
        } else {
          expect(row.commitment, `${team.slug} / ${row.name}`).toBeNull();
        }
      }
      expect(roster.hasCommitments).toBe(committed.size > 0);
    }
  });

  it('is null for a row with no athleteId', () => {
    expect(playerCommitLine('st-ignatius', null)).toBeNull();
  });
});

describe('/commits, rendered', () => {
  const html = renderIndex();

  it('has one h1, skips no heading level, and ends with how commitments are matched', () => {
    const levels = headings(html);
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    expect(html).toContain('id="how-matched"');
    expect(html.lastIndexOf('<section')).toBe(html.indexOf('<section aria-labelledby="how-matched"'));
  });

  it('gives every commitment and every college its anchor, and an empty state when there are none', () => {
    for (const c of file.commitments) expect(html).toContain(`id="${commitAnchor(c)}"`);
    for (const c of file.colleges) expect(html).toContain(`id="${collegeAnchor(c.slug)}"`);
    if (file.commitments.length === 0) {
      expect(textOf(html)).toContain('No commitment found yet.');
      expect(html).not.toContain('id="colleges"');
    }
  });

  it('shows no quote and no basis', () => {
    expect(commitmentLeaks(html, file, { publicTerms: PUBLIC_TERMS })).toEqual([]);
  });

  it('names no player in its metadata', () => {
    const meta = `${String(commitsMetadata.title)} ${String(commitsMetadata.description)}`;
    expect(meta).toContain('Unofficial and incomplete.');
    for (const c of file.commitments) expect(meta).not.toContain(c.fullName);
  });
});

describe('the pages that link /commits', () => {
  it('a committed player’s team page shows the line and the footnote, and leaks nothing', async () => {
    const slugs = [...new Set(file.commitments.map((c) => c.teamSlug))];
    for (const slug of slugs) {
      const html = await renderTeam(slug);
      for (const c of file.commitments.filter((x) => x.teamSlug === slug)) {
        expect(html).toContain(`href="/commits#${commitAnchor(c)}"`);
      }
      expect(textOf(html)).toContain('Commitment lines link to the player’s entry on the college commitments page');
      expect(commitmentLeaks(html, file, { publicTerms: PUBLIC_TERMS })).toEqual([]);
    }
  });

  it('a team page with no commitment has no footnote about them', async () => {
    const committed = new Set(file.commitments.map((c) => c.teamSlug));
    const slug = TEAMS.find((t) => !committed.has(t.slug))!.slug;
    expect(textOf(await renderTeam(slug))).not.toContain('Commitment lines');
  });

  it('/teams and /about link it, and /about leaks nothing', () => {
    expect(renderToStaticMarkup(createElement(TeamsPage))).toContain('href="/commits"');
    const about = renderToStaticMarkup(createElement(AboutPage));
    expect(about).toContain('id="commits-coverage"');
    expect(about).toContain('href="/commits"');
    expect(commitmentLeaks(about, file, { publicTerms: PUBLIC_TERMS })).toEqual([]);
  });
});
