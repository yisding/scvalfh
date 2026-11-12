import Link from 'next/link';

import { mapsSearchHref, monthDay } from '../../lib/format';
import { findDivision, findLeague } from '../../lib/leagues';
import { addressLine, gameAddress } from '../../lib/schools/venue';
import { DATA_CORRECTIONS_URL } from '../layout/site';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { maxPrepsLabel } from '../words/maxpreps-label';

import type { GameModel } from './game-view';

/**
 * DETAILS (DESIGN §33): the rail of a game page (under the main column below 768). A plain `<dl>` of
 * the facts the header does not carry, then the off-site links, then Report an error. The date, the
 * start time and the venue's name are in the header's fact list (ScoreBoard.tsx GameFacts) and are
 * not repeated here; what the game counts for is said here, once.
 *
 * List rows no longer expand, so every off-site link a row used to offer lives here: Directions,
 * the stream and tickets as buttons; the game's own pages (MaxPreps, si.com, a final's box score)
 * and each school's page on those sites as plain external links.
 *
 * Four honesty rules live here:
 *
 * 1. **`contest.location` is a NOTE field, not a venue field.** Live values include "Senior Night"
 *    and a coach's scoring note, so it is printed as a note and never labelled "Venue" (SPEC §4).
 * 2. **The address is lib/schools/venue.ts `gameAddress`'s, and Directions appear only when there is one.**
 *    MaxPreps gives a game no address in the sweep, so it is almost always a school's campus from
 *    data/schools.json: the named venue's school, the league final's fixed site, or the host. A neutral
 *    site, a venue that is not a registry school, and a disputed host have none, and print no address
 *    line and no Directions button: a button that cannot resolve a location is a dead affordance.
 * 3. **The venue we do know is the host school, not the field.** When the `.ics` feeds gave a real
 *    venue name the header shows it; otherwise the header says whose school hosts, and the address
 *    here is that school's. A school can play off campus, so the address is never labelled the field.
 * 4. **Where the two sources disagree about the host, it says so.** Home and away are always
 *    MaxPreps' (SPEC §5.5.4 — it is the only source that states them), but where a league's official
 *    schedule names the other school, `provenance.hostConflict` is printed rather than left unread.
 */
export interface GameDetailsProps {
  model: GameModel;
  className?: string;
}

/** The links drawn as buttons: somewhere to go for THIS game (the rest are reference pages). */
const BUTTONS: ReadonlySet<string> = new Set(['Directions', 'NFHS stream', 'Tickets']);

export function GameDetails({ model, className }: GameDetailsProps) {
  const { game, home, away, countsAs } = model;
  const officialLeague = game.official
    ? findLeague(findDivision(game.official.division)?.leagueId ?? '')?.shortName
    : undefined;
  const where = gameAddress(game);
  const address = where?.address ?? null;
  const movedFrom =
    game.official && game.official.scheduledDate !== game.dateKey
      ? game.official.scheduledDate
      : null;

  const links: Array<{ href: string; label: string }> = [];
  if (address) links.push({ href: mapsSearchHref(address), label: 'Directions' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: maxPrepsLabel(game.status) });
  if (game.urls.sblive) links.push({ href: game.urls.sblive, label: 'si.com game' });

  // A final's result links (the box score or si.com game page, the stream) and the game's other pages, each once.
  const seen = new Set<string>();
  const pages = [...model.resultLinks, ...links.filter((link) => !BUTTONS.has(link.label))].filter((link) =>
    seen.has(link.href) ? false : Boolean(seen.add(link.href)),
  );
  const buttons = links.filter((link) => BUTTONS.has(link.label) && !seen.has(link.href));
  // Each registry side's own page on the two sources, away first.
  const teamPages = [away, home].flatMap((side) =>
    side.team
      ? [
          ...(side.team.external.maxprepsTeamUrl
            ? [{ href: side.team.external.maxprepsTeamUrl, name: side.name, label: `${side.team.shortName} on MaxPreps` }]
            : []),
          ...(side.sbliveUrl ? [{ href: side.sbliveUrl, name: side.name, label: `${side.team.shortName} on si.com` }] : []),
        ]
      : [],
  );
  /* One line per source, not one line per link: "MaxPreps  Box score  Stevenson  Salinas". The source's
     name is said once, in the line's first word; each link keeps it for a screen reader, in the order
     its full label has it ("MaxPreps box score", "Stevenson on MaxPreps"). A link to anything else
     (a stream's replay) is a line of its own. */
  type SourceLink = { href: string; text: string; before?: string; after?: string };
  const SOURCE_NAMES = ['MaxPreps', 'si.com'] as const;
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const sources: Array<{ name: string | null; links: SourceLink[] }> = [];
  for (const name of SOURCE_NAMES) {
    const mine: SourceLink[] = [
      ...pages
        .filter((link) => link.label.startsWith(`${name} `))
        .map((link) => ({ href: link.href, before: `${name} `, text: sentence(link.label.slice(name.length + 1)) })),
      ...teamPages
        .filter((link) => link.label.endsWith(` on ${name}`))
        .map((link) => ({ href: link.href, text: link.label.slice(0, -` on ${name}`.length), after: ` on ${name}` })),
    ];
    if (mine.length > 0) sources.push({ name, links: mine });
  }
  for (const link of pages) {
    if (!SOURCE_NAMES.some((name) => link.label.startsWith(`${name} `))) sources.push({ name: null, links: [{ href: link.href, text: link.label }] });
  }
  // MaxPreps' location note, unless it only names the host (`@ Saint Francis`): the header already says where.
  const placeNote = game.venue.text?.startsWith('@ ') ? game.venue.text.slice(2).trim().toLowerCase() : null;
  const note =
    game.venue.text && !(placeNote && [home.name, home.team?.shortName].some((n) => n?.toLowerCase() === placeNote))
      ? game.venue.text
      : null;
  const whenNotes = Boolean(game.timeConfirmed || movedFrom || game.provenance.dateCorrection);

  return (
    <section className={className} aria-labelledby="game-details-kicker">
      <SectionHeader kicker="Details" as="h2" id="game-details-kicker" />
      <dl className="m-0 flex flex-col gap-3 text-body text-ink">
        {address || game.provenance.hostConflict ? (
          <div>
            <dt className="sr-only">Address</dt>
            <dd className="m-0">
              {address ? <span className="block">{addressLine(address)}</span> : null}
              {game.provenance.hostConflict ? (
                <span className="block text-cell text-ink-2">Hosts disagree — {game.provenance.hostConflict}</span>
              ) : null}
            </dd>
          </div>
        ) : null}

        {whenNotes ? (
          <div>
            <dt className="sr-only">Date and time</dt>
            <dd className="m-0 text-cell text-ink-2">
              {game.timeConfirmed ? (
                <span className="block">Start time confirmed against the school&rsquo;s athletics calendar.</span>
              ) : null}
              {movedFrom ? (
                <span className="block">
                  Moved — the official {officialLeague ?? 'league'} schedule has this game on {monthDay(movedFrom)}.
                </span>
              ) : null}
              {/* DATA_QUALITY.contestDateOverrides (lib/pipeline/normalize.ts): the date shown is a better source's,
                  not MaxPreps'; say so, from what, and on whose word (the override's source sentence). */}
              {game.provenance.dateCorrection ? (
                <span className="block">
                  Date corrected from MaxPreps&rsquo; {monthDay(game.provenance.dateCorrection.maxprepsDateLocal)}{' '}
                  &mdash; {game.provenance.dateCorrection.source}.
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}

        <div>
          <dt className="sr-only">Counts as</dt>
          <dd className="m-0">
            <span className="block">{countsAs.detail}</span>
            {countsAs.classificationNote ? (
              <span className="block text-cell text-ink-2">{countsAs.classificationNote}</span>
            ) : null}
          </dd>
        </div>

        {note ? (
          <div>
            <dt className="sr-only">Note</dt>
            {/* MaxPreps' `location` field, verbatim. It is a note, not a venue. */}
            <dd className="m-0">
              {note}
              {/* lib/pipeline/normalize.ts overtimeFromNote: the OT on this page is the note's, not MaxPreps'. */}
              {game.provenance.overtimeNote ? (
                <span className="block text-cell text-ink-2">
                  MaxPreps records no overtime for this game; the overtime shown here is from this note.
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {buttons.length > 0 ? (
        <p className="mt-4 mb-0 flex flex-wrap gap-2">
          {buttons.map((link) => (
            <ExternalLink key={link.href} href={link.href} className="sx-btn" arrow={false}>
              {link.label}
            </ExternalLink>
          ))}
        </p>
      ) : null}
      {sources.length > 0 ? (
        <ul className="m-0 mt-3 list-none p-0">
          {sources.map((source) => (
            <li key={source.name ?? source.links[0].href} className="flex flex-wrap items-baseline gap-x-4">
              {source.name ? <span className="text-meta text-ink-2">{source.name}</span> : null}
              {source.links.map((link) => (
                <ExternalLink key={link.href} href={link.href} className="sx-action" arrow={source.name === null}>
                  {link.before ? <span className="sr-only">{link.before}</span> : null}
                  {link.text}
                  {link.after ? <span className="sr-only">{link.after}</span> : null}
                </ExternalLink>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="sx-linkrow">
        <li>
          <ExternalLink href={DATA_CORRECTIONS_URL} className="sx-action">
            Report an error
          </ExternalLink>
        </li>
        <li>
          <Link href="/about" prefetch={false} className="sx-action">
            About this data
          </Link>
        </li>
      </ul>
    </section>
  );
}

export default GameDetails;
