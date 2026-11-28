import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isBannedHost } from '../lib/players/clubs-schema';
import { SchoolRosterSchema, getSchoolRoster } from '../lib/players/rosters';

/** Every recruiting build's enrichment file: each team's `schoolRoster` is the school's own varsity roster page. */
const SPORTS = ['field-hockey', 'soccer', 'basketball', 'volleyball'] as const;

function teams(sport: string): Array<{ slug: string; schoolRoster?: unknown }> {
  const file = path.join(__dirname, '..', 'data', sport, 'rosters-enrichment.json');
  return (JSON.parse(readFileSync(file, 'utf8')) as { teams: Array<{ slug: string; schoolRoster?: unknown }> }).teams;
}

describe('schoolRoster (the school’s own varsity roster page, owner decision 2026-11-28)', () => {
  for (const sport of SPORTS) {
    it(`${sport}: every entry validates, and a found page is the school's own`, () => {
      for (const t of teams(sport)) {
        if (t.schoolRoster === undefined) continue;
        const parsed = SchoolRosterSchema.safeParse(t.schoolRoster);
        expect(parsed.success, `${t.slug}: ${parsed.error?.issues[0]?.message ?? ''}`).toBe(true);
        if (!parsed.success || parsed.data.status !== 'found') continue;
        const host = new URL(parsed.data.url).hostname.toLowerCase();
        // Never MaxPreps (the roster it stands beside), social media, or a third party's roster: the domain or one under it.
        const onDomain = (domain: string) => host === domain || host.endsWith(`.${domain}`);
        expect(isBannedHost(parsed.data.url), `${t.slug}: ${host}`).toBe(false);
        for (const other of ['maxpreps.com', 'hudl.com', 'gamechanger.io', 'teamsnap.com']) expect(onDomain(other), `${t.slug}: ${host}`).toBe(false);
      }
    });
  }

  it('refuses a found page without a URL, a malformed season, and a none without a note', () => {
    const found = { status: 'found', checkedOn: '2026-11-28', url: 'https://example.org/roster', season: '2026-27', seasonEvidence: '2026-27 Varsity', listsPlayers: true };
    expect(SchoolRosterSchema.safeParse(found).success).toBe(true);
    expect(SchoolRosterSchema.safeParse({ ...found, season: null, seasonEvidence: null }).success).toBe(true); // a page with no season
    expect(SchoolRosterSchema.safeParse({ ...found, season: '2026' }).success).toBe(true);
    expect(SchoolRosterSchema.safeParse({ ...found, season: 'Winter 2026' }).success).toBe(false);
    expect(SchoolRosterSchema.safeParse({ ...found, url: undefined }).success).toBe(false);
    expect(SchoolRosterSchema.safeParse({ ...found, listsPlayers: false }).success).toBe(true); // set up, not yet filled
    expect(SchoolRosterSchema.safeParse({ ...found, listsPlayers: undefined }).success).toBe(false);
    expect(SchoolRosterSchema.safeParse({ ...found, players: [] }).success).toBe(false); // never a source of names
    expect(SchoolRosterSchema.safeParse({ status: 'none', checkedOn: '2026-11-28' }).success).toBe(false);
    expect(SchoolRosterSchema.safeParse({ status: 'none', checkedOn: '2026-11-28', note: 'No athletics pages.' }).success).toBe(true);
  });

  it('serves an unchecked team as null', () => {
    expect(getSchoolRoster('no-such-team')).toBeNull();
  });
});
