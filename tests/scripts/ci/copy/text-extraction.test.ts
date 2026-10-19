/**
 * scripts/ci/copy/copy-rules.ts: how a built page is read: the visible text and the title, description and attribute
 * text, and how it is cut into one element per id, its <main>, and without the one link a page may name CCS in.
 */

import { describe, expect, it } from 'vitest';

import {
  EAL_SCHOOL_CLAIM, RED_BLUFF_STATUS_CLAIM, SEED_CLAIM, attributeText, elementById, mainElement,
  nonMemberSectionClaims, sectionById, umpireOfficialClaims, visibleText, withoutLink,
} from '@/scripts/ci/copy/copy-rules';

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

describe('withoutLink: the one link a page may say a word in', () => {
  const words = 'CCS playoffs (SCVAL, BVAL, PCAL) →';

  it('drops a link whose text reads the words, whatever the arrow\'s markup', () => {
    // As React renders `{words} <Arrow />` (components/ui/Arrow.tsx): a text separator, then the aria-hidden glyph.
    const arrow = '<a class="sx-action" href="/playoffs">CCS playoffs (SCVAL, BVAL, PCAL)<!-- --> <span aria-hidden="true">→</span></a>';
    expect(withoutLink(`<p>x</p>${arrow}<p>y</p>`, words)).toBe('<p>x</p><p>y</p>');
    expect(withoutLink('<a href="/playoffs">CCS playoffs (SCVAL, BVAL, PCAL) →</a>', words)).toBe('');
  });

  it('keeps the words outside a link, and a link that says anything more', () => {
    expect(withoutLink('<p>CCS playoffs (SCVAL, BVAL, PCAL) →</p>', words)).toBe('<p>CCS playoffs (SCVAL, BVAL, PCAL) →</p>');
    const more = '<a href="/playoffs">CCS playoffs (SCVAL, BVAL, PCAL) → and the CCS picture</a>';
    expect(withoutLink(more, words)).toBe(more);
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
