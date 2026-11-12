import SectionHeader from '../../ui/SectionHeader';
import type { LeagueHealthEntry } from '../about-view';
import LeagueHealthCard from '../LeagueHealthCard';

/**
 * /about#health: one LeagueHealthCard per league, for how the most recent update went for it.
 */
export function HealthSection({ leagues }: { leagues: readonly LeagueHealthEntry[] }) {
  return (
    <section id="health" className="sx-section">
      <SectionHeader kicker="Data health, by league" />
      <p className="sx-prose">
        Each league is read and checked on its own, so a problem in one never holds the others
        back. This is how the most recent update went for each.
      </p>
      <div className="sx-auto mt-2">
        {leagues.map((l) => (
          <LeagueHealthCard
            key={l.summary.id}
            region={l.summary.region}
            shortName={l.summary.shortName}
            name={l.summary.name}
            health={l.health}
            divisions={l.healthDivisions}
            dropped={l.dropped}
            problems={l.problems}
          />
        ))}
      </div>
    </section>
  );
}

export default HealthSection;
