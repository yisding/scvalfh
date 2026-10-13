/**
 * The pre-paint theme stamp (DESIGN §7.14, build checklist step 2).
 *
 * A blocking inline script in <head> writes `data-theme` on <html> before first paint, so an
 * explicit Light/Dark choice never flashes the other theme and never causes layout shift. Reading
 * `localStorage` can throw (private windows, blocked site data), so the whole body is in a
 * try/catch and the page falls back to the OS setting, which the CSS already handles.
 *
 * "system" is stored as the ABSENCE of the attribute, so `prefers-color-scheme` stays in charge.
 *
 * The browser chrome follows an explicit choice too. The root layout's two `theme-color` metas are
 * media-conditioned (they follow the OS), so for Light or Dark this script PREPENDS one media-less
 * `<meta id="sx-theme-color">`: the first matching theme-color meta in tree order wins, so it
 * outranks both. Rewriting the layout's own metas does not survive: Next re-creates them on every
 * client-side navigation (measured), while a meta it does not own is left alone. ThemeToggle's
 * `applyTheme` keeps it in step and removes it for System.
 *
 * Its colour is written in UPPER case on purpose. React 19 adopts an existing `<meta>` whose `name`
 * and `content` match one it renders, ignoring `media`, so a lowercase twin of the layout's dark
 * meta was claimed as that meta and removed by the next client-side navigation (measured).
 */
export const THEME_STORAGE_KEY = 'scvalfh.theme';

/** `--sx-bg` in each mode (app/globals.css): the layout's theme-color metas and both scripts read it. */
export const THEME_COLOR = { light: '#f6f7f8', dark: '#0b0d10' } as const;

/** The id of the media-less theme-color meta an explicit choice adds. */
export const THEME_META_ID = 'sx-theme-color';

/** That meta's content: the same hex in UPPER case, so React never mistakes it for its own. */
export const themeMetaColor = (theme: keyof typeof THEME_COLOR): string => THEME_COLOR[theme].toUpperCase();

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light'){var d=document,m=d.createElement('meta');d.documentElement.setAttribute('data-theme',t);m.name='theme-color';m.id='${THEME_META_ID}';m.content=t==='dark'?'${themeMetaColor('dark')}':'${themeMetaColor('light')}';d.head.prepend(m)}}catch(e){}})();`;
