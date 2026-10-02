import { shortDate, toLocalTimestamp } from '../../lib/format';
import {
  getEnrichedTeamRoster,
  sortedPlayers,
  type EnrichmentSource,
  type MergedPlayer,
  type MergedTeamRoster,
  type RosterConflict,
} from '../../lib/rosters';
import type { TeamSlug } from '../../lib/types';

/**
 * The team page's roster section (SPEC §1.1j), derived from the merged MaxPreps + enrichment
 * view in lib/rosters.ts. Pure, so tests/ui/roster-view.test.ts can assert it over the real files.
 *
 * What the page promises, and this module enforces:
 *   - varsity only: rows a school source marks JV are left out and counted (Los Gatos' MaxPreps
 *     page is the whole program);
 *   - a blank is a blank: a fact nobody published is simply not printed, never guessed;
 *   - a value that did NOT come from MaxPreps carries `elsewhere`, which the page marks with †
 *     and explains under the list, with a link to every site those values came from;
 *   - where a source disagrees with the value shown, the disagreement is published (DESIGN §9's
 *     posture: trust comes from showing the disagreement, not from silently picking a side).
 */

const GRADE_WORDS = { 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' } as const;

/** MaxPreps' field hockey position codes. Anything else is printed as the coach wrote it. */
const POSITION_WORDS: Record<string, string> = {
  F: 'Forward',
  M: 'Midfield',
  D: 'Defense',
  G: 'Goalkeeper',
};

/** How a conflict sentence names the source that disagrees. */
const KIND_WORDS: Record<EnrichmentSource['kind'], string> = {
  'school-site': 'the school site',
  'school-pdf': "the school's roster PDF",
  news: 'a school paper',
  'maxpreps-jv': "MaxPreps' JV roster",
  'maxpreps-career': 'a MaxPreps career page',
  'maxpreps-team': "MaxPreps' team page",
};

const FIELD_WORDS: Record<RosterConflict['field'], string> = {
  jersey: 'number',
  grade: 'grade',
  position: 'position',
  height: 'height',
};

export interface RosterFact {
  text: string;
  /** true when the value came from a source other than MaxPreps (the page marks it †). */
  elsewhere: boolean;
}

export interface RosterRow {
  key: string;
  name: string;
  jersey: RosterFact | null;
  captain: boolean;
  /** Grade, position(s), height — only the ones somebody published, in that order. */
  facts: RosterFact[];
}

export interface RosterConflictLine {
  key: string;
  name: string;
  /** "number", "grade" … */
  field: string;
  /** What the list shows; null when it shows nothing for that field. */
  shown: string | null;
  other: string;
  /** "the school site", "a school paper" … */
  sourceLabel: string;
  sourceUrl: string;
}

export interface RosterSourceLink {
  label: string;
  url: string;
}

export interface RosterView {
  teamName: string;
  status: MergedTeamRoster['status'];
  rows: RosterRow[];
  /** false when nobody published a number for any listed player: the column is dropped. */
  showNumbers: boolean;
  /** The longest number on the list, in characters ("21/88" is 5), to size that column. */
  numberChars: number;
  /** Rows a school source says are JV, left off this varsity list. */
  jvLeftOut: number;
  /** Any value on the list came from a source other than MaxPreps. */
  hasElsewhere: boolean;
  /** Some grade is worked out from a class year on another season (Los Altos, Saratoga). */
  hasDerivedGrade: boolean;
  coaches: Array<{ key: string; name: string; role: string | null }>;
  conflicts: RosterConflictLine[];
  /** MaxPreps' roster page first, then one link per other site a shown value came from. */
  sources: RosterSourceLink[];
  rosterUrl: string | null;
  /** "Fri Oct 2": when MaxPreps was read (older than the file when carried forward). */
  asOf: string | null;
}

function gradeWord(grade: number): string {
  return GRADE_WORDS[grade as keyof typeof GRADE_WORDS] ?? `Grade ${grade}`;
}

function positionWords(codes: readonly string[]): string {
  return codes.map((c) => POSITION_WORDS[c] ?? c).join(' / ');
}

/** A conflict's value in the list's own words, lower-cased for the middle of a sentence. */
function conflictValue(field: RosterConflict['field'], value: string): string {
  if (field === 'grade' && /^\d+$/.test(value)) return gradeWord(Number(value)).toLowerCase();
  if (field === 'position') return positionWords(value.split(/\s*[,/]\s*/)).toLowerCase();
  return value;
}

/** A provenance tag that is not MaxPreps — the enrichment record, with its source URL. */
function elsewhereSource(tag: MergedPlayer['provenance'][keyof MergedPlayer['provenance']]) {
  return tag !== null && tag !== 'maxpreps' ? tag : null;
}

function rowFor(p: MergedPlayer, index: number): RosterRow {
  const facts: RosterFact[] = [];
  if (p.grade !== null) {
    facts.push({ text: gradeWord(p.grade), elsewhere: elsewhereSource(p.provenance.grade) !== null });
  }
  if (p.positions.length > 0) {
    facts.push({
      text: positionWords(p.positions),
      elsewhere: elsewhereSource(p.provenance.positions) !== null,
    });
  }
  if (p.height !== null) {
    facts.push({ text: p.height, elsewhere: elsewhereSource(p.provenance.height) !== null });
  }
  return {
    key: p.athleteId ?? `${p.fullName}-${index}`,
    name: p.fullName,
    jersey:
      p.jersey === null
        ? null
        : { text: p.jersey, elsewhere: elsewhereSource(p.provenance.jersey) !== null },
    captain: p.isCaptain,
    facts,
  };
}

function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * One link per site, in first-use order, from the URLs behind what the section actually shows:
 * filled values, recorded disagreements and the coach list. MaxPreps' own pages are covered by
 * the roster link, which always leads.
 */
function sourceLinks(team: MergedTeamRoster, players: MergedPlayer[]): RosterSourceLink[] {
  const links: RosterSourceLink[] = [];
  if (team.rosterUrl) links.push({ label: 'MaxPreps roster', url: team.rosterUrl });
  const seen = new Set<string>(['maxpreps.com']);
  const add = (url: string) => {
    const host = hostLabel(url);
    if (!host || seen.has(host)) return;
    seen.add(host);
    links.push({ label: host, url });
  };
  for (const p of players) {
    for (const tag of Object.values(p.provenance)) {
      const source = elsewhereSource(tag);
      if (source) add(source.source);
    }
    for (const c of p.conflicts) add(c.source);
  }
  for (const c of team.coaches) add(c.source);
  return links;
}

export function buildRosterView(slug: TeamSlug): RosterView | undefined {
  const team = getEnrichedTeamRoster(slug);
  if (!team) return undefined;

  const varsity = team.players.filter((p) => p.level !== 'jv');
  const players = sortedPlayers({ players: varsity });
  const rows = players.map(rowFor);

  const conflicts: RosterConflictLine[] = players.flatMap((p) =>
    p.conflicts.map((c, i) => ({
      key: `${p.athleteId ?? p.fullName}-${c.field}-${i}`,
      name: p.fullName,
      field: FIELD_WORDS[c.field],
      shown: c.kept === null ? null : conflictValue(c.field, c.kept),
      other: conflictValue(c.field, c.other),
      sourceLabel: KIND_WORDS[c.kind],
      sourceUrl: c.source,
    })),
  );

  return {
    teamName: team.name,
    status: team.status,
    rows,
    showNumbers: rows.some((r) => r.jersey !== null),
    numberChars: Math.max(0, ...rows.map((r) => r.jersey?.text.length ?? 0)),
    jvLeftOut: team.players.length - varsity.length,
    hasElsewhere: rows.some((r) => r.jersey?.elsewhere || r.facts.some((f) => f.elsewhere)),
    hasDerivedGrade: players.some((p) => {
      const g = elsewhereSource(p.provenance.grade);
      return g !== null && 'derived' in g && g.derived;
    }),
    coaches: team.coaches.map((c, i) => ({ key: `${c.name}-${i}`, name: c.name, role: c.role })),
    conflicts,
    sources: sourceLinks(team, players),
    rosterUrl: team.rosterUrl,
    asOf: team.fetchedAt ? shortDate(toLocalTimestamp(team.fetchedAt)) : null,
  };
}
