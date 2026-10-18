/**
 * Monogram ink for a team colour (DESIGN §12.4): the WCAG 2.x luminance and contrast arithmetic that
 * picks the readable site ink for a fill. Registry build-time math: lib/registry/team-list.ts calls it
 * for every team's `colors.onPrimary`, and the door (lib/registry/teams.ts) re-exports onPrimaryInk.
 */

/** Relative luminance per WCAG 2.x, on a 6-digit hex without '#'. */
function relativeLuminance(hex: string): number {
  const v = hex.replace(/[^0-9a-f]/gi, '').padEnd(6, '0').slice(0, 6);
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ink for a monogram filled with `hex`, computed at build (DESIGN §12.4) — never eyeballed.
 * Picks whichever of the two site inks has the greater contrast on the fill.
 */
export function onPrimaryInk(hex: string): '#0e1116' | '#ffffff' {
  const l = relativeLuminance(hex);
  const dark = contrast(l, relativeLuminance('0e1116'));
  const light = contrast(l, relativeLuminance('ffffff'));
  return dark >= light ? '#0e1116' : '#ffffff';
}
