import SectionHeader from '@/components/ui/SectionHeader';
import { leagueTitle } from '@/lib/config/leagues/labels';
import { listWords, numberWord } from '@/lib/format/words';
import { type AboutView, isQuotedLeague, leagueRef } from '@/views/about/about-view';

import { GeneratedRules, QuotedRules } from './LeagueRules';

/**
 * /about#standings: how every league's standings are computed, then one `#rules-<league>` block per
 * league (standings footnotes link those anchors; they are stable): SCVAL's by-laws quoted verbatim,
 * every other league's rules generated from its config citations (components/about/LeagueRules.tsx).
 */
export type AboutStandingsRulesProps = Pick<
  AboutView,
  'tabled' | 'perLeague' | 'siteOrdered' | 'anyTableless' | 'ruleLeagues' | 'titleOnly' | 'tableOrdered'
>;

export function AboutStandingsRules({
  tabled,
  perLeague,
  siteOrdered,
  anyTableless,
  ruleLeagues,
  titleOnly,
  tableOrdered,
}: AboutStandingsRulesProps) {
  return (
    <section id="standings" className="mt-16">
      <SectionHeader size="lg" kicker="Standings, points &amp; tiebreaks" />
      <div className="sx-prose">
        <p>
          {/* The qualifiers appear only when they are needed, so a NorCal-only site reads as before:
              a league that publishes no rules is ordered by this site's stated rules, and a division
              MaxPreps has no table for (the San Diego Section's Valley) has nothing to compare. */}
          Each league&rsquo;s standings are computed from individual game results by that
          league&rsquo;s own rules
          {siteOrdered.length > 0 ? ' where it publishes them (otherwise by this site’s stated rules below)' : ''},
          then compared field by field against MaxPreps&rsquo; own published table
          {anyTableless ? ' wherever MaxPreps publishes one' : ''} (see{' '}
          <a href="#cross-check" className="text-accent hover:underline">
            the cross-check log
          </a>
          ). A team with no reported results is never shown as a fabricated 0-0-0 record.{' '}
          {/* DESIGN-socal §2.1.7: the Southern California leagues publish no points rule, so the
              sentence names the leagues that do award points, then says this site applies the same
              3-1-0 to the rest (never that their rules require it). */}
          {siteOrdered.length > 0
            ? listWords(ruleLeagues.map((l) => l.shortName))
            : `All ${numberWord(tabled.length)} leagues`}{' '}
          award 3 points for a win and 1 for a tie
          {titleOnly.length === 0 ? (
            ' and order their tables by points'
          ) : (
            <>
              ; {listWords(tableOrdered.map((l) => l.shortName))} order their tables by points, and{' '}
              {listWords(titleOnly.map((l) => l.shortName))} {titleOnly.length === 1 ? 'uses' : 'use'} them
              only to decide {titleOnly.length === 1 ? 'its title and publishes' : 'their titles and publish'}{' '}
              no standings, so this site orders {titleOnly.length === 1 ? 'that table' : 'those tables'} by
              the same points
            </>
          )}
          {siteOrdered.length > 0
            ? `; ${listWords(siteOrdered.map(leagueRef))} publish no points rule, so this site applies the same 3-1-0`
            : null}
          ; they differ in which games count and how ties are broken.
        </p>
      </div>
      {perLeague.map(({ summary, config }) => (
        <section
          key={summary.id}
          id={`rules-${summary.id}`}
          data-region-scope={summary.region}
          className="mt-section"
          aria-labelledby={`rules-${summary.id}-heading`}
        >
          <SectionHeader
            as="h3"
            id={`rules-${summary.id}-heading`}
            kicker={leagueTitle(summary.id)}
          />
          {isQuotedLeague(config) ? (
            <QuotedRules league={config} />
          ) : (
            <GeneratedRules league={config} />
          )}
        </section>
      ))}
    </section>
  );
}

export default AboutStandingsRules;
