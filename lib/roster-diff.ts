/**
 * What changed between two data/rosters.json files, and which research records point at the rows
 * that changed: the summary the weekly update-people workflow puts on its pull request
 * (.github/workflows/update-people.yml, docs/WEEKLY-PEOPLE.md), so a reviewer reads a list of
 * players instead of a 600 KB JSON diff.
 *
 * A row is a player of a team, keyed by team slug + MaxPreps athleteId (a per-season id, so stable
 * within one season). The three research files join to the rosters on that same key:
 * data/rosters-enrichment.json, data/clubs.json and data/commits.json. lib/rosters.ts,
 * lib/clubs.ts and lib/commits.ts throw at import when a roster change breaks that join, which is
 * exactly when this report is needed, so it never imports them: it takes the files as plain JSON,
 * through the narrow shapes below, and names every record whose row was removed or changed with
 * the reason it needs a second look.
 *
 * Pure (no fs, no network): scripts/roster-diff.ts reads the files.
 */

import { getLeague } from './leagues';
import type { RosterPlayer, Rosters, TeamRoster } from './rosters-schema';
import { getTeamBySlug } from './teams';

/** The MaxPreps fields a reviewer cares about, in the order a change lists them. */
export const DIFF_FIELDS = ['fullName', 'grade', 'jersey', 'position', 'height', 'isCaptain'] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];

export interface FieldChange {
  field: DiffField;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface PlayerChange {
  athleteId: string;
  /** The name before the change; a rename shows as a `fullName` change. */
  fullName: string;
  changes: FieldChange[];
}

export interface TeamDiff {
  slug: string;
  name: string;
  /** null when the earlier file had no row for the team. */
  statusBefore: TeamRoster['status'] | null;
  statusAfter: TeamRoster['status'];
  /** The later file's error for the team (a failed fetch), if any. */
  error: string | null;
  added: RosterPlayer[];
  removed: RosterPlayer[];
  changed: PlayerChange[];
}

export interface RosterDiff {
  seasonBefore: string | null;
  seasonAfter: string;
  /** Only the teams with a status change or a player added, removed or changed, in the later file's order. */
  teams: TeamDiff[];
  totals: { added: number; removed: number; changed: number; teams: number };
}

/** A team whose fetch failed keeps its previous rows: a change into one of these is no news. */
const FAILED: ReadonlySet<string> = new Set(['carried-forward', 'error']);

const playerKey = (p: Pick<RosterPlayer, 'athleteId' | 'fullName'>) => p.athleteId ?? `name:${p.fullName}`;

/** Two roster files → what changed, team by team. `before` is null for a first run. */
export function diffRosters(before: Pick<Rosters, 'season' | 'teams'> | null, after: Pick<Rosters, 'season' | 'teams'>): RosterDiff {
  const previous = new Map((before?.teams ?? []).map((t) => [t.slug, t]));
  const teams: TeamDiff[] = [];
  for (const team of after.teams) {
    const prior = previous.get(team.slug);
    const was = new Map((prior?.players ?? []).map((p) => [playerKey(p), p]));
    const now = new Map(team.players.map((p) => [playerKey(p), p]));
    const added = team.players.filter((p) => !was.has(playerKey(p)));
    const removed = (prior?.players ?? []).filter((p) => !now.has(playerKey(p)));
    const changed: PlayerChange[] = [];
    for (const p of team.players) {
      const old = was.get(playerKey(p));
      if (!old) continue;
      const changes = DIFF_FIELDS.filter((f) => old[f] !== p[f]).map((f) => ({ field: f, before: old[f], after: p[f] }));
      if (changes.length) changed.push({ athleteId: p.athleteId ?? '', fullName: old.fullName, changes });
    }
    const statusBefore = prior?.status ?? null;
    if (statusBefore === team.status && !added.length && !removed.length && !changed.length) continue;
    teams.push({
      slug: team.slug,
      name: team.name,
      statusBefore,
      statusAfter: team.status,
      error: team.error,
      added,
      removed,
      changed,
    });
  }
  const sum = (k: 'added' | 'removed' | 'changed') => teams.reduce((n, t) => n + t[k].length, 0);
  return {
    seasonBefore: before?.season ?? null,
    seasonAfter: after.season,
    teams,
    totals: {
      added: sum('added'),
      removed: sum('removed'),
      changed: sum('changed'),
      teams: teams.filter((t) => t.added.length || t.removed.length || t.changed.length).length,
    },
  };
}

/**
 * Whether the change is worth a pull request: a player added, removed or changed, a team whose
 * status moved anywhere but into a failure, or a new season. A team that only failed this run
 * keeps its previous rows (carried-forward), so a run whose only news is failures has nothing
 * for a reviewer, and the workflow reports it as a failed run instead.
 */
export function needsReview(diff: RosterDiff): boolean {
  if (diff.seasonBefore !== null && diff.seasonBefore !== diff.seasonAfter) return true;
  return diff.teams.some(
    (t) =>
      t.added.length > 0 ||
      t.removed.length > 0 ||
      t.changed.length > 0 ||
      (t.statusBefore !== t.statusAfter && !FAILED.has(t.statusAfter)),
  );
}

// ---------------------------------------------------------------- research records

/** The fields of a data/rosters-enrichment.json player this report reads. */
export interface EnrichmentRecord {
  athleteId: string;
  fullName: string;
  grade: unknown;
  jersey: unknown;
  positions: unknown;
  height: unknown;
  conflicts?: ReadonlyArray<{ field: string }>;
  profiles?: ReadonlyArray<{ classOf: number | null }>;
}

/** The research files as plain JSON; a file that is missing or unreadable is null and skipped. */
export interface ResearchFiles {
  enrichment: { teams: ReadonlyArray<{ slug: string; players: readonly EnrichmentRecord[] }> } | null;
  clubs: { affiliations: ReadonlyArray<{ teamSlug: string; athleteId: string; fullName: string; club: string }> } | null;
  commits: {
    commitments: ReadonlyArray<{ teamSlug: string; athleteId: string; fullName: string; college: string; sport: string }>;
  } | null;
}

export type ResearchFile = 'rosters-enrichment' | 'clubs' | 'commits';

export interface ResearchRef {
  file: ResearchFile;
  teamSlug: string;
  athleteId: string;
  /** The name the record carries (which a rename makes stale). */
  fullName: string;
  /** "club sf-hawks", "commitment uc-davis (field hockey)", "overlay entry". */
  record: string;
  reasons: string[];
}

const show = (v: FieldChange['before']) => (v === null ? '—' : String(v));

/**
 * Every research record that points at a row this diff removed or changed, with why it needs a
 * second look. A record is listed when its row is gone, when MaxPreps now spells the name another
 * way, when the grade moved (every stated class year is checked against it), and, for the roster
 * overlay, when MaxPreps now fills a field the overlay fills (the overlay may only fill a blank) or
 * moved a value a recorded conflict kept. Records the diff did not touch are not listed, even if
 * they were already broken: the tests name those.
 */
export function researchRefs(diff: RosterDiff, files: ResearchFiles): ResearchRef[] {
  const removed = new Map<string, string>();
  const changed = new Map<string, PlayerChange>();
  for (const t of diff.teams) {
    for (const p of t.removed) {
      if (!p.athleteId) continue;
      // A coach who deletes and re-adds a player gives the row a new athleteId: the same person
      // (careerProfileId) or the same name among this run's added rows is the likely new row.
      const again = t.added.find(
        (a) => (p.careerProfileId !== null && a.careerProfileId === p.careerProfileId) || a.fullName === p.fullName,
      );
      removed.set(
        `${t.slug} ${p.athleteId}`,
        again
          ? `the row is gone from MaxPreps; "${again.fullName}" was added as athleteId ${again.athleteId}`
          : 'the row is gone from MaxPreps',
      );
    }
    for (const c of t.changed) if (c.athleteId) changed.set(`${t.slug} ${c.athleteId}`, c);
  }
  const reasonsFor = (teamSlug: string, athleteId: string, fullName: string, overlay: EnrichmentRecord | null): string[] => {
    const key = `${teamSlug} ${athleteId}`;
    const gone = removed.get(key);
    if (gone) return [gone];
    const c = changed.get(key);
    if (!c) return [];
    const by = new Map(c.changes.map((x) => [x.field, x]));
    const out: string[] = [];
    const rename = by.get('fullName');
    if (rename && rename.after !== fullName) out.push(`MaxPreps now spells the name "${show(rename.after)}"`);
    const grade = by.get('grade');
    const statesClass = overlay === null || (overlay.profiles ?? []).some((p) => p.classOf !== null);
    if (grade && statesClass) out.push(`grade ${show(grade.before)} → ${show(grade.after)}: re-check every stated class year`);
    if (overlay) {
      const fills: Array<[DiffField, unknown, string]> = [
        ['grade', overlay.grade, 'grade'],
        ['jersey', overlay.jersey, 'jersey'],
        ['position', overlay.positions, 'positions'],
        ['height', overlay.height, 'height'],
      ];
      for (const [field, value, label] of fills) {
        const x = by.get(field);
        if (x && value !== null && value !== undefined && x.after !== null) {
          out.push(`MaxPreps now has a ${field} (${show(x.after)}); the overlay's ${label} may only fill a blank`);
        }
      }
      for (const conflict of overlay.conflicts ?? []) {
        const x = by.get(conflict.field as DiffField);
        if (x) out.push(`the ${conflict.field} conflict was recorded against MaxPreps' "${show(x.before)}", now "${show(x.after)}"`);
      }
    }
    return out;
  };

  const refs: ResearchRef[] = [];
  for (const team of files.enrichment?.teams ?? []) {
    for (const e of team.players) {
      const reasons = reasonsFor(team.slug, e.athleteId, e.fullName, e);
      if (reasons.length) {
        refs.push({ file: 'rosters-enrichment', teamSlug: team.slug, athleteId: e.athleteId, fullName: e.fullName, record: 'overlay entry', reasons });
      }
    }
  }
  for (const a of files.clubs?.affiliations ?? []) {
    const reasons = reasonsFor(a.teamSlug, a.athleteId, a.fullName, null);
    if (reasons.length) {
      refs.push({ file: 'clubs', teamSlug: a.teamSlug, athleteId: a.athleteId, fullName: a.fullName, record: `club ${a.club}`, reasons });
    }
  }
  for (const c of files.commits?.commitments ?? []) {
    const reasons = reasonsFor(c.teamSlug, c.athleteId, c.fullName, null);
    if (reasons.length) {
      refs.push({
        file: 'commits',
        teamSlug: c.teamSlug,
        athleteId: c.athleteId,
        fullName: c.fullName,
        record: `commitment ${c.college} (${c.sport})`,
        reasons,
      });
    }
  }
  return refs;
}

// ---------------------------------------------------------------- formatting

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 added, 1 removed, 5 changed on 4 teams": the tail of the weekly commit message. */
export function formatRosterDiffLine(diff: RosterDiff): string {
  const { added, removed, changed, teams } = diff.totals;
  if (added + removed + changed === 0) {
    const moved = diff.teams.filter((t) => t.statusBefore !== t.statusAfter).length;
    return moved ? `${plural(moved, 'team status', 'team statuses')} changed` : 'no player changed';
  }
  return `${added} added, ${removed} removed, ${changed} changed on ${plural(teams, 'team')}`;
}

function teamLabel(slug: string, name: string): string {
  const team = getTeamBySlug(slug);
  return team ? `${name} (${getLeague(team.league).shortName})` : name;
}

function describePlayer(p: RosterPlayer): string {
  const facts = [p.gradeClass, p.jersey === null ? null : `#${p.jersey}`, p.position].filter((x) => x !== null);
  return facts.length ? `${p.fullName} (${facts.join(', ')})` : p.fullName;
}

function describeChange(c: FieldChange): string {
  if (c.field === 'fullName') return `name → ${show(c.after)}`;
  if (c.field === 'isCaptain') return c.after ? 'now a captain' : 'no longer a captain';
  return `${c.field} ${show(c.before)} → ${show(c.after)}`;
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The pull request's roster section: totals, then every team that changed, then the research records to re-check. */
export function formatRosterDiffMarkdown(diff: RosterDiff, refs: readonly ResearchRef[]): string {
  const out: string[] = [];
  if (diff.seasonBefore !== null && diff.seasonBefore !== diff.seasonAfter) {
    out.push(
      `> **The season changed (${diff.seasonBefore} → ${diff.seasonAfter}).** Every research file joins to last season's rows: ` +
        'the roster overlay, clubs and commitments must be redone for the new season, not repaired.',
      '',
    );
  }
  out.push(`**${formatRosterDiffLine(diff)}.**`, '');
  for (const t of diff.teams) {
    out.push(`#### ${teamLabel(t.slug, t.name)}`);
    if (t.statusBefore !== t.statusAfter) {
      out.push(`- Status: ${t.statusBefore ?? 'none'} → ${t.statusAfter}${t.error ? ` (${t.error})` : ''}`);
    }
    for (const p of t.added) out.push(`- Added: ${describePlayer(p)}`);
    for (const p of t.removed) out.push(`- Removed: ${describePlayer(p)}`);
    for (const c of t.changed) out.push(`- ${c.fullName}: ${c.changes.map(describeChange).join('; ')}`);
    out.push('');
  }
  out.push('#### Research records to re-check');
  if (refs.length === 0) {
    out.push('', 'No roster-overlay entry, club tie or commitment points at a row that changed.');
  } else {
    out.push('', '| File | Team | Player | Record | Why |', '|---|---|---|---|---|');
    for (const r of refs) {
      out.push(`| ${r.file} | ${r.teamSlug} | ${cell(r.fullName)} | ${cell(r.record)} | ${cell(r.reasons.join('; '))} |`);
    }
  }
  return `${out.join('\n')}\n`;
}
