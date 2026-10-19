/**
 * The run-abort error (SPEC §7.5). An import-free leaf on purpose: lib/pipeline/run-failure.ts
 * must recognise it without loading the pipeline contract (and through it the league config and
 * the team registry).
 */

/** Nothing is written; the previous snapshot stays. Only §7.5 run-abort triggers throw this. */
export class RunAbort extends Error {}
