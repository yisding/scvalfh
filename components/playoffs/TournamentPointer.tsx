import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import type { TournamentPointerData } from '@/views/playoffs/playoffs-view';

/** The NCS pointer card: always present, one per league tournament. */
export default function TournamentPointer({ pointer }: { pointer: TournamentPointerData }) {
  return (
    <div className="mt-4 sx-inset max-w-3xl text-body text-ink-2">
      {/* Whole sentences as single text nodes, so the built HTML carries them verbatim. */}
      <p className="m-0">
        {pointer.lead}
        <Link href={pointer.href} prefetch={false} className="sx-action text-accent hover:underline">
          {pointer.name} <Arrow />
        </Link>
      </p>
    </div>
  );
}
