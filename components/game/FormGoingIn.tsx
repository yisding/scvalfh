import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import FormStrip from '@/components/ui/FormStrip';
import ResultChip, { CHIP_LABEL } from '@/components/ui/ResultChip';
import SectionHeader from '@/components/ui/SectionHeader';
import SideMonogram from '@/components/ui/SideMonogram';
import type { GameView } from '@/views/game/game-view';
import type { GameSideModel } from '@/views/game/types';

/**
 * FORM GOING IN (DESIGN §3.5) — the last five LEAGUE results each side carried into this contest,
 * oldest → newest, then what happened here.
 *
 * "Going in" is the whole point: the strip is cut at this game, so a page for a September result
 * never shows October form. Rules are DESIGN §5.5 — league games only, five everywhere, unreported
 * and cancelled games skipped rather than shown as placeholder squares, and the words "no results"
 * instead of an empty row of boxes.
 *
 * An opponent outside the teams this site follows has no record here at all (DESIGN §8), so its
 * row says so in words (SPEC §10.6), beside the same GhostMonogram tile its game rows use
 * (SideMonogram).
 *
 * A member side's name is a link to its team page — the natural next step from "how were they
 * playing coming in" is "show me their season". It is a standalone link, so it carries
 * `.sx-action`'s 24px box (WCAG 2.5.8); the short name, because the strip shares its line.
 */
export interface FormGoingInProps {
  model: GameView;
  className?: string;
}

function FormRow({ side, memberCount }: { side: GameSideModel; memberCount: number }) {
  return (
    <li className="flex min-h-row-1 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {side.team ? (
        // `max-w-full` + `min-w-0` (not `shrink-0`): in this wrapping row a name wider than the
        // card truncates inside the link instead of pushing the page sideways at 320.
        // `prefetch={false}`: one link per form row, the policy for every per-row link
        // (tests/arch/prefetch-policy.test.ts).
        <span className="flex min-w-0 max-w-full items-center gap-2.5">
          <SideMonogram slug={side.team.slug} name={side.name} size={24} />
          <Link
            href={`/teams/${side.team.slug}`}
            prefetch={false}
            className="sx-action min-w-0 gap-1 text-body text-accent no-underline hover:underline"
          >
            <span className="truncate">{side.team.shortName}</span>
            <span aria-hidden="true" className="shrink-0 text-micro">
              &rsaquo;
            </span>
          </Link>
        </span>
      ) : (
        <span className="flex min-w-0 shrink-0 items-center gap-2.5">
          {/* No hover note on the ghost tile: the row says the same in words beside it. */}
          <SideMonogram slug={null} name={side.name} size={24} ghostTitle={null} />
          <span className="truncate text-body text-ink">{side.name}</span>
        </span>
      )}
      {side.team ? (
        // The strip and "→ then [chip]" are ONE unit that never splits. Below 768px it ALWAYS
        // takes its own line, aligned under the name (34px: the 24px tile and its 10px gap), and
        // may wrap there: a linked strip is 40px a chip, so four or five games plus "then L" are
        // wider than the line at 320. It used to move under the name only when it did not fit
        // beside it, so at 390 one side's row was 65px with the strip inline and the other 96px
        // with it wrapped, by the length of the name. From 768px it sits beside the name, flush
        // right, and moves whole when it does not fit, so the outcome chip never sits alone.
        <span className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap max-md:ml-0 max-md:basis-full max-md:flex-wrap max-md:gap-y-1 max-md:pl-[2.125rem]">
          <FormStrip
            entries={side.formBefore}
            size={20}
            label={`${side.name} going into this game`}
          />
          {side.outcome ? (
            <span className="flex items-center gap-2 text-meta text-ink-3">
              <Arrow />
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
        </span>
      ) : (
        // The same second line as a member's strip below 768px, so the two rows share one shape.
        <span className="text-meta text-ink-3 max-md:basis-full max-md:pl-[2.125rem]">
          {`Not one of the ${memberCount} teams this site follows — no record is kept here.`}
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
      <SectionHeader
        kicker="Form going in"
        as="h2"
        id="game-form-kicker"
        meta="League games · oldest → newest"
      />
      <div className="sx-card sx-flush sx-bleed">
        <ol className="sx-list">
          {/* Away over home, the same order as the scoreboard and every list on the site. */}
          <FormRow side={away} memberCount={model.memberCount} />
          <FormRow side={home} memberCount={model.memberCount} />
        </ol>
        <p className="m-0 border-t border-divider px-4 py-3 text-meta text-ink-3">
          {played === 0
            ? 'Neither side had a league result before this date.'
            : 'Games with no reported score are skipped, never shown as a result.'}
        </p>
      </div>
    </section>
  );
}

export default FormGoingIn;
