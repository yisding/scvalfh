/**
 * The JV players' own recruiting pages, as the team page's JV list links them (components/jv/jv-roster-view.ts)
 * and the recruiting page counts them.
 *
 * A page is filed under its person (data/player-accounts.json, lib/players/accounts-schema.ts), never under a
 * row: a player who moves up from JV, or plays another sport, keeps it. A JV list row is found as a person by
 * its name (lib/players/player-index.ts personOfName, the JV lists' names as data/<sport>/player-index.json
 * records them: the team's MaxPreps JV roster page, its own JV list, and a varsity-page row a school source marks
 * JV), and shows that person's pages under the rule the JV lists always had, checked here at load time (a page her
 * varsity row already shows is not repeated, and one the list names twice has them on the first of her rows):
 *   - a class year a page states agrees with the grade the JV list shows (a page that does not is roster drift,
 *     lib/players/roster-drift.ts: the JV list is rewritten by every roster refresh, so it is left out and
 *     reported, never thrown);
 *   - no MaxPreps career page: the claimed-page read of 2026-10-13 covered the varsity rows only, and a JV list's
 *     row is not always one of MaxPreps'.
 *
 * Commitments stay varsity-only: data/commitments.json's players are found on the varsity rows.
 */
import { reportDrift } from '../players/roster-drift';
import { accountsOfPerson, getJvResearch, personOfName } from '../players/player-index';
import { classOf, getRosterEnrichment, getRosters, shownOnVarsityRow } from '../players/rosters';
import type { PlayerProfile } from '../players/rosters-schema';
import type { TeamSlug } from '../types';
import { getJvRoster, nameKey } from './jv-rosters';

/** The JV round's record, for the JV list's footnote and the recruiting page, and the profiles it shows by team. */
export interface JvProfilesView {
  builtBy: string;
  /** When the JV lists' pages were looked for (data/player-accounts.json jvResearch), else the overlay's date. */
  capturedAt: string;
  notes: string[];
  season: string;
  /** Only the schools with a JV player who has a profile. */
  teams: Array<{ slug: TeamSlug; players: Array<{ name: string; profiles: PlayerProfile[] }> }>;
}

function load(): JvProfilesView {
  const season = getRosters().season;
  const research = getJvResearch();
  const teams: JvProfilesView['teams'] = [];
  for (const t of getRosters().teams) {
    const slug = t.slug as TeamSlug;
    const players: JvProfilesView['teams'][number]['players'] = [];
    const shown = new Set<string>();
    for (const p of getJvRoster(slug)?.players ?? []) {
      const person = personOfName(slug, 'jv', p.name);
      // One the JV list names twice has her pages on the first of her rows; a page her varsity row shows is not repeated.
      if (person === null || shown.has(person)) continue;
      shown.add(person);
      const profiles = accountsOfPerson(person).filter((x) => {
        if (x.platform === 'maxpreps' || shownOnVarsityRow(person, x.url)) return false;
        if (x.classOf !== null && p.grade !== null && x.classOf !== classOf(season, p.grade)) {
          reportDrift({
            file: 'player-accounts',
            teamSlug: slug,
            who: p.name,
            key: person as string,
            what: `${x.platform} profile says class of ${x.classOf}, the JV list shows grade ${p.grade}`,
            leftOut: 'field',
          });
          return false;
        }
        return true;
      });
      if (profiles.length > 0) players.push({ name: p.name, profiles });
    }
    if (players.length > 0) teams.push({ slug, players });
  }
  return {
    builtBy: research?.builtBy ?? 'No JV round of its own: the JV lists show what the varsity rounds found.',
    capturedAt: research?.capturedAt ?? getRosterEnrichment().capturedAt,
    notes: research?.notes ?? [],
    season,
    teams,
  };
}

const view = load();
const BY_TEAM = new Map(view.teams.map((t) => [t.slug, new Map(t.players.map((p) => [nameKey(p.name), p.profiles]))]));

/** The JV round's record and every JV list row's profiles, by team. */
export function getJvProfilesFile(): JvProfilesView {
  return view;
}

/** A JV player's own recruiting pages, by the name the team page's JV list gives; [] for most. */
export function getJvPlayerProfiles(slug: TeamSlug, name: string): readonly PlayerProfile[] {
  return BY_TEAM.get(slug)?.get(nameKey(name)) ?? [];
}
