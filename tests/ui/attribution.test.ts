/**
 * The footer (components/layout/Attribution.tsx) on every page: its rules clause and scope note, the
 * text docs/DATA-SOURCES.md §6 quotes. A league that publishes no rules is "we found no published
 * league rules" (what we found, not a claim that none exist: review 2026-10-06).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Attribution from '../../components/layout/Attribution';
import { SITE_SCOPE_NOTE } from '../../components/layout/site';
import { getFetchedAt } from '../../lib/data';
import { textOf } from './html-text';

describe('the footer attribution', () => {
  const text = textOf(renderToStaticMarkup(createElement(Attribution, { snapshotAt: getFetchedAt() })))
    // ExternalLink's sr-only "(opens in a new tab)" is not part of the sentence a sighted reader sees.
    .replace(/ \(opens in a new tab\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:])/g, '$1');

  it('names the rules source of every league, and says what we did not find', () => {
    expect(text).toContain(
      'League alignment and rules from SCVAL, BVAL, PCAL and MCAL; EAL rules from the CIF Northern Section; ' +
        'Sunset: we found no published league rules; Southern Section rules from the CIF Southern Section; ' +
        'City, North and Metro: we found no published league rules; San Diego Section rules from the CIF San Diego Section.',
    );
    expect(text).not.toContain('no league rules are published');
  });

  it('carries the scope note', () => {
    expect(text).toContain(SITE_SCOPE_NOTE);
  });
});
