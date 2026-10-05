/**
 * scripts/copy-rules.ts: the rules scripts/assert-copy.ts holds every built page to — nothing
 * claims rosters or player stats are SCVAL-only now that they cover every league, no page shows
 * what data/clubs.json or data/commits.json keeps but never renders (a record's basis, a source's
 * quote), and the five EAL claims no page makes (the umpires' grid called official, Davis or Bella
 * Vista called Northern Section schools, Red Bluff's status overstated, "EAL school", a seed word);
 * how it reads a built page's visible text and its title, description and attribute text; and how
 * it cuts a page into one element per id.
 */

import { describe, expect, it } from 'vitest';

import { getHistoryLeagues } from '../lib/history';
import { getLeague } from '../lib/leagues';
import {
  EAL_SCHOOL_CLAIM,
  LEAK_MIN_FRAGMENT,
  LEAK_MIN_PRIVATE,
  RED_BLUFF_STATUS_CLAIM,
  SCVAL_ONLY_CLAIM,
  SEED_CLAIM,
  UMPIRE_OFFICIAL_CLAIM,
  affiliationLeaks,
  attributeText,
  commitmentLeaks,
  elementById,
  historyPageProblems,
  mainElement,
  nonMemberSectionClaims,
  sectionById,
  umpireOfficialClaims,
  visibleText,
} from '../scripts/copy-rules';

describe('SCVAL_ONLY_CLAIM', () => {
  it.each([
    'Rosters are SCVAL-only.',
    'Player stats: SCVAL only for now.',
    'SCVAL only has rosters at the moment',
    'Only SCVAL teams have rosters.',
    'Only the SCVAL has player stats',
    'Rosters (SCVAL)',
    'player stats (SCVAL teams)',
    'Rosters for SCVAL teams only',
    '<p>Player stats are only for SCVAL.</p>',
    'SCVAL-only: rosters and the like',
  ])('flags %j', (text) => {
    expect(text).toMatch(SCVAL_ONLY_CLAIM);
  });

  it.each([
    'Rosters and player stats for all five leagues.',
    'The 2025-26 history is SCVAL only.',
    '<p>SCVAL only</p><p>Rosters for every team</p>',
    'Rosters from MaxPreps. SCVAL standings come from the official PDFs.',
    'Player stats: not every coach enters them.',
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(SCVAL_ONLY_CLAIM);
  });

  it('does not pair a subject and a claim more than 120 characters apart', () => {
    const far = `Rosters ${'x'.repeat(130)} SCVAL-only`;
    expect(far).not.toMatch(SCVAL_ONLY_CLAIM);
  });
});

describe('affiliationLeaks (data/clubs.json: quotes and bases are kept, never rendered)', () => {
  const file = {
    affiliations: [
      {
        teamSlug: 'st-ignatius',
        fullName: 'Pat Example',
        club: 'sf-hawks',
        basis: 'Club roster lists her under Class of 2027; the director confirmed it by email.',
        sources: [
          {
            url: 'https://example.com/roster',
            quote: 'Pat Example’s teammates & coach O’Neill: U19 Hawks Blue, Class of 2027 … short bit',
          },
        ],
      },
    ],
  };

  it('finds a basis, whatever the spacing and punctuation', () => {
    const page = '<p>Club roster lists her under\nClass of 2027 - the director confirmed it by email</p>';
    expect(affiliationLeaks(page, file)).toEqual(['st-ignatius / Pat Example (sf-hawks): its basis']);
  });

  it('finds a quote fragment hidden behind entities, JSON escapes and line breaks', () => {
    const html = '<span>Pat Example&#x27;s teammates &amp; coach\nO&rsquo;Neill:</span> U19 Hawks Blue, Class of 2027';
    expect(affiliationLeaks(html, file)).toEqual([
      'st-ignatius / Pat Example (sf-hawks): the quote from https://example.com/roster',
    ]);
    const rsc = 'Pat Example\\u0027s teammates \\u0026 coach O\\u2019Neill: U19 Hawks Blue, Class of 2027';
    expect(affiliationLeaks(rsc, file)).toHaveLength(1);
  });

  it('excuses a quote only from a document the page prints itself, and never a basis', () => {
    const page =
      '<p>Pat Example’s teammates &amp; coach O’Neill: U19 Hawks Blue, Class of 2027</p>' +
      '<p>Club roster lists her under Class of 2027; the director confirmed it by email.</p>';
    // /history/2025-26 prints the SCVAL all-league PDF some quotes copy a line of: not a leak there.
    expect(affiliationLeaks(page, file, { printsItself: new Set(['https://example.com/roster']) })).toEqual([
      'st-ignatius / Pat Example (sf-hawks): its basis',
    ]);
    // Any other document excuses nothing.
    expect(affiliationLeaks(page, file, { printsItself: new Set(['https://example.com/elsewhere']) })).toEqual([
      'st-ignatius / Pat Example (sf-hawks): its basis',
      'st-ignatius / Pat Example (sf-hawks): the quote from https://example.com/roster',
    ]);
  });

  it('finds an excerpt of a quote as well as the whole of it', () => {
    // 45 letters and digits from inside the quote's first segment, neither end of it.
    expect(affiliationLeaks('<p>Example’s teammates &amp; coach O’Neill: U19 Hawks Blue, Class</p>', file)).toEqual([
      'st-ignatius / Pat Example (sf-hawks): the quote from https://example.com/roster',
    ]);
  });

  it('ignores a fragment shorter than the floor, and a page that shows neither', () => {
    expect('short bit'.replace(/[^a-z0-9]/gi, '').length).toBeLessThan(LEAK_MIN_FRAGMENT);
    expect(affiliationLeaks('<p>… short bit …</p>', file)).toEqual([]);
    expect(affiliationLeaks('<p>Pat Example · U19 Hawks Blue · Current, as of Jul 8, 2026</p>', file)).toEqual([]);
  });
});

describe('commitmentLeaks (data/commits.json: the same rule as the clubs file)', () => {
  const file = {
    commitments: [
      {
        teamSlug: 'st-ignatius',
        fullName: 'Pat Example',
        college: 'example-college',
        basis: 'Her own profile says committed; a teammate’s post names the coach who recruited her.',
        sources: [
          {
            url: 'https://example.com/commits-2027',
            quote: 'Pat Example and teammate Jo Sample, coached by O’Neill: Example College, Class of 2027 … short bit',
          },
        ],
      },
    ],
  };

  it('finds a basis, and a quote fragment hidden behind entities and JSON escapes', () => {
    const page = '<p>Her own profile says committed - a teammate&#x27;s post names the coach who recruited her</p>';
    expect(commitmentLeaks(page, file)).toEqual(['st-ignatius / Pat Example (example-college): its basis']);
    const rsc = 'Pat Example and teammate Jo Sample, coached by O\\u2019Neill: Example College, Class of 2027';
    expect(commitmentLeaks(rsc, file)).toEqual([
      'st-ignatius / Pat Example (example-college): the quote from https://example.com/commits-2027',
    ]);
  });

  it('excuses a quote only from a document the page prints itself, never a basis', () => {
    const page =
      '<p>Pat Example and teammate Jo Sample, coached by O’Neill: Example College, Class of 2027</p>' +
      '<p>Her own profile says committed; a teammate’s post names the coach who recruited her.</p>';
    expect(commitmentLeaks(page, file, { printsItself: new Set(['https://example.com/commits-2027']) })).toEqual([
      'st-ignatius / Pat Example (example-college): its basis',
    ]);
    expect(commitmentLeaks(page, file)).toHaveLength(2);
  });

  it('finds an excerpt from the middle of a quote, and lets one under the floor pass', () => {
    // 45 letters and digits from inside the quote's first segment, neither end of it.
    const excerpt = 'teammate Jo Sample, coached by O’Neill: Example College';
    expect(commitmentLeaks(`<p>${excerpt}</p>`, file)).toEqual([
      'st-ignatius / Pat Example (example-college): the quote from https://example.com/commits-2027',
    ]);
    // 39: one short of LEAK_MIN_FRAGMENT, wherever it starts.
    const short = 'eammate Jo Sample, coached by O’Neill: Example Co';
    expect(short.replace(/[^a-z0-9]/gi, '').length).toBe(LEAK_MIN_FRAGMENT - 1);
    expect(commitmentLeaks(`<p>${short}</p>`, file)).toEqual([]);
    // The run must be one run: two halves with other text between them do not add up.
    expect(commitmentLeaks('<p>teammate Jo Sample, coached</p><p>by somebody else: Example College</p>', file)).toEqual([]);
  });

  it('does not count public names towards an excerpt, but counts what only the source says', () => {
    const quoted = (quote: string) => ({
      commitments: [{ ...file.commitments[0], sources: [{ url: 'https://example.com/list', quote }] }],
    });
    const publicTerms = ['Example Preparatory High School', 'San Example Hawks'];
    const list = quoted('Example Preparatory High School | San Example Hawks | coached by Jo Sample since 2019');
    // The school and its club side by side, as a page prints them: 44 letters, every one public.
    const page = '<p>Example Preparatory High School · San Example Hawks</p>';
    expect(commitmentLeaks(page, list)).toHaveLength(1);
    expect(commitmentLeaks(page, list, { publicTerms })).toEqual([]);
    // The part only the list says (a coach's name) makes the same excerpt a leak.
    const coached = '<p>San Example Hawks coached by Jo Sample since 2019</p>';
    expect(commitmentLeaks(coached, list, { publicTerms })).toHaveLength(1);
    // A run whose private part is one short of LEAK_MIN_PRIVATE is not one.
    const private19 = 'abcdefghijklmnopqrs';
    expect(private19.length).toBe(LEAK_MIN_PRIVATE - 1);
    const near = quoted(`Example Preparatory High School ${private19} San Example Hawks`);
    expect(commitmentLeaks(`<p>Example Preparatory High School ${private19}</p>`, near, { publicTerms })).toEqual([]);
    // A whole fragment always counts, public or not.
    const whole = quoted('Example Preparatory High School | San Example Hawks');
    expect(commitmentLeaks(page, whole, { publicTerms })).toHaveLength(1);
  });

  it('ignores what the page is meant to show, and a fragment under the floor', () => {
    expect(commitmentLeaks('<p>Pat Example · Example · NCAA Division I · Committed, as of Jun 2026</p>', file)).toEqual([]);
    expect(commitmentLeaks('<p>… short bit …</p>', file)).toEqual([]);
  });

  it('leaves the clubs rule exactly as it was', () => {
    const asClubs = { affiliations: file.commitments.map((c) => ({ ...c, club: c.college })) };
    const page = '<p>Her own profile says committed; a teammate’s post names the coach who recruited her.</p>';
    expect(affiliationLeaks(page, asClubs)).toEqual(commitmentLeaks(page, file));
  });
});

describe('sectionById: one league\'s section of the history page', () => {
  type Attrs = (id: string) => string;
  const idFirst: Attrs = (id) => `id="${id}" aria-label="${id}" class="min-w-0"`;
  const idLast: Attrs = (id) => `class="min-w-0 lg:grid" aria-label="${id}" id="${id}"`;
  /** A league section holding its division sections, as app/history/2025-26 renders it. */
  const league = (id: string, attrs: Attrs, divisionAttrs: Attrs, divisions: string[], tail: string) =>
    `<section ${attrs(id)}><h2>${id}</h2>` +
    divisions.map((d) => `<section ${divisionAttrs(d)}><p>${d}</p></section>`).join('') +
    `${tail}</section>`;

  it('finds the id anywhere in the start tag, and takes the nested division sections with it', () => {
    for (const [attrs, divisionAttrs] of [[idFirst, idLast], [idLast, idFirst], [idFirst, idFirst], [idLast, idLast]]) {
      const html =
        '<main>' +
        league('scval', attrs, divisionAttrs, ['de-anza', 'el-camino'], '') +
        league('bval', attrs, divisionAttrs, ['mt-hamilton', 'santa-teresa'], '<p>BVAL tail</p>') +
        league('pcal', attrs, divisionAttrs, [], '<p>Unavailable</p>') +
        '</main>';
      const bval = sectionById(html, 'bval');
      expect(bval).toBe(league('bval', attrs, divisionAttrs, ['mt-hamilton', 'santa-teresa'], '<p>BVAL tail</p>'));
      // A division is a section of its own too; the last league runs to its own close.
      expect(sectionById(html, 'mt-hamilton')).toBe(`<section ${divisionAttrs('mt-hamilton')}><p>mt-hamilton</p></section>`);
      expect(sectionById(html, 'pcal')).toBe(league('pcal', attrs, divisionAttrs, [], '<p>Unavailable</p>'));
    }
  });

  it('matches the id attribute exactly, not a data- attribute, a longer id or another element', () => {
    const html =
      '<div id="bval"></div><section data-id="bval"><p>a</p></section><section id="bval-old"><p>b</p></section>' +
      '<section class="x" id="bval"><p>c</p></section>';
    expect(sectionById(html, 'bval')).toBe('<section class="x" id="bval"><p>c</p></section>');
    expect(sectionById(html, 'mcal')).toBe('');
  });

  it('runs to the end of the markup when the section is never closed', () => {
    expect(sectionById('<p>x</p><section id="a"><section id="b"></section><p>y</p>', 'a')).toBe(
      '<section id="a"><section id="b"></section><p>y</p>',
    );
  });
});

describe('elementById: the /playoffs EAL card, a <div>', () => {
  it('takes the element with that id up to its own close, nested elements of the same name included', () => {
    const html =
      '<div class="a"><div id="mcal-x"><p>x</p></div><div class="mt-4" id="eal"><p>One</p><div><p>Two</p></div></div>' +
      '<p>after</p></div>';
    expect(elementById(html, 'eal', 'div')).toBe('<div class="mt-4" id="eal"><p>One</p><div><p>Two</p></div></div>');
    expect(elementById(html, 'eal', 'section')).toBe('');
    expect(elementById(html, 'mcal', 'div')).toBe('');
  });

  it('is sectionById for the section element', () => {
    const html = '<section id="a"><section id="b"></section></section><div id="a"></div>';
    expect(sectionById(html, 'a')).toBe(elementById(html, 'a', 'section'));
  });
});

describe('mainElement: a built page\'s <main>', () => {
  it('takes the <main> element with its attributes, and nothing outside it', () => {
    const html = '<body><header>h</header><main id="main" class="x"><p>one</p></main><footer>f</footer></body>';
    expect(mainElement(html)).toBe('<main id="main" class="x"><p>one</p></main>');
    expect(mainElement('<main><p>bare</p></main>')).toBe('<main><p>bare</p></main>');
  });

  it('is empty when the page has no <main>, and never matches a longer tag name', () => {
    expect(mainElement('<body><p>x</p></body>')).toBe('');
    expect(mainElement('<mainly>x</mainly>')).toBe('');
  });
});

describe('historyPageProblems: the history page holds what the history data says', () => {
  const leagues = getHistoryLeagues();
  /** React's escaping of text: `&` and `'`. */
  const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
  /** The page's <main>, as app/history/2025-26 renders it, with one league's section edited. */
  const page = (edit: { id: string; omit?: boolean; dropDivision?: boolean; tail?: string } | null = null) =>
    '<main>' +
    leagues
      .filter(({ id }) => !(edit?.id === id && edit.omit))
      .map(({ id, entry }) => {
        const body =
          entry.status === 'available'
            ? entry.divisions
                .filter((_, i) => !(edit?.id === id && edit.dropDivision && i === 0))
                .map(
                  (d) =>
                    `<section class="min-w-0" id="${d.division}"><table>` +
                    d.standings.varsity.map((r) => `<tr><td>${escaped(r.name)}</td><td>${r.leagueRecord}</td></tr>`).join('') +
                    '</table></section>',
                )
                .join('')
            : `<div><h3>Unavailable</h3><p>${escaped(entry.reason)}</p></div>`;
        return `<section id="${id}" aria-label="${id}"><h2>${id}</h2>${body}${edit?.id === id ? (edit.tail ?? '') : ''}</section>`;
      })
      .join('') +
    '</main>';
  const available = leagues.find((l) => l.entry.status === 'available');
  const unavailable = leagues.find((l) => l.entry.status === 'unavailable');

  it('finds nothing on a complete page', () => {
    expect(historyPageProblems(page(), leagues)).toEqual([]);
  });

  it('names a league whose section is gone', () => {
    expect(historyPageProblems(page({ id: 'pcal', omit: true }), leagues)).toEqual(['no <section id="pcal">']);
  });

  it('names the division anchor an available league lost', () => {
    if (available?.entry.status !== 'available') throw new Error('no available league in the history data');
    const { id, entry } = available;
    const problems = historyPageProblems(page({ id, dropDivision: true }), leagues);
    expect(problems).toContain(`${id}: no id="${entry.divisions[0].division}" division anchor`);
  });

  it('reports an unavailable league that shows a table or an award', () => {
    if (!unavailable) throw new Error('no unavailable league in the history data');
    const { id } = unavailable;
    expect(historyPageProblems(page({ id, tail: '<table><tr><td>1-0</td></tr></table>' }), leagues)).toEqual([
      `${id}: an unavailable league shows a table`,
    ]);
    const award = historyPageProblems(page({ id, tail: '<p>League champion: Example</p>' }), leagues);
    expect(award).toHaveLength(1);
    expect(award[0]).toMatch(new RegExp(`^${id}: an unavailable league shows a result or award — “…`));
  });
});

describe('visibleText: what a reader of a built page sees', () => {
  it('drops scripts, styles and tags, decodes entities, and ends each block in a line break', () => {
    const html =
      '<html><head><title>T</title><style>p{}</style></head><body><h2>Official sources</h2>' +
      '<p>The grid on the <a href="/x">umpires&rsquo;</a> site&nbsp;matches.</p>' +
      '<script>self.__next_f.push([1,"official umpire"])</script><p>Davis &amp; Bella Vista</p></body></html>';
    expect(visibleText(html)).toBe('Official sources\nThe grid on the umpires’ site matches.\nDavis & Bella Vista');
  });

  it('keeps inline elements inside their sentence', () => {
    expect(visibleText('<body><p>EAL <span>school</span>s</p></body>')).toBe('EAL school s');
    expect(visibleText('<body><p>EAL <strong>schools</strong> play</p></body>')).toMatch(EAL_SCHOOL_CLAIM);
  });

  it('leaves no comment behind when removing one forms another', () => {
    // One pass would turn `<!<!---->--` into `<!--` and read " hidden " as a tag.
    expect(visibleText('<body><p>A<!<!---->-- hidden -->B</p></body>')).toBe('AB');
  });
});

describe('attributeText: what a page shows or reads out outside its body text', () => {
  const html =
    '<html><head><title>EAL standings &middot; NorCal</title>' +
    '<meta name="description" content="Davis is a Northern Section school">' +
    '<meta property="og:description" content="The umpires&#x27; grid is official">' +
    '<meta name="twitter:description" content="Red Bluff withdrew">' +
    '<meta name="viewport" content="width=device-width, top seed">' +
    '<script>self.__next_f.push([1,"<span title=\\"EAL schools\\">"])</script></head>' +
    '<body><span title="Bella Vista is a Northern Section member" aria-label="The EAL schools">x</span>' +
    '<img src="/a.png" alt="the third seed"><a href="/b" class="c">link</a></body></html>';

  it('collects the title, description metas and title, aria-label and alt attributes, decoded, one per line', () => {
    expect(attributeText(html)).toBe(
      [
        'EAL standings · NorCal',
        'Davis is a Northern Section school',
        "The umpires' grid is official",
        'Red Bluff withdrew',
        'Bella Vista is a Northern Section member',
        'The EAL schools',
        'the third seed',
      ].join('\n'),
    );
  });

  it('is where an attribute-only claim is caught: visibleText never sees it', () => {
    const body =
      '<body><span title="Davis is a Northern Section school" aria-label="The umpires grid is official">x</span>' +
      '<img alt="top seed"></body>';
    expect(visibleText(body)).toBe('x');
    expect(nonMemberSectionClaims(visibleText(body))).toEqual([]);
    expect(umpireOfficialClaims(visibleText(body))).toEqual([]);
    const text = attributeText(body);
    expect(nonMemberSectionClaims(text)).toEqual(['Davis is a Northern Section school']);
    expect(umpireOfficialClaims(text)).toEqual(['The umpires grid is official']);
    expect(text).toMatch(SEED_CLAIM);
    expect(attributeText(html)).toMatch(RED_BLUFF_STATUS_CLAIM);
    expect(attributeText(html)).toMatch(EAL_SCHOOL_CLAIM);
  });

  it('reads no script (the RSC payload) and no other meta', () => {
    expect(attributeText('<head><meta name="viewport" content="EAL schools"><script>"title=\\"EAL schools\\""</script></head>')).toBe('');
  });
});

describe('UMPIRE_OFFICIAL_CLAIM / umpireOfficialClaims: the umpires’ grid is never official', () => {
  it.each([
    'The official schedule is the umpires’ grid.',
    'Umpire assignments come from the official EAL schedule.',
    'See the EAL/SRL umpires’ site for the Official 2026 grid',
    'The grid at fieldhockeyumpires.org is official',
    'fieldhockeyumpires.org posts the official EAL grid',
  ])('flags %j', (text) => {
    expect(text).toMatch(UMPIRE_OFFICIAL_CLAIM);
    expect(umpireOfficialClaims(text)).toHaveLength(1);
  });

  it.each([
    'The EAL publishes no official schedule. Its 2026 grid is posted on the umpires’ site.',
    'No official schedule document.\nThe league grid posted on the EAL/SRL umpires’ site matches MaxPreps.',
    'Official sources: the Guidelines (PDF)!  Umpires post a grid',
    'An umpire made the call.',
    'No official schedule. fieldhockeyumpires.org posts a grid.',
  ])('lets %j through: the two words are in different sentences, or only one is there', (text) => {
    expect(umpireOfficialClaims(text)).toEqual([]);
  });

  it.each([
    'The umpires’ grid is not official.',
    "The umpires' grid isn't official",
    'The umpires’ grid isn’t an official schedule.',
    'The umpires’ grid is no official document.',
    'The umpires’ grid has never been official.',
    'The umpires’ grid is not the official schedule.',
    'The EAL publishes no official schedule; the umpires’ grid matches MaxPreps game for game.',
    'The umpires’ grid, though not official, matches MaxPreps.',
    'The grid on the umpires’ site is never called official here.',
    'The umpires’ grid is not called official anywhere on this site.',
  ])('lets %j through: a negation directly governs every "official"', (text) => {
    expect(text, 'the lexical half still sees both words').toMatch(UMPIRE_OFFICIAL_CLAIM);
    expect(umpireOfficialClaims(text)).toEqual([]);
  });

  it.each([
    // The negation governs a word other than "official".
    'The umpires’ grid is not only official but complete.',
    'The umpires’ grid is not just official.',
    'Use the official grid, not the umpires’.',
    'The official schedule is not the umpires’ grid.',
    // A negation in another clause, or one "official" negated and another not.
    'The league does not post it, and the umpires’ grid is official.',
    'The umpires’ grid is not official, but it is the official record.',
    // A negation word that is not right before it.
    'There is no doubt the umpires’ grid is official.',
    // "If not" asserts it.
    'The umpires’ grid is nothing if not official.',
  ])('still flags %j: no negation directly governs an "official" in it', (text) => {
    expect(umpireOfficialClaims(text)).toHaveLength(1);
  });

  it.each([
    'MaxPreps is not official, but the umpires’ grid is.',
    'The league schedule is not official; the umpires’ grid is.',
    'The league schedule is not official — the umpires’ grid is!',
    'MaxPreps is not official, yet the umpires’ grid is official enough',
    'The league schedule is not official, whereas the umpires’ grid has been',
    'The league schedule is not official, but the umpires’ grid is one.',
    'MaxPreps is not official, and so is not the umpires’ grid, unlike the league’s',
    // Honest, but a lexical rule cannot tell what follows the contrast: the copy says it in two sentences.
    'The umpires’ grid is not official, though it matches MaxPreps.',
  ])('still flags %j: what follows the negation says it again of something else', (text) => {
    expect(umpireOfficialClaims(text)).toHaveLength(1);
  });

  it.each([
    'The umpires’ grid is not official. It matches MaxPreps game for game.',
    'The umpires’ grid is not official, and neither is MaxPreps.',
    'The umpires’ grid is not official, nor is MaxPreps.',
  ])('lets %j through: nothing after the negation reopens it', (text) => {
    expect(umpireOfficialClaims(text)).toEqual([]);
  });
});

describe('nonMemberSectionClaims: Davis and Bella Vista are not Northern Section schools', () => {
  it.each([
    'Davis is a Northern Section school.',
    'Bella Vista and Chico are Northern Section members',
    'The six Northern Section schools, Davis among them, play ten games',
  ])('flags %j', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Chico, Corning, Lassen and Pleasant Valley are Northern Section schools; Davis and Bella Vista are Sac-Joaquin Section schools that play field hockey in the EAL.',
    'Davis plays in the EAL. Chico is a Northern Section school.',
    'Davisville is a Northern Section school',
    'Davis: Northern Section postseason',
  ])('lets %j through', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    'Davis is an NS school.',
    'Bella Vista is a CIF-NS member',
    'Davis is a CIF NS school',
    'Davis is a CIF Northern Section school',
    'Davis is a Northern Section team',
    'Davis and Bella Vista are Northern Section teams',
    'Bella Vista is an NS-member school',
    'Davis is a member of the Northern Section',
    'Bella Vista is one of the members of CIF-NS',
    'Davis is a northern section school',
    'Davis is a Northern Section high school',
    'Davis is a member school of the Northern Section',
    'Bella Vista is one of the member teams of the NS',
    'Davis is a Northern-Section school',
    'Davis is one of the Northern Section’s schools',
    'Davis is an NS program',
    'Davis is a CIF–NS member',
    'Bella Vista is a CIF‑NS team',
    'Davis is a CIF-Northern Section school',
  ])('flags the variant %j', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Davis and Bella Vista are not Northern Section schools.',
    'Davis is not an NS school',
    'Bella Vista isn’t a CIF-NS member',
    "Davis isn't a Northern Section team",
    'Davis is no Northern Section member',
    'Davis has never been a Northern Section school',
    'Bella Vista is not one of the Northern Section schools',
    'Davis is not a member of the Northern Section',
    'Davis, a Sac-Joaquin school, is not a Northern Section school; Chico is a Northern Section school',
    'Davis isn’t a CIF–NS member',
    'Davis is not a Northern Section high school',
    'Bella Vista is not a member school of the Northern Section',
    'Davis is not one of the Northern Section’s schools',
    'Davis is not an NS program',
    'Davis is not an NS school, nor is Bella Vista.',
  ])('lets the negation %j through', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    // The negation governs something other than the claim.
    'Davis is not only a Northern Section school',
    'Chico, not Davis, is a Northern Section school',
    'Davis is not in the Sac-Joaquin Section but a Northern Section school',
    // One claim negated, another in the same clause not.
    'Davis is not a CIF-NS member, but it is a Northern Section team',
    // A negation word that is not right before it.
    'There is no question Davis is a Northern Section school',
    // "If not" asserts it.
    'Davis is nothing if not a Northern Section school',
  ])('still flags %j: no negation directly governs the claim', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Bella Vista is not a Northern Section school, but Davis is.',
    'Bella Vista is not a Northern Section school; Davis is.',
    'Bella Vista is not an NS school, while Davis is',
    'Bella Vista is not a CIF-NS member, though Davis has been for years',
    'Bella Vista is not a Northern Section school, and Davis is too.',
    'Bella Vista is not a Northern Section school, unlike Davis',
  ])('still flags %j: what follows the negation says it again of something else', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Davis plays the NS champion',
    'Davis: CIF-NS Guidelines §VII.E.4',
    'Bella Vista plays under the Northern Section’s Guidelines',
    'Davis transcribes a ns schoolbook',
  ])('lets %j through: the Section named, no membership claimed', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    'Davis defeated a Northern Section team.',
    'Bella Vista beat a Northern Section program 2-1.',
    'Davis played three Northern Section teams',
    'Davis plays Chico, a Northern Section school, on Friday',
    'A Northern Section team beat Davis',
    'Davis hosts NS members Chico and Lassen',
  ])('lets %j through: the membership phrase is about an opponent, not Davis or Bella Vista', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    'Davis, a Northern Section school, hosts Chico',
    'Davis, which is a Northern Section team, hosts Chico',
    'Davis, not Chico, is an NS school',
    'Chico, Davis and Lassen are Northern Section members',
    'Northern Section schools such as Davis play ten games',
    'The Northern Section teams Davis and Bella Vista meet on Friday',
    'Davis has been a member of the Northern Section since 2019',
  ])('flags %j: the membership phrase is said of Davis or Bella Vista', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it('returns each offending clause', () => {
    expect(nonMemberSectionClaims('Chico plays; Davis is a Northern Section member. Bella Vista is a Northern Section school')).toEqual([
      'Davis is a Northern Section member',
      'Bella Vista is a Northern Section school',
    ]);
  });
});

describe('RED_BLUFF_STATUS_CLAIM: Red Bluff is only "not fielding a varsity team in 2026"', () => {
  it.each([
    'Red Bluff cancelled its season.',
    'Red Bluff’s 2026 games were canceled',
    'Red Bluff withdrew from the EAL',
    'Red Bluff has withdrawn',
    'Red Bluff dropped field hockey',
    'Red Bluff has no program',
    'Red Bluff, which has no field hockey program',
  ])('flags %j', (text) => {
    expect(text).toMatch(RED_BLUFF_STATUS_CLAIM);
  });

  it.each([
    'MaxPreps also lists Red Bluff, which is not fielding a varsity team in 2026.',
    'Red Bluff is not fielding a varsity team in 2026. Two games were cancelled for smoke.',
    'Red Bluff: a 0-0-0 row; the game was cancelled',
    `Red Bluff ${'x'.repeat(90)} cancelled`,
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(RED_BLUFF_STATUS_CLAIM);
  });
});

describe('EAL_SCHOOL_CLAIM: never "EAL school(s)" or "EAL member(s)"', () => {
  it.each(['the six EAL schools', 'an EAL school', 'Eastern Athletic League members', 'every EAL member'])('flags %j', (text) => {
    expect(text).toMatch(EAL_SCHOOL_CLAIM);
  });

  it.each([
    'the six EAL teams',
    'the top six EAL/SRL schools compete',
    'Davis and Bella Vista play field hockey in the EAL',
    'EAL schooling', // not the word
    'eal schools', // case-sensitive, as the names are
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(EAL_SCHOOL_CLAIM);
  });
});

describe('SEED_CLAIM: no seed word on an EAL page', () => {
  it.each(['the 1st seed', 'No. 2 seed', 'No.3 seeded', 'the top seed', 'First seed', 'second seeded', 'the 4th Seed'])(
    'flags %j',
    (text) => {
      expect(text).toMatch(SEED_CLAIM);
    },
  );

  // The Super Regional takes six teams, so "third" to "sixth" are the likely words.
  it.each([
    'the third seed',
    'Chico is the fourth seed',
    'the fifth seed',
    'sixth seed',
    'the last seed',
    'the lowest seed',
    'the highest seed',
    'the bottom seed',
    'the #1 seed',
    'a 1-seed',
    'the 2 seed',
    'top-seeded Chico',
    'the top seeds',
    'seed No. 1',
    'seed #3',
    'seeded 2',
    'seeded first',
    'seeded sixth',
    'seeded 3rd',
  ])('flags %j', (text) => {
    expect(text).toMatch(SEED_CLAIM);
  });

  it.each([
    'Seeding will be based on League record — quoted as written; this site does not apply it',
    'the top six qualify',
    'seeds are set by the coaches',
    'topseed',
    'the 2026 seeding criteria',
    'Super Regional seeding (§III.E.1)',
    'seeded by the coaches',
    'seedless',
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(SEED_CLAIM);
  });
});

describe('the EAL’s own config strings pass all five rules', () => {
  const eal = getLeague('eal');
  const ps = eal.postseason;
  const strings: Array<[string, string]> = [['membershipNote', eal.membershipNote ?? '']];
  for (const d of eal.divisions) {
    if (d.official.mode === 'none') strings.push([`${d.id} official.note`, d.official.note]);
    if (d.knownCause) strings.push([`${d.id} knownCause`, d.knownCause]);
  }
  if (ps.kind === 'unbracketed-tournament') {
    strings.push(['postseason note', ps.note]);
    for (const [k, v] of Object.entries(ps.citations)) strings.push([`postseason citations.${k}`, v]);
  }
  // The rules' citations: stages['no-rule'] is the standings footnote on every EAL tie.
  const { stages, ...cites } = eal.rules.citations;
  for (const [k, v] of Object.entries(cites)) if (v !== undefined) strings.push([`rules citations.${k}`, v]);
  for (const [k, v] of Object.entries(stages)) strings.push([`rules citations.stages.${k}`, v ?? '']);

  it('collects them all', () => {
    expect(ps.kind).toBe('unbracketed-tournament');
    expect(strings.map(([k]) => k)).toEqual([
      'membershipNote',
      'eal official.note',
      'eal knownCause',
      'postseason note',
      'postseason citations.qualification',
      'postseason citations.format',
      'postseason citations.seeding',
      'postseason citations.eligibility',
      'postseason citations.noFurtherPath',
      'rules citations.points',
      'rules citations.pointsShort',
      'rules citations.order',
      'rules citations.doubleRoundRobin',
      'rules citations.overtime',
      'rules citations.coChampions',
      'rules citations.stages.no-rule',
    ]);
    expect(strings.every(([, v]) => v.length > 0)).toBe(true);
  });

  it('and each passes', () => {
    for (const [what, text] of strings) {
      expect(umpireOfficialClaims(text), `${what}: umpires’ grid called official`).toEqual([]);
      expect(nonMemberSectionClaims(text), `${what}: Davis or Bella Vista called a Northern Section school`).toEqual([]);
      expect(text, `${what}: Red Bluff's status`).not.toMatch(RED_BLUFF_STATUS_CLAIM);
      expect(text, `${what}: "EAL school"`).not.toMatch(EAL_SCHOOL_CLAIM);
      expect(text, `${what}: a seed word`).not.toMatch(SEED_CLAIM);
    }
  });

  it('is a real test: the strings name what the rules look for', () => {
    const all = strings.map(([, v]) => v).join('\n');
    expect(all).toMatch(/umpire/i);
    expect(all).toMatch(/Davis/);
    expect(all).toMatch(/Northern Section schools/);
    expect(all).toMatch(/Red Bluff/);
    expect(all).toMatch(/Seeding/);
  });
});
