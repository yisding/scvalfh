/**
 * What `pnpm build-players --review` shows a person: the registry's review list (data/players.json
 * `review`), sorted into what needs an answer and what a rule already decided, with the evidence
 * for each pair laid out side by side and a draft answer for data/player-identity.json.
 *
 *   questions  the items only a person can settle: possible matches, a name that fits two players
 *              or the wrong class year, one name in two sports. Each pair is put in a pattern
 *              (below), and the patterns are listed most likely one player first.
 *   decided    what a rule settled and lists so it can be checked: two MaxPreps careers under one
 *              name (joined), one career under two unrelated names (split). Nothing to answer
 *              unless one is wrong.
 *   ties       official names (lib/players/official-name.ts) that came down to which source is
 *              more official, the spellings' support being even: a person who knows says which in
 *              data/player-identity.json `names`.
 *
 * A pair's pattern, from its two players' stints on the team:
 *   two-lists    listed in the same season at the same level by two different lists, each list
 *                giving one spelling: almost always one player and a slip
 *   new-career   one MaxPreps career ends the season before another begins, the class year the same:
 *                a returning player MaxPreps filed under a new career
 *   returning    the same, where one side is known by a name alone (an all-league list, a school list)
 *   concurrent   listed in the same season at different levels: two players, sisters as often as not
 *   unclear      anything else (class years a year apart, seasons apart)
 *
 * Drafts are only drafts: each `basis` starts with "DRAFT", which data/player-identity.json refuses
 * (lib/players/registry-schema.ts), so one cannot be committed without a person rewriting it.
 *
 * Pure: it reads nothing. scripts/build-players.ts hands it the files and the career links.
 */

import { nameKey } from './name-compare';
import { chooseNames, type DecidedBy } from './official-name';
import type { ObservationSource, Player, PlayerIdentity, PlayersFile, ReviewItem, Stint } from './registry-schema';

export const PATTERNS = ['two-lists', 'new-career', 'returning', 'unclear', 'concurrent'] as const;
export type Pattern = (typeof PATTERNS)[number];
export type Verdict = 'likely one player' | 'unclear' | 'likely two players';

const VERDICT: Record<Pattern, Verdict> = {
  'two-lists': 'likely one player',
  'new-career': 'likely one player',
  returning: 'likely one player',
  unclear: 'unclear',
  concurrent: 'likely two players',
};

const PATTERN_LABEL: Record<Pattern, string> = {
  'two-lists': 'two lists, one season: each list gives one spelling',
  'new-career': 'a returning player under a new MaxPreps career',
  returning: 'a name on last season\'s list, a MaxPreps career this season',
  unclear: 'neither pattern',
  concurrent: 'listed in the same season at different levels',
};

const SOURCE_LABEL: Record<ObservationSource, string> = {
  'maxpreps-roster': 'MaxPreps roster',
  'maxpreps-jv-roster': 'MaxPreps JV roster',
  enrichment: 'overlay',
  'school-roster': 'school varsity list',
  'school-jv-roster': 'school JV list',
  'maxpreps-stats': 'MaxPreps stat sheet',
  'all-league': 'all-league list',
  profile: 'recruiting profile',
};

export interface StintEvidence {
  season: string;
  level: string;
  jersey: string | null;
  grade: number | null;
  /** The sources that list the player in this stint, as words: "MaxPreps JV roster". */
  sources: string[];
  /** The pages those sources were read on, where the file records them. */
  urls: string[];
}

export interface Side {
  id: string;
  name: string;
  /** The spelling this item is about, when it is not the official name. */
  spelling: string;
  classOf: number | null;
  careers: Array<{ careerId: string; url: string | null }>;
  stints: StintEvidence[];
}

export interface Question {
  item: ReviewItem;
  pattern: Pattern;
  verdict: Verdict;
  /** "both #10", "both class of 2029", …: what tells the two apart or together. */
  facts: string[];
  sides: Side[];
}

export interface Tie {
  sport: string;
  team: string;
  player: string;
  name: string;
  decidedBy: DecidedBy;
  where: string[];
  others: Array<{ name: string; kind: string; where: string[] }>;
}

export interface Drafts {
  sameAs: PlayerIdentity['sameAs'];
  notSame: PlayerIdentity['notSame'];
  names: PlayerIdentity['names'];
}

export interface ReviewReport {
  questions: Question[];
  decided: ReviewItem[];
  ties: Tie[];
  drafts: Drafts;
}

const QUESTION_KINDS: ReadonlyArray<ReviewItem['kind']> = ['possible-match', 'same-name-other-sport', 'possible-transfer', 'name-ambiguous', 'name-class-mismatch'];
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function stintsOn(p: Player, sport: string, team: string): Stint[] {
  return p.stints.filter((s) => s.sport === sport && s.team === team).sort((a, b) => byText(a.season, b.season) || byText(a.level, b.level));
}

function evidence(s: Stint): StintEvidence {
  const sources = [...new Set(s.observations.map((o) => (o.kind && (o.src === 'enrichment' || o.src === 'profile') ? `${SOURCE_LABEL[o.src]} (${o.kind})` : SOURCE_LABEL[o.src])))];
  const urls = [...new Set(s.observations.flatMap((o) => (o.url ? [o.url] : [])))];
  return { season: s.season, level: s.level, jersey: s.jersey, grade: s.grade, sources, urls };
}

/** " #10", or nothing: a jersey as the report prints it (a source may write "#30" or "08"). */
const number = (jersey: string | null) => (jersey ? ` #${jersey.replace(/^#/, '')}` : '');

/** "volleyball 25-26 jv #10 grade 9 (all-league list)": a stint as the curation file's bases write one. */
function stintPhrase(sport: string, e: StintEvidence): string {
  return `${sport} ${e.season} ${e.level}${number(e.jersey)}${e.grade ? ` grade ${e.grade}` : ''} (${e.sources.join(', ')})`;
}

function careersOf(p: Player, urls: ReadonlyMap<string, string>): Side['careers'] {
  return p.identifiers.flatMap((i) => (i.kind === 'maxpreps-career' ? [{ careerId: i.careerId, url: urls.get(i.careerId) ?? null }] : []));
}

function classify(sport: string, team: string, a: Player, b: Player): Pattern {
  const [sa, sb] = [stintsOn(a, sport, team), stintsOn(b, sport, team)];
  const seasonsA = new Set(sa.map((s) => s.season));
  const together = sb.filter((s) => seasonsA.has(s.season));
  if (together.length > 0) {
    return together.some((s) => sa.some((t) => t.season === s.season && t.level === s.level)) ? 'two-lists' : 'concurrent';
  }
  if (a.classOf !== null && b.classOf !== null && a.classOf !== b.classOf) return 'unclear';
  const careers = (p: Player) => p.identifiers.some((i) => i.kind === 'maxpreps-career');
  return careers(a) && careers(b) ? 'new-career' : 'returning';
}

/** The facts that weigh: a shared number, the class years, the careers. */
function factsOf(sport: string, team: string, a: Player, b: Player): string[] {
  const out: string[] = [];
  const numbers = (p: Player) => new Set(stintsOn(p, sport, team).flatMap((s) => (s.jersey ? [s.jersey.replace(/^#?0*(?=\d)/, '')] : [])));
  const shared = [...numbers(a)].filter((n) => numbers(b).has(n));
  if (shared.length) out.push(`both #${shared.join(', #')}`);
  else if (numbers(a).size && numbers(b).size) out.push(`#${[...numbers(a)].join('/')} and #${[...numbers(b)].join('/')}`);
  if (a.classOf !== null && a.classOf === b.classOf) out.push(`both class of ${a.classOf}`);
  else if (a.classOf !== null && b.classOf !== null) out.push(`class of ${a.classOf} and ${b.classOf}`);
  else out.push(`class of ${a.classOf ?? b.classOf ?? 'unknown'}${a.classOf === null || b.classOf === null ? ' (one side gives none)' : ''}`);
  const careers = [a, b].map((p) => p.identifiers.filter((i) => i.kind === 'maxpreps-career').length);
  out.push(careers.every((n) => n > 0) ? 'each has its own MaxPreps career' : careers.some((n) => n > 0) ? 'one MaxPreps career' : 'no MaxPreps career');
  return out;
}

/** Whether another player of the team carries either spelling: the bases say when none does. */
function othersNamed(file: PlayersFile, sport: string, team: string, ids: readonly string[], spellings: readonly string[]): number {
  const keys = new Set(spellings.map(nameKey));
  return file.players.filter((p) => !ids.includes(p.id) && p.stints.some((s) => s.sport === sport && s.team === team) && p.names.some((n) => keys.has(nameKey(n)))).length;
}

function draftFor(file: PlayersFile, q: Question, today: string): { sameAs?: PlayerIdentity['sameAs'][number]; notSame?: PlayerIdentity['notSame'][number] } {
  const { item } = q;
  if (item.kind !== 'possible-match' || q.sides.length !== 2) return {};
  const sport = item.sport;
  const [x, y] = q.sides;
  const said = (s: Side) => `"${s.spelling}": ${s.stints.map((e) => stintPhrase(sport, e)).join('; ')}`;
  const others = othersNamed(file, sport, item.team, [x.id, y.id], [x.spelling, y.spelling]);
  const classLine = x.classOf !== null && x.classOf === y.classOf ? `both class of ${x.classOf}` : `classes of ${x.classOf ?? 'unknown'} and ${y.classOf ?? 'unknown'}`;
  const tail = `${others === 0 ? 'No other player of the team has either name.' : `${others} other player(s) of the team carry one of the names.`} Decided ${today}.`;
  if (q.verdict === 'likely two players') {
    return { notSame: { sport, team: item.team, names: [x.spelling, y.spelling], basis: `DRAFT — Two people. ${said(x)}. ${said(y)}. Listed in the same season, ${classLine}. ${tail}` } };
  }
  if (q.verdict !== 'likely one player') return {};
  // The side known by name alone, else the earlier one, is tied to the other's career.
  const nameSide = [x, y].find((s) => s.careers.length === 0) ?? [x, y].sort((a, b) => byText(a.stints[0]?.season ?? '', b.stints[0]?.season ?? ''))[0];
  const other = nameSide === x ? y : x;
  const basis = `DRAFT — One player. ${said(x)}. ${said(y)}. Same school, ${classLine}. ${tail}`;
  const career = other.careers[0]?.careerId;
  return {
    sameAs: career
      ? { sport, team: item.team, name: nameSide.spelling, careerId: career, basis }
      : { sport, team: item.team, name: nameSide.spelling, isName: other.spelling, basis },
  };
}

const TIE_RULES: ReadonlySet<DecidedBy> = new Set(['source', 'season', 'length', 'alphabet']);

function tiesOf(file: PlayersFile, identity: PlayerIdentity): Tie[] {
  const decided = new Set(identity.names.filter((e) => e.official !== undefined).map((e) => `${e.sport} ${e.team} ${nameKey(e.name)}`));
  const out: Tie[] = [];
  for (const p of file.players) {
    // MaxPreps' numbered stand-ins ("12118281 Nguyen") have no right spelling to find.
    if (p.names.length < 2 || /\d/.test(p.name)) continue;
    if (p.stints.some((s) => p.names.some((n) => decided.has(`${s.sport} ${s.team} ${nameKey(n)}`)))) continue;
    const seen = p.stints.flatMap((s) => s.observations.flatMap((o) => (o.name ? [{ name: o.name, src: o.src, season: s.season }] : [])));
    const spelled = p.names.filter((n) => seen.some((s) => s.name === n));
    if (spelled.length < 2) continue;
    const choice = chooseNames(spelled, seen);
    if (!TIE_RULES.has(choice.decidedBy)) continue;
    const where = (n: string) => [...new Set(seen.filter((s) => s.name === n).map((s) => `${SOURCE_LABEL[s.src]} ${s.season}`))];
    const home = [...p.stints].sort((a, b) => byText(b.season, a.season)).find((s) => s.observations.some((o) => o.name === p.name)) ?? p.stints[0];
    out.push({
      sport: home.sport,
      team: home.team,
      player: p.id,
      name: p.name,
      decidedBy: choice.decidedBy,
      where: where(p.name),
      others: p.aliases.filter((a) => a.kind === 'spelling' || a.kind === 'variant').map((a) => ({ name: a.name, kind: a.kind, where: where(a.name) })),
    });
  }
  return out.sort((a, b) => byText(a.sport, b.sport) || byText(a.team, b.team) || byText(a.name, b.name));
}

export function buildReviewReport(
  file: PlayersFile,
  identity: PlayerIdentity,
  options: { careerUrls?: ReadonlyMap<string, string>; today: string },
): ReviewReport {
  const urls = options.careerUrls ?? new Map<string, string>();
  const byId = new Map(file.players.map((p) => [p.id, p]));
  const questions: Question[] = [];
  const decided: ReviewItem[] = [];
  for (const item of file.review) {
    if (!QUESTION_KINDS.includes(item.kind)) {
      decided.push(item);
      continue;
    }
    const players = item.players.flatMap((id) => (byId.has(id) ? [byId.get(id) as Player] : []));
    const sides: Side[] = players.map((p, i) => ({
      id: p.id,
      name: p.name,
      spelling: item.names[i] ?? p.name,
      classOf: p.classOf,
      careers: careersOf(p, urls),
      stints: (item.kind === 'same-name-other-sport' ? p.stints.filter((s) => s.team === item.team) : item.kind === 'possible-transfer' ? p.stints : stintsOn(p, item.sport, item.team)).map(evidence),
    }));
    const pattern: Pattern = item.kind === 'possible-match' && players.length === 2 ? classify(item.sport, item.team, players[0], players[1]) : 'unclear';
    questions.push({
      item,
      pattern,
      verdict: VERDICT[pattern],
      facts: players.length === 2 && item.kind === 'possible-match' ? factsOf(item.sport, item.team, players[0], players[1]) : [],
      sides,
    });
  }
  const weight = (q: Question) => (q.facts.some((f) => f.startsWith('both #')) ? 0 : 1) + (q.facts.some((f) => f.startsWith('both class')) ? 0 : 1);
  questions.sort(
    (a, b) =>
      PATTERNS.indexOf(a.pattern) - PATTERNS.indexOf(b.pattern) || weight(a) - weight(b) || byText(a.item.sport, b.item.sport) ||
      byText(a.item.team, b.item.team) || byText(a.item.names.join('|'), b.item.names.join('|')),
  );

  const drafts: Drafts = { sameAs: [], notSame: [], names: [] };
  for (const q of questions) {
    const d = draftFor(file, q, options.today);
    if (d.sameAs) drafts.sameAs.push(d.sameAs);
    if (d.notSame) drafts.notSame.push(d.notSame);
  }
  const ties = tiesOf(file, identity);
  for (const t of ties) {
    drafts.names.push({
      sport: t.sport as PlayerIdentity['names'][number]['sport'],
      team: t.team,
      name: t.name,
      official: t.name,
      basis: `DRAFT — "${t.name}" (${t.where.join(', ')}) against ${t.others.map((o) => `"${o.name}" (${o.where.join(', ')})`).join(', ')}: the sources split evenly. Say which is right, and where that is from.`,
    });
  }
  return { questions, decided, ties, drafts };
}

/** The report as `--review` prints it. */
export function formatReviewReport(r: ReviewReport): string {
  const lines: string[] = [];
  lines.push(
    `for review: ${r.questions.length} question(s) to answer · ${r.decided.length} decided by a rule, listed to check · ${r.ties.length} official name(s) chosen on a tie`,
  );

  lines.push('', 'QUESTIONS — answer each in data/player-identity.json: sameAs if one player, notSame if two.');
  for (const pattern of PATTERNS) {
    const qs = r.questions.filter((q) => q.pattern === pattern);
    if (qs.length === 0) continue;
    lines.push('', `  ${VERDICT[pattern]} · ${PATTERN_LABEL[pattern]} (${qs.length})`);
    for (const q of qs) {
      lines.push(`    ${q.item.kind} · ${q.item.sport} ${q.item.team}: ${q.item.names.join(' / ')}${q.facts.length ? ` — ${q.facts.join(', ')}` : ''}`);
      if (q.item.kind !== 'possible-match') lines.push(`      ${q.item.note}`);
      for (const s of q.sides) {
        const careers = s.careers.length ? s.careers.map((c) => `career ${c.careerId}${c.url ? ` ${c.url}` : ''}`).join(' · ') : 'known by name';
        lines.push(`      ${s.spelling}${s.spelling !== s.name ? ` (shown as ${s.name})` : ''} · ${s.id} · class of ${s.classOf ?? '?'} · ${careers}`);
        for (const e of s.stints) {
          lines.push(`        ${e.season} ${e.level}${number(e.jersey)}${e.grade ? ` grade ${e.grade}` : ''} — ${e.sources.join(', ')}${e.urls.length ? ` ${e.urls.join(' ')}` : ''}`);
        }
      }
    }
  }

  lines.push('', 'DECIDED BY A RULE — nothing to answer unless one is wrong (distinct to undo a join, rowSplits to move a row).');
  for (const kind of [...new Set(r.decided.map((d) => d.kind))]) {
    const items = r.decided.filter((d) => d.kind === kind);
    lines.push('', `  ${kind} (${items.length})`);
    for (const d of items) lines.push(`    ${d.sport} ${d.team}: ${d.names.join(' / ')} — ${d.note}`);
  }

  lines.push('', 'OFFICIAL NAMES CHOSEN ON A TIE — the sources split evenly; if you know which is right, say so in data/player-identity.json names.');
  for (const t of r.ties) {
    lines.push(`    ${t.sport} ${t.team}: ${t.name} (${t.where.join(', ')}) over ${t.others.map((o) => `${o.name} (${o.where.join(', ')})`).join('; ')} — by ${t.decidedBy}`);
  }
  return lines.join('\n');
}
