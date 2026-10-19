/**
 * Shared helpers of the league-config suites (tests/lib/config/leagues*.test.ts): the uncomputable
 * tiebreak stages, a league's tiebreak chains, every string a league could render, the SoCal ids, and
 * the mutate-assert-restore harness for assertLeagues().
 */

import { expect } from 'vitest';

import { ConfigInvariantError } from '@/lib/config/invariant';
import { LEAGUES, assertLeagues, getSection } from '@/lib/config/leagues';
import { type LeagueConfig, type SectionConfig } from '@/lib/model/league-config';
import type { TiebreakStage } from '@/lib/model/standings';

export const UNCOMPUTABLE: readonly TiebreakStage[] = ['coin-flip', 'ccs-points', 'no-rule'];

export function chainsOf(l: LeagueConfig): Array<[number | null, readonly TiebreakStage[]]> {
  return [
    [null, l.rules.tiebreaks.default],
    ...Object.entries(l.rules.tiebreaks.byBucketStart ?? {}).map(
      ([k, v]) => [Number(k), v!] as [number, readonly TiebreakStage[]],
    ),
  ];
}

/** Every string a league could render (Gabilan check). */
export function renderedStrings(l: LeagueConfig): string[] {
  const out: string[] = [
    l.name, l.shortName, l.cities, l.alignmentSource, ...l.links.map((x) => x.label), l.membershipNote ?? '',
  ];
  for (const d of l.divisions) {
    out.push(d.label, ...d.searchAliases, d.knownCause ?? '', d.home.lineLabel ?? '', d.ladderLine?.label ?? '');
    if (d.official.mode === 'none') out.push(d.official.note);
  }
  const r = l.rules;
  out.push(
    r.citations.points, r.citations.order, r.citations.doubleRoundRobin, r.citations.overtime,
    r.citations.coChampions, r.citations.incomplete ?? '', ...Object.values(r.citations.stages).map(String),
    r.coChampionsLabel, r.unresolvedSuffix,
  );
  for (const rung of l.postseason.ladder) out.push(rung.label, rung.phrase, rung.badge, rung.legend);
  const ps = l.postseason;
  switch (ps.kind) {
    case 'ccs-ladder':
      out.push(ps.citation);
      for (const p of ps.pairings) out.push(p.label, ...p.seatLabels);
      break;
    case 'league-tournament':
      out.push(ps.name, ps.titleNote, ps.finalSite.label, ...Object.values(ps.citations), ...ps.rounds.map((x) => x.pairing));
      break;
    case 'unbracketed-tournament':
      out.push(ps.name, ps.note, ...Object.values(ps.citations));
      break;
    case 'no-postseason':
      out.push(ps.note, ps.sourceLabel, ...Object.values(ps.citations));
      break;
    case 'section-playoffs':
      out.push(ps.name, ps.note, ps.qualificationLine, ps.sourceLabel, ...ps.divisions.map((d) => d.name), ...Object.values(ps.citations));
      break;
  }
  out.push(...l.keyDates.map((k) => k.label));
  // The league's section prints too, wherever the league's rules or postseason are explained.
  const section: SectionConfig = getSection(l.sectionId);
  out.push(section.name, section.briefLabel, section.rulesSource.name, section.noChampionshipNote ?? '');
  if (section.shootout) out.push(section.shootout.words, section.shootout.citation);
  return out;
}

export const SOCAL_IDS = ['sunset', 'city', 'north-county', 'metro', 'independents'];

export const socal = (): LeagueConfig[] => LEAGUES.filter((l) => SOCAL_IDS.includes(l.id));

/** Mutate the live config, expect assertLeagues() to throw, then restore. */
export function expectViolation(mutate: () => () => void, message: RegExp): void {
  const restore = mutate();
  try {
    expect(() => assertLeagues()).toThrow(message);
    expect(() => assertLeagues()).toThrow(ConfigInvariantError);
  } finally {
    restore();
  }
  expect(() => assertLeagues()).not.toThrow();
}
