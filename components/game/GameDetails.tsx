import { dateTimeAttr, longDate, monthDay, parseLocal, timeOfDayPT } from '../../lib/format';
import { findDivision, findLeague } from '../../lib/leagues';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import type { GameModel } from './game-model';

/**
 * The DETAILS card of DESIGN §3.5 — when, where, and the off-site links that are not the result's.
 * Three widths, one DOM:
 * - phone: a card in the column, each fact a 12px label over a 16px value, divider lines between;
 * - 768–1023: still in the column (the page is one column there — F-17, a recorded deviation from
 *   §3.5's 768 rail), so the facts sit 3-up across the full width with no dividers, and a Note
 *   takes its own full-width row under a rule;
 * - ≥1024: the right rail (sticky under the top bar), back to the stacked phone list.
 * The 3-up band is written as `md:max-lg:` ranges rather than `md:` undone by `lg:` because the
 * phone list's `first:pt-0` / `last:pb-0` would lose to an `lg:py-3` reset.
 *
 * A FINAL's result links (the box score or si.com game page, and the stream) are not here: the
 * page prints them under the recap (`GameModel.resultLinks`, F-73), and each link has one home on
 * the page (the exception is the disagreement notes under the scoreboard — GameSources'
 * SourceDisagreement and ResultFlagConflict — which link the source pages they cite).
 *
 * Four honesty rules live here:
 *
 * 1. **`contest.location` is a NOTE field, not a venue field.** Live values include "Senior Night"
 *    and a coach's scoring note, so it is printed as a note and never labelled "Venue" (SPEC §4).
 * 2. **Directions appear only when a street address exists.** The per-game address is a lazy fetch
 *    that the scheduled sweep does not make, so today no game has one and no map chip is rendered.
 *    A chip that cannot resolve a location is a dead affordance.
 * 3. **The venue we do know is the host school, not the field.** When the `.ics` feeds gave a real
 *    venue name it is shown; otherwise the line says who hosted, which is all MaxPreps published.
 * 4. **Where the two sources disagree about the host, the page says so.** Home and away are always
 *    MaxPreps' (SPEC §5.5.4 — it is the only source that states them), but where a league's official
 *    schedule names the other school the host line was the one claim on this page stated as settled
 *    fact while `provenance.hostConflict` recorded the opposite. It is printed here, the way `Moved`
 *    is printed under WHEN, rather than left in the snapshot unread.
 *
 * "Counts as" is the model's league-aware `countsAs` (SPEC §10.6): `League game · De Anza Division`
 * (a division label only through `divisionHeading`), `League game · MCAL` for a single-division
 * league, the postseason round, or `Non-league game`; the points sentence cites the game's league.
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
  const { game, home, countsAs } = model;
  const officialLeague = game.official
    ? findLeague(findDivision(game.official.division)?.leagueId ?? '')?.shortName
    : undefined;
  const address = game.venue.address;
  const host = game.site === 'neutral' ? null : home;
  const movedFrom =
    game.official && game.official.scheduledDate !== game.dateKey
      ? game.official.scheduledDate
      : null;

  // Whatever the page already printed under the recap (a final's result links) is skipped, so no
  // link appears twice on the page.
  const elsewhere = new Set(model.resultLinks.map((link) => link.href));
  const links: Array<{ href: string; label: string }> = [];
  if (address) links.push({ href: mapsHref(address), label: 'Directions' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: 'MaxPreps box score' });
  if (game.urls.sblive) links.push({ href: game.urls.sblive, label: 'si.com game' });
  const ownLinks = links.filter((link) => !elsewhere.has(link.href));

  return (
    <section
      className={['sx-card p-5', className].filter(Boolean).join(' ')}
      aria-labelledby="game-details-kicker"
    >
      <SectionHeader kicker="Details" as="h2" size="label" id="game-details-kicker" />
      <dl className="m-0 divide-y divide-divider text-meta md:max-lg:grid md:max-lg:grid-cols-3 md:max-lg:gap-x-6 md:max-lg:gap-y-4 md:max-lg:divide-y-0">
        <div className="py-3 first:pt-0 last:pb-0 md:max-lg:py-0">
          <dt className="text-micro font-medium text-ink-3">When</dt>
          <dd className="mt-1 mb-0 ml-0 text-body text-ink">
            <time dateTime={dateTimeAttr(game)} className="block">
              <span className="block">
                {longDate(game.dateLocal)}, {parseLocal(game.dateLocal).year}
              </span>
              {/* Sans with tabular figures, not `.sx-num` mono: a single time of day does not
                  stack in a column, and "4:00 PM PT" in mono read as a code (F-54d). */}
              <span className="block text-meta text-ink-2 tabular-nums">
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
                Moved — the official {officialLeague ?? 'league'} schedule has this game on{' '}
                {monthDay(movedFrom)}.
              </span>
            ) : null}
          </dd>
        </div>

        <div className="py-3 first:pt-0 last:pb-0 md:max-lg:py-0">
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

        <div className="py-3 first:pt-0 last:pb-0 md:max-lg:py-0">
          <dt className="text-micro font-medium text-ink-3">Counts as</dt>
          <dd className="mt-1 mb-0 ml-0 text-body text-ink">
            <span className="block">{countsAs.label}</span>
            <span className="mt-1 block text-meta text-ink-3">{countsAs.detail}</span>
            {countsAs.classificationNote ? (
              <span className="mt-1 block text-meta text-ink-3">{countsAs.classificationNote}</span>
            ) : null}
          </dd>
        </div>

        {game.venue.text ? (
          // In the 3-up band the Note is a fourth fact, so it takes a full-width row of its own
          // under a rule (it keeps the list's own 12px above the rule's content).
          <div className="py-3 first:pt-0 last:pb-0 md:max-lg:col-span-3 md:max-lg:border-t md:max-lg:border-divider">
            <dt className="text-micro font-medium text-ink-3">Note</dt>
            {/* MaxPreps' `location` field, verbatim. It is a note, not a venue. */}
            <dd className="mt-1 mb-0 ml-0 text-body text-ink-2">{game.venue.text}</dd>
          </div>
        ) : null}
      </dl>

      {ownLinks.length > 0 ? (
        <p className="mt-4 mb-0 flex flex-wrap gap-2">
          {ownLinks.map((link) => (
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
