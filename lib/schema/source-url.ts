/**
 * The source-URL building blocks the research files share (data/clubs.json and data/commits.json):
 * the social-media host list, a real calendar day, a non-empty string and an https URL that is not
 * on a social-media host. One declaration each, so a club's website and a commitment's source are
 * held to the same rule and refused under the same message.
 *
 * zod and lib/shared/patterns.ts only, so lib/schema/clubs.ts, lib/schema/commits.ts and the tests
 * take them without a dependency cycle (commits used to import them out of clubs).
 */

import { z } from 'zod';

import { isCalendarDate, isHttpsUrl } from '@/lib/shared/patterns';

/**
 * Social media is never a source, nor a club's website. A host is banned when it IS one of these or
 * a subdomain of one (`www.instagram.com`, `m.facebook.com`) — never by substring, so `notx.com`
 * and `maxpreps.com` pass. The list covers the networks themselves and their short links (`fb.me`,
 * `instagr.am`, `t.co`, `youtu.be`), and is shared with data/commits.json (lib/schema/commits.ts),
 * whose commitments are most often announced on one of them.
 */
export const BANNED_HOSTS = [
  'instagram.com',
  'instagr.am',
  'facebook.com',
  'fb.com',
  'fb.me',
  'tiktok.com',
  'x.com',
  'twitter.com',
  't.co',
  'threads.net',
  'threads.com',
  'youtube.com',
  'youtu.be',
  'snapchat.com',
  'linkedin.com',
] as const;

export function isBannedHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // not a URL at all: isHttpsUrl refuses it under its own message
  }
  return BANNED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** A real calendar day, YYYY-MM-DD (the strict check; lib/schema/primitives.ts `dateKey` is the shape only). */
export const dateOnly = z.string().refine(isCalendarDate, 'expected YYYY-MM-DD');

/** Two refusals, two messages: not an https URL at all, or a social-media host. */
export const httpsSourceUrl = z
  .string()
  .refine(isHttpsUrl, 'expected an https URL')
  .refine((v) => !isBannedHost(v), 'social media is not a source');

/** A non-empty string. */
export const text = z.string().min(1);
