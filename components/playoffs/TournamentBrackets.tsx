import { listWords, shortDate } from '../../lib/format';
import ExternalLink from '../ui/ExternalLink';
import MissingValue from '../ui/MissingValue';
import SectionHeader from '../ui/SectionHeader';

import Bracket, { type BracketRoundModel, type TieLineModel, type TieModel } from './Bracket';
import type { TournamentBracketView, TournamentBracketsView, TournamentTie, TournamentTieLine } from './tournament-brackets-view';

/**
 * The published brackets on /playoffs, one section per division (`#cif-division-iii`, `#ccs-open-division`,
 * `#ccs-division-1`, the anchors a game's "Bracket" link lands in: components/playoffs/bracket-link.ts), for a
 * championship MaxPreps publishes whole (volleyball: the CCS's Open Division and Divisions 1-5, and the CIF State
 * divisions a team of ours plays in). components/playoffs/tournament-brackets-view.ts decides what is drawn and
 * every word; this file only hands it to the site's one drawer (Bracket.tsx).
 *
 * Above the first bracket, a jump to each (seven brackets are several screens). Under the last, the CCS
 * divisions that hold none of our teams, named once, and where the brackets come from. A server component.
 */
export interface TournamentBracketsProps {
  view: TournamentBracketsView;
  /** The snapshot's day (YYYY-MM-DD): "as MaxPreps had them on …". */
  readOn: string;
  /** The names of the leagues this build covers, for the sentence about the other divisions: 'SCVAL or BVAL'. */
  leagueWords: string;
  /** The link row under the brackets (the official bracket, Scores). */
  children?: React.ReactNode;
}

function line(l: TournamentTieLine): TieLineModel {
  return {
    slug: l.slug,
    name: l.name,
    seed: l.seed,
    score: l.score === undefined ? undefined : l.score === null ? <MissingValue words="score not posted" /> : l.score,
    result: l.result,
    open: l.open,
  };
}

function tie(t: TournamentTie): TieModel {
  return {
    key: t.key,
    id: t.id,
    state: t.state,
    lines: [line(t.lines[0]), line(t.lines[1])],
    time: t.time,
    note: t.note,
    links:
      t.links.length > 0
        ? t.links.map((l) => (
            <ExternalLink key={l.href} href={l.href} className="sx-link inline-flex min-h-6 items-center">
              {l.label}
            </ExternalLink>
          ))
        : undefined,
    href: t.href,
    sentence: [t.sentence],
  };
}

/** One bracket as the shared drawer's rounds. */
export function tournamentRounds(bracket: TournamentBracketView): BracketRoundModel[] {
  return bracket.rounds.map((round) => ({
    key: round.key,
    name: round.name,
    dateLabel: round.dateLabel,
    ties: round.ties.map(tie),
    byes: round.byes,
  }));
}

export function TournamentBrackets({ view, readOn, leagueWords, children }: TournamentBracketsProps) {
  const { brackets, ccsOthers } = view;
  if (brackets.length === 0) return null;
  // One source link per event: its first bracket's page.
  const sources = brackets.filter((b, i) => brackets.findIndex((x) => x.event === b.event) === i);
  return (
    <div id="bracket" className="sx-target">
      {brackets.length > 1 ? (
        <nav aria-label="Brackets" className="sx-linkrow sx-print-hide">
          {brackets.map((b) => (
            <a key={b.id} href={`#${b.id}`} className="sx-action">
              {b.nav}
            </a>
          ))}
        </nav>
      ) : null}
      {brackets.map((b, index) => (
        <section
          key={b.id}
          id={b.id}
          aria-labelledby={`${b.id}-heading`}
          data-first={index === 0 ? '' : undefined}
          className="sx-section sx-target min-w-0"
        >
          <SectionHeader id={`${b.id}-heading`} kicker={b.name} meta={b.meta || undefined} />
          <Bracket rounds={tournamentRounds(b)} label={`${b.name} bracket`} />
        </section>
      ))}
      {ccsOthers.length > 0 ? (
        <p className="sx-note">
          {`CCS ${listWords(ccsOthers)} ${ccsOthers.length === 1 ? 'has' : 'have'} no ${leagueWords} team, so ${ccsOthers.length === 1 ? 'it is' : 'they are'} not drawn here; the official bracket has ${ccsOthers.length === 1 ? 'it' : 'them'}.`}
        </p>
      ) : null}
      <p className="sx-note">
        {`Brackets, seeds and results as MaxPreps had them on ${shortDate(readOn)}.`}{' '}
        {sources.map((b, i) => (
          <span key={b.event}>
            {i > 0 ? ' · ' : null}
            <ExternalLink href={b.url}>{b.event === 'cif' ? 'CIF State brackets on MaxPreps' : 'CCS brackets on MaxPreps'}</ExternalLink>
          </span>
        ))}
      </p>
      {children ? <p className="sx-linkrow">{children}</p> : null}
    </div>
  );
}

export default TournamentBrackets;
