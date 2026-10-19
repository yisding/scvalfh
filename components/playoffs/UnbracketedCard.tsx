import ExternalLink from '@/components/ui/ExternalLink';
import type { UnbracketedCardData } from '@/views/playoffs/playoffs-view';

/**
 * One card per unbracketed league (EAL): the rule, its dates and its source, never a bracket or a
 * seed. Its id is the EAL chip's and jump link's target. The link words are today's, byte for byte
 * (tests/ui/eal-views.test.ts), from postseasonSourceLink: the EAL's rules document is the Northern
 * Section's Guidelines, which `SectionConfig.rulesSource.name` names with its years.
 */
export default function UnbracketedCard({ card }: { card: UnbracketedCardData }) {
  const { id, lead, qualification, source } = card;
  return (
    <div id={id} className="mt-4 sx-inset max-w-3xl text-body text-ink-2">
      <p className="m-0">{lead}</p>
      <p className="mb-0 text-meta">
        {qualification}{' '}
        <ExternalLink href={source.href}>{source.text}</ExternalLink>
      </p>
    </div>
  );
}
