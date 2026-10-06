/**
 * Transports and the corpus (SPEC §7.3): the manifest schema and variant overlays, FixtureTransport
 * (files, HTTP-status entries, missing keys, hash bodies), RecordingTransport into a temp dir and
 * its replay, LiveTransport over injected clients (never the network), and MeteredTransport.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_QUALITY, LEAGUES, getDivision, getLeague } from '../../lib/leagues';
import {
  FixtureMissing,
  TransportError,
  resourcePath,
  type RawResponse,
  type ResourceKey,
  type Transport,
} from '../../lib/pipeline/contract';
import { loadCorpus, readManifest } from '../../lib/pipeline/corpus';
import {
  FixtureTransport,
  LiveTransport,
  MeteredTransport,
  RecordingTransport,
  hostOf,
  recordedExtension,
  resourceUrl,
} from '../../lib/pipeline/transport';
import { officialDocumentOf } from '../../lib/official/schema';
import { officialChangesCellText, sha256Hex, tdCellBodies } from '../../lib/official/validate';
import { BOOTSTRAP_URL } from '../../lib/season';
import { HttpError, type HttpResponse } from '../../lib/sources/http';
import { MaxPrepsError } from '../../lib/sources/maxpreps';
import { ALL_DIVISIONS } from '../../lib/leagues';
import { TEAMS, getTeamBySlug } from '../../lib/teams';
import { REPO, corpusDir, variantDir } from '../helpers';

const ALL = corpusDir('all-2026-10-02');
const SCVAL = corpusDir('scval');
const MISSION = Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)[0];

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `scvalfh-${prefix}-`));
}

function writeVariant(files: Record<string, unknown>, manifest: Record<string, unknown>): string {
  const dir = tempDir('variant');
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  return dir;
}

/** Every resource key the cron can ask for, one per kind and configured scope. */
function everyKey(): ResourceKey[] {
  const keys: ResourceKey[] = [{ kind: 'maxpreps-bootstrap' }];
  for (const d of ALL_DIVISIONS) {
    // A division MaxPreps publishes no table for (maxprepsLeagueId null: the San Diego Valley) is
    // never requested: steps 03 and 04 skip it, so the cron cannot ask for these two keys.
    if (d.maxprepsLeagueId !== null) {
      keys.push({ kind: 'maxpreps-league-meta', division: d.id }, { kind: 'maxpreps-standings', division: d.id });
    }
    if (d.official.mode === 'live-pdf') keys.push({ kind: 'scval-pdf-text', division: d.id });
    if (d.official.mode === 'bundled' && d.official.revisionCheckUrl) keys.push({ kind: 'official-revision', division: d.id });
  }
  for (const t of TEAMS) keys.push({ kind: 'maxpreps-schedule', team: t.slug });
  for (const l of LEAGUES) if (l.officialChanges) keys.push({ kind: 'official-changes', league: l.id });
  keys.push({ kind: 'scval-standings-index' }, { kind: 'sblive-scores', date: '2026-09-30' }, { kind: 'ccs-ical' }, { kind: 'ccs-bracket' });
  keys.push({ kind: 'vnn-ics', team: 'palo-alto' }, { kind: 'sblive-team-games', team: 'carmel' });
  return keys;
}

describe('the corpus manifest', () => {
  it('validates both committed corpora', () => {
    expect(readManifest(SCVAL)).toMatchObject({ id: 'scval-2026-09-29', leagues: ['scval'] });
    const all = readManifest(ALL);
    expect(all.leagues).toEqual(['scval', 'bval', 'pcal', 'mcal']);
    expect(Object.keys(all.files).filter((k) => k.startsWith('maxpreps/schedule/')).length).toBe(43);
  });

  it('rejects a malformed manifest and a manifest naming a missing file', () => {
    const bad = writeVariant({}, { id: 'x', fetchedAt: 'yesterday', leagues: ['scval'], files: {} });
    expect(() => readManifest(bad)).toThrow(/invalid manifest/);
    const missing = writeVariant({}, { id: 'x', fetchedAt: '2026-10-02T15:00:00.000Z', leagues: ['scval'], files: { 'ccs/ical': 'nope.ics' } });
    expect(() => loadCorpus(missing)).toThrow(/missing file/);
  });

  it('applies variants in order: replace, add, remove (null), previous override, ids appended', () => {
    const a = writeVariant(
      { 'cal.ics': 'BEGIN:VCALENDAR\nEND:VCALENDAR\n', 'prev.json': '{}' },
      { id: 'a', files: { 'ccs/ical': 'cal.ics', 'maxpreps/schedule/leland': 503 }, previous: 'prev.json' },
    );
    const b = writeVariant({}, { files: { 'maxpreps/schedule/leland': null, 'maxpreps/standings/pcal': 400 } });
    const corpus = loadCorpus(ALL, [a, b]);
    expect(corpus.id).toBe(`all-2026-10-02+a+${path.basename(b)}`);
    expect(corpus.entries.get('ccs/ical')).toEqual({ kind: 'file', file: path.join(a, 'cal.ics') });
    expect(corpus.entries.has('maxpreps/schedule/leland')).toBe(false);
    expect(corpus.entries.get('maxpreps/standings/pcal')).toEqual({ kind: 'status', httpStatus: 400 });
    expect(corpus.previous).toBe(path.join(a, 'prev.json'));
    expect(corpus.fetchedAt).toBe('2026-10-02T15:00:00.000Z');
  });

  it('resolves `../` paths relative to the manifest (the SCVAL corpus PDF texts)', () => {
    const corpus = loadCorpus(SCVAL);
    expect(corpus.entries.get('scval/pdf-text/de-anza')).toEqual({
      kind: 'file',
      file: path.join(REPO, 'tests', 'fixtures', 'scval', 'da-pdftotext.txt'),
    });
  });
});

describe('FixtureTransport', () => {
  const t = new FixtureTransport(loadCorpus(ALL));

  it('serves a file with the live URL and the capture stamp', async () => {
    const res = await t.get({ kind: 'maxpreps-schedule', team: 'leigh' });
    expect(res.httpStatus).toBe(200);
    expect(res.url).toBe(resourceUrl({ kind: 'maxpreps-schedule', team: 'leigh' }));
    expect(res.url).toContain(getTeamBySlug('leigh')?.id);
    expect(res.upstreamModifiedOn).toBe('2026-10-02T13:43:00Z');
    expect(JSON.parse(res.body)).toHaveProperty('data');
  });

  it('throws FixtureMissing for a key the corpus lacks', async () => {
    await expect(t.get({ kind: 'maxpreps-bootstrap' })).rejects.toBeInstanceOf(FixtureMissing);
    await expect(t.get({ kind: 'ccs-ical' })).rejects.toThrow('not in corpus: ccs/ical');
  });

  it('serves an HTTP-status entry as a TransportError with that status', async () => {
    const v = new FixtureTransport(loadCorpus(ALL, [variantDir('leland-feed-503')]));
    const err = await v.get({ kind: 'maxpreps-schedule', team: 'leland' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect(err).toMatchObject({ httpStatus: 503, message: 'HTTP 503' });
  });

  it('serves hash resources as one bare lowercase hex string', async () => {
    for (const d of ['mt-hamilton', 'santa-teresa', 'pcal', 'marin-county']) {
      const res = await t.get({ kind: 'official-revision', division: d });
      expect(res.body, d).toBe(officialDocumentOf(d).bundledSha256);
    }
    expect((await t.get({ kind: 'official-changes', league: 'mcal' })).body).toBe(getLeague('mcal').officialChanges?.sha256);
  });
});

describe('the live resource map', () => {
  it('gives every key an http(s) URL and a host bucket, and never names the Mission league', () => {
    for (const key of everyKey()) {
      const url = resourceUrl(key);
      expect(url, resourcePath(key)).toMatch(/^https?:\/\//);
      expect(url).not.toContain(MISSION);
      expect(['maxpreps', 'sblive', 'official', 'other']).toContain(hostOf(key));
    }
    expect(resourceUrl({ kind: 'maxpreps-bootstrap' })).toBe(BOOTSTRAP_URL);
    expect(resourceUrl({ kind: 'maxpreps-league-meta', division: 'pcal' })).toContain(getDivision('pcal').maxprepsLeagueId);
    expect(resourceUrl({ kind: 'sblive-team-games', team: 'carmel' })).toBe(getTeamBySlug('carmel')?.external.sbliveGamesUrl);
  });

  it('the live MaxPreps sweep is 128 resources: 1 bootstrap + 14 metas + 14 tables + 99 schedules', () => {
    const maxpreps = everyKey().filter((k) => k.kind.startsWith('maxpreps-'));
    const count = (kind: ResourceKey['kind']) => maxpreps.filter((k) => k.kind === kind).length;
    // 15 divisions, of which one (the San Diego Valley) has no MaxPreps table (DESIGN-socal §2.1.7).
    const withTable = ALL_DIVISIONS.filter((d) => d.maxprepsLeagueId !== null);
    expect(ALL_DIVISIONS.map((d) => d.id).filter((id) => !withTable.some((d) => d.id === id))).toEqual(['valley']);
    expect([count('maxpreps-bootstrap'), count('maxpreps-league-meta'), count('maxpreps-standings'), count('maxpreps-schedule')]).toEqual([
      1, 14, 14, 99,
    ]);
    expect(maxpreps.length).toBe(128);
    expect(maxpreps.length).toBe(1 + withTable.length * 2 + TEAMS.length);
  });

  it('refuses to build a MaxPreps URL for a division with no table (never /leagues/null/v1)', () => {
    expect(getDivision('valley').maxprepsLeagueId).toBeNull();
    for (const kind of ['maxpreps-league-meta', 'maxpreps-standings'] as const) {
      expect(() => resourceUrl({ kind, division: 'valley' })).toThrow(/MaxPreps publishes no table for valley/);
    }
  });

  it('has no official URL for a division whose league publishes no schedule (EAL)', () => {
    expect(getDivision('eal').official.mode).toBe('none');
    expect(() => resourceUrl({ kind: 'official-revision', division: 'eal' })).toThrow(/eal has no revision-check URL/);
    expect(() => resourceUrl({ kind: 'scval-pdf-text', division: 'eal' })).toThrow(/eal publishes no official schedule/);
  });

  it('extracts the MCAL officialChanges cell whose sha256 is the configured one', () => {
    const html = readFileSync(path.join(REPO, 'tests', 'fixtures', 'official', 'mcal-Schedir.htm'), 'utf8');
    const changes = getLeague('mcal').officialChanges;
    const cell = officialChangesCellText(html, changes?.cellMarker ?? '');
    expect(cell?.startsWith('Girls Field Hockey:')).toBe(true);
    expect(sha256Hex(cell ?? '')).toBe(changes?.sha256);
    expect(officialChangesCellText('<table><td>nothing</td></table>', 'Girls Field Hockey:')).toBeNull();
  });

  it('scans cells linearly: the same cells as the old regex, and no blow-up on a page without </td>', () => {
    const RE = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const viaRegex = (html: string) => [...html.matchAll(RE)].map((m) => m[1]);
    const tokens = ['<td', '<TD', '<tdx', '>', '</td>', '</TD>', '</td', '<', 'x', ' ', '<b>', '\n'];
    let x = 11;
    const next = () => ((x = (x * 1103515245 + 12345) >>> 0) % tokens.length);
    for (let n = 0; n < 500; n++) {
      const html = Array.from({ length: 1 + (n % 30) }, () => tokens[next()]).join('');
      expect([...tdCellBodies(html)], html).toEqual(viaRegex(html));
      const marker = 'x';
      const old = viaRegex(html)
        .map((b) => b.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim())
        .find((t) => t.includes(marker));
      expect(officialChangesCellText(html, marker), html).toBe(old ?? null);
    }
    const t0 = Date.now();
    expect(officialChangesCellText('<td>x'.repeat(200_000), 'Girls Field Hockey:')).toBeNull(); // 1 MB
    expect(officialChangesCellText(`<td>${'<'.repeat(500_000)}</td>`, 'Girls')).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

/** True when `url`'s host is maxpreps.com or one of its subdomains (a host check, not a substring). */
function isMaxprepsHost(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'maxpreps.com' || host.endsWith('.maxpreps.com');
}

describe('LiveTransport (injected clients, no network)', () => {
  function fakeHttp(log: string[], bodies: Record<string, string | Uint8Array | Error>) {
    const answer = <T>(url: string, kind: 'text' | 'bytes'): HttpResponse<T> => {
      log.push(`${kind} ${url}`);
      const body = bodies[url];
      if (body instanceof Error) throw body;
      if (body === undefined) throw new HttpError('HTTP 404', { url, httpStatus: 404 });
      return { body: body as T, url, httpStatus: 200, contentType: null, attempts: 1 };
    };
    return {
      text: async (url: string) => answer<string>(url, 'text'),
      bytes: async (url: string) => answer<Uint8Array>(url, 'bytes'),
    };
  }

  it('routes each kind to its client and maps failures to TransportError', async () => {
    const log: string[] = [];
    const maxpreps = {
      raw: async (url: string): Promise<RawResponse> => {
        log.push(`maxpreps ${url}`);
        if (url.includes(getTeamBySlug('leland')?.id ?? '?')) throw new MaxPrepsError('HTTP 503', { url, httpStatus: 503 });
        return { url, httpStatus: 200, body: '{"data":[]}' };
      },
    };
    const doc = new TextEncoder().encode('the BVAL schedule document');
    const mh = officialDocumentOf('mt-hamilton').revisionCheckUrl as string;
    const schedir = readFileSync(path.join(REPO, 'tests', 'fixtures', 'official', 'mcal-Schedir.htm'), 'utf8');
    const http = fakeHttp(log, {
      [mh]: doc,
      [officialDocumentOf('de-anza').scheduleUrl]: new TextEncoder().encode('%PDF'),
      [getLeague('mcal').officialChanges?.url as string]: schedir,
      [resourceUrl({ kind: 'ccs-ical' })]: 'BEGIN:VCALENDAR',
    });
    const sblive = fakeHttp(log, { [resourceUrl({ kind: 'sblive-scores', date: '2026-09-30' })]: '<html>scores</html>' });
    const t = new LiveTransport({ maxpreps, http, sblive, pdfToText: (b) => `text of ${b.byteLength} bytes` });

    expect((await t.get({ kind: 'maxpreps-standings', division: 'marin-county' })).url).toBe(
      resourceUrl({ kind: 'maxpreps-standings', division: 'marin-county' }),
    );
    expect((await t.get({ kind: 'official-revision', division: 'mt-hamilton' })).body).toBe(sha256Hex(doc));
    expect((await t.get({ kind: 'official-changes', league: 'mcal' })).body).toBe(getLeague('mcal').officialChanges?.sha256);
    expect((await t.get({ kind: 'scval-pdf-text', division: 'de-anza' })).body).toBe('text of 4 bytes');
    expect((await t.get({ kind: 'sblive-scores', date: '2026-09-30' })).body).toBe('<html>scores</html>');
    expect((await t.get({ kind: 'ccs-ical' })).body).toBe('BEGIN:VCALENDAR');

    await expect(t.get({ kind: 'maxpreps-schedule', team: 'leland' })).rejects.toMatchObject({ httpStatus: 503 });
    await expect(t.get({ kind: 'maxpreps-schedule', team: 'leland' })).rejects.toBeInstanceOf(TransportError);
    await expect(t.get({ kind: 'ccs-bracket' })).rejects.toMatchObject({ httpStatus: 404 });
    // A team with no recorded si.com page is never guessed.
    const noPage = TEAMS.find((x) => !x.external.sbliveGamesUrl);
    if (noPage) await expect(t.get({ kind: 'sblive-team-games', team: noPage.slug })).rejects.toBeInstanceOf(TransportError);

    // si.com went through its own client; MaxPreps through MaxPrepsClient.raw only.
    expect(log.filter((l) => l.startsWith('text https://www.si.com'))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('maxpreps ')).every((l) => isMaxprepsHost(l.slice('maxpreps '.length)))).toBe(true);
  });
});

describe('RecordingTransport', () => {
  it('records every response (and HTTP failures as their status) into a corpus a FixtureTransport replays', async () => {
    const source = new FixtureTransport(loadCorpus(ALL, [variantDir('leland-feed-503')]));
    const out = tempDir('capture');
    const rec = new RecordingTransport(source, out, { id: 'capture-test', fetchedAt: '2026-10-02T15:00:00.000Z', leagues: ['bval'] });
    const keys: ResourceKey[] = [
      { kind: 'maxpreps-league-meta', division: 'mt-hamilton' },
      { kind: 'maxpreps-schedule', team: 'leigh' },
      { kind: 'official-revision', division: 'mt-hamilton' },
      { kind: 'sblive-scores', date: '2026-09-30' },
    ];
    for (const key of keys) await rec.get(key);
    await expect(rec.get({ kind: 'maxpreps-schedule', team: 'leland' })).rejects.toMatchObject({ httpStatus: 503 });
    await expect(rec.get({ kind: 'ccs-ical' })).rejects.toBeInstanceOf(FixtureMissing);

    const manifest = readManifest(out);
    expect(manifest).toMatchObject({ id: 'capture-test', leagues: ['bval'] });
    expect(manifest.files['maxpreps/schedule/leland']).toBe(503);
    expect(manifest.files['ccs/ical']).toBeUndefined();
    expect(manifest.files['maxpreps/schedule/leigh']).toBe(`maxpreps/schedule/leigh${recordedExtension(keys[1])}`);
    expect(manifest.files['sblive/scores/2026-09-30']).toBe('sblive/scores/2026-09-30.html');
    expect(manifest.files['official/revision/mt-hamilton']).toBe('official/revision/mt-hamilton.txt');

    const replay = new FixtureTransport(loadCorpus(out));
    for (const key of keys) {
      expect((await replay.get(key)).body, resourcePath(key)).toBe((await source.get(key)).body);
    }
    await expect(replay.get({ kind: 'maxpreps-schedule', team: 'leland' })).rejects.toMatchObject({ httpStatus: 503 });
  });
});

describe('MeteredTransport', () => {
  it('counts every request per host and logs each MaxPreps URL', async () => {
    const lines: string[] = [];
    const inner: Transport = {
      mode: 'fixture',
      get: async (key) => {
        if (key.kind === 'ccs-ical') throw new FixtureMissing(key);
        return { url: resourceUrl(key), httpStatus: 200, body: '' };
      },
    };
    const t = new MeteredTransport(inner, (l) => lines.push(l));
    await t.get({ kind: 'maxpreps-bootstrap' });
    await t.get({ kind: 'maxpreps-schedule', team: 'tamalpais' });
    await t.get({ kind: 'sblive-scores', date: '2026-09-23' });
    await t.get({ kind: 'official-revision', division: 'pcal' });
    await expect(t.get({ kind: 'ccs-ical' })).rejects.toBeInstanceOf(FixtureMissing);
    expect(t.counts).toEqual({ maxpreps: 2, sblive: 1, official: 1, other: 1 });
    expect(t.mode).toBe('fixture');
    expect(t.requested).toEqual(['maxpreps/bootstrap', 'maxpreps/schedule/tamalpais', 'sblive/scores/2026-09-23', 'official/revision/pcal', 'ccs/ical']);
    expect(lines).toEqual([
      `maxpreps GET ${BOOTSTRAP_URL}`,
      `maxpreps GET ${resourceUrl({ kind: 'maxpreps-schedule', team: 'tamalpais' })}`,
    ]);
  });
});
