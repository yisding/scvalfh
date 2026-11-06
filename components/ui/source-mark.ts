/**
 * The † beside a score that is not MaxPreps' own, and its words. Pure and import-free, so client and server
 * components share it (components/ui/describe-game.ts sets `sourceMark`; StatusLabel and ScoreBoard print it).
 */

/** The source a † names: si.com (owner decision D2), a school's athletics site (JV), the San Diego Section's bracket sheet. */
export type SourceMark = 'si.com' | 'school site' | 'CIF-SDS';

/** The words a † stands for: its title, its screen-reader text and the scoreboard's legend. */
export function sourceMarkWords(mark: SourceMark): string {
  switch (mark) {
    case 'si.com':
      return 'Score via si.com';
    case 'school site':
      return 'Score via the school’s athletics site';
    case 'CIF-SDS':
      return 'Score via the CIF San Diego Section';
  }
}
