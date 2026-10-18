/**
 * MaxPreps writes every recap from one side, almost always the away (or neutral-site) team's:
 * "Helix lost their away non-conference game against Point Loma by a score of 7-1." The site
 * prints it winner first instead, so the sentence always reads "<winner> won … against <loser>":
 * "Point Loma won their home non-conference game against Helix by a score of 7-1."
 *
 * A tie puts the home team first ("<home> tied their home … against <away>"); a neutral-site tie
 * has no home team and stays as MaxPreps wrote it. The score needs no swap: MaxPreps gives the
 * higher score first whichever side the sentence is from.
 *
 * Applied when the snapshot loads (lib/data.ts), so every surface that prints a recap — the game
 * page, its meta description and JSON-LD, the game rows and cards — reads the same sentence, and
 * a snapshot written before this rule reads the same as a new one. A sentence of any other shape
 * (a JV "The <School> JV field hockey team …" line, anything MaxPreps words differently) is
 * returned unchanged. Idempotent: a winner-first sentence comes back as it went in.
 */

// subject · verb · " by forfeit[ in]" · site · kind · object · " by a score of N-N"
const RECAP =
  /^(.+?) (won|lost|tied)( by forfeit in| by forfeit)? their (home|away|neutral) (.+?) game against (.+?)( by a score of \d+-\d+)?\.$/;

const FLIPPED_SITE = { home: 'away', away: 'home', neutral: 'neutral' } as const;
const FLIPPED_VERB = { won: 'lost', lost: 'won', tied: 'tied' } as const;

export function winnerFirstRecap(recap: string): string {
  const m = RECAP.exec(recap);
  if (!m) return recap;
  const [, subject, verbWord, forfeit = '', siteWord, kind, object, score = ''] = m;
  const verb = verbWord as keyof typeof FLIPPED_VERB;
  const site = siteWord as keyof typeof FLIPPED_SITE;
  if (subject.startsWith('The ')) return recap;
  const flip = verb === 'lost' || (verb === 'tied' && site === 'away');
  if (!flip) return recap;
  // A name that ends in its own period ("Davis Sr.") closes the sentence with it.
  const last = subject.endsWith('.') && !score ? '' : '.';
  return `${object} ${FLIPPED_VERB[verb]}${forfeit} their ${FLIPPED_SITE[site]} ${kind} game against ${subject}${score}${last}`;
}
