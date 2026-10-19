/**
 * views/clubs/words.ts (DESIGN §17.3): the status words and the source labels (the kind and the host, never the
 * path).  The data is hand research that changes only with a new sweep (tests/data/clubs.test.ts), so the words
 * pinned here are pinned to it: when a sweep lands, re-read the pages and update them together. The suites share
 * tests/support/clubs-view.ts.
 */

import { describe, expect, it } from 'vitest';

import { clubDisplayName, getClubs } from '@/lib/datasets/clubs';
import { sourceLabel, sourceName, statusWords } from '@/views/clubs/words';
import { file, club, tie, views, viewOf } from '@/tests/support/clubs-view';

describe('status words (DESIGN §17.3)', () => {
  it('words every pinned tie as the table says', () => {
    const PINS: Array<[string, string, string]> = [
      ['Storey Lewis', 'sf-hawks', 'Current, as of Aug 27, 2026'],
      ['Caitlyn Hughes', 'sf-hawks', 'Current, as of Aug 27, 2026'],
      ['Clara Brunello', 'sf-hawks', 'Current, as of Jul 8, 2026'],
      ['Isabella Bjork', 'fly-fhc', 'Current, as of 2026'],
      ['Gigi Colant', 'sf-hawks', 'Current, 2025-26 season'],
      ['Dylan Powell', 'sf-hawks', 'Current'],
      ['Melanie Henderson', 'fly-fhc', 'Earlier, 2019–2022'],
      ['Melanie Henderson', 'lightning', 'Earlier, 2015–2018'],
      ['Alex Pires', 'infinity', 'Earlier, Jul 18, 2025'],
      ['Hailey Moncada', 'infinity', 'Earlier, 2024-25 season'],
      ['Riya Mehrotra', 'fly-fhc', 'Listed by NCSA, 2025'],
      // Her NCSA page and one of her two MaxPreps URLs are undated; the other is dated Oct 19, 2025.
      ['Gabrielle Moll', 'fly-fhc', 'Listed by MaxPreps, Oct 19, 2025'],
      ['Emma Traverso', 'fly-fhc', 'Listed by NCSA, 2025'],
      // No source is dated "2025", so the first one (NCSA) lists it, not the dated Stick Together page.
      ['Brooklyn Barnard', 'fly-fhc', 'Listed by NCSA, 2025'],
      ['Colette Boyd', 'infinity', 'Listed by the Gilroy Dispatch, Jul 18, 2025'],
      ['Ruhee Bhatnagar', 'lightning', 'Listed by NCSA, 2024-25 season'],
      ['Kira Kelly', 'd-city', 'Listed by the NFHCA, Aug 28, 2025'],
      ['Amelia Zedonis', 'd-city', 'Listed by the NFHCA, Aug 28, 2025'],
      ['Kate Loscutoff', 'd-city', 'Earlier, 2024'],
      ['Lilah Letcher', 'chico-hotshots', 'Current, as of Sep 29, 2026'],
      ['Kate Panighetti', 'chico-hotshots', 'Current, as of May 20, 2026'],
    ];
    for (const [name, slug, words] of PINS) expect(statusWords(tie(name, slug), club(slug)), `${name} @ ${slug}`).toBe(words);
  });

  it('covers the shapes the data does not use yet: a month, a current range, an undated listing', () => {
    const base = tie('Riya Mehrotra', 'fly-fhc');
    const fly = club('fly-fhc');
    expect(statusWords({ ...base, status: 'current', asOf: '2025-10' }, fly)).toBe('Current, as of Oct 2025');
    expect(statusWords({ ...base, status: 'current', asOf: '2025-2026' }, fly)).toBe('Current, 2025–2026');
    expect(statusWords({ ...base, status: 'past', asOf: null }, fly)).toBe('Earlier');
    expect(statusWords({ ...base, status: 'unknown', asOf: null }, fly)).toBe('Listed by NCSA; no date given');
  });

  it('never words a listed or earlier tie as current, nor a current one as listed', () => {
    for (const a of file.affiliations) {
      const words = statusWords(a, club(a.club));
      if (a.status === 'current') expect(words, a.fullName).not.toMatch(/listed|not/i);
      else expect(words, `${a.fullName} @ ${a.club}`).not.toMatch(/^Current/);
      if (a.status === 'unknown') expect(words, a.fullName).toMatch(/^Listed by /);
      if (a.status === 'past') expect(words, a.fullName).toMatch(/^Earlier/);
    }
  });
});

describe('source labels: the kind and the host, never the path', () => {
  it('names a page by whose site it is on', () => {
    // Bridget Schilb's earlier Fly club rests on NorCal Impact's page for her.
    const page = tie('Bridget Schilb', 'fly-fhc').sources[0];
    expect(sourceLabel(page, club('fly-fhc'))).toBe('NorCal Impact site');
    // The same page on NorCal Impact's own club page is "club site".
    const bridget = tie('Bridget Schilb', 'norcal-impact').sources.find((s) => s.url === page.url)!;
    expect(sourceLabel(bridget, club('norcal-impact'))).toBe('club site');
    // Ruhee Bhatnagar's Lightning roster (an older sub-season than the club's rosterPages).
    const ruhee = tie('Ruhee Bhatnagar', 'lightning').sources.find((s) => s.kind === 'club-site')!;
    expect(sourceLabel(ruhee, club('lightning'))).toBe('club roster');
    // A host no club record names is printed as it is. No tie in the file rests on such a page any
    // more (Fly's old about page on sanjosefly.com named no player and was dropped), so the rule is
    // held on a source built here.
    const oldFly = { url: 'https://sanjosefly.com/about-fly/', kind: 'club-site' } as const;
    expect(sourceLabel(oldFly, club('fly-fhc'))).toBe('sanjosefly.com');
    expect(sourceName(oldFly, club('fly-fhc'))).toBe('sanjosefly.com');
  });

  it('labels the EAL-area ties, and reads a shared host (Google Sites, TeamLinkt) by its site, not its host', () => {
    const labels = (slug: string) => viewOf(slug).groups.flatMap((g) => g.rows).map((r) => [r.name, r.sources.map((s) => s.label)]);
    expect(labels('d-city')).toEqual([
      ['Kira Kelly', ['NFHCA']],
      ['Kate Loscutoff', ['NCSA profile']],
      ['Maisy Martin', ['NCSA profile']],
      ['Amelia Zedonis', ['NFHCA']],
    ]);
    expect(labels('chico-hotshots')).toEqual([
      ['Quinn Karolyi', ['NCSA profile']],
      ['Evie Nielsen', ['SportsRecruits profile']],
      ['Lilah Letcher', ['MaxPreps profile']],
      ['Kate Panighetti', ['MaxPreps profile']],
      ['Olivia Council', ['NCSA profile']],
    ]);
    // Davis High's Google Site is on D-City's host but not on D-City's site.
    const dcity = club('d-city');
    expect(sourceLabel({ url: 'https://sites.google.com/djusd.net/dhsfieldhockey/home', kind: 'club-site' }, dcity)).toBe('sites.google.com');
    expect(sourceLabel({ url: 'https://sites.google.com/view/dcityhockeyclub/home', kind: 'club-site' }, dcity)).toBe('club site');
    // Another TeamLinkt league, or a TeamLinkt page outside the club's slug, is not Chico Hotshots' site.
    const chico = club('chico-hotshots');
    expect(sourceLabel({ url: 'https://leagues.teamlinkt.com/chicohotshotsfieldhockey/Divisions', kind: 'club-site' }, chico)).toBe('club site');
    expect(sourceLabel({ url: 'https://leagues.teamlinkt.com/someotherleague/Divisions', kind: 'club-site' }, chico)).toBe('leagues.teamlinkt.com');
    expect(sourceLabel({ url: 'https://leagues.teamlinkt.com/leagues/NewsItem/34623/39251', kind: 'club-site' }, chico)).toBe('leagues.teamlinkt.com');
  });

  it('names the NFHCA watchlists and MAX Field Hockey pages by their outlet', () => {
    const hughes = tie('Caitlyn Hughes', 'sf-hawks');
    const label = (host: string) => sourceLabel(hughes.sources.find((s) => s.url.includes(host))!, club('sf-hawks'));
    expect(label('nfhca.org/')).toBe('NFHCA');
    expect(label('maxfh.longstreth.com')).toBe('MAX Field Hockey');
    // Two watchlists (2025 and 2026) on one row read apart.
    const hazel = viewOf('sf-hawks').groups[0].rows.find((r) => r.name === 'Hazel Stang')!;
    expect(hazel.sources.map((s) => s.label).filter((l) => l.startsWith('NFHCA'))).toEqual(['NFHCA', 'NFHCA (2)']);
  });

  it('every label on every club page is a closed-set word, another club’s site, or the bare host', () => {
    const fixed = new Set([
      'SportsRecruits profile',
      'SportsRecruits team page',
      'NCSA profile',
      'Hudl profile',
      'FieldLevel profile',
      'MaxPreps profile',
      'MaxPreps roster',
      'MaxPreps page',
      'club roster',
      'club site',
      'Stick Together',
      'Gilroy Dispatch',
      'SCVAL',
      'NFHCA',
      'MAX Field Hockey',
      'Saint Francis athletics',
      ...getClubs().flatMap((c) => [`${clubDisplayName(c)} site`, `${clubDisplayName(c)} roster`]),
    ]);
    let checked = 0;
    for (const { slug, view } of views) {
      for (const row of view.groups.flatMap((g) => g.rows)) {
        for (const s of row.sources) {
          const label = s.label.replace(/ \(\d+\)$/, '');
          const host = new URL(s.url).hostname.replace(/^www\./, '');
          expect(fixed.has(label) || label === host, `${slug} / ${row.name}: ${s.label} (${s.url})`).toBe(true);
          // A label is never read from a path, so no name in a slug (a coach's bio page) reaches one.
          expect(s.label, `${slug} / ${row.name}`).not.toMatch(/leaf|huynh/i);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(file.affiliations.reduce((n, a) => n + new Set(a.sources.map((s) => s.url)).size, 0));
  });
});
