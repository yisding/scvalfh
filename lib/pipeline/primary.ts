/**
 * The pipeline's first stage (lib/pipeline/run.ts, stage `primary`): the steps that read the build's primary source
 * (lib/sports/shape.ts PrimarySourceId) and start the view from it. Every later stage (the league schedules, si.com,
 * the school calendars, the bracket sheet, classification, the guards, the results) reads what this stage published,
 * whatever the source was.
 *
 *  - 'maxpreps' (every high school build): steps 02-06, the season bootstrap, the league metas, the reported tables,
 *    the team schedule feeds and their normalization (lib/pipeline/steps/{bootstrap,league-meta,reported,schedules,
 *    normalize}.ts).
 *  - 'teamsideline' (the VAL): the league's own schedule page (lib/pipeline/steps/teamsideline.ts).
 */

import { PRIMARY_SOURCE } from '../sports/current';
import type { PipelineContext, RunState } from './ledger';
import { stepBootstrap } from './steps/bootstrap';
import { stepLeagueMeta } from './steps/league-meta';
import { stepNormalize } from './steps/normalize';
import { stepReported } from './steps/reported';
import { stepSchedules } from './steps/schedules';
import { stepTeamsideline } from './steps/teamsideline';

export async function runPrimary(ctx: PipelineContext, state: RunState): Promise<void> {
  switch (PRIMARY_SOURCE) {
    case 'maxpreps':
      await stepBootstrap(ctx); // 02
      await stepLeagueMeta(ctx, state); // 03
      await stepReported(ctx, state); // 04
      await stepSchedules(ctx, state); // 05
      stepNormalize(ctx, state); // 06: the view starts from the MaxPreps claims
      return;
    case 'teamsideline':
      await stepTeamsideline(ctx, state); // 02-06: the view starts from the league's own schedule page
      return;
  }
}
