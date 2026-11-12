'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * The rounds of one bracket (components/playoffs/Bracket.tsx draws the cells on the server and hands
 * each round's content here as a node).
 *
 * From 1024px the rounds are columns and every one shows (app/globals.css `.sx-bracket`). Below that
 * a round shows only while it carries `data-current`, and this component decides which: the server
 * marks EVERY round, so without JavaScript they all read, stacked; once hydrated, one round shows and
 * the tab row above picks another. The first choice is the round the caller calls current (the first
 * with a game still to finish), unless the address names a cell of another round (a game's "Bracket"
 * link lands on its cell: components/playoffs/bracket-link.ts), which then wins.
 */
export interface BracketRoundsProps {
  /** One entry per round, in order. */
  rounds: ReadonlyArray<{
    key: string;
    /** The tab's word: 'Quarterfinals'. */
    tab: string;
    /** The ids of the round's cells, for an address that names one. */
    ids: readonly string[];
    /** The round's heading and cells, drawn on the server. */
    content: React.ReactNode;
  }>;
  /** The index of the round to open on. */
  current: number;
  /** Names the tab row for a screen reader: 'CCS Division 1 rounds'. */
  label: string;
}

const noop = () => () => {};

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function BracketRounds({ rounds, current, label }: BracketRoundsProps) {
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.slice(1),
    () => '',
  );
  // A tab press holds only for the address it was made under: a later "Bracket" link wins again.
  const [picked, setPicked] = useState<{ index: number; hash: string } | null>(null);
  const named = hash ? rounds.findIndex((round) => round.ids.includes(hash)) : -1;
  const shown = picked && picked.hash === hash ? picked.index : named >= 0 ? named : current;

  // The browser scrolled to the named cell while every round was still stacked; narrowing to one
  // round moved it, so bring it back into view.
  useEffect(() => {
    if (hydrated && named >= 0) document.getElementById(hash)?.scrollIntoView({ block: 'center' });
  }, [hydrated, named, hash]);

  return (
    <>
      {rounds.length > 1 ? (
        <nav className="sx-round-tabs sx-js-only sx-print-hide" aria-label={label}>
          <ul className="sx-tabs">
            {rounds.map((round, index) => (
              <li key={round.key}>
                <button
                  type="button"
                  className="sx-tab"
                  aria-pressed={hydrated && index === shown}
                  onClick={() => setPicked({ index, hash })}
                >
                  {round.tab}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="sx-bracket mt-3">
        {rounds.map((round, index) => (
          <div key={round.key} className="sx-round" data-current={!hydrated || index === shown ? '' : undefined}>
            {round.content}
          </div>
        ))}
      </div>
    </>
  );
}

export default BracketRounds;
