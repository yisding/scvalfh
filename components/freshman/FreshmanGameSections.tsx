import Link from 'next/link';

import { mapsSearchHref } from '../../lib/format';
import { addressLine, gameAddress } from '../../lib/schools/venue';
import { GameLogRowBody, gameLogRowClass } from '../game-row/GameLogRow';
import { DATA_CORRECTIONS_URL } from '../layout/site';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import type { FreshmanGameModel } from './freshman-view';
import { FRESHMAN_LEVEL } from '../words/level-words';

/**
 * The sections of a freshman game's page (app/freshman/game/[id]) under its scoreboard: the two teams' freshman
 * season series and the Details rail, the JV page's (components/jv/JvGameSections.tsx) cut to what the level has: no
 * varsity twin, no table to count for.
 */

/** "Freshman season series": every listed freshman meeting of the two teams, this one marked, the others linked. */
export function FreshmanSeasonSeries({ model, className }: { model: FreshmanGameModel; className?: string }) {
  if (model.series.length < 2) return null;
  const perspective = model.seriesPerspective;
  return (
    <section className={className} aria-labelledby="freshman-game-series-kicker">
      <SectionHeader
        kicker={`${FRESHMAN_LEVEL.longTitle} season series`}
        as="h2"
        id="freshman-game-series-kicker"
        meta={`${model.home.label}’s results`}
      />
      <ol className="sx-list">
        {model.series.map(({ game, href, isThisGame }) => (
          <li key={game.contestId}>
            {isThisGame ? (
              <span className={gameLogRowClass(game)} aria-current="page">
                <GameLogRowBody game={game} perspective={perspective} showChips={false} isThisGame />
              </span>
            ) : (
              <Link href={href} prefetch={false} className={`sx-tap no-underline ${gameLogRowClass(game)}`}>
                <GameLogRowBody game={game} perspective={perspective} showChips={false} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

const BUTTONS: ReadonlySet<string> = new Set(['Directions', 'NFHS stream', 'Hudl TV']);

/** DETAILS: the address and Directions, the venue note, the game's pages, the two teams' freshman sections, Report an error. */
export function FreshmanGameDetails({ model, className }: { model: FreshmanGameModel; className?: string }) {
  const { game } = model;
  const address = gameAddress(game)?.address ?? null;
  const links = [...(address ? [{ href: mapsSearchHref(address), label: 'Directions' }] : []), ...model.links];
  const buttons = links.filter((l) => BUTTONS.has(l.label));
  const pages = links.filter((l) => !BUTTONS.has(l.label));
  const teamPages = [model.away, model.home].flatMap((side) =>
    side.team ? [{ href: `/teams/${side.team.slug}#freshman`, label: `${side.team.shortName} ${FRESHMAN_LEVEL.long} games` }] : [],
  );
  return (
    <section className={className} aria-labelledby="freshman-game-details-kicker">
      <SectionHeader kicker="Details" as="h2" id="freshman-game-details-kicker" />
      <dl className="m-0 flex flex-col gap-3 text-body text-ink">
        {address ? (
          <div>
            <dt className="sr-only">Address</dt>
            <dd className="m-0">{addressLine(address)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">Counts as</dt>
          <dd className="m-0">
            <span className="block">{FRESHMAN_LEVEL.longTitle} game</span>
            <span className="block text-cell text-ink-2">In no varsity or JV record or table.</span>
          </dd>
        </div>
        {game.venue.text ? (
          <div>
            <dt className="sr-only">Note</dt>
            <dd className="m-0">{game.venue.text}</dd>
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
      {pages.length > 0 ? (
        <ul className="sx-linkrow">
          {pages.map((link) => (
            <li key={link.href}>
              <ExternalLink href={link.href} className="sx-action">
                {link.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="sx-linkrow">
        {teamPages.map((link) => (
          <li key={link.href}>
            <Link href={link.href} prefetch={false} className="sx-action">
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <ExternalLink href={DATA_CORRECTIONS_URL} className="sx-action">
            Report an error
          </ExternalLink>
        </li>
        <li>
          <Link href="/freshman#about" prefetch={false} className="sx-action">
            How freshman games are shown
          </Link>
        </li>
      </ul>
    </section>
  );
}
