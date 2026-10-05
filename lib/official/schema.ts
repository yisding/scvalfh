/**
 * The bundled official-fixture files `data/official/{bval,pcal,mcal}-2026.json` (SPEC §7.8): their
 * Zod schema, the deterministic serializer the build script writes them with, and the loader the
 * cron and the tests read them through.
 *
 * A bundle is a faithful transcription of the league's own document: `away`/`home` hold the
 * source's tokens (BVAL: registry slugs; PCAL: grid codes such as `STE`; MCAL: legend codes such
 * as `AW`). They are resolved ONLY through the league's own scope (`resolveOfficialName`, which
 * reads `officialCodes`/`officialNames`), never through the global resolver, so a code like `CAT`
 * or `U` can never land on another league's team. The file is validated at load (schema, league,
 * documents against config, ids); the double-round-robin checks live in lib/official/validate.ts.
 *
 * Never edit the JSON by hand: `pnpm build-official-fixtures` writes it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { getDivision, getLeague, leagueOfDivision, type DivisionConfig } from '../leagues';
import { dateKey } from '../schema-primitives';
import { resolveOfficialName } from '../teams';
import {
  OFFICIAL_SOURCE_IDS,
  type DivisionId,
  type LeagueId,
  type OfficialFixture,
  type OfficialSourceId,
  type TeamSlug,
} from '../types';

export const OFFICIAL_BUNDLE_SCHEMA = 'scvalfh-official-fixtures/1';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24h)');

export const BundleDocumentSchema = z.strictObject({
  division: z.string().min(1),
  url: z.url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'expected a lowercase hex sha256'),
  /** The document's own revision text ("Revised 9/20/26"), when it prints one. */
  revisionMarker: z.string().min(1).nullable(),
});

export const BundleFixtureSchema = z.strictObject({
  /** `${division}:${date}:${awaySlug}@${homeSlug}` — the OfficialFixture id. */
  id: z.string().min(1),
  division: z.string().min(1),
  /** The official date (after any approved change). */
  date: dateKey,
  /** The originally published date when an approved change moved it (MCAL); else null. */
  originalDate: dateKey.nullable(),
  /** League-published varsity start. */
  time: HHMM.nullable(),
  /** Source token, resolved through the league scope only. */
  away: z.string().min(1),
  home: z.string().min(1),
  /** Source spelling, verbatim. */
  awayName: z.string().min(1),
  homeName: z.string().min(1),
});

export const BundleEventSchema = z.strictObject({
  kind: z.literal('play-in'),
  date: dateKey,
  time: HHMM.nullable(),
  verbatim: z.string().min(1),
});

export const OfficialBundleSchema = z.strictObject({
  schema: z.literal(OFFICIAL_BUNDLE_SCHEMA),
  league: z.string().min(1),
  source: z.enum(OFFICIAL_SOURCE_IDS),
  transcribedOn: dateKey,
  documents: z.array(BundleDocumentSchema).min(1),
  fixtures: z.array(BundleFixtureSchema).min(1),
  events: z.array(BundleEventSchema),
});

export type BundleDocument = z.infer<typeof BundleDocumentSchema>;
export type BundleFixture = z.infer<typeof BundleFixtureSchema>;
export type BundleEvent = z.infer<typeof BundleEventSchema>;
export type OfficialBundle = z.infer<typeof OfficialBundleSchema>;

/** THE OfficialFixture id rule (lib/types.ts): `${division}:${dateKey}:${awaySlug ?? awayName}@${homeSlug ?? homeName}`. */
export function officialFixtureId(
  division: DivisionId,
  dateKey: string,
  away: { slug: TeamSlug | null; name: string },
  home: { slug: TeamSlug | null; name: string },
): string {
  return `${division}:${dateKey}:${away.slug ?? away.name}@${home.slug ?? home.name}`;
}

/** A division's own schedule document: the 'live-pdf' and 'bundled' arm of `DivisionConfig.official`. */
export type OfficialDocumentConfig = Extract<DivisionConfig['official'], { mode: 'live-pdf' | 'bundled' }>;

/** A division whose league publishes a schedule document (every division but a mode-'none' one: EAL). */
export type DocumentDivision = DivisionConfig & { official: OfficialDocumentConfig };

/** True when the division has a schedule document; false for official mode 'none' (no fixtures exist). */
export function hasOfficialDocument(d: DivisionConfig): d is DocumentDivision {
  return d.official.mode !== 'none';
}

/** A division's schedule document; throws for a division whose league publishes none (mode 'none'). */
export function officialDocumentOf(division: DivisionId): OfficialDocumentConfig {
  const d = getDivision(division);
  if (!hasOfficialDocument(d)) throw new Error(`lib/official/schema.ts: ${division} publishes no official schedule`);
  return d.official;
}

/** The bundled divisions of a league, config order. */
export function bundledDivisions(leagueId: LeagueId): DocumentDivision[] {
  return getLeague(leagueId).divisions.filter((d): d is DocumentDivision => d.official.mode === 'bundled');
}

/** The one bundle file a league's bundled divisions share (repo-relative), or null when it has none. */
export function bundleFileOf(leagueId: LeagueId): string | null {
  const files = [...new Set(bundledDivisions(leagueId).map((d) => d.official.bundledFile))];
  if (files.length === 0) return null;
  if (files.length > 1 || files[0] === null) {
    throw new Error(`lib/official/schema.ts: ${leagueId} bundled divisions do not share one bundledFile`);
  }
  return files[0];
}

/** Canonical bundle order: division (config order), then date, then id. */
export function compareBundleFixtures(a: BundleFixture, b: BundleFixture): number {
  const order = (d: DivisionId) => {
    const league = leagueOfDivision(d);
    return league.divisions.findIndex((x) => x.id === d);
  };
  return (
    order(a.division) - order(b.division) ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Deterministic JSON: the top-level keys in schema order, two-space indent, and each document,
 * fixture and event on one line, so a revision diff reads one game per line.
 */
export function serializeBundle(bundle: OfficialBundle): string {
  const parsed = OfficialBundleSchema.parse(bundle);
  const ordered = {
    documents: parsed.documents.map((d) => ({
      division: d.division, url: d.url, sha256: d.sha256, revisionMarker: d.revisionMarker,
    })),
    fixtures: parsed.fixtures.map((f) => ({
      id: f.id, division: f.division, date: f.date, originalDate: f.originalDate, time: f.time,
      away: f.away, home: f.home, awayName: f.awayName, homeName: f.homeName,
    })),
    events: parsed.events.map((e) => ({ kind: e.kind, date: e.date, time: e.time, verbatim: e.verbatim })),
  };
  const list = (items: readonly unknown[]) =>
    items.length === 0 ? '[]' : `[\n${items.map((i) => `    ${JSON.stringify(i)}`).join(',\n')}\n  ]`;
  return [
    '{',
    `  "schema": ${JSON.stringify(parsed.schema)},`,
    `  "league": ${JSON.stringify(parsed.league)},`,
    `  "source": ${JSON.stringify(parsed.source)},`,
    `  "transcribedOn": ${JSON.stringify(parsed.transcribedOn)},`,
    `  "documents": ${list(ordered.documents)},`,
    `  "fixtures": ${list(ordered.fixtures)},`,
    `  "events": ${list(ordered.events)}`,
    '}',
    '',
  ].join('\n');
}

/** Resolve one bundle token through the league scope only (officialCodes, officialNames, then league members). */
function resolveToken(leagueId: LeagueId, token: string): TeamSlug | null {
  return resolveOfficialName(leagueId, token)?.slug ?? null;
}

/**
 * Parse a bundle and check it against config: the schema, the league id, the league's source id,
 * one document per bundled division whose sha256 equals `bundledSha256`, every fixture in a bundled
 * division of this league, and every fixture id equal to the id rebuilt from its resolved slugs.
 * Throws an Error listing every problem.
 */
export function parseOfficialBundle(raw: unknown, leagueId: LeagueId): OfficialBundle {
  const res = OfficialBundleSchema.safeParse(raw);
  if (!res.success) {
    throw new Error(`official bundle for ${leagueId}: schema: ${z.prettifyError(res.error)}`);
  }
  const bundle = res.data;
  const problems: string[] = [];
  const divisions = bundledDivisions(leagueId);
  const ids = new Set(divisions.map((d) => d.id));
  if (bundle.league !== leagueId) problems.push(`league is "${bundle.league}"`);
  for (const d of divisions) {
    if (d.official.source !== bundle.source) problems.push(`${d.id}: source is ${d.official.source}, file says ${bundle.source}`);
    const docs = bundle.documents.filter((doc) => doc.division === d.id);
    if (docs.length !== 1) problems.push(`${d.id}: ${docs.length} documents`);
    else if (docs[0].sha256 !== d.official.bundledSha256) problems.push(`${d.id}: document sha256 ≠ config bundledSha256`);
  }
  for (const doc of bundle.documents) {
    if (!ids.has(doc.division)) problems.push(`document for unknown division "${doc.division}"`);
  }
  for (const f of bundle.fixtures) {
    if (!ids.has(f.division)) {
      problems.push(`${f.id}: division "${f.division}" is not a bundled ${leagueId} division`);
      continue;
    }
    const away = resolveToken(leagueId, f.away);
    const home = resolveToken(leagueId, f.home);
    if (away === null) problems.push(`${f.id}: away "${f.away}" resolves to no ${leagueId} team`);
    if (home === null) problems.push(`${f.id}: home "${f.home}" resolves to no ${leagueId} team`);
    const id = officialFixtureId(f.division, f.date, { slug: away, name: f.awayName }, { slug: home, name: f.homeName });
    if (id !== f.id) problems.push(`${f.id}: id should be ${id}`);
  }
  if (problems.length > 0) {
    throw new Error(`official bundle for ${leagueId}: ${problems.join('; ')}`);
  }
  return bundle;
}

/** The bundle's fixtures as OfficialFixture rows (division order, then date, then id). */
export function bundleToFixtures(bundle: OfficialBundle): OfficialFixture[] {
  const leagueId = bundle.league;
  const source: OfficialSourceId = bundle.source;
  return [...bundle.fixtures].sort(compareBundleFixtures).map((f) => {
    const awaySlug = resolveToken(leagueId, f.away);
    const homeSlug = resolveToken(leagueId, f.home);
    return {
      id: officialFixtureId(f.division, f.date, { slug: awaySlug, name: f.awayName }, { slug: homeSlug, name: f.homeName }),
      league: leagueId,
      division: f.division,
      dateKey: f.date,
      time: f.time,
      awayName: f.awayName,
      homeName: f.homeName,
      awaySlug,
      homeSlug,
      source,
    };
  });
}

/** Repo root, from this module's location (lib/official/). */
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Read and validate a league's bundle file (schema + config checks). Throws on any problem. */
export function readOfficialBundle(leagueId: LeagueId, root: string = REPO_ROOT): OfficialBundle {
  const file = bundleFileOf(leagueId);
  if (file === null) throw new Error(`official bundle for ${leagueId}: the league has no bundled division`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`official bundle for ${leagueId}: cannot read ${file}: ${(err as Error).message}`);
  }
  return parseOfficialBundle(raw, leagueId);
}

/**
 * The league's bundled official fixtures, validated at load (schema and config checks; the
 * double-round-robin checks are `assertDoubleRoundRobin`). Throws when the file is missing or
 * invalid — the cron turns that into degraded divisions, never an abort.
 */
export function loadBundledFixtures(leagueId: LeagueId, root?: string): OfficialFixture[] {
  return bundleToFixtures(readOfficialBundle(leagueId, root));
}
