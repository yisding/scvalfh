/**
 * The editor's claims: the fixture ledger (lib/fixtures) read as one claim per fixture, and the slices each step
 * reads from them. Rebuilt from the ledger every run with `seenAt` the run's stamp, never carried: in the
 * claims file they are informational, and lib/claims/store.ts fromFile discards them.
 *
 * This is the one module under lib/claims that reads the ledger itself (tests/claims/boundary.test.ts); the rest
 * of the claims code takes an `EditorView` as an argument, so a test can hand in any ledger.
 */

import { DATA_QUALITY } from '../league-config/data-quality';
import { LEDGER, fixtureKey, ledgerView, type LedgerView } from '../fixtures/ledger';
import type { FixtureLedger } from '../fixtures/shape';
import type { Exclusions } from '../pipeline/normalize';
import type { ClaimStore } from './store';
import type { EditorClaim } from './types';

/** The same slices as lib/fixtures/ledger.ts LedgerView, built from the editor's claims. */
export type EditorView = LedgerView;

/** One claim per fixture of `ledger`, keyed by its fixtureKey, in the ledger's order. */
export function editorClaims(ledger: FixtureLedger, fetchedAt: string): EditorClaim[] {
  return ledger.fixtures.map((fixture) => ({ ref: fixtureKey(fixture), seenAt: fetchedAt, fixture }));
}

/** The slices of the ledger whose fixtures are `claims` and whose rejected rows are `rejected`: ledgerView of that ledger. */
export function editorView(claims: readonly EditorClaim[], rejected: FixtureLedger['rejected']): EditorView {
  return ledgerView({ fixtures: claims.map((c) => c.fixture), rejected });
}

/** What applyExclusions drops: the ghost teams' contests (DATA_QUALITY) and the editor's rejected and duplicate rows. */
export function exclusionsOf(view: EditorView): Exclusions {
  return { ghostTeamIds: DATA_QUALITY.ghostTeamIds, rejected: view.rejected };
}

/** A ledger (default: this build's) as the editor's claims and their view, stamped `fetchedAt`. */
export function ledgerEditor(fetchedAt: string, ledger: FixtureLedger = LEDGER): { claims: EditorClaim[]; view: EditorView } {
  const claims = editorClaims(ledger, fetchedAt);
  return { claims, view: editorView(claims, ledger.rejected) };
}

/**
 * The editor's claims onto the store: a fixture linked to a MaxPreps contest goes to that contest's fixture, and a
 * fixture with a listing (a game no feed lists) to a fixture of its own, named by its fixtureKey; a fixture of that
 * name read from the claims file (holding what other sources said of the listed game) is that one. A fixture linked
 * only to a league fixture is stored on no fixture: its one fact, the day and host it moves that league fixture to,
 * is the view's `moves`, which the official and si.com steps and assembly read.
 */
export function attachEditorClaims(store: ClaimStore, claims: readonly EditorClaim[]): void {
  for (const c of claims) {
    const contest = c.fixture.sources.maxpreps;
    const linked = contest !== undefined ? store.fixtureOf('maxpreps', contest) : undefined;
    if (linked !== undefined) store.attach(linked, 'editor', c);
    else if (c.fixture.listing) {
      const named = store.get(c.ref) !== undefined && store.get(c.ref)?.claims.maxpreps === undefined ? c.ref : undefined;
      store.attach(store.fixtureOf('editor', c.ref) ?? named ?? store.create(c.ref), 'editor', c);
    }
  }
}
