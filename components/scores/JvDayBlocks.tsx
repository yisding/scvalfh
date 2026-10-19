import JvDayGames from '@/components/schedule/JvDayGames';
import SectionHeader from '@/components/ui/SectionHeader';
import { gameWord } from '@/lib/format/words';
import type { ScoresDayView } from '@/views/scores/scores-view';

/**
 * JV last of the games: the same schools' other teams, never mixed into the varsity groups above or
 * their counts. One block per region (`#jv`, `#jv-socal`), each scoped to it and omitted when the region
 * has no JV game that day. When both render, each names its region beside the count, so the two "JV
 * games" headings (both visible without JS) differ. A day page exists only for a date with a varsity
 * contest, so a JV-only date is on the team pages alone.
 */
export default function JvDayBlocks({ jvBlocks }: Pick<ScoresDayView, 'jvBlocks'>) {
  return (
    <>
      {jvBlocks.map((block) => (
        <section
          key={block.region}
          id={`jv${block.idSuffix}`}
          data-region-scope={block.region}
          aria-labelledby={`jv${block.idSuffix}-heading`}
          className="mt-section md:mt-section-lg"
        >
          <SectionHeader
            id={`jv${block.idSuffix}-heading`}
            kicker="JV games"
            meta={`${jvBlocks.length > 1 ? `${block.shortName} · ` : ''}${block.view.rows.length} ${gameWord(block.view.rows.length)}`}
          />
          <JvDayGames view={block.view} />
        </section>
      ))}

    </>
  );
}
