/**
 * The instant this build ran, as an ISO UTC string.
 *
 * A fully static site cannot observe its own staleness at view time, so the stale-snapshot state
 * (DESIGN §7.15) is measured against the BUILD instant instead: if the scheduled fetch fails but the
 * scheduled build still runs, `snapshot.fetchedAt` is old against a fresh build and the footer says
 * so. That is exactly the failure the state exists for.
 *
 * It is read once at module scope, so every page in a build stamps the same instant, and
 * `SCVAL_BUILD_AT` lets CI pin it for a byte-reproducible build.
 */
export const BUILD_INSTANT: string = process.env.SCVAL_BUILD_AT ?? new Date().toISOString();
