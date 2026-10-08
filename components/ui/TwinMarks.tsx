'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * One copy of each breakpoint twin for anything that reads the page WITHOUT its stylesheet.
 *
 * Some content is rendered twice, once per layout (the phone and desktop standings tables, the
 * phone game rows and the desktop game cards, a short and a full team name), and a breakpoint
 * utility shows exactly one. Reader modes (Firefox Reader View, Safari Reader) drop the
 * stylesheet, so they printed both: every standings table twice, every game twice, "MittyArchbishop
 * Mitty". Readers do honour the `hidden` attribute, but the server cannot know the viewport, so
 * no static attribute can pick the right copy.
 *
 * Both copies carry `data-twin`. After hydration this stamps `hidden` on whichever copy the
 * stylesheet currently hides, and re-stamps on resize, on every client navigation and on any DOM
 * change. A copy it marks is already `display: none`, so nothing moves (CLS 0) and the
 * accessibility tree is unchanged; a copy about to show is unmarked in the same frame, inside the
 * `resize` event, before paint. Printing lays the page out at another width, so `beforeprint`
 * clears every mark and lets the print media queries choose. Without JS nothing is stamped and
 * the stylesheet alone decides, exactly as before.
 *
 * Only `data-twin` elements are touched: the schedule filter (components/schedule/GameList.tsx)
 * owns `hidden` on its own `<li>`s.
 */
export const TWIN_ATTR = 'data-twin';

function twins(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[${TWIN_ATTR}]`)];
}

function clear(): void {
  for (const el of twins()) el.removeAttribute('hidden');
}

/** Unmark every twin, then read every display in one style pass, then mark the hidden ones. */
function sync(): void {
  const all = twins();
  for (const el of all) el.removeAttribute('hidden');
  const off = all.filter((el) => getComputedStyle(el).display === 'none');
  for (const el of off) el.setAttribute('hidden', '');
}

export function TwinMarks() {
  const pathname = usePathname();

  useEffect(() => {
    sync();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const observer = new MutationObserver(later);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', sync);
    window.addEventListener('beforeprint', clear);
    window.addEventListener('afterprint', sync);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('beforeprint', clear);
      window.removeEventListener('afterprint', sync);
    };
  }, [pathname]);

  return null;
}

export default TwinMarks;
