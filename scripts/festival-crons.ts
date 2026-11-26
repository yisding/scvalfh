#!/usr/bin/env tsx
/**
 * Print the cron lines .github/workflows/update-data-festival.yml must carry for the committed
 * data/field-hockey/festival.json (lib/festival/festival-crons.ts), as YAML ready to paste under `schedule:`.
 *
 *   pnpm festival-crons
 *
 * update-data-festival.yml's "Schedule drift check" step compares these lines with the workflow's after each refresh
 * and warns when they differ (TourneyMachine moved or added a slot); pasting them is the fix. Another sport's build has
 * no festival, so there is nothing to print (exit 0).
 */

import { festivalCrons } from '../lib/festival/festival-crons';
import { festivalSlots, getFestival } from '../lib/festival/festival';
import { runCliIfMain } from './cli';

export function main(argv: readonly string[]): number {
  if (argv.length > 0) {
    console.error('Usage: pnpm festival-crons');
    return argv.includes('--help') ? 0 : 1;
  }
  const lines = festivalCrons(festivalSlots(getFestival()));
  if (lines.length === 0) {
    console.log('festival-crons: this build has no festival games (field hockey only); nothing to schedule.');
    return 0;
  }
  for (const line of lines) console.log(`    - cron: '${line}'`);
  return 0;
}

runCliIfMain(import.meta.url, main);
