/**
 * The DOM half of `/schedule/<league>`'s filters (DESIGN §7.13): toggles the `hidden` attribute on
 * the server-rendered `[data-game]` rows and `[data-dategroup]` sections, and re-aims the timeline
 * rail. Plain functions over `document`, no React and no directive: ScheduleFilters.tsx (a
 * client module) calls `applyFilters` from its event handlers. Which rows match is
 * `matchesFilter` (views/schedule/filters-client.ts), which node tests cover.
 */

import { gameWord } from '@/lib/format/words';
import { matchesFilter, type FilterState } from '@/views/schedule/filters-client';
import { railLabel, railSr, railTargets, type RailKind, type RailMarker } from '@/views/schedule/rail-client';

/** Hides what does not match, hides a group whose every child is hidden, returns what is left. */
export function applyFilters(listId: string, f: FilterState): number {
  const root = document.getElementById(listId);
  if (!root) return 0;
  let visible = 0;
  root.querySelectorAll<HTMLElement>('[data-game]').forEach((row) => {
    const show = matchesFilter(row.dataset, f);
    row.hidden = !show;
    if (show) visible += 1;
  });
  root.querySelectorAll<HTMLElement>('[data-dategroup]').forEach((group) => {
    const shown = group.querySelectorAll('[data-game]:not([hidden])').length;
    group.hidden = shown === 0;
    const badge = group.querySelector<HTMLElement>('[data-date-count]');
    if (badge) {
      const total = Number(badge.dataset.total ?? shown);
      badge.textContent =
        shown === total ? `${total} ${gameWord(total)}` : `${shown} of ${total} ${gameWord(total)}`;
    }
  });
  retargetRail(
    root.querySelectorAll('[data-dategroup]').length,
    [...root.querySelectorAll<HTMLElement>('[data-dategroup]:not([hidden])')].map(
      (group) => group.dataset.dategroup ?? '',
    ),
  );
  return visible;
}

/** Replaces a span's text in place, keeping the text node React rendered. */
function setText(el: HTMLElement, text: string) {
  const node = el.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE && !node.nextSibling) node.nodeValue = text;
  else el.textContent = text;
}

/**
 * Re-aims the timeline rail's date chips (TimelineRail.tsx) at the date groups still shown, or
 * restores them once every group is shown. The server's href, label and screen-reader text are
 * saved to `data-*-orig` the first time a chip is touched, so "restore" is exact. A chip with
 * nothing shown to jump to (no shown contest in its month, none after today) hides its `<li>`.
 */
function retargetRail(totalGroups: number, shownDates: string[]) {
  const links = document.querySelectorAll<HTMLAnchorElement>(
    "nav[aria-label='Jump to a date'] a[data-rail-date]",
  );
  const markers: RailMarker[] = [...links].map((link) => ({
    date: link.dataset.railDate ?? '',
    kind: (link.dataset.railKind ?? 'up') as RailKind,
  }));
  const allShown = shownDates.length === totalGroups;
  const targets = railTargets(shownDates, markers);
  links.forEach((link, i) => {
    const sr = link.querySelector<HTMLElement>('[data-rail-sr]');
    const label = link.querySelector<HTMLElement>('[data-rail-label]');
    const item = link.closest('li');
    if (link.dataset.hrefOrig === undefined) {
      link.dataset.hrefOrig = link.getAttribute('href') ?? '';
      if (sr) sr.dataset.srOrig = sr.textContent ?? '';
      if (label) label.dataset.labelOrig = label.textContent ?? '';
    }
    const target = targets[i];
    if (allShown || target === null) {
      link.setAttribute('href', link.dataset.hrefOrig);
      if (sr) setText(sr, sr.dataset.srOrig ?? '');
      if (label) setText(label, label.dataset.labelOrig ?? '');
      if (item) item.hidden = !allShown;
      return;
    }
    if (item) item.hidden = false;
    link.setAttribute('href', `#${target}`);
    if (sr) setText(sr, railSr(markers[i], target));
    const text = railLabel(markers[i], target);
    if (label) setText(label, text ?? label.dataset.labelOrig ?? '');
  });
}
