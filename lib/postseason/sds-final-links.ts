/**
 * The stream and the tickets of a San Diego Section final, from data/sds-brackets-2026.json onto the final's game.
 *
 * MaxPreps carries a game's NFHS Network stream and GoFan tickets on its own contest, and a final MaxPreps never
 * lists has neither: 2026's Division I final (Poway v San Marcos, Sat Nov 14) is on the Section's bracket sheet,
 * the NFHS Network and GoFan, and has no MaxPreps contest, so its game (`cifsds:poway-at-san-marcos`,
 * lib/postseason/sds-sheet-results.ts rule 5) had no link to either. The owner copies the two links onto the
 * file's Final round (`stream`, `tickets`; lib/postseason/sds-brackets-schema.ts allows them on that round only,
 * the one round that is a single game), and this fills them in where the game has none: a link MaxPreps does
 * carry is kept as MaxPreps has it.
 *
 * The final is the game on the Final round's date between two of the division's teams (a division plays one game
 * that day), whoever lists it: the sheet's `cifsds:` game, or the MaxPreps contest that takes its place.
 *
 * Applied where the site reads the snapshot (lib/data.ts), not stored, so the stored file stays what the sources
 * said. Pure: no I/O, no clock.
 */

import type { Game } from '../types';
import { sdsDivisionTeams } from './sds-brackets-file';
import type { SdsBracketsFile } from './sds-brackets-schema';

export function withSdsFinalLinks(games: readonly Game[], file: SdsBracketsFile): Game[] {
  const finals = file.divisions.flatMap((d) => {
    const round = d.rounds.at(-1);
    if (!round || (round.stream === undefined && round.tickets === undefined)) return [];
    return [{ date: round.date, teams: new Set<string>(sdsDivisionTeams(d)), stream: round.stream ?? null, tickets: round.tickets ?? null }];
  });
  if (finals.length === 0) return [...games];
  return games.map((g) => {
    if (g.status === 'postponed' || g.isDateTba || g.home.slug === null || g.away.slug === null) return g;
    const final = finals.find((f) => f.date === g.dateKey && f.teams.has(g.home.slug as string) && f.teams.has(g.away.slug as string));
    if (!final) return g;
    const nfhsStream = g.urls.nfhsStream ?? final.stream;
    const goFan = g.urls.goFan ?? final.tickets;
    if (nfhsStream === g.urls.nfhsStream && goFan === g.urls.goFan) return g;
    return { ...g, urls: { ...g.urls, nfhsStream, goFan } };
  });
}
