import Link from 'next/link';

import { mapsSearchHref, shortDate } from '../../lib/format';
import { getJvGameForVarsity, jvGameHref } from '../../lib/jv/jv';
import { addressLine, gameAddress } from '../../lib/schools/venue';
import { GameLogRowBody, gameLogRowClass } from '../game-row/GameLogRow';
import { DATA_CORRECTIONS_URL } from '../layout/site';
import { describeGame } from '../ui/describe-game';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import type { JvGameModel } from './jv-game-view';

/**
 * The sections of a JV game's page (app/jv/game/[id]) under its scoreboard: the varsity game played beside it, the
 * two JV teams' season series and the Details rail. They are the varsity page's sections (components/game/) cut to
 * what a JV game has: no bracket, no league form, no box score, and every link to a game in the series is a JV page.
 */

/** "Varsity game": the varsity game of the same two schools (lib/jv/jv-standings.ts jvVarsityTwins), linked. */
export function JvVarsityGame({ model, className }: { model: JvGameModel; className?: string }) {
  const { varsity } = model;
  if (!varsity) return null;
  return (
    <section className={className} aria-labelledby="jv-game-varsity-kicker">
      <SectionHeader kicker="Varsity game" as="h2" id="jv-game-varsity-kicker" action={{ href: varsity.href, label: 'Game page' }} />
      <p className="m-0 text-body text-ink">
        {varsity.sameDay ? '' : `${varsity.dateLabel}: `}
        {varsity.sentence}
      </p>
    </section>
  );
}

/**
 * "JV game" on a VARSITY game's page: the one JV game played beside it (jvVarsityTwins), as a sentence and a link to
 * its page. Nothing when there is none, or when two JV games sit beside it (neither is the one).
 */
export function VarsityJvGame({ contestId, dateKey, className }: { contestId: string; dateKey: string; className?: string }) {
  const jv = getJvGameForVarsity(contestId);
  const href = jv ? jvGameHref(jv) : undefined;
  if (!jv || !href) return null;
  return (
    <section className={className} aria-labelledby="game-jv-kicker">
      <SectionHeader kicker="JV game" as="h2" id="game-jv-kicker" action={{ href, label: 'JV game page' }} />
      <p className="m-0 text-body text-ink">
        {jv.dateKey === dateKey ? '' : `${shortDate(jv.dateLocal)}: `}
        {describeGame(jv).sentence}
      </p>
    </section>
  );
}

/** "JV season series": every listed JV meeting of the two teams, this one marked, the others linked. */
export function JvSeasonSeries({ model, className }: { model: JvGameModel; className?: string }) {
  if (model.series.length < 2) return null;
  const perspective = model.seriesPerspective;
  return (
    <section className={className} aria-labelledby="jv-game-series-kicker">
      <SectionHeader kicker="JV season series" as="h2" id="jv-game-series-kicker" meta={`${model.home.label}’s results`} />
      <ol className="sx-list">
        {model.series.map(({ game, href, isThisGame }) => (
          <li key={game.contestId}>
            {isThisGame ? (
              <span className={gameLogRowClass(game)} aria-current="page">
                <GameLogRowBody game={game} perspective={perspective} isThisGame />
              </span>
            ) : (
              <Link href={href} prefetch={false} className={`sx-tap no-underline ${gameLogRowClass(game)}`}>
                <GameLogRowBody game={game} perspective={perspective} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

const BUTTONS: ReadonlySet<string> = new Set(['Directions', 'NFHS stream', 'Hudl TV']);

/** DETAILS: the address and Directions, what the game counts for, the game's pages, Report an error. */
export function JvGameDetails({ model, className }: { model: JvGameModel; className?: string }) {
  const { game, countsAs } = model;
  const address = gameAddress(game)?.address ?? null;
  const links = [...(address ? [{ href: mapsSearchHref(address), label: 'Directions' }] : []), ...model.links];
  const buttons = links.filter((l) => BUTTONS.has(l.label));
  const pages = links.filter((l) => !BUTTONS.has(l.label));
  const teamPages = [model.away, model.home].flatMap((side) =>
    side.team ? [{ href: `/teams/${side.team.slug}#jv`, label: `${side.team.shortName} JV games` }] : [],
  );
  return (
    <section className={className} aria-labelledby="jv-game-details-kicker">
      <SectionHeader kicker="Details" as="h2" id="jv-game-details-kicker" />
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
            <span className="block">{countsAs.label}</span>
            <span className="block text-cell text-ink-2">{countsAs.detail}</span>
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
          <Link href="/about#jv" prefetch={false} className="sx-action">
            How JV games are shown
          </Link>
        </li>
      </ul>
    </section>
  );
}
