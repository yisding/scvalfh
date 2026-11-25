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
 * Academy, which had no si.com page then, has one since: its JV path was read on 2026-11-03 from the
 * JV page's own header and `otherTeams` link. A JV side is identified only by these
 * ids, never by name: si.com names a JV team as it names the varsity one.
 *
 * Pure config: no I/O.
 */

import { SBLIVE_WEB, maxprepsJvTeamUrl } from '../season';
import { bySport } from '../sports/current';
import { TEAMS } from '../teams';
import type { Team, TeamSlug } from '../types';

/** Registry slug → the JV team's si.com web path segment (`<id>-<slug>-jv`), or null when si.com has none. */
const FIELD_HOCKEY_JV_SBLIVE_PATHS: Readonly<Record<TeamSlug, string | null>> = {
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
  // Marin Academy had no si.com page on 2026-10-05; on 2026-11-03 its JV page (read, not guessed)
  // named itself "Marin Academy Wildcats Junior Varsity" and listed varsity team 575124 in `otherTeams`.
  'marin-academy': '575146-marin-academy-wildcats-jv',
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

/**
 * Girls soccer: each team's si.com JV team, the Junior Varsity entry of `otherTeams` on its varsity games page
 * (lib/registry/soccer/*.ts `sbliveSlug`), read 2026-11-21 (the PAL's and the SCCAL's later the same day). Eastside has
 * no JV team on si.com.
 */
const SOCCER_JV_SBLIVE_PATHS: Readonly<Record<TeamSlug, string | null>> = {
  gunn: '367041-gunn-titans-jv',
  homestead: '364704-homestead-mustangs-jv',
  'los-altos': '366648-los-altos-eagles-jv',
  'los-gatos': '366143-los-gatos-wildcats-jv',
  'mountain-view': '366654-mountain-view-spartans-jv',
  'palo-alto': '367047-palo-alto-vikings-jv',
  'santa-clara': '368142-santa-clara-bruins-jv',
  cupertino: '364694-cupertino-pioneers-jv',
  fremont: '364699-fremont-firebirds-jv',
  lynbrook: '364708-lynbrook-vikings-jv',
  macdonald: '577853-macdonald-condor-jv',
  milpitas: '366423-milpitas-trojans-jv',
  'monta-vista': '364714-monta-vista-matadors-jv',
  saratoga: '366148-saratoga-falcons-jv',
  wilcox: '368137-wilcox-chargers-jv',
  branham: '363437-branham-bruins-jv',
  gilroy: '364857-gilroy-mustangs-jv',
  leigh: '363444-leigh-longhorns-jv',
  leland: '367929-leland-chargers-jv',
  'piedmont-hills': '364308-piedmont-hills-pirates-jv',
  pioneer: '367933-pioneer-mustangs-jv',
  westmont: '363453-westmont-warriors-jv',
  'willow-glen': '367942-willow-glen-rams-jv',
  christopher: '486102-christopher-cougars-jv',
  'evergreen-valley': '364284-evergreen-valley-cougars-jv',
  lincoln: '367918-lincoln-lions-jv',
  'live-oak': '366621-live-oak-acorns-jv',
  'oak-grove': '364304-oak-grove-eagles-jv',
  'santa-teresa': '364312-santa-teresa-saints-jv',
  'silver-creek': '364317-silver-creek-raiders-jv',
  sobrato: '366617-ann-sobrato-bulldogs-jv',
  'andrew-hill': '364281-hill-falcons-jv',
  'del-mar': '363441-del-mar-dons-jv',
  gunderson: '367924-gunderson-grizzlies-jv',
  independence: '364288-independence-76ers-jv',
  'james-lick': '364292-james-lick-comets-jv',
  'mt-pleasant': '364300-mt-pleasant-cardinals-jv',
  overfelt: '400930-overfelt-royals-jv',
  prospect: '363448-prospect-panthers-jv',
  'san-jose': '367937-san-jose-bulldogs-jv',
  'yerba-buena': '364321-yerba-buena-aztec-warriors-jv',
  mitty: '400412-archbishop-mitty-monarchs-jv',
  riordan: '496908-archbishop-riordan-crusaders-jv',
  'sacred-heart-cathedral': '354478-sacred-heart-cathedral-preparatory-fightin-irish-jv',
  'saint-francis': '359170-saint-francis-lancers-jv',
  'st-ignatius': '354484-st-ignatius-wildcats-jv',
  'valley-christian': '354753-valley-christian-warriors-jv',
  castilleja: '354701-castilleja-gators-jv',
  'crystal-springs': '488372-crystal-springs-uplands-gryphons-jv',
  'kings-academy': '400761-kings-academy-knights-jv',
  menlo: '354635-menlo-school-knights-jv',
  'notre-dame-belmont': '361556-notre-dame-tigers-jv',
  presentation: '359175-presentation-panthers-jv',
  'sacred-heart-prep': '354500-sacred-heart-prep-gators-jv',
  eastside: null,
  harker: '354601-harker-eagles-jv',
  'mercy-burlingame': '354497-mercy-crusaders-jv',
  'notre-dame-san-jose': '359179-notre-dame-regents-jv',
  pinewood: '400952-pinewood-panthers-jv',
  priory: '555761-woodside-priory-panthers-jv',
  // The PAL and the SCCAL (2026-11-21); si.com lists a JV team for El Camino, Jefferson and Westmoor, which the PAL
  // schedules play as varsity only.
  aragon: '368035-aragon-dons-jv',
  burlingame: '368039-burlingame-panthers-jv',
  carlmont: '368298-carlmont-scots-jv',
  hillsdale: '368049-hillsdale-fighting-knights-jv',
  'menlo-atherton': '368302-menloatherton-bears-jv',
  sequoia: '368307-sequoia-cherokee-jv',
  woodside: '368311-woodside-wildcats-jv',
  capuchino: '368044-capuchino-mustangs-jv',
  'el-camino-ssf': '368446-el-camino-colts-jv',
  'half-moon-bay': '363406-half-moon-bay-cougars-jv',
  jefferson: '365427-jefferson-grizzlies-jv',
  mills: '368055-mills-vikings-jv',
  'san-mateo': '368061-san-mateo-bearcats-jv',
  'south-san-francisco': '368453-south-san-francisco-warriors-jv',
  'terra-nova': '365433-terra-nova-tigers-jv',
  westmoor: '365437-westmoor-rams-jv',
  aptos: '367015-aptos-mariners-jv',
  harbor: '368145-harbor-pirates-jv',
  'san-lorenzo-valley': '368005-san-lorenzo-valley-cougars-jv',
  'santa-cruz': '368150-santa-cruz-cardinals-jv',
  'scotts-valley': '368265-scotts-valley-falcons-jv',
  soquel: '368153-soquel-knights-jv',
  // The PCAL and the PSAL (2026-11-25); Monterey Bay Academy, Summit Tahoma, Summit Prep and KIPP Navigate have no JV team on
  // si.com.
  'everett-alvarez': '367750-everett-alvarez-eagles-jv',
  hollister: '367763-hollister-haybalers-jv',
  monterey: '366547-monterey-toreadores-jv',
  'pacific-collegiate': '400937-pacific-collegiate-pumas-jv',
  'rancho-san-juan': '489309-rancho-san-juan-trailblazers-jv',
  salinas: '367757-salinas-cowboys-jv',
  watsonville: '367023-watsonville-wildcatz-jv',
  alisal: '367745-alisal-trojans-jv',
  carmel: '363490-carmel-padres-jv',
  gonzales: '364917-gonzales-spartans-jv',
  'monte-vista-christian': '354667-monte-vista-christian-mustangs-jv',
  'pajaro-valley': '367018-pajaro-valley-grizzlies-jv',
  soledad: '368430-soledad-aztecs-jv',
  stevenson: '354628-stevenson-pirates-jv',
  greenfield: '365571-greenfield-bruins-jv',
  'king-city': '365575-king-city-mustangs-jv',
  'north-monterey-county': '366829-north-monterey-county-condors-jv',
  'north-salinas': '367753-north-salinas-vikings-jv',
  palma: '623673-palma-jv',
  seaside: '366550-seaside-spartans-jv',
  anzar: '363044-anzar-hawks-jv',
  'marina-mariners': '366545-marina-mariners-jv',
  'monterey-bay-academy': null,
  'pacific-grove': '487179-pacific-grove-breakers-jv',
  'st-francis-watsonville': '360122-st-francis-sharks-jv',
  'santa-catalina': '360065-santa-catalina-cougars-jv',
  york: '354621-york-falcons-jv',
  'thomas-more': '504727-more-knights-jv',
  oceana: '506676-oceana-sharks-jv',
  'kipp-san-jose': '625003-kipp-san-jose-collegiate-jv',
  'design-tech': '515949-design-tech-dragons-jv',
  'cristo-rey-san-jose': '624179-cristo-rey-jv',
  'latino-college-prep': '485998-latino-college-preparatory-academy-golden-eagles-jv',
  nueva: '610888-the-nueva-school-jv',
  'summit-tahoma': null,
  'ace-charter': '488578-ace-charter-cheetahs-jv',
  'kipp-esperanza': '581859-kipp-esperanza-jv',
  'summit-prep': null,
  'kipp-navigate': null,
  'summit-shasta': '401125-summit-shasta-black-bears-jv',
  'cindy-avitia': '623918-alpha-cindy-avitia-jv',
};

/**
 * Boys basketball: each team's si.com JV team, the Junior Varsity entry of `otherTeams` on its varsity games page
 * (lib/registry/basketball/*.ts `sbliveSlug`), read 2026-11-21.
 */
const BASKETBALL_JV_SBLIVE_PATHS: Readonly<Record<TeamSlug, string | null>> = {
  gunn: '158952-gunn-titans-jv',
  homestead: '155794-homestead-mustangs-jv',
  'los-gatos': '157693-los-gatos-wildcats-jv',
  lynbrook: '155799-lynbrook-vikings-jv',
  milpitas: '158120-milpitas-trojans-jv',
  'mountain-view': '158429-mountain-view-spartans-jv',
  'palo-alto': '158957-palo-alto-vikings-jv',
  cupertino: '155784-cupertino-pioneers-jv',
  fremont: '155789-fremont-firebirds-jv',
  'los-altos': '158425-los-altos-eagles-jv',
  macdonald: '577851-macdonald-condor-jv',
  'monta-vista': '155804-monta-vista-matadors-jv',
  'santa-clara': '160361-santa-clara-bruins-jv',
  saratoga: '157698-saratoga-falcons-jv',
  wilcox: '160355-wilcox-chargers-jv',
  christopher: '485309-christopher-cougars-jv',
  'evergreen-valley': '155188-evergreen-valley-cougars-jv',
  leigh: '153966-leigh-longhorns-jv',
  pioneer: '160112-pioneer-mustangs-jv',
  'santa-teresa': '155225-santa-teresa-saints-jv',
  westmont: '153976-westmont-warriors-jv',
  'willow-glen': '160122-willow-glen-rams-jv',
  branham: '153958-branham-bruins-jv',
  independence: '155193-independence-76ers-jv',
  leland: '160106-leland-chargers-jv',
  'live-oak': '158384-live-oak-acorns-jv',
  'silver-creek': '155230-silver-creek-raiders-jv',
  sobrato: '158379-ann-sobrato-bulldogs-jv',
  gilroy: '156012-gilroy-mustangs-jv',
  lincoln: '160095-lincoln-lions-jv',
  'oak-grove': '155214-oak-grove-eagles-jv',
  overfelt: '207723-overfelt-royals-jv',
  'piedmont-hills': '155219-piedmont-hills-pirates-jv',
  prospect: '153970-prospect-panthers-jv',
  'andrew-hill': '155183-hill-falcons-jv',
  'del-mar': '153962-del-mar-dons-jv',
  gunderson: '160102-gunderson-grizzlies-jv',
  'james-lick': '155199-james-lick-comets-jv',
  'mt-pleasant': '155210-mt-pleasant-cardinals-jv',
  'san-jose': '160117-san-jose-bulldogs-jv',
  'yerba-buena': '155236-yerba-buena-aztec-warriors-jv',
  // The WCAL, the WBAL, the PAL and the SCCAL (2026-11-21).
  mitty: '206988-archbishop-mitty-monarchs-jv',
  riordan: '141031-archbishop-riordan-crusaders-jv',
  bellarmine: '147279-bellarmine-college-prep-bells-jv',
  serra: '141045-serra-padres-jv',
  'sacred-heart-cathedral': '141035-sacred-heart-cathedral-preparatory-fightin-irish-jv',
  'saint-francis': '147266-saint-francis-lancers-jv',
  'st-ignatius': '141041-st-ignatius-wildcats-jv',
  'valley-christian': '141412-valley-christian-warriors-jv',
  'crystal-springs': '207227-crystal-springs-uplands-gryphons-jv',
  eastside: '152015-eastside-college-prep-panthers-jv',
  harker: '141194-harker-eagles-jv',
  'kings-academy': '207499-kings-academy-knights-jv',
  menlo: '141239-menlo-school-knights-jv',
  pinewood: '207759-pinewood-panthers-jv',
  priory: '141022-woodside-priory-panthers-jv',
  'sacred-heart-prep': '141059-sacred-heart-prep-gators-jv',
  aragon: '160229-aragon-dons-jv',
  burlingame: '160235-burlingame-panthers-jv',
  carlmont: '160612-carlmont-scots-jv',
  'half-moon-bay': '153889-half-moon-bay-cougars-jv',
  hillsdale: '160247-hillsdale-fighting-knights-jv',
  'menlo-atherton': '160618-menloatherton-bears-jv',
  sequoia: '160624-sequoia-cherokee-jv',
  woodside: '160630-woodside-wildcats-jv',
  capuchino: '160241-capuchino-mustangs-jv',
  'el-camino-ssf': '160845-el-camino-colts-jv',
  jefferson: '156820-jefferson-grizzlies-jv',
  mills: '160253-mills-vikings-jv',
  'san-mateo': '160259-san-mateo-bearcats-jv',
  'south-san-francisco': '160850-south-san-francisco-warriors-jv',
  'terra-nova': '156830-terra-nova-tigers-jv',
  westmoor: '156836-westmoor-rams-jv',
  aptos: '158917-aptos-mariners-jv',
  harbor: '160366-harbor-pirates-jv',
  'san-lorenzo-valley': '160197-san-lorenzo-valley-cougars-jv',
  'santa-cruz': '160371-santa-cruz-cardinals-jv',
  'scotts-valley': '160557-scotts-valley-falcons-jv',
  soquel: '160376-soquel-knights-jv',
  // The PCAL and the PSAL (2026-11-25); Monterey Bay Academy, Summit Tahoma, KIPP Navigate and Stratford have no JV team on
  // si.com.
  carmel: '154017-carmel-padres-jv',
  hollister: '159920-hollister-haybalers-jv',
  monterey: '158279-monterey-toreadores-jv',
  'pacific-grove': '158905-pacific-grove-breakers-jv',
  salinas: '159910-salinas-cowboys-jv',
  oakwood: '148669-oakwood-hawks-jv',
  palma: '141084-palma-chieftains-jv',
  alisal: '159892-alisal-trojans-jv',
  'marina-mariners': '158274-marina-mariners-jv',
  'monte-vista-christian': '141285-monte-vista-christian-mustangs-jv',
  'north-salinas': '159904-north-salinas-vikings-jv',
  'rancho-san-juan': '489303-rancho-san-juan-trailblazers-jv',
  soledad: '160806-soledad-aztecs-jv',
  'st-francis-watsonville': '148681-st-francis-sharks-jv',
  watsonville: '158929-watsonville-wildcatz-jv',
  'everett-alvarez': '159898-everett-alvarez-eagles-jv',
  gonzales: '156084-gonzales-spartans-jv',
  greenfield: '157015-greenfield-bruins-jv',
  'king-city': '157021-king-city-mustangs-jv',
  'north-monterey-county': '158652-north-monterey-county-condors-jv',
  'pajaro-valley': '158923-pajaro-valley-grizzlies-jv',
  seaside: '158284-seaside-spartans-jv',
  stevenson: '141229-stevenson-pirates-jv',
  anzar: '153361-anzar-hawks-jv',
  'monterey-bay-academy': null,
  'pacific-collegiate': '207737-pacific-collegiate-pumas-jv',
  york: '141220-york-falcons-jv',
  ceiba: '487826-ceiba-college-prep-spartans-jv',
  chartwell: '576406-chartwell-school-jv',
  kirby: '487816-kirby-prep-jv',
  'trinity-christian': '148662-trinity-christian-warriors-jv',
  'thomas-more': '150043-more-knights-jv',
  'design-tech': '207256-design-tech-dragons-jv',
  'summit-shasta': '207992-summit-shasta-black-bears-jv',
  oceana: '156824-oceana-sharks-jv',
  'university-prep': '488155-university-prep-academy-golden-eagles-jv',
  'basis-silicon-valley': '207015-basis-independent-silicon-valley-bobcats-jv',
  'kipp-san-jose': '155203-kipp-san-jose-collegiate-wolfpack-jv',
  nueva: '208016-the-nueva-school-mavericks-jv',
  'cristo-rey-san-jose': '572715-cristo-rey-lions-jv',
  kehillah: '149442-kehillah-rams-jv',
  'mountain-view-academy': '141506-mountain-view-academy-jv',
  'north-valley-baptist': '147964-north-valley-baptist-bulldogs-jv',
  'summit-prep': '487998-summit-preparatory-huskies-jv',
  'kipp-esperanza': '581835-kipp-esperanza-jv',
  pescadero: '157069-pescadero-vikings-jv',
  'sf-christian': '508023-san-francisco-christian-trojans-jv',
  'pacific-bay-christian': '141429-pacific-bay-christian-school-eagles-jv',
  'summit-tahoma': null,
  'kipp-navigate': null,
  'cindy-avitia': '206951-alpha-cindy-avitia-jaguars-jv',
  stratford: null,
  'mid-peninsula': '147567-midpeninsula-dragons-jv',
  'east-palo-alto-academy': '583705-east-palo-alto-phoenix-academy-bulldogs-jv',
};

/** This build's paths: the sport's own JV pages (si.com team ids are per sport); none for volleyball, whose build reads no si.com page. */
export const JV_SBLIVE_PATHS: Readonly<Record<TeamSlug, string | null>> = bySport<Readonly<Record<TeamSlug, string | null>>>({
  'field-hockey': FIELD_HOCKEY_JV_SBLIVE_PATHS,
  soccer: SOCCER_JV_SBLIVE_PATHS,
  basketball: BASKETBALL_JV_SBLIVE_PATHS,
  volleyball: {},
  // si.com carries no VAL school.
  'val-soccer': {},
});

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

export interface JvSlotTeam {
  name: string;
  /** The MaxPreps team id the JV rows name it by. */
  maxprepsTeamId: string;
  /** The registry school whose league slot it fills at JV level; that school fields no JV team. */
  jvFor: TeamSlug;
  /** One sentence: the league's own words, for the pages. */
  source: string;
  /** The stem of its tiles in public/mascots/ (`<mascot>-<px>.webp`), written by scripts/fetch-mascots.ts. */
  mascot: string;
  /** The logo the tiles are drawn from: the school's own site. */
  mascotSource: string;
  /** Its MaxPreps JV schedule page, which Santa Catalina's JV section links in place of its own. */
  maxprepsJvScheduleUrl: string;
  /** Its si.com JV games page. */
  sbliveJvGamesUrl: string;
}

/**
 * JV teams outside the registry that play a registry school's JV slot in its league, keyed by si.com JV
 * team id and identified on both sources by id, never by name.
 *
 * York (Monterey). PCAL's 2026 schedule (pcalathletics.org, the bundled PDF), Note 1: "Santa Catalina is
 * Varsity only. York is JV only. They are paired together in this schedule as CAT/YOR." Its schools line
 * reads "Santa Catalina V only (SCAT) … York (YOR) - JV ONLY". So the JV game of every Santa Catalina
 * fixture is York's: York stands in the PCAL JV table in Santa Catalina's place, a JV row filed under
 * Santa Catalina is York's (lib/jv/jv-corrections.ts), and a York game takes the classification of Santa
 * Catalina's varsity game of the day (lib/jv/jv-standings.ts). York's si.com JV page (456850, read
 * 2026-11-03) is "York Falcons Junior Varsity", Monterey, linking the varsity listing 456851 that
 * DATA_QUALITY.sbliveIgnoredTeamIds ignores; MaxPreps' JV rows name it e9a91bc8. Its si.com games fall on
 * Santa Catalina's fixture dates (Greenfield Sep 4 and Oct 6, Carmel Sep 10, Stevenson Sep 16; MaxPreps'
 * Monterey Oct 26).
 */
export const JV_OUTSIDE_TEAMS: Readonly<Record<string, JvSlotTeam>> = {
  '456850': {
    name: 'York',
    maxprepsTeamId: 'e9a91bc8-5999-4321-9e21-d6cdc8aafcb2',
    jvFor: 'santa-catalina',
    source: 'PCAL’s schedule pairs Santa Catalina (varsity only) with York (JV only), so York plays the JV games of Santa Catalina’s fixtures.',
    mascot: 'york',
    // York's athletics logo, from york.org (the owner's choice, 2026-11-03).
    mascotSource: 'https://www.york.org/uploads/images/Athletics/orig_photo564035_5539708.webp?v=1742499788252',
    // Both read 2026-11-06: MaxPreps' York JV roster page reports team e9a91bc8 (its schedule is the same
    // team's), and the si.com page is team 456850's.
    maxprepsJvScheduleUrl: 'https://www.maxpreps.com/ca/monterey/york-falcons/field-hockey/jv/schedule/',
    sbliveJvGamesUrl: `${SBLIVE_WEB}/teams/456850-york-falcons-jv/games`,
  },
};

/** The JV_OUTSIDE_TEAMS team a MaxPreps team id names, or undefined. */
export function jvOutsideTeamByMaxprepsId(teamId: string | null): JvSlotTeam | undefined {
  return teamId ? Object.values(JV_OUTSIDE_TEAMS).find((t) => t.maxprepsTeamId === teamId) : undefined;
}

/** The team that plays a registry school's JV slot because the school fields no JV team, or undefined. */
export function jvSlotTeamFor(slug: TeamSlug | null): JvSlotTeam | undefined {
  return slug ? Object.values(JV_OUTSIDE_TEAMS).find((t) => t.jvFor === slug) : undefined;
}

/** MaxPreps' JV schedule page for a school: `<varsity team URL>jv/schedule/`, or null without a MaxPreps page. */
export function jvMaxprepsScheduleUrl(team: Pick<Team, 'external'>): string | null {
  const base = team.external.maxprepsTeamUrl;
  return base ? `${maxprepsJvTeamUrl(base)}schedule/` : null;
}
