import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import { GameRow } from '@/components/game-row/GameRow';
import SectionHeader from '@/components/ui/SectionHeader';
import { REGIONS } from '@/lib/config/leagues';
import { longDate, shortDate } from '@/lib/format/dates';
import { gameWord, plural } from '@/lib/format/words';
import type { RegionId } from '@/lib/model/ids';
import { scheduleHref, scoresHref } from '@/lib/shared/routes';
import type { IndexDay, LeagueCardData, ScheduleIndexView } from '@/views/schedule/schedule-view';

/**
 * The light `/schedule` index (SPEC §8.1, §10.4): the whole season no longer fits one fast page,
 * so this page is cards and an index, and each league's full season is `/schedule/<league>`.
 *
 *  - League cards: `<n> games · <m> results · next <date> →` → `/schedule/<league>`
 *    (each card carries `id=<league>`, the jump links' target).
 *  - `Recent` (the last three game days up to today) and `Next` (the next three): each day grouped
 *    by league, at most three rows per league and `+<n> more →` the day's page. A cross-league game
 *    appears under both leagues, as it does on each league's schedule.
 *  - `Every game day`: one row per date with `id="YYYY-MM-DD"`, so an old `/schedule#2026-09-24`
 *    link lands on that day's row, which links `/scores/2026-09-24`.
 *
 * Regions (DESIGN-socal §2.4): the cards, Recent and Next are rendered once per region inside a
 * `data-region-scope` block (the SoCal blocks' ids take the `-socal` suffix), and the scope stylesheet
 * shows the reader's; Recent and Next are each region's OWN last and next game days. The every-game-day
 * index stays one list, so each `id="YYYY-MM-DD"` exists once, and each row's counts are scoped per
 * region. A card grid sits inside a plain region `<div>`: the jump links target a card's id, and a
 * region-scoped grid holding the target would be forced to `display:block` by the deep-link rule
 * (components/head/league-scope-css.ts).
 *
 * A server component over plain data; every row link carries `prefetch={false}`.
 */

/** 'NorCal' | 'SoCal', for each region's count on an every-game-day row. */
function regionShort(id: RegionId): string {
  return REGIONS.find((r) => r.id === id)?.shortName ?? id;
}
export interface ScheduleIndexProps extends ScheduleIndexView {
  /** Rows per league in Recent and Next. */
  perLeague?: number;
}

/**
 * A card's stat line, under its league title (so no short name again). The `next <date> →` tail is
 * one nowrap run, arrow included, so a narrow card breaks before `next` and never inside the date.
 */
function CardLine({ card }: { card: LeagueCardData }) {
  return (
    <>
      {plural(card.games, 'game')} · {plural(card.results, 'result')} ·{' '}
      <span className="whitespace-nowrap">
        {card.next ? `next ${shortDate(card.next)}` : 'no games to come'} <Arrow />
      </span>
    </>
  );
}

/**
 * The accessible name of a SoCal copy of a Recent, Next or day section: 'Recent, Southern California'.
 * With JS off both regions render, so the NorCal and SoCal sections shared the names "Recent", "Next"
 * and each date (axe landmark-unique, review 2026-10-06); naming the second copy's region makes every
 * name unique and leaves the NorCal sections as they were (labelled by their headings), as /leaders
 * names its region sections.
 */
function socalLabel(idSuffix: string, words: string): string | undefined {
  return idSuffix === '' ? undefined : `${words}, ${REGIONS.find((r) => r.id === 'socal')?.name ?? 'Southern California'}`;
}

function DayBlock({
  day,
  perLeague,
  headingId,
  idSuffix,
}: {
  day: IndexDay;
  perLeague: number;
  headingId: string;
  idSuffix: string;
}) {
  const label = socalLabel(idSuffix, longDate(day.date));
  return (
    <section
      aria-labelledby={label ? undefined : headingId}
      aria-label={label}
      className="mt-6 first:mt-4"
    >
      {/* Capped like the day's lists below, so "Day page" sits over them. */}
      <div className="flex min-h-12 items-center gap-2 md:max-w-3xl">
        <h3 id={headingId} className="m-0 text-body font-semibold text-ink">
          <time dateTime={day.date}>
            <span aria-hidden="true">{shortDate(day.date)}</span>
            <span className="sr-only">{longDate(day.date)}</span>
          </time>
        </h3>
        <span className="sx-badge shrink-0 tabular-nums">
          {day.total} {gameWord(day.total)}
        </span>
        <Link
          href={scoresHref(day.date)}
          prefetch={false}
          className="sx-action ml-auto shrink-0 text-meta font-medium text-accent no-underline hover:underline"
        >
          Day page<span className="sr-only"> for {longDate(day.date)}</span>
        </Link>
      </div>
      {day.leagues.map((league) => {
        const more = league.games.length - perLeague;
        return (
          <div key={league.id} className="mt-2">
            <h4 className="m-0 mb-1 text-micro font-semibold text-ink-3">{league.shortName}</h4>
            <ol className="sx-list sx-bleed bg-surface md:max-w-3xl shadow-[0_-1px_0_var(--sx-border),0_1px_0_var(--sx-border)]">
              {league.games.slice(0, perLeague).map((game) => (
                <li key={game.contestId}>
                  <GameRow game={game} scopeLeague={league.id} showRecap={false} />
                </li>
              ))}
            </ol>
            {more > 0 ? (
              <p className="m-0 mt-1">
                <Link
                  href={scoresHref(day.date)}
                  prefetch={false}
                  className="sx-action text-meta font-medium text-accent hover:underline"
                >
                  +{more} more<span className="sr-only"> {league.shortName} {gameWord(more)} on {longDate(day.date)}</span> <Arrow />
                </Link>
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export function ScheduleIndex({ cards, regions, days, perLeague = 3 }: ScheduleIndexProps) {
  return (
    <>
      {regions.map((region) => (
        <div key={region.id} data-region-scope={region.id}>
          <ul className="m-0 mt-8 grid list-none gap-3 p-0 md:mt-10 md:grid-cols-2">
            {cards.filter((card) => card.region === region.id).map((card) => (
              <li key={card.id} id={card.id} className="flex">
                <Link
                  href={scheduleHref(card.id)}
                  prefetch={false}
                  className="sx-card sx-lift flex w-full flex-col gap-1 p-4 no-underline md:p-5"
                >
                  <span className="text-lead font-semibold text-ink">{card.shortName}</span>
                  <span className="text-meta text-ink-3">{card.name}</span>
                  <span className="text-body text-ink-2">
                    <CardLine card={card} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {region.recent.length > 0 ? (
            <section
              aria-labelledby={socalLabel(region.idSuffix, 'Recent') ? undefined : `schedule-recent${region.idSuffix}`}
              aria-label={socalLabel(region.idSuffix, 'Recent')}
              className="mt-section md:mt-section-lg"
            >
              <SectionHeader id={`schedule-recent${region.idSuffix}`} kicker="Recent" />
              {region.recent.map((day) => (
                <DayBlock
                  key={day.date}
                  day={day}
                  perLeague={perLeague}
                  headingId={`recent-${day.date}${region.idSuffix}`}
                  idSuffix={region.idSuffix}
                />
              ))}
            </section>
          ) : null}

          {region.next.length > 0 ? (
            <section
              aria-labelledby={socalLabel(region.idSuffix, 'Next') ? undefined : `schedule-next${region.idSuffix}`}
              aria-label={socalLabel(region.idSuffix, 'Next')}
              className="mt-section md:mt-section-lg"
            >
              <SectionHeader id={`schedule-next${region.idSuffix}`} kicker="Next" />
              {region.next.map((day) => (
                <DayBlock
                  key={day.date}
                  day={day}
                  perLeague={perLeague}
                  headingId={`next-${day.date}${region.idSuffix}`}
                  idSuffix={region.idSuffix}
                />
              ))}
            </section>
          ) : null}
        </div>
      ))}

      <section aria-labelledby="schedule-days" className="mt-section md:mt-section-lg">
        <SectionHeader id="schedule-days" kicker="Every game day" />
        <ol className="sx-list sx-card sx-flush sx-bleed mt-4">
          {days.map((day) => (
            <li key={day.date} id={day.date}>
              <Link
                href={scoresHref(day.date)}
                prefetch={false}
                className="sx-tap flex min-h-row-1 items-center gap-3 px-gutter py-2 text-body text-ink no-underline hover:underline"
              >
                <span className="min-w-0 flex-1">
                  <time dateTime={day.date} className="font-semibold">
                    {shortDate(day.date)}
                  </time>
                  {/* One count line per region; the scope stylesheet shows the reader's. Each names its
                      region ('NorCal: 4 games · SCVAL 1 …'): with JS off both show inside one link, and an
                      unlabelled second count was ambiguous (review 2026-10-06). */}
                  {day.byRegion.map((r) => (
                    <span key={r.region} data-region-scope={r.region} className="text-ink-2">
                      {/* A no-break space BEFORE each dot (DESIGN §26.5 "Separators"): the only
                          break is after it, so no line starts with "·". */}
                      {r.total === 0
                        ? `\u00a0· no ${regionShort(r.region)} games`
                        : `${`\u00a0· ${regionShort(r.region)}: ${plural(r.total, 'game')}`}${r.byLeague.map((l) => `\u00a0· ${l.shortName}\u00a0${l.games}`).join('')}`}
                    </span>
                  ))}
                </span>
                <Arrow className="shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export default ScheduleIndex;
