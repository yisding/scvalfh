/**
 * Synthetic si.com (ex-SBLive) pages for the parser tests: a `data-react-props` snippet HTML-escaped
 * exactly the way si.com escapes it, so the unescape → raw_decode → zod path is exercised end to end.
 * Field names and shapes are copied from the live captures (tests/sblive.test.ts header).
 */

/** The escaping si.com actually applies to the attribute value. */
export function escapeAttr(json: string): string {
  return json.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * One React-island `<div>` carrying `props` for `className`; with `{ document: true }` it sits in a
 * full HTML document, the way a captured page does.
 */
export function page(className: string, props: unknown, opts: { document?: boolean } = {}): string {
  const island = `<div data-react-class="${className}" data-react-props="${escapeAttr(JSON.stringify(props))}"></div>`;
  return opts.document ? `<!DOCTYPE html><html><body>\n${island}\n</body></html>` : island;
}

/**
 * A `teams/Games` node (one game of a team's page): the Los Altos 4, Cupertino 0 final of 2026-09-23.
 * `{ full: true }` carries the whole captured shape (status text, game type, location, title, records);
 * the default keeps only the fields the id-first resolver reads.
 */
export function teamNode(over: Record<string, unknown> = {}, opts: { full?: boolean } = {}) {
  const team = { name: 'Los Altos', webPath: '/california/field-hockey/teams/458850-los-altos-eagles' };
  const opponent = {
    scoreText: '0',
    isHome: false,
    team: { name: 'Cupertino', webPath: '/california/field-hockey/teams/458665-cupertino-pioneers' },
  };
  if (!opts.full) {
    return {
      id: '6528121',
      date: '2026-09-23T16:00:00.000-07:00',
      statusId: 3,
      webPath: '/california/field-hockey/games/6528121-cupertino-vs-los-altos',
      featured: { isHome: true, scoreText: '4', team },
      opponent,
      ...over,
    };
  }
  return {
    id: '6528121',
    date: '2026-09-23T16:00:00.000-07:00',
    statusId: 3,
    shortStatusText: 'F',
    gameTypeLabel: 'League',
    locationText: 'Los Altos, CA',
    webPath: '/california/field-hockey/games/6528121-cupertino-vs-los-altos',
    titleText: 'Los Altos vs Cupertino',
    featured: {
      locationDescriptor: 'vs',
      isHome: true,
      result: 'WIN',
      scoreText: '4',
      standing: { overallRecord: '4-3-2', leagueRecord: '1-0' },
      team,
    },
    opponent,
    ...over,
  };
}

/** The props of a `teams/Games` page holding `nodes` (`{ full: true }` as for {@link teamNode}). */
export function teamGamesProps(nodes: unknown[], opts: { full?: boolean } = {}) {
  const team = {
    id: '458850',
    name: 'Los Altos',
    webPath: '/california/field-hockey/teams/458850-los-altos-eagles',
  };
  if (!opts.full) return { query: { team: { ...team, games: { nodes } } }, variables: {}, application: {} };
  return {
    query: { team: { ...team, standing: { overallRecord: '4-3-2', leagueRecord: '1-0' }, games: { nodes } } },
    variables: { id: '458850', schoolYear: '2026-2027', paginating: false },
    application: { env: 'production' },
  };
}
