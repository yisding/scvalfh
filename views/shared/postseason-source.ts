/**
 * The words of a league's postseason source link, for every page that prints one: app/playoffs/page.tsx's
 * EAL, San Diego and Sunset/independents cards, and /about's source card and Postseason paragraphs
 * (components/about/AboutSources.tsx, components/about/AboutPostseason.tsx). Server-only: it reads
 * lib/config/leagues.
 *
 * One function, returning EXACTLY what those pages print, so no page templates a document name
 * (design-review UI §3): a section-name template such as `${section.name} Field Hockey Guidelines (PDF)`
 * would print "San Diego Section Field Hockey Guidelines (PDF)", a document that does not exist (the San
 * Diego rules are in the Green Book, a Google Doc), and "Southern Section Field Hockey Guidelines" for the
 * Blue Book.
 *
 * - 'unbracketed-tournament' (the EAL): "Northern Section Field Hockey Guidelines (PDF)", BYTE-IDENTICAL
 *   to what the EAL card and /about have printed since before the SoCal amendment (tests pin it). The kind
 *   carries no `sourceLabel` (lib/config/leagues.ts), and SectionConfig.rulesSource.name ("… Guidelines
 *   2026-28") is not these words, so the kind keeps its own template here.
 * - 'no-postseason' (the Sunset, the LA independents) and 'section-playoffs' (City, North County, Metro):
 *   the config's `sourceLabel` ("CIF-SS Blue Book 2026-27", "CIF-SDS Green Book 2026-27, Bylaw 2000.1"),
 *   as it stands, with no document format after it: that is what /playoffs and /about print.
 *   OPEN OWNER DECISION: whether these links should name the document's format the way the EAL's does
 *   ("(PDF)", "(Google Doc)", from SectionConfig.rulesSource.format when the link is that same document).
 *   Until it is made, the words stay as printed; adding the format is a copy change on two pages.
 * - every other kind: null (a CCS league links the CCS bylaws, MCAL its own tournament sheet; their pages
 *   word those links themselves).
 */
import { getLeague, getSection } from '@/lib/config/leagues';
import type { LeagueId } from '@/lib/model/ids';

export interface SourceLink {
  href: string;
  text: string;
}

export function postseasonSourceLink(leagueId: LeagueId): SourceLink | null {
  const league = getLeague(leagueId);
  const ps = league.postseason;
  switch (ps.kind) {
    case 'unbracketed-tournament':
      return { href: ps.sourceUrl, text: `${getSection(league.sectionId).name} Field Hockey Guidelines (PDF)` };
    case 'no-postseason':
    case 'section-playoffs':
      return { href: ps.sourceUrl, text: ps.sourceLabel };
    case 'ccs-ladder':
    case 'league-tournament':
      return null;
  }
}
