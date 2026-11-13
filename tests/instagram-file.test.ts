/**
 * data/instagram.json (lib/social/instagram.ts): the committed file loads and keeps every invariant, the
 * soccer and basketball placeholders parse, and a bad file — built in memory from the real one, never
 * written to disk — is refused at load with a message naming the list, the slug and what is wrong.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getClub } from '../lib/players/clubs';
import { isBannedHost } from '../lib/players/clubs-schema';
import { isHttpsUrl } from '../lib/schema-primitives';
import {
  InstagramFileSchema,
  getClubInstagram,
  getInstagramFile,
  getTeamInstagram,
  instagramUrl,
  loadInstagram,
  type InstagramFile,
} from '../lib/social/instagram';
import { getTeamBySlug } from '../lib/teams';
import { REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'instagram.json'), 'utf8')) as InstagramFile;
const copy = (): InstagramFile => structuredClone(raw);

describe('data/instagram.json', () => {
  const file = getInstagramFile();

  it('loads, with at least one team and one club account', () => {
    expect(file.teams.length).toBeGreaterThan(0);
    expect(file.clubs.length).toBeGreaterThan(0);
  });

  it('names only registry teams and data/clubs.json clubs, each once', () => {
    for (const a of file.teams) expect(getTeamBySlug(a.slug), a.slug).toBeDefined();
    for (const a of file.clubs) expect(getClub(a.slug), a.slug).toBeDefined();
    expect(new Set(file.teams.map((a) => `${a.slug} ${a.level}`)).size).toBe(file.teams.length);
    const handles = [...file.teams, ...file.clubs].map((a) => a.handle);
    expect(new Set(handles).size).toBe(handles.length);
    expect(new Set(file.clubs.map((a) => a.slug)).size).toBe(file.clubs.length);
  });

  it('cites, where it cites one, an https page that is not social media', () => {
    for (const a of [...file.teams, ...file.clubs]) {
      if (a.foundAt === null) continue;
      expect(isHttpsUrl(a.foundAt), a.slug).toBe(true);
      expect(isBannedHost(a.foundAt), a.slug).toBe(false);
    }
  });

  it('serves each account by slug, and a profile address per handle', () => {
    const team = file.teams.find((a) => a.level === 'varsity')!;
    expect(getTeamInstagram(team.slug)).toEqual(team);
    expect(getTeamInstagram(team.slug, 'varsity')).toEqual(team);
    const jv = file.teams.find((a) => a.level === 'jv');
    if (jv) expect(getTeamInstagram(jv.slug, 'jv')).toEqual(jv);
    expect(getClubInstagram(file.clubs[0]!.slug)).toEqual(file.clubs[0]);
    expect(getTeamInstagram('no-such-team')).toBeNull();
    expect(getClubInstagram('no-such-club')).toBeNull();
    expect(instagramUrl('flyfhc')).toBe('https://www.instagram.com/flyfhc/');
  });

  it('parses the soccer and basketball placeholders', () => {
    for (const sport of ['soccer', 'basketball']) {
      const f = JSON.parse(readFileSync(path.join(REPO, 'data', sport, 'instagram.json'), 'utf8')) as unknown;
      expect(InstagramFileSchema.safeParse(f).success, sport).toBe(true);
    }
  });
});

describe('loadInstagram refuses a bad file', () => {
  it('a handle with an @, a capital or a space', () => {
    for (const handle of ['@flyfhc', 'FlyFHC', 'fly fhc', '']) {
      const f = copy();
      f.clubs[0]!.handle = handle;
      expect(() => loadInstagram(f), handle).toThrow(/Instagram username/);
    }
  });

  it('a foundAt page on social media, or not https', () => {
    const f = copy();
    f.teams[0]!.foundAt = 'https://www.instagram.com/someteam/';
    expect(() => loadInstagram(f)).toThrow(/social media is not a source/);
    const g = copy();
    g.teams[0]!.foundAt = 'http://example.com/';
    expect(() => loadInstagram(g)).toThrow(/https/);
  });

  it('a slug that is not a team or a club, or one listed twice', () => {
    const f = copy();
    f.teams[0]!.slug = 'no-such-team';
    expect(() => loadInstagram(f)).toThrow('data/instagram.json: teams no-such-team: not a registry team');
    const g = copy();
    g.clubs[0]!.slug = 'no-such-club';
    expect(() => loadInstagram(g)).toThrow('data/instagram.json: clubs no-such-club: not a club in data/clubs.json');
    const h = copy();
    h.teams.push({ ...h.teams[0]!, handle: 'another.handle' });
    expect(() => loadInstagram(h)).toThrow(/listed twice/);
  });

  it('a handle two records share, or a level that is not varsity or jv', () => {
    const f = copy();
    f.teams.push({ ...f.teams[0]!, level: f.teams[0]!.level === 'jv' ? 'varsity' : 'jv' });
    expect(() => loadInstagram(f)).toThrow(/is already/);
    const g = copy();
    (g.teams[0] as { level: string }).level = 'freshman';
    expect(() => loadInstagram(g)).toThrow();
  });

});
