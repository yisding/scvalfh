/**
 * A MaxPreps tournament page read whole (2026-11-14): every published bracket on it, with every matchup, seed,
 * result and the links that join the matchups into a tree. lib/sources/ccs.ts readTournamentPage answers only
 * "is this division published?"; this parser reads what is in a published block, so the site can draw each
 * division's bracket with every team in it, not only the games of the schools it covers.
 *
 * The page is server HTML (captured: tests/fixtures/corpus/volleyball-2026-11-14/ccs/bracket.html, the CCS girls
 * volleyball championship, six brackets; and maxpreps/tournament/*.html beside it, three divisions of the CIF State
 * championships). What the parser keys on, all of it markup MaxPreps' own bracket script reads:
 *
 *   <li id="bracket_<GUID>" data-bracket-type="standard-bracket|horizontal-bracket" …>
 *     <h2 class="bracket-name">Division 1</h2>
 *     <div class="round" data-round-index="0">
 *       <abbr class="start-date" title="2026-10-31T19:00:00.0000000">  <span class="round-name" title="1st round">
 *       <li data-matchup-index="0" id="matchup_<GUID>" data-winners-next-matchup-id="<GUID>"
 *           class="matchup-container has-seeds [is-bye] [has-result] [has-undefined-teams]">
 *         <header class="contest-header"><abbr title="2026-11-14T18:00:00.0000000">   (an unplayed game's start)
 *         <li class="team [matchwinner|matchloser]" data-school-id="<GUID>" data-source-matchup-id="<GUID>">
 *           <span class="seed">3</span> <span class="name"><a>Homestead</a></span> <a class="result" href="…?c=<contest>">3</a>
 *         <p class="description" title="@ Santiago Canyon College | Tickets">
 *
 * The all-zero GUID is MaxPreps' null (no next matchup, no school yet, no feeding matchup). A bye is a matchup
 * with one school and the other side empty; its team's "result" is the word "Bye". A horizontal bracket (the CIF
 * State championships: the two regionals side by side, the regional finals and the state final between them)
 * lists its rounds view by view, so a round's position on the page says nothing: the tree is the links.
 *
 * Nothing is inferred. A block still carrying `not-published`, or one with no matchup, is skipped; a matchup
 * the parser cannot read fails its whole bracket (null, with the reason), never a half-read tree.
 */

import { GUID_RE } from '../game-id';
import type { TournamentBracket, TournamentBracketMatchup, TournamentBracketSide } from '../types';

const NULL_GUID = '00000000-0000-0000-0000-000000000000';
const TOURNAMENT_PAGE = /^https:\/\/www\.maxpreps\.com\/tournament\/[A-Za-z0-9_\-/.]+\.htm$/;

/** true for a maxpreps.com/tournament/….htm page: the only URL the pipeline requests from a game's `bracket.url`. */
export function isTournamentPageUrl(url: string): boolean {
  return TOURNAMENT_PAGE.test(url);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** The text of a fragment: tags dropped, entities decoded, whitespace collapsed. */
function textOf(fragment: string): string {
  return decode(fragment.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function guidOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const id = value.toLowerCase();
  return GUID_RE.test(id) && id !== NULL_GUID ? id : null;
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}=["']([^"']*)["']`).exec(tag)?.[1];
}

/** '2026-11-14T18:00:00.0000000' → '2026-11-14T18:00:00'. */
function localStamp(value: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(value ?? '');
  return m ? m[1] : null;
}

/** The pieces of `html` that each start at a match of `open`, running to the next match (or the end). */
function splitAt(html: string, open: RegExp): string[] {
  const starts = [...html.matchAll(open)].map((m) => m.index);
  return starts.map((start, i) => html.slice(start, starts[i + 1] ?? html.length));
}

function parseSide(block: string): TournamentBracketSide {
  const openTag = /^<li\b[^>]*>/.exec(block)?.[0] ?? '';
  const teamId = guidOrNull(attr(openTag, 'data-school-id'));
  const name = textOf(/<span class="name"\s*>([\s\S]*?)<\/span>/.exec(block)?.[1] ?? '');
  const seed = Number.parseInt(textOf(/<span class="seed"\s*>([\s\S]*?)<\/span>/.exec(block)?.[1] ?? ''), 10);
  const result = textOf(/<a class="result"[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1] ?? '');
  return {
    teamId,
    name: teamId !== null && name ? name : null,
    // A seed printed beside an empty side (a bye's missing opponent) belongs to no team.
    seed: teamId !== null && Number.isInteger(seed) && seed > 0 ? seed : null,
    score: /^\d+$/.test(result) ? Number(result) : null,
    from: guidOrNull(attr(openTag, 'data-source-matchup-id')),
  };
}

function parseMatchup(block: string, round: string, roundDate: string): TournamentBracketMatchup | string {
  const openTag = /^<li\b[^>]*>/.exec(block)?.[0] ?? '';
  const id = guidOrNull(/\bid="matchup_([0-9a-f-]+)"/i.exec(openTag)?.[1]);
  if (id === null) return 'a matchup has no id';
  const teams = splitAt(block, /<li class="team\b/g);
  if (teams.length !== 2) return `matchup ${id} lists ${teams.length} sides`;
  const sides: [TournamentBracketSide, TournamentBracketSide] = [parseSide(teams[0]), parseSide(teams[1])];
  const classes = attr(openTag, 'class') ?? '';
  const bye = /\bis-bye\b/.test(classes);
  const won = teams.map((t) => /^<li class="team[^"]*\bmatchwinner\b/.test(t));
  const header = /<header class="contest-header"[\s\S]*?<\/header>/.exec(block)?.[0] ?? '';
  const description = attr(/<p class="description"[^>]*>/.exec(block)?.[0] ?? '', 'title');
  const site = decode(description ?? '').split('|').map((part) => part.trim()).find((part) => part.startsWith('@'));
  return {
    id,
    round,
    roundDate,
    next: guidOrNull(attr(openTag, 'data-winners-next-matchup-id')),
    contestId: bye ? null : guidOrNull(/[?&;]c=([0-9a-f-]{36})/i.exec(block)?.[1]),
    dateLocal: localStamp(attr(/<abbr\b[^>]*>/.exec(header)?.[0] ?? '', 'title')),
    bye,
    winner: bye || won[0] === won[1] ? null : won[0] ? 0 : 1,
    site: site ? site.replace(/^@\s*/, '').trim() || null : null,
    sides,
  };
}

export interface TournamentPageBrackets {
  /** The page's own heading ('2026 CIF State Girls Volleyball Championships'), '' when it has none. */
  tournament: string;
  /** Every published bracket that parsed, in page order (`event` and `url` are the caller's to set). */
  brackets: Array<Omit<TournamentBracket, 'event' | 'url'>>;
  /** One line per bracket block that was skipped or failed, for the run log. */
  problems: string[];
}

/**
 * Every published bracket on a MaxPreps tournament page. A page with no bracket block gives `brackets: []` and a
 * problem line; the caller treats that as "not read".
 */
export function parseTournamentBrackets(html: string): TournamentPageBrackets {
  const tournament = textOf(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
  const blocks = splitAt(html, /<li id="bracket_[0-9a-f-]+"/gi);
  const out: TournamentPageBrackets = { tournament, brackets: [], problems: [] };
  if (blocks.length === 0) out.problems.push('no <li id="bracket_…"> block on the page');
  for (const block of blocks) {
    const bracketId = guidOrNull(/^<li id="bracket_([0-9a-f-]+)"/i.exec(block)?.[1]);
    const name = textOf(/<h2 class="bracket-name"\s*>([\s\S]*?)<\/h2>/.exec(block)?.[1] ?? '');
    const label = name || bracketId || 'a bracket';
    if (bracketId === null || !name) {
      out.problems.push(`${label}: no id or no name`);
      continue;
    }
    if (/not-published/.test(block)) {
      out.problems.push(`${label}: not published`);
      continue;
    }
    const matchups: TournamentBracketMatchup[] = [];
    let failed: string | null = null;
    for (const round of splitAt(block, /<div class="round"/g)) {
      const roundName = decode(attr(/<span class="round-name"[^>]*>/.exec(round)?.[0] ?? '', 'title') ?? '').trim();
      const roundDate = localStamp(attr(/<abbr class="start-date"[^>]*>/.exec(round)?.[0] ?? '', 'title'))?.slice(0, 10);
      if (!roundName || !roundDate) {
        failed = 'a round has no name or no date';
        break;
      }
      for (const m of splitAt(round, /<li data-matchup-index=/g)) {
        const parsed = parseMatchup(m, roundName, roundDate);
        if (typeof parsed === 'string') {
          failed = parsed;
          break;
        }
        matchups.push(parsed);
      }
      if (failed) break;
    }
    const ids = new Set(matchups.map((m) => m.id));
    const linked = matchups.every((m) => [m.next, m.sides[0].from, m.sides[1].from].every((l) => l === null || ids.has(l)));
    if (!failed && matchups.length === 0) failed = 'no matchup';
    if (!failed && ids.size !== matchups.length) failed = 'a matchup id repeats';
    if (!failed && !linked) failed = 'a matchup links outside the bracket';
    if (!failed && matchups.filter((m) => m.next === null).length !== 1) failed = 'no single last matchup';
    if (failed) {
      out.problems.push(`${label}: ${failed}`);
      continue;
    }
    out.brackets.push({ tournament, bracketId, name, matchups });
  }
  return out;
}
