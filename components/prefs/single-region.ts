/**
 * The soccer and basketball builds cover one region (lib/league-config/sections.ts REGIONS: Northern California), so
 * they have no region to switch to; only field hockey's build (SCVAL_SPORT unset or 'field-hockey') has two. Read
 * from the inlined SCVAL_SPORT (next.config.ts `env`), not lib/sports/current, so a client module that imports this
 * bundles no sport definition. Its own module, not an export of LeagueSwitcher.tsx: a server component that imports a
 * value from a 'use client' file gets a reference, not the value.
 */
// Unset (a test, a script) is field hockey, as in lib/sports/current.ts; the builds always inline a value.
export const SINGLE_REGION = !!process.env.SCVAL_SPORT && process.env.SCVAL_SPORT !== 'field-hockey';
