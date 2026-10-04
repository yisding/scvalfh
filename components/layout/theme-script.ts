/**
 * The pre-paint theme stamp (DESIGN §7.14, build checklist step 2).
 *
 * A blocking inline script in <head> writes `data-theme` on <html> before first paint, so an
 * explicit Light/Dark choice never flashes the other theme and never causes layout shift. Reading
 * `localStorage` can throw (private windows, blocked site data), so the whole body is in a
 * try/catch and the page falls back to the OS setting, which the CSS already handles.
 *
 * "system" is stored as the ABSENCE of the attribute, so `prefers-color-scheme` stays in charge.
 */
export const THEME_STORAGE_KEY = 'scvalfh.theme';

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;
