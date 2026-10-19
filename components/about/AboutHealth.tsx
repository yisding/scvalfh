import SectionHeader from '@/components/ui/SectionHeader';
import type { AboutView } from '@/views/about/about-view';

import LeagueHealthCard from './LeagueHealthCard';

/**
 * /about#health: one LeagueHealthCard per league (SPEC §10.8), each read and checked on its own.
 */
export function AboutHealth({ perLeague }: Pick<AboutView, 'perLeague'>) {
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

export default AboutHealth;
