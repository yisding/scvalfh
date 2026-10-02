import { dateTimeAttr, longDate, monthDay, parseLocal, timeOfDayPT } from '../../lib/format';
import { DIVISION_LABELS } from '../../lib/season';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import type { GameModel } from './game-model';

/**
 * The DETAILS card of DESIGN §3.5 — when, where, and every real off-site link. A card in the
 * right rail from 768px (sticky under the top bar), a card in the column on a phone; each fact is
 * a 12px label over a 16px value, with divider lines between them.
 *
 * Three honesty rules live here:
 *
 * 1. **`contest.location` is a NOTE field, not a venue field.** Live values include "Senior Night"
 *    and a coach's scoring note, so it is printed as a note and never labelled "Venue" (SPEC §4).
 * 2. **Directions appear only when a street address exists.** The per-game address is a lazy fetch
 *    that the nightly sweep does not make, so today no game has one and no map chip is rendered.
 *    A chip that cannot resolve a location is a dead affordance.
 * 3. **The venue we do know is the host school, not the field.** When the `.ics` feeds gave a real
 *    venue name it is shown; otherwise the line says who hosted, which is all MaxPreps published.
 * 4. **Where the two sources disagree about the host, the page says so.** Home and away are always
 *    MaxPreps' (SPEC §5.5.4 — it is the only source that states them), but on the two games where
 *    the official SCVAL grid names the other school the host line was the one claim on this page
 *    stated as settled fact while `provenance.hostConflict` recorded the opposite. It is printed
 *    here, the way `Moved` is printed under WHEN, rather than left in the snapshot unread.
 */
export interface GameDetailsProps {
  model: GameModel;
  className?: string;
}

function mapsHref(address: NonNullable<GameModel['game']['venue']['address']>): string {
  const query = `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function GameDetails({ model, className }: GameDetailsProps) {
  const { game, home, division } = model;
  const address = game.venue.address;
  const host = game.site === 'neutral' ? null : home;
  const movedFrom =
    game.official && game.official.scheduledDate !== game.dateKey
      ? game.official.scheduledDate
      : null;

  const links: Array<{ href: string; label: string }> = [];
  if (address) links.push({ href: mapsHref(address), label: 'Directions' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: 'MaxPreps box score' });
  if (game.urls.sblive) links.push({ href: game.urls.sblive, label: 'SBLive game' });

  return (
    <section
      className={`sx-card p-5${className ? ` ${className}` : ''}`}
      aria-labelledby="game-details-kicker"
    >
      <SectionHeader kicker="Details" as="h2" size="label" id="game-details-kicker" />
      <dl className="m-0 divide-y divide-divider text-meta">
        <div className="py-3 first:pt-0 last:pb-0">
          <dt className="text-micro font-medium text-ink-3">When</dt>
          <dd className="mt-1 mb-0 ml-0 text-body text-ink">
            <time dateTime={dateTimeAttr(game)} className="block">
              <span className="block">
                {longDate(game.dateLocal)}, {parseLocal(game.dateLocal).year}
              </span>
              <span className="sx-num block text-meta text-ink-2">
                {game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal)}
              </span>
            </time>
            {game.timeConfirmed ? (
              <span className="mt-1 block text-meta text-ink-3">
                Start time confirmed against the school&rsquo;s athletics calendar.
              </span>
            ) : null}
            {movedFrom ? (
              <span className="mt-1 block text-meta text-ink-3">
                Moved — the official SCVAL grid has this game on {monthDay(movedFrom)}.
              </span>
            ) : null}
          </dd>
        </div>

        <div className="py-3 first:pt-0 last:pb-0">
          <dt className="text-micro font-medium text-ink-3">Where</dt>
          <dd className="mt-1 mb-0 ml-0 text-body text-ink">
            {game.venue.name ? (
              <span className="block">{game.venue.name}</span>
            ) : host ? (
              <span className="block">
                Hosted by {host.name}
                {host.team ? `, ${host.team.city}, CA` : ''}
              </span>
            ) : (
              <span className="block">Neutral site — the venue is not published.</span>
            )}
            {address ? (
              <span className="mt-1 block text-meta text-ink-2">
                {address.street}, {address.city}, {address.region} {address.postalCode}
              </span>
            ) : (
              <span className="mt-1 block text-meta text-ink-3">
                No street address published for this contest.
              </span>
            )}
            {game.provenance.hostConflict ? (
              <span className="mt-1 block text-meta text-ink-3">
                Hosts disagree — {game.provenance.hostConflict}
              </span>
            ) : null}
          </dd>
        </div>

        <div className="py-3 first:pt-0 last:pb-0">
          <dt className="text-micro font-medium text-ink-3">Counts as</dt>
          <dd className="mt-1 mb-0 ml-0 text-body text-ink">
            {game.isLeague ? (
              <>
                <span className="block">
                  League game
                  {division ? ` · ${DIVISION_LABELS[division]} Division` : ''}
                </span>
                <span className="mt-1 block text-meta text-ink-3">
                  Counts toward the division standings — 3 points for a win, 1 for a tie.
                </span>
              </>
            ) : (
              <>
                <span className="block">Non-league game</span>
                <span className="mt-1 block text-meta text-ink-3">
                  Counts in the overall record only, never in the division table.
                </span>
              </>
            )}
          </dd>
        </div>

        {game.venue.text ? (
          <div className="py-3 first:pt-0 last:pb-0">
            <dt className="text-micro font-medium text-ink-3">Note</dt>
            {/* MaxPreps' `location` field, verbatim. It is a note, not a venue. */}
            <dd className="mt-1 mb-0 ml-0 text-body text-ink-2">{game.venue.text}</dd>
          </div>
        ) : null}
      </dl>

      {links.length > 0 ? (
        <p className="mt-4 mb-0 flex flex-wrap gap-2">
          {links.map((link) => (
            <ExternalLink key={link.href} href={link.href} className="sx-pill">
              {link.label}
            </ExternalLink>
          ))}
        </p>
      ) : null}
    </section>
  );
}

export default GameDetails;
