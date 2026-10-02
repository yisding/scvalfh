import { shortDate, toLocalTimestamp } from '../../lib/format';
import {
  getEnrichedTeamRoster,
  sortedPlayers,
  type EnrichmentSource,
  type MergedPlayer,
  type MergedTeamRoster,
  type ProfilePlatform,
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
 *     and explains under the list, with a link to every page those values came from;
 *   - where a source disagrees with the value shown, the disagreement is published (DESIGN §9's
 *     posture: trust comes from showing the disagreement, not from silently picking a side);
 *   - a player's own recruiting pages (NCSA and the like) are linked from that player's row.
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

/** A row's link text, and how the footnote names the platform. */
const PROFILE_WORDS: Record<ProfilePlatform, { link: string; footnote: string }> = {
  ncsa: { link: 'NCSA profile', footnote: 'NCSA' },
  sportsrecruits: { link: 'SportsRecruits profile', footnote: 'SportsRecruits' },
  fieldlevel: { link: 'FieldLevel profile', footnote: 'FieldLevel' },
  hudl: { link: 'Hudl profile', footnote: 'Hudl' },
  captainu: { link: 'Captain U profile', footnote: 'Captain U' },
  personal: { link: 'Recruiting site', footnote: 'personal sites' },
};
const PROFILE_ORDER = Object.keys(PROFILE_WORDS) as ProfilePlatform[];

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

export interface RosterProfileLink {
  /** "NCSA profile", "Recruiting site" … */
  label: string;
  url: string;
}

export interface RosterRow {
  key: string;
  name: string;
  jersey: RosterFact | null;
  captain: boolean;
  /** Grade, position(s), height — only the ones somebody published, in that order. */
  facts: RosterFact[];
  /** The player's own recruiting pages, one per platform, NCSA first. */
  profiles: RosterProfileLink[];
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
  /** The platforms the listed rows link to, as the footnote names them ("NCSA", "SportsRecruits"). */
  profilePlatforms: string[];
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
    profiles: [...p.profiles]
      .sort((a, b) => PROFILE_ORDER.indexOf(a.platform) - PROFILE_ORDER.indexOf(b.platform))
      .map((x) => ({ label: PROFILE_WORDS[x.platform].link, url: x.url })),
  };
}

function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** What a source link backs up, in the order its label lists them. */
const USE_WORDS = {
  grade: ['grade', 'grades'],
  position: ['position', 'positions'],
  number: ['number', 'numbers'],
  height: ['height', 'heights'],
  coaches: ['coaches', 'coaches'],
} as const;
type SourceUse = keyof typeof USE_WORDS;

const PROVENANCE_USE: Record<keyof MergedPlayer['provenance'], SourceUse> = {
  grade: 'grade',
  positions: 'position',
  jersey: 'number',
  height: 'height',
};

/** More pages than this from one site and kind fold into that site's team page. */
const FOLD_OVER = 2;

function siteLabel(kind: EnrichmentSource['kind'], host: string): string {
  switch (kind) {
    case 'maxpreps-team':
      return 'MaxPreps team page';
    case 'maxpreps-jv':
      return 'MaxPreps JV roster';
    case 'maxpreps-career':
      return 'MaxPreps career';
    case 'school-pdf':
      return `${host} roster PDF`;
    default:
      return host;
  }
}

function usesText(uses: Map<SourceUse, number>): string {
  return (Object.keys(USE_WORDS) as SourceUse[])
    .filter((u) => uses.has(u))
    .map((u) => USE_WORDS[u][uses.get(u)! === 1 ? 0 : 1])
    .join(', ');
}

/**
 * Every page behind a value the list shows, so each † can be checked: MaxPreps' roster first,
 * then one link per source URL in first-use order, labelled with the site and what it supplied
 * ("MaxPreps JV roster: grade", "losgatosathletics.org: coaches").
 *
 * Deduplicated by URL, never by site: MaxPreps' career, JV and team pages each back up values the
 * roster page does not carry. Where one site supplied a value from a separate page per player
 * (Saratoga's and Lynbrook's player profiles), the pages fold into the one team roster page the
 * enrichment file lists for that site, which links to every profile. Disagreements are linked
 * where they are listed, not here: they are not values the list shows.
 */
function sourceLinks(team: MergedTeamRoster, players: MergedPlayer[]): RosterSourceLink[] {
  interface Entry {
    url: string;
    host: string;
    kind: EnrichmentSource['kind'];
    uses: Map<SourceUse, number>;
    names: string[];
  }
  const entries = new Map<string, Entry>();
  const note = (url: string, kind: EnrichmentSource['kind'], use: SourceUse, name?: string) => {
    if (url === team.rosterUrl) return;
    const host = hostLabel(url);
    if (!host) return;
    let e = entries.get(url);
    if (!e) {
      e = { url, host, kind, uses: new Map(), names: [] };
      entries.set(url, e);
    }
    e.uses.set(use, (e.uses.get(use) ?? 0) + 1);
    if (name && !e.names.includes(name)) e.names.push(name);
  };
  for (const p of players) {
    for (const field of Object.keys(PROVENANCE_USE) as Array<keyof MergedPlayer['provenance']>) {
      const source = elsewhereSource(p.provenance[field]);
      if (source) note(source.source, source.kind, PROVENANCE_USE[field], p.lastName ?? p.fullName);
    }
  }
  for (const c of team.coaches) {
    const kind =
      team.sources.find((s) => s.url === c.source)?.kind ??
      (hostLabel(c.source) === 'maxpreps.com' ? 'maxpreps-team' : 'school-site');
    note(c.source, kind, 'coaches');
  }

  const groups = new Map<string, Entry[]>();
  for (const e of entries.values()) {
    const key = `${e.host} ${e.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const links: RosterSourceLink[] = [];
  if (team.rosterUrl) links.push({ label: 'MaxPreps roster', url: team.rosterUrl });
  for (const group of groups.values()) {
    const { host, kind } = group[0];
    const label = siteLabel(kind, host);
    if (group.length > FOLD_OVER) {
      const teamPage = team.sources.find(
        (s) => s.kind === kind && hostLabel(s.url) === host && !entries.has(s.url),
      );
      if (teamPage) {
        const uses = new Map<SourceUse, number>();
        for (const e of group) for (const [u, n] of e.uses) uses.set(u, (uses.get(u) ?? 0) + n);
        links.push({ label: `${label}: ${usesText(uses)} (player pages)`, url: teamPage.url });
        continue;
      }
    }
    const labels = group.map((e) => `${label}: ${usesText(e.uses)}`);
    group.forEach((e, i) => {
      // Two pages that would read the same ("lahstalon.org: grade" twice) say whose values they hold.
      const clash = labels.filter((l) => l === labels[i]).length > 1;
      const who =
        e.names.length > 2 ? `${e.names.slice(0, 2).join(', ')} +${e.names.length - 2}` : e.names.join(', ');
      links.push({ label: clash && who ? `${labels[i]} (${who})` : labels[i], url: e.url });
    });
  }
  return links;
}

/**
 * null for a team lib/rosters.ts does not hold: rosters are SCVAL-only (SPEC §0.2 item 12), so a
 * BVAL, PCAL or MCAL page gets no roster section at all — never an empty state that would read as
 * the team hiding its roster. Never throws for a registry slug.
 */
export function buildRosterView(slug: TeamSlug): RosterView | null {
  const team = getEnrichedTeamRoster(slug);
  if (!team) return null;

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
    profilePlatforms: PROFILE_ORDER.filter((k) =>
      players.some((p) => p.profiles.some((x) => x.platform === k)),
    ).map((k) => PROFILE_WORDS[k].footnote),
    coaches: team.coaches.map((c, i) => ({ key: `${c.name}-${i}`, name: c.name, role: c.role })),
    conflicts,
    sources: sourceLinks(team, players),
    rosterUrl: team.rosterUrl,
    asOf: team.fetchedAt ? shortDate(toLocalTimestamp(team.fetchedAt)) : null,
  };
}
