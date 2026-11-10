/**
 * Transports (SPEC §7.3): where a pipeline step's raw bytes come from.
 *
 *  - LiveTransport      the network, through the frozen live resource map only (below, held as the
 *                       RESOURCES table of lib/pipeline/resources.ts);
 *  - FixtureTransport   a manifest-driven corpus (lib/pipeline/corpus.ts) with variant overlays;
 *  - RecordingTransport wraps another transport and writes every response into a new corpus;
 *  - MeteredTransport   wraps any of them: counts requests per host and logs every MaxPreps URL as
 *                       `maxpreps GET <url>` (so the 128-request budget and the never-requested
 *                       Mission league id can be grepped from a run log, live or offline).
 *
 * Live resource map (frozen at the end of Stage A):
 *   maxpreps-*            maxprepsLeagueMetaUrl / maxprepsStandingsUrl / maxprepsScheduleUrl (lib/sources/maxpreps.ts) → MaxPrepsClient.raw (its gate, retries, UA)
 *   scval-pdf-text        scvalScheduleUrl(d) (config official.scheduleUrl) → HttpClient.bytes → pdfToText
 *   scval-standings-index SCVAL_STANDINGS_INDEX → HttpClient.text
 *   official-revision     getDivision(d).official.revisionCheckUrl (bundled only) → bytes → sha256 hex
 *   official-changes      getLeague(l).officialChanges.url → text → officialChanges cell → sha256 hex
 *   sblive-*              sbliveScoresUrl(date) / the registry's si.com team page → HttpClient(SBLIVE_HTTP_OPTIONS)
 *   vnn-ics               vnnIcsUrl(VNN_SITE_IDS[team].siteId) → HttpClient.text
 *   ccs-ical, ccs-bracket CCS_ICAL_URL, CCS.bracketUrl → HttpClient.text
 *   cifss-scores          cifssListingUrl(section, season start → through, page) → HttpClient.text
 *   sds-bracket-sheet     sdsBracketSheetCsvUrl(division) (the Section's bracket sheet, one tab as CSV) → HttpClient.text
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HttpClient, HttpError, type HttpClientOptions } from '../sources/http';
import { MaxPrepsClient, MaxPrepsError } from '../sources/maxpreps';
import { SBLIVE_HTTP_OPTIONS } from '../sources/sblive';
import { pdfToText } from '../sources/scval-pdf';
import {
  FixtureMissing,
  TransportError,
  resourcePath,
  type RawResponse,
  type ResourceKey,
  type Transport,
} from './contract';
import type { Corpus } from './corpus';
import { specOf, type TextClient } from './resources';

// ---------------------------------------------------------------- the resource map

export type RequestHost = 'maxpreps' | 'sblive' | 'official' | 'other';

/** Which budget a resource counts against (the summary line's `requests maxpreps:<n> sblive:<n> official:<n>`). */
export function hostOf(key: ResourceKey): RequestHost {
  return specOf(key).host;
}

/**
 * The upstream URL of a resource, from the live resource map (lib/pipeline/resources.ts). Pure: used
 * by LiveTransport to fetch and by every other transport to label what it serves. Throws only for a
 * key the configuration cannot address (an unknown slug, a division with no revision-check URL).
 */
export function resourceUrl(key: ResourceKey): string {
  return specOf(key).url(key);
}

/** Like resourceUrl, but never throws (for labels and logs). */
export function resourceUrlOrNull(key: ResourceKey): string | null {
  try {
    return resourceUrl(key);
  } catch {
    return null;
  }
}

/** Bodies that are hashes by contract (§7.2): served and recorded as one bare hex line. */
function isHashResource(key: ResourceKey): boolean {
  return specOf(key).hashBody === true;
}

// ---------------------------------------------------------------- live

export interface LiveTransportOptions {
  /** MaxPreps reads (default: a MaxPrepsClient, ≤3 concurrent, ≥500 ms spacing). */
  maxpreps?: Pick<MaxPrepsClient, 'raw'>;
  /** scval.com, Drive, pcalathletics.org, mcalsports.org, VNN, cifccs.org, cifsshome.org. */
  http?: TextClient;
  /** si.com (Chrome UA and its own spacing: SBLIVE_HTTP_OPTIONS). */
  sblive?: TextClient;
  /** pdftotext over the SCVAL grid PDF bytes. */
  pdfToText?: (bytes: Uint8Array) => string;
  onLog?: (line: string) => void;
}

function asTransportError(err: unknown, url: string): TransportError {
  if (err instanceof TransportError) return err;
  if (err instanceof MaxPrepsError || err instanceof HttpError) {
    return new TransportError(err.message, url, err.httpStatus ?? null);
  }
  return new TransportError((err as Error)?.message || String(err), url, null);
}

export class LiveTransport implements Transport {
  readonly mode = 'live' as const;
  private readonly maxpreps: Pick<MaxPrepsClient, 'raw'>;
  private readonly http: TextClient;
  private readonly sblive: TextClient;
  private readonly toText: (bytes: Uint8Array) => string;

  constructor(opts: LiveTransportOptions = {}) {
    const onLog = opts.onLog ?? (() => {});
    this.maxpreps = opts.maxpreps ?? new MaxPrepsClient({ onLog: (l) => onLog(`  ${l}`) });
    this.http = opts.http ?? new HttpClient({ onLog: (l) => onLog(`  ${l}`) });
    const sbliveOptions: HttpClientOptions = { ...SBLIVE_HTTP_OPTIONS, onLog: (l) => onLog(`  ${l}`) };
    this.sblive = opts.sblive ?? new HttpClient(sbliveOptions);
    this.toText = opts.pdfToText ?? pdfToText;
  }

  async get(key: ResourceKey): Promise<RawResponse> {
    let url: string;
    try {
      url = resourceUrl(key);
    } catch (err) {
      throw new TransportError((err as Error).message, '', null);
    }
    try {
      return await specOf(key).fetch(
        { maxpreps: this.maxpreps, http: this.http, sblive: this.sblive, toText: (b) => this.toText(b) },
        url,
        key,
      );
    } catch (err) {
      throw asTransportError(err, url);
    }
  }
}

// ---------------------------------------------------------------- fixture

export class FixtureTransport implements Transport {
  readonly mode = 'fixture' as const;

  constructor(readonly corpus: Corpus) {}

  async get(key: ResourceKey): Promise<RawResponse> {
    const entry = this.corpus.entries.get(resourcePath(key));
    const url = resourceUrlOrNull(key) ?? `https://corpus.invalid/${resourcePath(key)}`;
    if (!entry) throw new FixtureMissing(key);
    if (entry.kind === 'status') {
      throw new TransportError(`HTTP ${entry.httpStatus}`, url, entry.httpStatus);
    }
    const raw = readFileSync(entry.file, 'utf8');
    return {
      url,
      httpStatus: 200,
      body: isHashResource(key) ? raw.trim() : raw,
      ...(entry.capturedAt ? { upstreamModifiedOn: entry.capturedAt } : {}),
    };
  }
}

// ---------------------------------------------------------------- recording

export interface RecordingOptions {
  id: string;
  fetchedAt: string;
  leagues: readonly string[];
  note?: string;
}

/** File extension of a recorded resource (SPEC §7.3). */
export function recordedExtension(key: ResourceKey): string {
  return specOf(key).ext;
}

/**
 * Wraps another transport and writes every response it serves into `outDir` as a new corpus:
 * `<outDir>/<resourcePath>.<ext>` plus its manifest entry (an HTTP failure is recorded as its
 * status number, so a replay reproduces it). The manifest is rewritten after every response, so
 * an interrupted run still leaves a readable corpus.
 */
export class RecordingTransport implements Transport {
  readonly mode = 'recording' as const;
  private readonly files: Record<string, string | number> = {};
  private readonly capturedAt: Record<string, string> = {};

  constructor(
    private readonly inner: Transport,
    readonly outDir: string,
    private readonly opts: RecordingOptions,
  ) {
    mkdirSync(outDir, { recursive: true });
    this.writeManifest();
  }

  async get(key: ResourceKey): Promise<RawResponse> {
    const stem = resourcePath(key);
    try {
      const res = await this.inner.get(key);
      const rel = `${stem}${recordedExtension(key)}`;
      const file = path.join(this.outDir, rel);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, isHashResource(key) ? `${res.body.trim()}\n` : res.body, 'utf8');
      this.files[stem] = rel;
      this.capturedAt[stem] = this.opts.fetchedAt;
      this.writeManifest();
      return res;
    } catch (err) {
      if (err instanceof TransportError && err.httpStatus !== null && err.httpStatus >= 100) {
        this.files[stem] = err.httpStatus;
        this.writeManifest();
      }
      throw err;
    }
  }

  private writeManifest(): void {
    const sortedFiles = Object.fromEntries(Object.entries(this.files).sort(([a], [b]) => a.localeCompare(b)));
    const sortedCaptured = Object.fromEntries(Object.entries(this.capturedAt).sort(([a], [b]) => a.localeCompare(b)));
    const manifest = {
      id: this.opts.id,
      fetchedAt: this.opts.fetchedAt,
      leagues: [...this.opts.leagues],
      ...(this.opts.note ? { note: this.opts.note } : {}),
      files: sortedFiles,
      capturedAt: sortedCaptured,
    };
    writeFileSync(path.join(this.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
}

// ---------------------------------------------------------------- metering

export type RequestCounts = Record<RequestHost, number>;

/**
 * Counts every resource requested (successful or not) per host and logs each MaxPreps request as
 * `maxpreps GET <url>`. Applied to every transport the pipeline uses, so an offline run reports the
 * same request shape a live run would.
 */
export class MeteredTransport implements Transport {
  readonly counts: RequestCounts = { maxpreps: 0, sblive: 0, official: 0, other: 0 };
  /** resourcePath of every request, in request order. */
  readonly requested: string[] = [];

  constructor(
    private readonly inner: Transport,
    private readonly log: (line: string) => void = () => {},
  ) {}

  get mode(): Transport['mode'] {
    return this.inner.mode;
  }

  async get(key: ResourceKey): Promise<RawResponse> {
    const host = hostOf(key);
    this.counts[host] += 1;
    this.requested.push(resourcePath(key));
    if (host === 'maxpreps') this.log(`maxpreps GET ${resourceUrlOrNull(key) ?? resourcePath(key)}`);
    return this.inner.get(key);
  }
}
