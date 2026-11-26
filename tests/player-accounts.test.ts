/**
 * data/player-accounts.json (lib/players/accounts-schema.ts): each person's own recruiting pages, filed under her
 * registry id, and what a build shows of them through its player index (lib/players/player-index.ts).
 */

import { describe, expect, it } from 'vitest';

import { AccountSchema, AccountsFileSchema, maxPrepsCareerId, type AccountsFile } from '../lib/players/accounts-schema';
import { accountsOfPerson, isCareerPage, rowsOfPerson } from '../lib/players/player-index';
import { readAccountsFile } from '../lib/players/registry-file';
import { getAllEnrichedRosters } from '../lib/players/rosters';
import { REPO } from './helpers';

const file = readAccountsFile(REPO)!;

const page = (over: object) => ({
  platform: 'ncsa',
  url: 'https://www.ncsasports.org/field-hockey-recruiting/california/x/y/a-b',
  sports: ['field-hockey'],
  linkedBy: [{ build: 'field-hockey', list: 'varsity' }],
  classOf: 2028,
  note: null,
  ...over,
});
const person = (id: string, accounts: object[]) => ({ playerId: id, name: 'A B', accounts });
const withPeople = (players: object[]): unknown => ({ ...file, players });

describe('data/player-accounts.json', () => {
  it('validates, every sport\'s pages in one file, by person', () => {
    expect(AccountsFileSchema.safeParse(file).success).toBe(true);
    expect(file.players.length).toBeGreaterThan(2000);
    const builds = new Set(file.players.flatMap((p) => p.accounts.flatMap((a) => a.linkedBy.map((r) => r.build))));
    expect([...builds].sort()).toEqual(['basketball', 'field-hockey', 'soccer', 'volleyball']);
    expect(Object.keys(file.jvResearch).sort()).toEqual(['basketball', 'field-hockey', 'soccer', 'volleyball']);
  });

  it('keeps a page two builds\' rounds linked as one account, with both rounds and every sport it shows', () => {
    const mitty = file.players.flatMap((p) => p.accounts).find((a) => a.url === 'https://www.hudl.com/profile/25154237')!;
    expect(mitty.sports).toEqual(['field-hockey', 'soccer']);
    expect(mitty.linkedBy).toEqual([
      { build: 'field-hockey', list: 'varsity' },
      { build: 'soccer', list: 'varsity' },
    ]);
  });

  it('refuses a page on the wrong host, an unreadable URL, a page shared by two people and a person listed twice', () => {
    const ok = withPeople([person('p0000000001', [page({})])]);
    expect(AccountsFileSchema.safeParse(ok).success).toBe(true);
    expect(AccountSchema.safeParse(page({ url: 'https://my.sportsrecruits.com/athlete/a_b' })).success).toBe(false);
    expect(AccountSchema.safeParse(page({ platform: 'personal', url: 'https://?broken' })).success).toBe(false);
    expect(AccountsFileSchema.safeParse(withPeople([person('p0000000001', [page({})]), person('p0000000002', [page({})])])).success).toBe(false);
    expect(AccountsFileSchema.safeParse(withPeople([person('p0000000001', [page({})]), person('p0000000001', [page({ url: `${page({}).url}2` })])])).success).toBe(false);
    // In id order, so a rebuild writes the same bytes.
    expect(AccountsFileSchema.safeParse(withPeople([person('p0000000002', [page({})]), person('p0000000001', [page({ url: `${page({}).url}2` })])])).success).toBe(false);
  });

  it('takes one page per platform in each sport, names every page\'s sports but a MaxPreps career page\'s, and keeps MAX Field Hockey to field hockey', () => {
    const sr = (url: string, sports: string[]) => page({ platform: 'sportsrecruits', url, sports });
    expect(
      AccountsFileSchema.safeParse(
        withPeople([person('p0000000001', [sr('https://nfhca.sportsrecruits.com/athlete/a', ['field-hockey']), sr('https://iwlca.sportsrecruits.com/athlete/a', ['lacrosse'])])]),
      ).success,
    ).toBe(true);
    expect(
      AccountsFileSchema.safeParse(
        withPeople([person('p0000000001', [sr('https://iwlca.sportsrecruits.com/athlete/a', ['lacrosse']), sr('https://iwlca.sportsrecruits.com/athlete/b', ['lacrosse', 'soccer'])])]),
      ).success,
    ).toBe(false);
    expect(AccountSchema.safeParse(page({ sports: undefined })).success).toBe(false);
    const maxpreps = { platform: 'maxpreps', url: 'https://www.maxpreps.com/ca/x/y/athletes/a-b/?careerid=abc123', linkedBy: [{ build: 'field-hockey', list: 'varsity' }], classOf: null, note: null };
    expect(AccountSchema.safeParse(maxpreps).success).toBe(true);
    expect(AccountSchema.safeParse({ ...maxpreps, sports: ['lacrosse'] }).success).toBe(false);
    expect(AccountSchema.safeParse({ ...maxpreps, url: 'https://www.maxpreps.com/ca/x/y/athletes/a-b/' }).success).toBe(false);
    expect(AccountSchema.safeParse({ ...maxpreps, url: 'https://www.ncsasports.org/x?careerid=abc123' }).success).toBe(false);
    expect(AccountSchema.safeParse(page({ platform: 'maxfh', url: 'https://maxfh.longstreth.com/athlete/?Athlete_ID=1', sports: ['soccer'] })).success).toBe(false);
    expect(AccountSchema.safeParse(page({ linkedBy: [] })).success).toBe(false);
    expect(maxPrepsCareerId(maxpreps.url)).toBe('abc123');
  });
});

describe('what this build shows of them', () => {
  const rows = getAllEnrichedRosters().flatMap((t) => t.players.map((p) => ({ t, p })));

  it('shows a MaxPreps career page only on a row of its own career', () => {
    const shown = rows.flatMap(({ t, p }) => p.profiles.filter((x) => x.platform === 'maxpreps').map((x) => ({ t, p, x })));
    expect(shown.length).toBeGreaterThan(200);
    for (const { t, p, x } of shown) expect(isCareerPage(x.url, p.careerId), `${t.slug} / ${p.fullName}`).toBe(true);
  });

  it('names a page\'s sport only when the page does not show the player in this build\'s', () => {
    const named = (a: AccountsFile['players'][number]['accounts'][number]) => a.sports !== undefined && !a.sports.includes('field-hockey');
    for (const p of file.players) {
      if (rowsOfPerson(p.playerId).length === 0) continue;
      const shown = accountsOfPerson(p.playerId);
      expect(shown.map((x) => x.url)).toEqual(p.accounts.map((a) => a.url));
      p.accounts.forEach((a, i) => expect(shown[i].sport !== undefined, a.url).toBe(named(a)));
    }
  });
});
