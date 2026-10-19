import PlayoffBracket from '@/components/playoffs/PlayoffBracket';
import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import { shortDate } from '@/lib/format/dates';
import { listWords } from '@/lib/format/words';
import type { PlayoffsPageView } from '@/views/playoffs/playoffs-view';

/** The bracket, once published; before that, the one sentence that says when it will be. */
export default function CcsBracket({
  seeded,
  paths,
  pending,
  divisionLabels,
  playoffs,
}: Pick<PlayoffsPageView, 'seeded' | 'paths' | 'pending' | 'divisionLabels' | 'playoffs'>) {
  const { keyDates, bracketUrl } = playoffs;
  return (
    <section id="bracket" className="mt-section md:mt-section-lg">
      <SectionHeader
        kicker="Bracket"
        meta={seeded ? `seeded ${shortDate(keyDates.seedingMeeting)}` : undefined}
        action={seeded ? { href: '/schedule', label: 'All games' } : undefined}
      />
      {seeded ? (
        <>
          <div className="space-y-stack">
            {paths.map((path) => (
              <div key={path.id}>
                {paths.length > 1 ? <h3 className="m-0 mb-3 text-lead text-ink">{path.name}</h3> : null}
                <PlayoffBracket path={path} headingLevel={paths.length > 1 ? 'h4' : 'h3'} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 text-meta text-ink-2">
            {pending.length > 0 ? (
              <p className="m-0">
                {listWords(pending.map((r) => `${r.name} (${r.dateLabel})`))}{' '}
                {pending.length === 1 ? 'has' : 'have'} no games posted yet. Pairings appear here as
                CCS posts them.
              </p>
            ) : null}
            <p className="m-0">
              The CCS field is two eight-team divisions, {listWords(divisionLabels)}. Our data
              does not say which division a game belongs to, so the games above are grouped by round and, where
              the bracket splits into independent paths, by path.{' '}
              <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink>
            </p>
          </div>
        </>
      ) : (
        <p className="m-0 max-w-prose text-body text-ink-2">
          CCS seeds {listWords(divisionLabels)} at the {shortDate(keyDates.seedingMeeting)} meeting;
          the bracket appears here that evening.{' '}
          <ExternalLink href={bracketUrl}>Official CCS bracket</ExternalLink> &mdash; not yet posted.
        </p>
      )}
    </section>
  );
}
