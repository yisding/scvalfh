/**
 * data/club-events.json (DESIGN §34): the committed file validates and every club it names is in
 * data/clubs.json; lib/players/club-events.ts serves it in calendar order; and a bad file — built in
 * memory from the real one, never written to disk — is refused with a message that names what is
 * wrong.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ClubEventsFileSchema, lastDay, type ClubEventsFile } from '../lib/players/club-events-schema';
import { getClubEvents, getClubEventsFile, getClubEventsFor, getClubEventsLastChecked, loadClubEvents } from '../lib/players/club-events';
import { getClub } from '../lib/players/clubs';
import { REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'club-events.json'), 'utf8')) as ClubEventsFile;

function bad(edit: (f: ClubEventsFile) => void): () => ClubEventsFile {
  const copy = structuredClone(raw);
  edit(copy);
  return () => loadClubEvents(copy);
}

describe('data/club-events.json', () => {
  it('validates, and every club it names is a club in data/clubs.json', () => {
    expect(ClubEventsFileSchema.safeParse(raw).success).toBe(true);
    for (const e of raw.events) {
      if (e.hostClub) expect(getClub(e.hostClub), `${e.id} host`).toBeDefined();
      for (const slug of e.clubs) expect(getClub(slug), `${e.id} ${slug}`).toBeDefined();
    }
  });

  it('cites no social media and only https pages', () => {
    for (const e of raw.events) {
      for (const url of [e.url, e.fixturesUrl, e.registrationUrl, ...e.sources.map((s) => s.url)]) {
        if (url) expect(url.startsWith('https://'), `${e.id} ${url}`).toBe(true);
      }
    }
  });

  it('is served in calendar order: dated events by first day, then those with no dates posted', () => {
    const events = getClubEvents();
    expect(events).toHaveLength(raw.events.length);
    const dated = events.filter((e) => e.start !== null);
    const undated = events.filter((e) => e.start === null);
    expect(events.slice(0, dated.length)).toEqual(dated);
    for (let i = 1; i < dated.length; i++) expect(dated[i - 1].start! <= dated[i].start!).toBe(true);
    expect(undated.every((e) => e.dateStatus === 'expected' && e.expectedWhen !== null)).toBe(true);
  });

  it('gives each club its hosted and entered events', () => {
    for (const e of raw.events) {
      for (const slug of [...(e.hostClub ? [e.hostClub] : []), ...e.clubs]) {
        expect(getClubEventsFor(slug).map((x) => x.id)).toContain(e.id);
      }
    }
    expect(getClubEventsFor('no-such-club')).toEqual([]);
  });

  it('dates the file by its capturedAt or a later check', () => {
    expect(getClubEventsLastChecked() >= getClubEventsFile().capturedAt).toBe(true);
  });

  it('keeps every dated event’s last day on or after its first', () => {
    for (const e of raw.events) if (e.start) expect(lastDay(e)! >= e.start, e.id).toBe(true);
  });
});

describe('a bad file is refused', () => {
  const first = raw.events[0];

  it('names a duplicate id', () => {
    expect(bad((f) => f.events.push({ ...f.events[0] }))).toThrow(`duplicate event id ${first.id}`);
  });

  it('names a club that is not in data/clubs.json', () => {
    expect(bad((f) => (f.events[0].clubs = ['no-such-club']))).toThrow(`${first.id} names no-such-club`);
  });

  it('refuses social media as a source', () => {
    expect(bad((f) => (f.events[0].sources[0].url = 'https://www.instagram.com/x'))).toThrow('social media is not a source');
  });

  it('refuses an end before the start', () => {
    expect(
      bad((f) => {
        Object.assign(f.events[0], { dateStatus: 'confirmed', start: '2027-01-10', end: '2027-01-09', expectedWhen: null });
      }),
    ).toThrow('end 2027-01-09 is before start 2027-01-10');
  });

  it('refuses dates on an expected event, and an expected event that does not say when it runs', () => {
    expect(
      bad((f) => {
        Object.assign(f.events[0], { dateStatus: 'expected', start: '2027-01-10', end: null, expectedWhen: 'January' });
      }),
    ).toThrow('an expected event has no start');
    expect(
      bad((f) => {
        Object.assign(f.events[0], { dateStatus: 'expected', start: null, end: null, expectedWhen: null });
      }),
    ).toThrow('an expected event says when it usually runs');
  });

  it('refuses league days out of order', () => {
    expect(
      bad((f) => {
        Object.assign(f.events[0], {
          dateStatus: 'confirmed',
          start: '2027-04-01',
          end: '2027-05-31',
          expectedWhen: null,
          sessions: ['2027-04-19', '2027-04-12'],
        });
      }),
    ).toThrow('sessions are in order, each once');
  });
});
