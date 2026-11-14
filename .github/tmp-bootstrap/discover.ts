// TEMPORARY: reads MaxPreps' team-context for candidate schools and each league's meta and standings.
import { writeFileSync } from 'node:fs';
import { MaxPrepsClient, maxprepsLeagueMetaUrl, maxprepsStandingsUrl } from '../../lib/sources/maxpreps';

const ids = process.argv.slice(2);
const c = new MaxPrepsClient();
const teams: Record<string, unknown> = {};
const leagueOut: Record<string, unknown> = {};

const main = async () => {
  const leagues = new Set<string>();
  for (const id of ids) {
    try {
      const { data } = await c.getTeamContext(id);
      const t = data.teamData as Record<string, unknown>;
      const keep: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(t)) if (v === null || typeof v !== 'object') keep[k] = v;
      teams[id] = keep;
      if (typeof t.leagueId === 'string' && !/^[0-]+$/.test(t.leagueId)) leagues.add(t.leagueId);
    } catch (e) {
      teams[id] = { error: (e as Error).message };
    }
  }
  for (const id of leagues) {
    const entry: Record<string, unknown> = {};
    for (const [k, url] of [['meta', maxprepsLeagueMetaUrl(id)], ['standings', maxprepsStandingsUrl(id)]] as const) {
      try {
        const res = await c.text(url, 'application/json');
        entry[k] = JSON.parse(res.data);
      } catch (e) {
        entry[k] = { error: (e as Error).message };
      }
    }
    leagueOut[id] = entry;
  }
  writeFileSync('.github/tmp-bootstrap/out/discover.json', JSON.stringify({ teams, leagues: leagueOut }, null, 1));
  console.log('teams', Object.keys(teams).length, 'leagues', leagues.size);
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
