import { ALLOWS_TIES, RECORD_NOUN_WORDS, SCORE_UNITS } from '../../words/score-words';
import SectionHeader from '../../ui/SectionHeader';
import type { ShootoutSection } from '../about-view';

/**
 * /about#conventions: how a score is shown, with one item per section whose level games end in a
 * shootout (SectionConfig.shootout).
 */
export function ConventionsSection({ shootoutSections }: { shootoutSections: readonly ShootoutSection[] }) {
  return (
    <section id="conventions" className="sx-section">
      <SectionHeader kicker="How a score is shown" />
      <div className="sx-prose">
        <p>
          One rule governs every score on this site: a game that has not been decided never shows
          as <span className="sx-num">0&ndash;0</span>. A real final score of 0 prints as{' '}
          <span className="sx-num">0</span>; a game with nothing reported yet says &ldquo;No score&rdquo;
          and shows no figures. The two are never confused.
        </p>
        <ul className="list-disc">
          <li>A completed game says <b>Final</b> beside the score; an overtime win adds an OT tag.</li>
          {/* One item per section with a shootout rule (SectionConfig.shootout): the Northern Section's
              1 v 1s (the EAL's sentence, unchanged), the San Diego Section's shootouts. */}
          {/* An 'unverified' section (San Diego) never says a shootout decided a level W/L final: no box
              score carries a tally, and si.com and the Section's power rankings record Mt. Carmel–Poway
              (Sep 11) as 2-0 where MaxPreps has 0-0 (SectionConfig.shootout.inference). */}
          {shootoutSections.map((g) => (
            <li key={g.section.id}>
              {g.leagues.length === 1
                ? `A level ${g.leagues[0].shortName} league game`
                : `A level game between two ${g.section.name} teams`}{' '}
              {g.section.shootout!.inference === 'verified' ? (
                <>
                  that MaxPreps marks as won was decided on {g.section.shootout!.words}: it shows the level score
                  with an SO tag and counts as the winner&rsquo;s win. The{' '}
                  {/* '1 v 1s' → '1 v 1', 'a shootout' → 'shootout'. */}
                  {g.section.shootout!.words.replace(/^a /, '').replace(/s$/, '')} tally is not shown.
                </>
              ) : (
                <>
                  that MaxPreps marks as won is counted as the flagged team&rsquo;s win (under the
                  Section&rsquo;s procedures a level game outside a tournament is settled in overtime or
                  by a shootout; si.com and the Section&rsquo;s power rankings record some such games
                  with the shootout goal added): it shows MaxPreps&rsquo; score with no decider tag.
                </>
              )}
            </li>
          ))}
          {/* lib/postseason/level-final.ts: a level final with the winner marked, in a game that must have one. No
              source this site reads says how the tie was broken, so the row carries no decider tag. */}
          <li>
            {ALLOWS_TIES
              ? 'A postseason or tournament game that MaxPreps lists as level and marks as won was played to a winner: it is counted as the marked team’s win in records and form. The score shown is always the score in play. Where a second source records that level score with a shootout added (si.com’s 4–3 where MaxPreps has 1–1 is a 3–2 shootout), or a cited report gives it, the shootout is shown beside the score; where nothing says how the level score was broken, the game shows no decider tag and its page says so.'
              : 'A game cannot end level. One that MaxPreps lists as level and marks as won is counted as the marked team’s win; it shows the score as MaxPreps has it.'}
          </li>
          <li>
            No source is always right, so a score is checked against the others this site reads: si.com,
            cifsshome.org and each team&rsquo;s own box score. Where two of them agree on a score that is not
            MaxPreps&rsquo; and nothing supports MaxPreps&rsquo;, their score is shown, and the game&rsquo;s page
            says what each source has. Where one source differs and nothing settles it, MaxPreps&rsquo; score
            stands and the page says so.
          </li>
          <li>
            {`A forfeit counts in ${RECORD_NOUN_WORDS} but not in ${SCORE_UNITS} for/against/differential — marked with a dagger everywhere a total would otherwise be misleading.`}
          </li>
          <li>A game with no score posted yet says <b>No score</b>, never a blank or a zero.</li>
          <li>A postponed game says <b>Postponed</b>; a game with no start time yet says &ldquo;TBD&rdquo;.</li>
          <li>A non-league game is marked &ldquo;Non-league&rdquo;; it counts in a team&rsquo;s overall record and nowhere in the league standings.</li>
          <li>A score published from si.com carries a &dagger; and the words &ldquo;Score via si.com&rdquo; with the game.</li>
        </ul>
      </div>
    </section>
  );
}

export default ConventionsSection;
