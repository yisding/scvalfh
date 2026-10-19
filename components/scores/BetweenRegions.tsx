import GameList from '@/components/schedule/GameList';
import SectionHeader from '@/components/ui/SectionHeader';
import { gameWord } from '@/lib/format/words';
import type { ScoresDayView } from '@/views/scores/scores-view';

import MovedNote from './MovedNote';

/** The NorCal vs SoCal block, unscoped (shown in both views): games with a registry side in each region. */
export default function BetweenRegions({
  between,
  betweenMoved,
  records,
}: Pick<ScoresDayView, 'between' | 'betweenMoved' | 'records'>) {
  return (
    <section id="between-regions" aria-labelledby="between-regions-heading" className="mt-section md:mt-section-lg">
      <SectionHeader
        id="between-regions-heading"
        kicker="NorCal vs SoCal"
        meta={`${between.length} ${gameWord(between.length)}`}
      />
      <GameList games={between} records={records} tracks={between.length > 1 ? 'fit' : 'fill'} />
      <MovedNote moved={betweenMoved} />
    </section>
  );
}
