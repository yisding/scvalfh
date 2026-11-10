/**
 * What orders a league's table, and how a row's place in that order is printed (LeagueRules.orderBy).
 *
 * 'points' (every field hockey and soccer league): the league's points; the column is PTS and a row prints
 * its total ('13'). 'win-pct' (SCVAL basketball, By-Laws Article VI §1: "A team's league record determines
 * their finish"): the share of league games won; the column is PCT and a row prints '.750'. Under 'win-pct' a
 * row's stored `pts` is its league wins (points { win: 1, tie: 0, loss: 0 }), which no reader prints as points.
 *
 * Pure and config-free: every function takes the rule, so a client component may use it with a rule handed
 * down as a prop.
 */

import { plural, winPct } from '../format';
import type { LeagueRules } from '../league-config/shape';

type OrderRule = Pick<LeagueRules, 'orderBy'>;
type Row = { pts: number; winPct: number; gp: number };

/** Whether the table is ordered on the league record (win percentage), not on points. */
export function ordersByRecord(rules: OrderRule): boolean {
  return rules.orderBy === 'win-pct';
}

/** The order column's head: 'PTS' or 'PCT'. */
export function orderHead(rules: OrderRule): 'PTS' | 'PCT' {
  return ordersByRecord(rules) ? 'PCT' : 'PTS';
}

/** The head in words, for a `title` or a screen-reader label: 'Points' / 'Winning percentage'. */
export function orderHeadWords(rules: OrderRule): string {
  return ordersByRecord(rules) ? 'Winning percentage' : 'Points';
}

/** What the table is ordered on, in a sentence: 'points' / 'league record'. */
export function orderNoun(rules: OrderRule): string {
  return ordersByRecord(rules) ? 'league record' : 'points';
}

/** A row's cell in the order column: '13', or '.750'. */
export function orderValue(rules: OrderRule, row: Row): string {
  return ordersByRecord(rules) ? winPct(row.winPct) : String(row.pts);
}

/** The same with its unit, for running copy and labels: '13 pts' / '.750'. */
export function orderValueShort(rules: OrderRule, row: Row): string {
  return ordersByRecord(rules) ? winPct(row.winPct) : `${row.pts} pts`;
}

/** The same in words, for a screen reader: '13 points' / 'winning percentage .750'. */
export function orderValueWords(rules: OrderRule, row: Row): string {
  return ordersByRecord(rules) ? `winning percentage ${winPct(row.winPct)}` : plural(row.pts, 'point');
}

/** Whether two rows are level in the table's order. */
export function levelInOrder(rules: OrderRule, a: Row, b: Row): boolean {
  return ordersByRecord(rules) ? a.winPct === b.winPct : a.pts === b.pts;
}

/** A sort comparator, best first, on the table's order alone (no tiebreak). */
export function compareInOrder(rules: OrderRule, a: Row, b: Row): number {
  return ordersByRecord(rules) ? b.winPct - a.winPct : b.pts - a.pts;
}
