/**
 * `ccs`, `san-diego-section-playoffs`, `tournament-of-champions`: an event group's id tail (`postseason-<slug>`,
 * the anchor the pills link to), on the schedule index (schedule-view.ts) and the day page (day-summary.ts).
 */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
