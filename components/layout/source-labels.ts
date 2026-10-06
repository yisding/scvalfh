/**
 * The words of a league's postseason source link, for every page that prints one (app/playoffs/page.tsx's
 * cards, app/about/page.tsx's postseason list). Server-only: it reads lib/leagues.
 *
 * One function so no page templates a document name (design-review UI §3): the old literal
 * `${section.name} Field Hockey Guidelines (PDF)` would have printed "San Diego Section Field Hockey
 * Guidelines (PDF)", a document that does not exist (the San Diego rules are in the Green Book, a Google
 * Doc), and "Southern Section Field Hockey Guidelines" for the Blue Book.
 *
 * - 'unbracketed-tournament' (the EAL): "Northern Section Field Hockey Guidelines (PDF)", BYTE-IDENTICAL
 *   to what the EAL card and /about printed before the SoCal amendment (tests pin it). The kind carries no
 *   `sourceLabel` (lib/leagues.ts), and SectionConfig.rulesSource.name ("… Guidelines 2026-28") is not
 *   these words, so the kind keeps its own template here.
 * - 'no-postseason' (the Sunset) and 'section-playoffs' (City, North County, Metro): the config's
 *   `sourceLabel` ("CIF-SS Blue Book 2026-27", "CIF-SDS Green Book 2026-27, Bylaw 2000.1") with the
 *   document's format from SectionConfig.rulesSource ("(PDF)", "(Google Doc)") when the link is that same
 *   document, and no parenthesis otherwise (a format is never guessed).
 * - every other kind: null (a CCS league links the CCS bylaws, MCAL its own tournament sheet; their pages
 *   word those links themselves).
 */
import { getLeague, getSection } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

export interface SourceLink {
  href: string;
  text: string;
}

export function postseasonSourceLink(leagueId: LeagueId): SourceLink | null {
  const league = getLeague(leagueId);
  const section = getSection(league.sectionId);
  const ps = league.postseason;
  switch (ps.kind) {
    case 'unbracketed-tournament':
      return { href: ps.sourceUrl, text: `${section.name} Field Hockey Guidelines (PDF)` };
    case 'no-postseason':
    case 'section-playoffs': {
      const format = ps.sourceUrl === section.rulesSource.url ? ` (${section.rulesSource.format})` : '';
      return { href: ps.sourceUrl, text: `${ps.sourceLabel}${format}` };
    }
    case 'ccs-ladder':
    case 'league-tournament':
      return null;
  }
}
