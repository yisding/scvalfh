/**
 * No-op official and si.com steps for B-unit pipeline tests (SPEC §7.2: "B1's own tests may pass
 * no-op steps"). They never import B2's or B3's modules.
 */

import type { OfficialStep, PipelineSteps, SbliveStep } from '../../../lib/pipeline/contract';

export const noopOfficial: OfficialStep = async (_ctx, games) => ({
  games,
  unmatched: [],
  degradedDivisions: new Set(),
  revisedUpstream: new Set(),
  carriedDivisions: new Set(),
});

export const noopSblive: SbliveStep = async (_ctx, input) => ({
  games: input.games,
  unmatched: input.unmatched,
  crossCheck: undefined,
});

export const NOOP_STEPS: PipelineSteps = { official: noopOfficial, sblive: noopSblive };

/**
 * A stand-in official step for fixtures that need counted BVAL games before B2's matcher exists:
 * every same-division BVAL game whose contestTypes are not 2/4 gets a same-date stamp for its own
 * division. Test support only — never the real matcher.
 */
export const naiveBvalOfficial: OfficialStep = async (_ctx, games) => {
  const { divisionsOf } = await import('../../../lib/leagues');
  const bval = new Set(divisionsOf('bval').map((d) => d.id));
  return {
    games: games.map((g) => {
      const d = g.leagueDivision;
      const types = [g.contestTypes.home, g.contestTypes.away];
      if (d === null || !bval.has(d) || types.some((t) => t === 2 || t === 4) || !g.home.slug || !g.away.slug) return g;
      return {
        ...g,
        official: {
          scheduledDate: g.dateKey,
          division: d,
          source: 'bval-docx' as const,
          fixtureId: `${d}:${g.dateKey}:${g.away.slug}@${g.home.slug}`,
          pass: 'same-date' as const,
        },
      };
    }),
    unmatched: [],
    degradedDivisions: new Set(),
    revisedUpstream: new Set(),
    carriedDivisions: new Set(),
  };
};
