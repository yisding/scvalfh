import FormStrip from '../ui/FormStrip';
import ResultChip, { CHIP_LABEL } from '../ui/ResultChip';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';

import type { GameModel, GameSideModel } from './game-model';

/**
 * FORM GOING IN (DESIGN §3.5) — the last five LEAGUE results each side carried into this contest,
 * oldest → newest, then what happened here.
 *
 * "Going in" is the whole point: the strip is cut at this game, so a page for a September result
 * never shows October form. Rules are DESIGN §5.5 — league games only, five everywhere, unreported
 * and cancelled games skipped rather than shown as placeholder squares, and the words "no results"
 * instead of an empty row of boxes.
 *
 * A non-SCVAL opponent has no record on this site at all (DESIGN §8), so its row says so in words.
 */
export interface FormGoingInProps {
  model: GameModel;
  className?: string;
}

function FormRow({ side, showDirection }: { side: GameSideModel; showDirection: boolean }) {
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-gutter py-2">
      <span className="flex min-w-0 shrink-0 items-center gap-2">
        {side.team ? <TeamMonogram team={side.team} size={20} /> : null}
        <span className="truncate text-body text-ink">{side.name}</span>
      </span>
      {side.team ? (
        <>
          <FormStrip
            entries={side.formBefore}
            size={20}
            showDirection={showDirection}
            label={`${side.name} going into this game`}
          />
          {side.outcome ? (
            <span className="ml-auto flex items-center gap-1.5 text-meta text-ink-3">
              <span aria-hidden="true">&rarr;</span>
              <span>then</span>
              {/* `aria-hidden` on the chip, as every other ResultChip consumer does (GameRow,
                  SeasonSeries, FormStrip). ResultChip is a `role="img"` with its own
                  `aria-label`, so left exposed beside the sentence below it the row announced
                  "Loss" and then "Loss in this game". The written word is the channel that
                  carries the meaning here; the chip is the colour-free glyph beside it. */}
              <span aria-hidden="true">
                <ResultChip kind={side.outcome} size={20} />
              </span>
              <span className="sr-only">
                {CHIP_LABEL[side.outcome]} in this game
              </span>
            </span>
          ) : null}
        </>
      ) : (
        <span className="text-meta text-ink-3">
          Not an SCVAL school — this site keeps no record for {side.name}.
        </span>
      )}
    </li>
  );
}

export function FormGoingIn({ model, className }: FormGoingInProps) {
  const { away, home } = model;
  const anyTracked = Boolean(away.team || home.team);
  if (!anyTracked) return null;
  const played = [away, home].filter((s) => s.team && s.playedBefore > 0).length;

  return (
    <section className={className} aria-labelledby="game-form-kicker">
      <SectionHeader kicker="Form going in" as="h2" id="game-form-kicker" />
      <ol className="sx-list sx-bleed mt-2">
        {/* Away over home, the same order as the scoreboard and every list on the site. */}
        <FormRow side={away} showDirection />
        <FormRow side={home} showDirection={false} />
      </ol>
      <p className="mt-2 mb-0 text-meta text-ink-3">
        {played === 0
          ? 'Neither side had a league result before this date.'
          : 'League games only, oldest first. Games with no reported score are skipped, never shown as a result.'}
      </p>
    </section>
  );
}

export default FormGoingIn;
