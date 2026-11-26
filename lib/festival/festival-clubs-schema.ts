/**
 * The Zod contract for data/field-hockey/festival-clubs.json — which club each 2026 National Hockey Festival team
 * plays for (/festival/clubs, DESIGN §35).
 *
 * TourneyMachine names teams, not clubs ('U14 Gateway Red Stars', 'AGH U16 2'), so the clubs are research, written
 * by hand like data/field-hockey/clubs.json: a club's display name is the one USA Field Hockey's participating-clubs
 * page prints, and a team joins the club whose `match` prefix is the longest one its name starts with
 * (lib/festival/festival.ts resolveFestivalClubs). A team no club matches gets an automatic club from its own name,
 * so a team added mid-event never breaks the refresh.
 *
 * Every claim beyond a name — a region, California or Northern California, the club on this site it is — carries
 * the page it was read from and the words it says (`evidence`). Nothing is inferred from a name alone without
 * saying so in `teamNotes`.
 *
 * Invariants (one file-level `superRefine`):
 *   1. club slugs are unique, and no prefix belongs to two clubs
 *   2. a prefix is lower case, trimmed and single-spaced (it is compared with lib/festival/festival-names.ts
 *      clubMatchText)
 *   3. a Northern California club is a California club
 *   4. a club with a region, a California flag or a siteClub cites at least one piece of evidence
 * That every siteClub names a club in data/field-hockey/clubs.json is checked by lib/festival/festival.ts, which
 * can see the clubs; this file cannot.
 */

import { z } from 'zod';

import { calendarDateKey, httpsUrl, slugId } from '../schema-primitives';

const text = z.string().min(1);

export const FestivalClubEvidenceSchema = z.object({ url: httpsUrl, quote: text });

export const FestivalCuratedClubSchema = z.object({
  slug: slugId,
  /** The display name, as USA Field Hockey's participating-clubs page lists the club where it does. */
  name: text,
  /** Lower-case prefixes tried at a word boundary against a team name without its leading age token. */
  match: z.array(text).min(1),
  /** Where the club is from, only with evidence: 'San Francisco, Calif.'. */
  region: text.nullable(),
  california: z.boolean(),
  norCal: z.boolean(),
  /** The club's slug in data/field-hockey/clubs.json, when this site has a page for it (/clubs/<slug>). */
  siteClub: slugId.nullable(),
  /** A note on one team, keyed by its TourneyMachine name verbatim. */
  teamNotes: z.record(z.string().min(1), text).optional(),
  evidence: z.array(FestivalClubEvidenceSchema),
});

const FestivalClubsFileObject = z.object({
  checkedOn: calendarDateKey,
  sources: z.array(z.object({ url: httpsUrl, what: text })).min(1),
  clubs: z.array(FestivalCuratedClubSchema),
});

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Invariants 1-4. */
function checkFestivalClubsFile(f: z.infer<typeof FestivalClubsFileObject>, ctx: Ctx): void {
  const slugs = new Set<string>();
  const owner = new Map<string, string>();
  f.clubs.forEach((c, i) => {
    if (slugs.has(c.slug)) issue(ctx, ['clubs', i, 'slug'], `duplicate club slug ${c.slug}`);
    slugs.add(c.slug);
    c.match.forEach((m, j) => {
      if (m !== m.trim().replace(/\s+/g, ' ').toLowerCase()) {
        issue(ctx, ['clubs', i, 'match', j], `${m} is not a lower-case, single-spaced prefix`);
      }
      const other = owner.get(m);
      if (other !== undefined) issue(ctx, ['clubs', i, 'match', j], `${m} is also ${other}'s prefix`);
      owner.set(m, c.slug);
    });
    if (c.norCal && !c.california) issue(ctx, ['clubs', i, 'norCal'], 'a Northern California club is a California club');
    if ((c.region !== null || c.california || c.siteClub !== null) && c.evidence.length === 0) {
      issue(ctx, ['clubs', i, 'evidence'], 'a region, California flag or siteClub cites its evidence');
    }
  });
}

export const FestivalClubsFileSchema = FestivalClubsFileObject.superRefine(checkFestivalClubsFile);

export type FestivalClubEvidence = z.infer<typeof FestivalClubEvidenceSchema>;
export type FestivalCuratedClub = z.infer<typeof FestivalCuratedClubSchema>;
export type FestivalClubsFile = z.infer<typeof FestivalClubsFileSchema>;
