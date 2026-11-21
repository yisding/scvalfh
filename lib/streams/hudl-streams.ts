/**
 * data/field-hockey/hudl-streams.json — the Hudl TV broadcast of a game, where a covered school streams it on Hudl's fan site
 * (fan.hudl.com), keyed by the game's contest id. Game pages, a team's Next card, the home page's next-game card
 * and the bracket cells link it beside the NFHS Network stream MaxPreps carries.
 *
 * MaxPreps' schedule rows carry the NFHS Network stream and GoFan tickets but never a Hudl broadcast, so the link
 * comes from Hudl: each covered school's fan.hudl.com page lists its past livestreams and its schedule, and a
 * scheduled event that Hudl will stream carries `broadcastStatus: "Upcoming"`. Each broadcast was matched to a
 * game on the sport, the varsity level, the Pacific date and the opponent (the file's `notes` say how). One
 * link per game: the home school's broadcast where both schools stream it.
 *
 * `url` is the broadcast's watch page (`…/watch?b=<base64 "Broadcast<id>">`); the same page carries the live
 * stream and, after the game, the replay. Hudl sells some broadcasts (pay-per-view or a Hudl TV pass, `access`
 * 'paid'); the link is the same either way.
 *
 * Research, written by a script run by hand (`builtBy`); the twice-daily data job does not rewrite it. A game
 * with no record had no Hudl broadcast on a covered school's page when the file was captured; that is not a
 * claim that none exists (a school outside the site, or one added later, may stream it).
 *
 * Applied where the site reads the snapshot (lib/data.ts), not stored in it, so the stored snapshot stays what
 * MaxPreps said and a data refresh keeps the links. A record whose game has left the snapshot is ignored.
 *
 * Invariants, checked once at module scope so a bad file fails at import:
 *   1. no contest id appears twice
 *   2. `url` is an https watch page on fan.hudl.com
 *
 * One file per sport: data/, data/soccer/, data/basketball/ and data/volleyball/.
 */

import { z } from 'zod';

import bundledFieldHockey from '../../data/field-hockey/hudl-streams.json';
import bundledBasketball from '../../data/basketball/hudl-streams.json';
import bundledVolleyball from '../../data/volleyball/hudl-streams.json';
import bundledSoccer from '../../data/soccer/hudl-streams.json';
import bundledValSoccer from '../../data/val-soccer/hudl-streams.json';
import { validateData } from '../data-file';
import { calendarDateKey, httpsUrl } from '../schema-primitives';
import type { Game } from '../types';

/** This build's copy (data/<sport>/: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledVolleyball : process.env.SCVAL_SPORT === 'val-soccer' ? bundledValSoccer : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

const text = z.string().trim().min(1);

/** A Hudl broadcast's watch page on the fan site. */
export const hudlWatchUrl = httpsUrl.refine(
  (v) => /^https:\/\/fan\.hudl\.com\/[^?#\s]+\/watch\?b=[A-Za-z0-9%=+/_-]+$/.test(v),
  'expected a fan.hudl.com watch page (…/watch?b=…)',
);

export const HudlStreamSchema = z.strictObject({
  contestId: text,
  url: hudlWatchUrl,
  /** The school whose Hudl page carries the broadcast, as the site names it. */
  by: text,
  /** 'replay': the broadcast was archived when the file was captured; 'scheduled': Hudl listed it as upcoming. */
  kind: z.enum(['replay', 'scheduled']),
  /** 'free', 'paid' (pay-per-view or a Hudl TV pass) or 'unknown' (Hudl had not said for a scheduled broadcast). */
  access: z.enum(['free', 'paid', 'unknown']),
  /**
   * 'confirmed': date and opponent agree. 'likely': the date and sport agree and the broadcast names no opponent
   * or names it differently (a venue camera's "Field Recording", a "vs EAL" title, a date a day off the site's).
   */
  match: z.enum(['confirmed', 'likely']),
  /** What the match rests on when it is not plain, for maintainers. Never rendered. */
  note: text.optional(),
});

export type HudlStream = z.infer<typeof HudlStreamSchema>;

export const HudlStreamsFileSchema = z
  .strictObject({
    /** How the file was made. */
    builtBy: text,
    capturedAt: calendarDateKey,
    /** Method and rules, in words. */
    notes: z.array(text),
    streams: z.array(HudlStreamSchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.streams.forEach((s, i) => {
      if (seen.has(s.contestId)) {
        ctx.addIssue({ code: 'custom', path: ['streams', i, 'contestId'], message: `contest ${s.contestId} appears twice` });
      }
      seen.add(s.contestId);
    });
  });

export type HudlStreamsFile = z.infer<typeof HudlStreamsFileSchema>;

/** A Hudl streams file parsed and checked (the committed one at module scope; a test passes its own). */
export function loadHudlStreams(raw: unknown): HudlStreamsFile {
  return validateData('hudl-streams', HudlStreamsFileSchema, raw);
}

const FILE: HudlStreamsFile = loadHudlStreams(bundled);

export function getHudlStreamsFile(): HudlStreamsFile {
  return FILE;
}

/** Each game with its Hudl broadcast (`urls.hudl`), where the file has one. Pure: no I/O, no clock. */
export function withHudlStreams(games: readonly Game[], file: HudlStreamsFile): Game[] {
  if (file.streams.length === 0) return [...games];
  const byContest = new Map(file.streams.map((s) => [s.contestId, s.url]));
  return games.map((g) => {
    const url = byContest.get(g.contestId);
    if (url === undefined || g.urls.hudl === url) return g;
    return { ...g, urls: { ...g.urls, hudl: url } };
  });
}
