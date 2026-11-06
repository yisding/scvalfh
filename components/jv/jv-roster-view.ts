/**
 * A team page's JV roster section: the school's JV list from lib/jv/jv-rosters.ts (the fuller of the
 * school's own athletics site's and MaxPreps' JV roster page), in the varsity roster's
 * order and words, less the players on the varsity roster the page shows above it, with the JV
 * players' own recruiting pages (data/jv-profiles.json, lib/jv/jv-profiles.ts) linked as the varsity
 * roster links its players'. JV players stay apart from varsity otherwise: nothing here feeds the
 * varsity roster, the clubs or the commitments, which are built from the varsity rosters alone.
 *
 * SERVER-ONLY: reads lib/jv/jv-rosters, which imports the data files.
 */

import { dateWithYear, gradeWord, shortDate, toLocalTimestamp } from '../../lib/format';
import { getJvPlayerProfiles, getJvProfilesFile } from '../../lib/jv/jv-profiles';
import { getJvRoster, type JvRosterPlayer } from '../../lib/jv/jv-rosters';
import { getTeamBySlug } from '../../lib/teams';
import type { TeamSlug } from '../../lib/types';
import { profileLinks, profilePlatformWords, type RosterProfileLink } from '../teams/roster-view';
import { positionFromText, positionWords } from '../words/position-words';

export interface JvRosterRow {
  key: string;
  name: string;
  jersey: string | null;
  captain: boolean;
  /** Grade, position, height: only the ones the source gives, in that order. */
  facts: string[];
  /** The player's own recruiting pages, in the varsity roster's order and words; [] for most. */
  profiles: RosterProfileLink[];
}

export interface TeamJvRosterView {
  teamName: string;
  rows: JvRosterRow[];
  /** false when the source gives no number for any player: the column is dropped. */
  showNumbers: boolean;
  /** The longest number on the list, in characters, to size that column. */
  numberChars: number;
  source: 'maxpreps' | 'school-site';
  /** "MaxPreps" or the school site's host. */
  sourceLabel: string;
  sourceUrl: string;
  /** "Fri Nov 6" (MaxPreps' read) or "Nov 6, 2026" (the day a school's page was read). */
  asOf: string;
  /**
   * The other source's list, when it has one (lib/jv/jv-rosters.ts shows the fuller): its words for the
   * footnote ("MaxPreps’ JV roster", "the JV list on palyathletics.com"), its page and how many JV
   * players it lists, less the varsity ones.
   */
  other: { words: string; url: string; count: number } | null;
  /** Players the source lists who are on the varsity roster above: not repeated (lib/jv/jv-rosters.ts). */
  onVarsity: number;
  /** The platforms the rows' profile links go to, for the footnote ("SportsRecruits"); [] when none. */
  profilePlatforms: string[];
  /** When the JV profiles were looked for: "Nov 6, 2026". */
  profilesCheckedOn: string;
}

/** By number when most players have one (the varsity roster's rule), else by last name. */
function sorted(players: readonly JvRosterPlayer[]): JvRosterPlayer[] {
  const out = [...players];
  const byName = (a: JvRosterPlayer, b: JvRosterPlayer) =>
    (a.lastName ?? a.name).localeCompare(b.lastName ?? b.name) || a.name.localeCompare(b.name);
  const numbered = out.filter((p) => p.jersey !== null).length;
  if (numbered * 2 < out.length) return out.sort(byName);
  const num = (j: string | null) => {
    const m = j === null ? null : /^\d+/.exec(j);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  };
  return out.sort(
    (a, b) => num(a.jersey) - num(b.jersey) || (a.jersey ?? '').localeCompare(b.jersey ?? '') || byName(a, b),
  );
}

/** MaxPreps' codes read through the varsity roster's words; a school's own word through the same vocabulary. */
function positionText(p: JvRosterPlayer, source: TeamJvRosterView['source']): string | null {
  if (p.positions.length === 0) return null;
  return source === 'maxpreps' ? positionWords(p.positions) : positionFromText(p.positions.join(' / '));
}

/** The JV roster section for a registry school, or null when no source lists its JV players. */
export function buildTeamJvRosterView(slug: TeamSlug): TeamJvRosterView | null {
  const team = getTeamBySlug(slug);
  const roster = getJvRoster(slug);
  if (!team || !roster) return null;
  const linked = new Map(roster.players.map((p) => [p, getJvPlayerProfiles(slug, p.name)]));
  const rows = sorted(roster.players).map((p, i): JvRosterRow => {
    const position = positionText(p, roster.source);
    return {
      key: `${p.name}-${i}`,
      name: p.name,
      jersey: p.jersey,
      captain: p.isCaptain,
      facts: [p.grade === null ? null : gradeWord(p.grade), position, p.height].filter((f): f is string => f !== null),
      profiles: profileLinks(linked.get(p) ?? []),
    };
  });
  return {
    teamName: team.name,
    rows,
    showNumbers: rows.some((r) => r.jersey !== null),
    numberChars: Math.max(0, ...rows.map((r) => r.jersey?.length ?? 0)),
    source: roster.source,
    sourceLabel: roster.sourceLabel,
    sourceUrl: roster.url,
    asOf: roster.source === 'maxpreps' ? shortDate(toLocalTimestamp(roster.readAt)) : dateWithYear(`${roster.readAt}T12:00:00`),
    other: roster.other
      ? {
          words: roster.other.source === 'maxpreps' ? 'MaxPreps’ JV roster' : `the JV list on ${roster.other.sourceLabel}`,
          url: roster.other.url,
          count: roster.other.count,
        }
      : null,
    onVarsity: roster.onVarsity,
    profilePlatforms: profilePlatformWords([...linked.values()].flat().map((x) => x.platform)),
    profilesCheckedOn: dateWithYear(`${getJvProfilesFile().capturedAt}T12:00:00`),
  };
}
