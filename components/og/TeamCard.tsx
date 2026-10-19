import { OG } from '@/views/site/og-theme';
import { SITE_NAME } from '@/views/site/site';
import type { TeamCardModel } from '@/views/teams/team-card';

import { OgFooter, OgFrame } from './primitives';

/**
 * The team card's alt (app/teams/[slug]/opengraph-image.tsx `alt`). It is a static export, so it
 * describes what every card CONTAINS rather than naming one team; the per-team fact is in the OG
 * title that sits beside it. A per-team alt would need `generateImageMetadata`, which changes the
 * image URL shape.
 */
export const TEAM_CARD_ALT =
  'Team card: league and division, place, league record, points, goals for and against, streak, last result and next game';

/** One labelled number in the card's stat row. */
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div
        style={{
          display: 'flex',
          fontSize: 20,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: OG.TEXT_3,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', marginTop: 8, fontSize: 38, fontWeight: 600, color: OG.TEXT }}>
        {value}
      </div>
      {note ? (
        <div style={{ display: 'flex', marginTop: 4, fontSize: 20, color: OG.TEXT_2 }}>{note}</div>
      ) : null}
    </div>
  );
}

/**
 * The per-team OG card (DESIGN §1.1, §3.7; model: views/teams/team-card.ts): the monogram square,
 * name, identity and place lines, six stats, the last and next games, and the as-of footer.
 *
 * The one school-color concession is the monogram square, drawn with the cron's measured
 * `onPrimary` ink — the same guardrail TeamMonogram uses, never a hue picked by eye (DESIGN §7.1,
 * §12.4).
 */
export function TeamCard({ model }: { model: TeamCardModel }) {
  const { team } = model;
  return (
    <OgFrame padding={72}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 118,
            height: 118,
            borderRadius: 16,
            background: `#${team.colors.primary}`,
            color: team.colors.onPrimary,
            border: `2px solid ${OG.RULE}`,
            fontSize: 50,
            fontWeight: 600,
          }}
        >
          {team.abbr}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 58, fontWeight: 600 }}>{team.name}</div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 28, color: OG.TEXT_2 }}>
            {model.identityLine}
          </div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 30, color: OG.TEXT }}>{model.placeLine}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, borderTop: `2px solid ${OG.RULE}`, paddingTop: 24 }}>
        <Stat label="League" value={model.record} />
        <Stat label="Pts" value={model.points} />
        <Stat label="GP" value={model.gp} />
        <Stat label="Goals F / A" value={model.goals} />
        <Stat label="Diff" value={model.diff} />
        <Stat label="Streak" value={model.streak} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', fontSize: 30, color: OG.TEXT }}>Last: {model.lastLine}</div>
        <div style={{ display: 'flex', fontSize: 30, color: OG.TEXT_2 }}>Next: {model.nextLine}</div>
      </div>

      <OgFooter size={22}>
        {model.asOf} &middot; {SITE_NAME}
      </OgFooter>
    </OgFrame>
  );
}
