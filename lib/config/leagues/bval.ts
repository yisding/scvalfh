/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: the Blossom Valley Athletic League (CCS) and its by-laws citation.
 */

import type { LeagueConfig } from '@/lib/model/league-config';

export const BVAL_BYLAWS = 'BVAL Field Hockey By-Laws (rev. 8/13/24)';

export const BVAL: LeagueConfig = {
  id: 'bval', sectionId: 'ccs',
  name: 'Blossom Valley Athletic League', shortName: 'BVAL',
  cities: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
  alignmentSource: 'its official schedule',
  officialUrl: 'https://bval.org/field-hockey/',
  links: [
    { label: 'BVAL field hockey', href: 'https://bval.org/field-hockey/' },
    { label: 'BVAL Field Hockey By-Laws (rev. 8/13/24)', href: 'https://docs.google.com/document/d/1sI0CxQMZ0m8T6tJWt6Cd3btjTNcGwAgz/edit' },
  ],
  sblive: { leagueSlugs: ['4175-blossom-valley-mount-hamilton'], backfill: true },
  officialCodes: { WG: 'willow-glen' },
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'mt-hamilton', leagueId: 'bval', label: 'Mt. Hamilton', searchAliases: ['Mount Hamilton', 'Mt Hamilton'],
      maxprepsLeagueId: '8ec791a6-463e-4313-86de-1bd02671054a',
      maxprepsName: 'Blossom Valley - Mount Hamilton', maxprepsSlug: 'blossom-valley--mount-hamilton',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-17', last: '2026-10-30' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: 'data/official/bval-2026.json',
        scheduleUrl: 'https://docs.google.com/document/d/150BDI14JosnaB71NoTwYyLp1AFfXSVXb/edit',
        revisionCheckUrl: 'https://drive.google.com/uc?export=download&id=150BDI14JosnaB71NoTwYyLp1AFfXSVXb',
        bundledSha256: '2b0eb69347cdb0e6aa57da94213db50bd5eadeccfeed96370b5c8106ef2cb172',
        revisedOn: '9/20/26',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'AQ line' },
      ladderLine: { after: 3, label: 'AQ line' },
    },
    {
      id: 'santa-teresa', leagueId: 'bval', label: 'Santa Teresa', searchAliases: [],
      maxprepsLeagueId: '7c899b2d-07fa-4664-976c-a4f57d12eeec',
      maxprepsName: 'Blossom Valley - Santa Teresa', maxprepsSlug: 'blossom-valley--santa-teresa',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-18', last: '2026-10-30' },
      official: {
        source: 'bval-docx', mode: 'bundled', bundledFile: 'data/official/bval-2026.json',
        scheduleUrl: 'https://docs.google.com/document/d/1CrK6oOd5_Lu91rHAfpIlMtqaxMhLxSwD/edit',
        revisionCheckUrl: 'https://drive.google.com/uc?export=download&id=1CrK6oOd5_Lu91rHAfpIlMtqaxMhLxSwD',
        bundledSha256: '5730fb6089f31d94abd2ebe7a3073114f3867eef731391c8dd113557b79d7303',
        revisedOn: '9/22/26',
      },
      maxprepsTeamCount: 5, maxprepsMissing: ['prospect'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps’ Santa Teresa table leaves out Prospect and counts four of Prospect’s official league games as non-league, so its records here differ from ours. This table is computed from BVAL’s official schedule.',
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Play-in host' },
      ladderLine: { after: 1, label: 'Play-in host' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    classification: 'official-fixtures', excludeContestTypes: [2, 4], postseasonFrom: null, leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['head-to-head', 'division-wins', 'h2h-goal-diff', 'division-goals-against', 'coin-flip'] },
    multiTeam: 'seed-one-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'sudden-victory',
    citations: {
      points: `${BVAL_BYLAWS} §6a (3 points for a win, 1 for a tie)`,
      pointsShort: 'BVAL by-laws §6a',
      order: `${BVAL_BYLAWS} §6a (division placement is the order of team points)`,
      doubleRoundRobin: 'BVAL 2026-27 schedules (home-and-home double round robin; division games only)',
      overtime: `${BVAL_BYLAWS} §1a (one 7-minute 7v7 sudden-victory period; still tied ⇒ the game ends in a tie)`,
      coChampions: `${BVAL_BYLAWS} §6a (“If there is a tie, both teams shall be declared Division Champions”)`,
      stages: {
        'head-to-head': `${BVAL_BYLAWS} §6b (head-to-head; with three or more tied, a 3-1-0 mini-league among them)`,
        'division-wins': `${BVAL_BYLAWS} §6c (more division wins)`,
        'h2h-goal-diff': `${BVAL_BYLAWS} §6d (head-to-head goal differential among the tied teams)`,
        'division-goals-against': `${BVAL_BYLAWS} §6e (fewest goals allowed in division play)`,
        'coin-flip': `${BVAL_BYLAWS} §6f (coin flip — we cannot compute it, so the teams stay tied)`,
      },
    },
    coChampionsLabel: 'Division co-champions',
    unresolvedSuffix: '— BVAL By-Laws §6f decides it with a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: `${BVAL_BYLAWS} §7a (Mt. Hamilton 1st-3rd are BVAL #1-#3; Mt. Hamilton 4th plays at the Santa Teresa champion for BVAL #4)`,
    ladder: [
      { divisions: ['mt-hamilton'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier (BVAL #1-#3)' },
      { divisions: ['mt-hamilton'], places: [4, 4], status: 'play-in', label: 'Play-in game Oct 31',
        phrase: 'the Oct 31 play-in', badge: 'Play-in',
        legend: '4th place — plays at the Santa Teresa champion {date}, 11 AM, for BVAL’s 4th berth' },
      { divisions: ['mt-hamilton'], places: [5, 99], status: 'no-aq-route', label: 'No automatic-berth route',
        phrase: 'no automatic-berth route', badge: 'No AQ route',
        legend: '5th or lower — no automatic-berth route (at-large is the CCS committee’s call)' },
      { divisions: ['santa-teresa'], places: [1, 1], status: 'play-in', label: 'Hosts the play-in Oct 31',
        phrase: 'hosting the Oct 31 play-in', badge: 'Play-in host',
        legend: 'Champion — hosts Mt. Hamilton #4 {date}, 11 AM, for BVAL’s 4th berth' },
      { divisions: ['santa-teresa'], places: [2, 99], status: 'no-aq-route', label: 'No automatic-berth route',
        phrase: 'no automatic-berth route', badge: 'No AQ route',
        legend: '2nd or lower — no automatic-berth route (at-large is the CCS committee’s call)' },
    ],
    pairings: [{
      id: 'bval-play-in', date: '2026-10-31', time: '11:00', tag: 'bval-play-in',
      seats: [{ division: 'santa-teresa', place: 1 }, { division: 'mt-hamilton', place: 4 }],
      seatLabels: ['Santa Teresa #1', 'Mt. Hamilton #4'], host: 0, isPlayIn: true,
      label: 'Mt. Hamilton #4 at Santa Teresa #1 — play-in for BVAL’s 4th automatic CCS berth',
    }],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'play-in', through: '2026-10-31' },
    { phase: 'playoffs', through: '2026-11-14' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-30', label: 'Last BVAL league games' },
    { id: 'play-in', date: '2026-10-31', label: 'BVAL play-in, 11 AM' },
  ],
  officialChanges: null,
};
