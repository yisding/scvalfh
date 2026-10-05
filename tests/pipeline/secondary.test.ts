/**
 * lib/pipeline/steps/secondary.ts, the VNN per-site carry (SPEC §5.3, §7.13): a school calendar
 * that fails this run keeps the venue and confirmed start time its games had in the previous
 * snapshot, its source row turns stale stamped with when that calendar was last fresh
 * (carriedFromOf follows a row that was itself carried), and the run log says so.
 * No corpus has VNN files, so the corpus runs never reach this branch; this test drives it alone.
 */

import { describe, expect, it } from 'vitest';

import { TransportError, resourcePath, type ResourceKey, type Transport } from '../../lib/pipeline/contract';
import { PipelineContext, SILENT_SINK } from '../../lib/pipeline/ledger';
import { stepSecondary } from '../../lib/pipeline/steps/secondary';
import type { Game, Snapshot, SourceStatus } from '../../lib/types';
import { game } from '../helpers';
import { testRunArgs } from './support/run-args';

const PREVIOUS_AT = '2026-10-01T14:00:00.000Z';
const EARLIER = '2026-09-30T14:00:00.000Z';

/** Los Gatos' calendar answers with one varsity event; Palo Alto's fails. */
const LOS_GATOS_ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:1@mmboltapi.azurewebsites.net',
  'DTSTART:20261004T000000Z',
  'SUMMARY:Girls Varsity Field Hockey vs Lynbrook High School',
  'LOCATION:Los Gatos High School',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const transport: Transport = {
  mode: 'fixture',
  async get(key: ResourceKey) {
    const url = `fixture:${resourcePath(key)}`;
    if (key.kind === 'vnn-ics' && key.team === 'los-gatos') return { url, httpStatus: 200, body: LOS_GATOS_ICS };
    throw new TransportError('HTTP 500', url, 500);
  },
};

const paly: Game = game({ home: 'palo-alto', away: 'saratoga', status: 'scheduled', date: '2026-10-02' });
const annotated: Game = { ...paly, venue: { text: null, name: 'Paly Field' }, timeConfirmed: true };

const previousRow: SourceStatus = {
  id: 'vnn-ics',
  kind: 'school-calendar',
  scope: { league: 'scval', team: 'palo-alto' },
  label: 'palo-alto school calendar',
  url: 'https://example.com/palo-alto.ics',
  status: 'ok',
  fetchedAt: PREVIOUS_AT,
};
const previous = { fetchedAt: PREVIOUS_AT, games: [annotated], sources: [previousRow] } as unknown as Snapshot;

describe('stepSecondary: the VNN per-site carry', () => {
  it('carries a failed calendar\'s annotations, marks its row stale and warns', async () => {
    const ctx = new PipelineContext({
      args: testRunArgs({ leagues: ['scval'], ccs: false }),
      transport,
      previous,
      sink: SILENT_SINK,
    });
    const { games } = await stepSecondary(ctx, [paly]);

    expect(games.map((g) => [g.contestId, g.venue.name, g.timeConfirmed])).toEqual([[paly.contestId, 'Paly Field', true]]);

    const rows = ctx.sources.all().filter((r) => r.id === 'vnn-ics');
    expect(rows.find((r) => r.label === 'palo-alto school calendar')).toMatchObject({
      status: 'stale',
      error: 'HTTP 500; carried forward from the previous snapshot',
      carriedFrom: PREVIOUS_AT,
    });
    expect(rows.find((r) => r.label === 'los-gatos school calendar')?.status).toBe('ok');

    expect(ctx.logLines).toContain(
      'WARN vnn: palo-alto produced no calendar events — carried 1 venue/start-time annotation forward from the previous snapshot',
    );
  });

  it('stamps a calendar that failed again with when it was last fresh, not another site\'s read', async () => {
    const losGatosRow: SourceStatus = {
      ...previousRow,
      scope: { league: 'scval', team: 'los-gatos' },
      label: 'los-gatos school calendar',
      url: 'https://example.com/los-gatos.ics',
    };
    const palyStale: SourceStatus = { ...previousRow, status: 'stale', carriedFrom: EARLIER };
    const ctx = new PipelineContext({
      args: testRunArgs({ leagues: ['scval'], ccs: false }),
      transport,
      previous: { ...previous, sources: [losGatosRow, palyStale] } as Snapshot,
      sink: SILENT_SINK,
    });
    await stepSecondary(ctx, [paly]);

    expect(ctx.sources.all().find((r) => r.label === 'palo-alto school calendar')).toMatchObject({
      status: 'stale',
      carriedFrom: EARLIER,
    });
  });
});
