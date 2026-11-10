/**
 * data/schools.json — one record per registry school, keyed by team slug: today, the street address of
 * its campus. The one place a school's address is written down: the game pages' WHERE line and every
 * Directions link (lib/schools/venue.ts) and a league final's fixed site (LeagueConfig postseason
 * `finalSite.slug`) all read it from here, by slug. It is not a field of `Team`, because the snapshot
 * stores the registry's teams and a school's address is not fetched data.
 *
 * The addresses are MaxPreps' own school fields (`address`, `city`, `state`, `zipCode` on each team of
 * a contest in its schedule payloads), harvested once from the committed corpus; the file's `builtBy`
 * says how. No script rewrites the file: a new registry school needs its record added by hand, and
 * lib/teams.ts throws at import until it has one (and on a record for a slug that is not a team).
 *
 * It is imported so the build bundles it (a Worker has no project filesystem), and validated once at
 * module scope, so a bad file fails at import rather than half-way through a render. This module
 * imports neither lib/teams nor lib/leagues, so lib/teams can read it without a cycle.
 */

import { z } from 'zod';

import bundledFieldHockey from '../../data/schools.json';
import bundledBasketball from '../../data/basketball/schools.json';
import bundledSoccer from '../../data/soccer/schools.json';
import { validateData } from '../data-file';
import { dateKey, isCalendarDate, slugId } from '../schema-primitives';
import type { StreetAddress, TeamSlug } from '../types';

/** This build's copy (data/ for field hockey, data/soccer/ for soccer, data/basketball/ for basketball: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

const nonEmpty = z.string().trim().min(1);

export const StreetAddressSchema = z.strictObject({
  street: nonEmpty,
  city: nonEmpty,
  region: z.string().regex(/^[A-Z]{2}$/, 'expected a two-letter state code'),
  postalCode: z.string().regex(/^\d{5}$/, 'expected a five-digit ZIP code'),
});

export const SchoolsFileSchema = z.strictObject({
  /** How the file was made: the source and every normalization applied to it. */
  builtBy: nonEmpty,
  /** The newest capture date of the source payloads. */
  capturedAt: dateKey.refine(isCalendarDate, 'expected a real calendar day'),
  notes: z.array(nonEmpty),
  schools: z.record(slugId, StreetAddressSchema),
});

export type SchoolsFile = z.infer<typeof SchoolsFileSchema>;

/** Parse a schools file, throwing `data/schools.json failed validation: …` with the first issues. */
export function loadSchools(input: unknown): SchoolsFile {
  return validateData('data/schools.json', SchoolsFileSchema, input);
}

const SCHOOLS = loadSchools(bundled);

/** Every school's campus address, by team slug (lib/teams.ts checks the keys are exactly the registry's). */
export const SCHOOL_ADDRESSES: Readonly<Record<TeamSlug, StreetAddress>> = SCHOOLS.schools;

/** A registry school's campus address. Every registry slug has one (lib/teams.ts assertRegistry step 6). */
export function schoolAddress(slug: TeamSlug): StreetAddress {
  const address = SCHOOL_ADDRESSES[slug];
  if (!address) throw new Error(`data/schools.json: no record for ${slug}`);
  return address;
}
