/**
 * Where each registry school's JV team lives on the two sources scripts/fetch-jv.ts reads.
 *
 * MaxPreps needs nothing new: a school's JV games come from the same schedule-calculated call as
 * its varsity games, with JV_SPORT_SEASON_ID (lib/season.ts) and the school's own id, which is the
 * registry id. Its human-facing JV pages sit under the varsity team URL, at `jv/schedule/`.
 *
 * si.com gives each JV team its own team id and web path, distinct from the varsity one in the
 * registry. Each path below was read on 2026-10-05 from the level switcher (`level.name` "Junior
 * Varsity", `webPath`) on that school's varsity si.com games page, never guessed (DATA-SOURCES
 * §1.2 caveat 5); the 53 Southern California paths were read the same way on 2026-10-06. Marin
 * Academy has no si.com page at all, so it has no JV path. A JV side is identified only by these
 * ids, never by name: si.com names a JV team as it names the varsity one.
 *
 * Pure config: no I/O.
 */

import { SBLIVE_WEB } from './sources/sblive';
import { TEAMS } from './teams';
import type { Team, TeamSlug } from './types';

/** Registry slug → the JV team's si.com web path segment (`<id>-<slug>-jv`), or null when si.com has none. */
export const JV_SBLIVE_PATHS: Readonly<Record<TeamSlug, string | null>> = {
  'st-ignatius': '456832-st-ignatius-wildcats-jv',
  'saint-francis': '457983-saint-francis-lancers-jv',
  'los-altos': '458849-los-altos-eagles-jv',
  'valley-christian': '480710-valley-christian-warriors-jv',
  fremont: '496837-fremont-firebirds-jv',
  cupertino: '458664-cupertino-pioneers-jv',
  homestead: '458666-homestead-mustangs-jv',
  mitty: '464807-archbishop-mitty-monarchs-jv',
  'los-gatos': '458803-los-gatos-wildcats-jv',
  'palo-alto': '480764-palo-alto-vikings-jv',
  presentation: '457984-presentation-panthers-jv',
  'santa-clara': '496840-santa-clara-bruins-jv',
  saratoga: '458806-saratoga-falcons-jv',
  lynbrook: '458668-lynbrook-vikings-jv',
  'monta-vista': '458671-monta-vista-matadors-jv',
  branham: '458509-branham-bruins-jv',
  christopher: '458686-christopher-cougars-jv',
  gilroy: '458689-gilroy-mustangs-jv',
  leigh: '458514-leigh-longhorns-jv',
  leland: '459052-leland-chargers-jv',
  'willow-glen': '459058-willow-glen-rams-jv',
  'del-mar': '458512-del-mar-dons-jv',
  'live-oak': '458847-live-oak-acorns-jv',
  prospect: '458518-prospect-panthers-jv',
  'silver-creek': '547017-silver-creek-raiders-jv',
  sobrato: '458845-ann-sobrato-bulldogs-jv',
  westmont: '458519-westmont-warriors-jv',
  carmel: '458528-carmel-padres-jv',
  greenfield: '458775-greenfield-bruins-jv',
  hollister: '459011-hollister-haybalers-jv',
  monterey: '458838-monterey-toreadores-jv',
  salinas: '459008-salinas-cowboys-jv',
  'santa-catalina': '458108-santa-catalina-cougars-jv',
  stevenson: '456853-stevenson-pirates-jv',
  'archie-williams': '512735-archie-williams-falcons-jv',
  redwood: '459142-redwood-giants-jv',
  tamalpais: '512156-tamalpais-red-tailed-hawks-jv',
  berkeley: '458484-berkeley-yellowjackets-jv',
  'lick-wilmerding': '487099-lickwilmerding-tigers-jv',
  'university-sf': '456868-university-red-devils-jv',
  'marin-catholic': '456833-marin-catholic-wildcats-jv',
  // si.com files Convent & Stuart Hall's JV under the joint name; it is the JV on Convent's own page.
  'convent-sacred-heart': '487181-convent-stuart-hall-jv',
  'marin-academy': null,
  'bella-vista': '459059-bella-vista-broncos-jv',
  chico: '458563-chico-panthers-jv',
  corning: '485808-corning-cardinals-jv',
  davis: '458606-davis-blue-devils-jv',
  lassen: '490252-lassen-grizzlies-jv',
  'pleasant-valley': '458565-pleasant-valley-vikings-jv',
  // Southern California (the Sunset and the San Diego Section's City, North County and Metro
  // conferences): each path read on 2026-10-06 from the "Junior Varsity" entry of `otherTeams` on that
  // school's varsity si.com games page (the registry's sbliveGamesUrl), never guessed. Every one of the
  // 50 lists a JV team there; si.com names Southwest's "Southwest SD", as it names the varsity.
  bonita: '458495-bonita-bearcats-jv',
  chaminade: '483205-chaminade-eagles-jv',
  chaparral: '484041-chaparral-pumas-jv',
  edison: '468928-edison-chargers-jv',
  'fountain-valley': '482354-fountain-valley-barons-jv',
  'great-oak': '459146-great-oak-wolfpack-jv',
  'huntington-beach': '458745-huntington-beach-oilers-jv',
  marina: '483032-marina-vikings-jv',
  'newport-harbor': '482406-newport-harbor-sailors-jv',
  'temecula-valley': '480762-temecula-valley-golden-bears-jv',
  bishops: '480763-bishops-knights-jv',
  'canyon-hills': '459035-canyon-hills-rattlers-jv',
  'cathedral-catholic': '458203-cathedral-catholic-dons-jv',
  'la-jolla': '459020-la-jolla-vikings-jv',
  'mission-bay': '459026-mission-bay-buccaneers-jv',
  'scripps-ranch': '459031-scripps-ranch-falcons-jv',
  clairemont: '459018-clairemont-chieftains-jv',
  'la-jolla-country-day': '456864-la-jolla-country-day-torreys-jv',
  'mira-mesa': '459024-mira-mesa-marauders-jv',
  'patrick-henry': '480713-patrick-henry-patriots-jv',
  'point-loma': '459030-point-loma-pointers-jv',
  'university-city': '459036-university-city-centurions-jv',
  'canyon-crest-academy': '459040-canyon-crest-academy-ravens-jv',
  'la-costa-canyon': '459044-la-costa-canyon-mavericks-jv',
  'mt-carmel': '458940-mt-carmel-sundevils-jv',
  'rancho-bernardo': '458944-rancho-bernardo-broncos-jv',
  'san-marcos': '459067-san-marcos-knights-jv',
  'torrey-pines': '459048-torrey-pines-falcons-jv',
  'del-norte': '458936-del-norte-nighthawks-jv',
  fallbrook: '458654-fallbrook-warriors-jv',
  'mission-vista': '484580-mission-vista-timberwolves-jv',
  poway: '458941-poway-titans-jv',
  'rancho-buena-vista': '459175-rancho-buena-vista-longhorns-jv',
  'san-dieguito-academy': '459046-san-dieguito-academy-mustangs-jv',
  'valley-center': '459168-valley-center-jaguars-jv',
  escondido: '458640-escondido-cougars-jv',
  'mission-hills': '459064-mission-hills-grizzlies-jv',
  'sage-creek': '464865-sage-creek-bobcats-jv',
  'san-pasqual': '458645-san-pasqual-golden-eagles-jv',
  vista: '464778-vista-panthers-jv',
  westview: '458948-westview-wolverines-jv',
  'bonita-vista': '459120-bonita-vista-barons-jv',
  eastlake: '459129-eastlake-titans-jv',
  helix: '458714-helix-highlanders-jv',
  olympian: '483313-olympian-eagles-jv',
  'otay-ranch': '459135-otay-ranch-mustangs-jv',
  'el-capitan': '458710-el-capitan-vaqueros-jv',
  'granite-hills': '458712-granite-hills-eagles-jv',
  hilltop: '459132-hilltop-lancers-jv',
  southwest: '459139-southwest-sd-raiders-jv',
  // The LA independents, read from each school's si.com games page (`otherTeams`) on 2026-10-06.
  glendora: '481707-glendora-tartans-jv',
  'harvard-westlake': '482355-harvardwestlake-wolverines-jv',
  'thousand-oaks': '482332-thousand-oaks-lancers-jv',
};

/** The numeric si.com JV team id of a registry team, or null. */
export function jvSbliveTeamId(slug: TeamSlug): string | null {
  const path = JV_SBLIVE_PATHS[slug];
  return path ? (/^(\d+)-/.exec(path)?.[1] ?? null) : null;
}

/** The JV team's si.com games page, or null. */
export function jvSbliveGamesUrl(slug: TeamSlug): string | null {
  const path = JV_SBLIVE_PATHS[slug];
  return path ? `${SBLIVE_WEB}/teams/${path}/games` : null;
}

/** si.com JV team id → registry slug: the only way a si.com JV side becomes one of our teams. */
export const JV_SLUG_BY_SBLIVE_ID: ReadonlyMap<string, TeamSlug> = new Map(
  TEAMS.flatMap((t) => {
    const id = jvSbliveTeamId(t.slug);
    return id ? [[id, t.slug] as const] : [];
  }),
);

/** MaxPreps' JV schedule page for a school: `<varsity team URL>jv/schedule/`, or null without a MaxPreps page. */
export function jvMaxprepsScheduleUrl(team: Pick<Team, 'external'>): string | null {
  const base = team.external.maxprepsTeamUrl;
  return base ? `${base.endsWith('/') ? base : `${base}/`}jv/schedule/` : null;
}
