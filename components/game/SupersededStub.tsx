import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import type { SupersededStub as SupersededStubData } from '@/views/game/game-view';
import { gameTitle } from '@/views/game/titles';

/**
 * The body of a `/game/sblive-<id>` page whose si.com game MaxPreps has since published (SPEC §8.1):
 * the stub's sentence, one pill to the MaxPreps game and the reason in a line. The page's metadata
 * (canonical = the MaxPreps href, no og:url) is `generateMetadata`'s; the stub stays out of the sitemap.
 */
export default function SupersededStub({ stub }: { stub: SupersededStubData }) {
  return (
    <div className="pb-section-lg">
      <h1 className="mt-6 mb-0 text-h1 text-ink">{stub.sentence}</h1>
      <p className="mt-4 mb-0">
        <Link
          href={stub.targetHref}
          className="sx-pill sx-pill-ring min-h-11"
        >
          {stub.targetModel ? gameTitle(stub.targetModel) : 'The MaxPreps game'} <Arrow />
        </Link>
      </p>
      <p className="mt-4 mb-0 max-w-prose text-meta text-ink-3">
        This page held a score published from High School on SI (si.com) while MaxPreps had no
        contest for the game. MaxPreps has it now, so the game&rsquo;s page is the MaxPreps one.
      </p>
    </div>
  );
}
