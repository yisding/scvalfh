#!/usr/bin/env tsx
/**
 * Compare two data/rosters.json files and print what changed (lib/roster-diff.ts): the summary the
 * weekly update-people workflow puts on its pull request.
 *
 *   pnpm roster-diff <before.json> <after.json>                    Markdown: every team that changed,
 *                                                                  then the research records to re-check
 *   pnpm roster-diff <before.json> <after.json> --format line      one line, for the commit message
 *   pnpm roster-diff <before.json> <after.json> --format review    "true" when a reviewer has something
 *                                                                  to read (lib/roster-diff.ts needsReview)
 *
 * A missing or empty <before.json> is a first run (every row is added). The research files are read
 * from data/ (data/rosters-enrichment.json, data/clubs.json, data/commits.json) as plain JSON, never
 * through lib/rosters.ts, lib/clubs.ts or lib/commits.ts, which throw at import when a roster change
 * has broken their join; a research file that is missing or not JSON is skipped with a warning.
 * Reads files only; makes no request and writes nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  diffRosters,
  formatRosterDiffLine,
  formatRosterDiffMarkdown,
  needsReview,
  researchRefs,
  type ResearchFiles,
} from '../lib/roster-diff';
import type { Rosters } from '../lib/rosters-schema';

const FORMATS = ['markdown', 'line', 'review'] as const;
type Format = (typeof FORMATS)[number];

function parseArgs(argv: readonly string[]): { before: string; after: string; format: Format } {
  const files: string[] = [];
  let format: Format = 'markdown';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--format') {
      const v = argv[i + 1];
      if (!v || !(FORMATS as readonly string[]).includes(v)) throw new Error(`--format takes one of ${FORMATS.join(', ')}`);
      format = v as Format;
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 2) throw new Error('usage: roster-diff <before.json> <after.json> [--format markdown|line|review]');
  return { before: files[0], after: files[1], format };
}

function readRosters(file: string, label: string): Rosters | null {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  if (text.trim() === '') return null;
  const raw = JSON.parse(text) as Rosters;
  if (typeof raw?.season !== 'string' || !Array.isArray(raw?.teams)) throw new Error(`${label} ${file} is not a rosters file`);
  return raw;
}

function readResearch<K extends keyof ResearchFiles>(name: string): ResearchFiles[K] {
  const file = path.join(process.cwd(), 'data', name);
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ResearchFiles[K];
  } catch (err) {
    console.warn(`roster-diff: skipping data/${name}: ${(err as Error).message}`);
    return null;
  }
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const after = readRosters(args.after, 'after:');
  if (!after) throw new Error(`after: ${args.after} is missing or empty`);
  const diff = diffRosters(readRosters(args.before, 'before:'), after);
  if (args.format === 'review') {
    process.stdout.write(`${needsReview(diff)}\n`);
  } else if (args.format === 'line') {
    process.stdout.write(`${formatRosterDiffLine(diff)}\n`);
  } else {
    const refs = researchRefs(diff, {
      enrichment: readResearch<'enrichment'>('rosters-enrichment.json'),
      clubs: readResearch<'clubs'>('clubs.json'),
      commits: readResearch<'commits'>('commits.json'),
    });
    process.stdout.write(formatRosterDiffMarkdown(diff, refs));
  }
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`roster-diff: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
