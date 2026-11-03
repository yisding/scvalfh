import SectionHeader from '../../ui/SectionHeader';
import type { AboutSectionProps } from '../about-view';
import LeagueHealthCard from '../LeagueHealthCard';

/**
 * /about#health: one LeagueHealthCard per league, for how the most recent update went for it.
 */
export function HealthSection({ view }: AboutSectionProps) {
  const { perLeague } = view;
  return (
    <section id="health" className="mt-16">
      <SectionHeader size="lg" kicker="Data health, by league" />
      <p className="sx-prose">
        Each league is read and checked on its own, so a problem in one never holds the others
        back. This is how the most recent update went for each.
      </p>
      <div className="mt-stack grid gap-4 md:grid-cols-2">
        {perLeague.map((l) => (
          <LeagueHealthCard
            key={l.summary.id}
            region={l.summary.region}
            shortName={l.summary.shortName}
            name={l.summary.name}
            health={l.health}
            divisions={l.healthDivisions}
            dropped={l.dropped.length}
            problems={l.problems}
          />
        ))}
      </div>
    </section>
  );
}

export default HealthSection;
