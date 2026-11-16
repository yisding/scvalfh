/**
 * lib/players/official-name.ts: which of a player's spellings is official, and what the others are.
 * The cases are the registry's own (2026-11), with the sources they were read in.
 */
import { describe, expect, it } from 'vitest';

import { chooseNames, isNicknameOf, type SpellingSeen } from '../lib/players/official-name';
import type { ObservationSource } from '../lib/players/registry-schema';

const at = (name: string, src: ObservationSource, season = '26-27'): SpellingSeen => ({ name, src, season });
/** The choice for spellings in the order given (the order the registry lists them). */
const choose = (seen: SpellingSeen[], curated?: Parameters<typeof chooseNames>[2]) =>
  chooseNames([...new Set(seen.map((s) => s.name))], seen, curated);
const kinds = (c: ReturnType<typeof chooseNames>) => Object.fromEntries(c.aliases.map((a) => [a.name, a.kind]));

describe('isNicknameOf', () => {
  it('knows the table, stems, endings and doubled syllables', () => {
    for (const [short, full] of [
      ['Maddie', 'Madeleine'], ['Lexie', 'Alexandra'], ['Nate', 'Nathan'], ['Ollie', 'Oliver'], ['Kai', 'Kailaya'],
      ['Emme', 'Emmeline'], ['Franny', 'Francesca'], ['Bella', 'Ysabella'], ['Gigi', 'Gisella'], ['Lala', 'Laura'], ['Cece', 'Cecily'],
    ]) {
      expect(isNicknameOf(short, full), `${short} / ${full}`).toBe(true);
    }
  });

  it('is not fooled by a slip, the other direction, or an unrelated name', () => {
    expect(isNicknameOf('Chevy', 'Chevey')).toBe(false);
    expect(isNicknameOf('Kalia', 'Kaila')).toBe(false);
    expect(isNicknameOf('Madeleine', 'Maddie')).toBe(false);
    expect(isNicknameOf('Maya', 'Nayla')).toBe(false);
    expect(isNicknameOf('Gigi', 'Amelia')).toBe(false);
  });
});

describe('chooseNames', () => {
  it('a full name is official over its nickname, whatever the source', () => {
    const c = choose([at('Maddie Grimsley', 'maxpreps-roster'), at('Madeleine Grimsley', 'all-league', '25-26')]);
    expect(c.name).toBe('Madeleine Grimsley');
    expect(kinds(c)).toEqual({ 'Maddie Grimsley': 'nickname' });
  });

  it('a whole name is official over a part of it', () => {
    const c = choose([at('Alana Phan', 'maxpreps-jv-roster'), at('Alana Phan-Rodriguez', 'all-league', '25-26')]);
    expect(c.name).toBe('Alana Phan-Rodriguez');
    expect(kinds(c)).toEqual({ 'Alana Phan': 'short-form' });
  });

  it('a name in parentheses or quotes is a nickname: of the plain spelling when there is one, else it stands', () => {
    expect(choose([at('Wenhe (Angela) Zhang', 'maxpreps-roster'), at('Wenhe Zhang', 'maxpreps-stats', '25-26')])).toEqual({
      name: 'Wenhe Zhang',
      decidedBy: 'fullest',
      aliases: [{ name: 'Wenhe (Angela) Zhang', kind: 'nickname' }],
    });
    expect(choose([at('Bella Pablo', 'maxpreps-jv-roster'), at('Vivienne (Bella) Pablo', 'all-league', '25-26')]).name).toBe('Vivienne (Bella) Pablo');
    expect(choose([at('Kate Barsily', 'maxpreps-roster'), at('Katherine "Kate" Barsily', 'enrichment')]).name).toBe('Katherine "Kate" Barsily');
  });

  it('a nickname written in as a middle word is a nickname, not a middle name', () => {
    const c = choose([at('GiGi Borello', 'maxpreps-roster'), at('Giuliana Borello', 'enrichment'), at('Giuliana Gigi Borello', 'all-league', '25-26')]);
    expect(c.name).toBe('Giuliana Borello');
    expect(kinds(c)).toEqual({ 'GiGi Borello': 'nickname', 'Giuliana Gigi Borello': 'nickname' });
  });

  it('a slip goes to the spelling more sources give, then to the more official source', () => {
    // MaxPreps' roster and last year's stat sheet against the all-league list.
    const c = choose([at('Caityln Hughes', 'all-league', '25-26'), at('Caitlyn Hughes', 'maxpreps-roster'), at('Caitlyn Hughes', 'maxpreps-stats', '25-26')]);
    expect(c).toMatchObject({ name: 'Caitlyn Hughes', decidedBy: 'support' });
    expect(kinds(c)).toEqual({ 'Caityln Hughes': 'spelling' });
    // One against one: the school's own list, then MaxPreps over the all-league list.
    expect(choose([at('Peri Teper', 'maxpreps-jv-roster'), at('Peri Tepper', 'school-jv-roster')])).toMatchObject({ name: 'Peri Tepper', decidedBy: 'source' });
    expect(choose([at('Mitchelle Tchoub', 'all-league', '25-26'), at('Michelle Tchoub', 'maxpreps-jv-roster')]).name).toBe('Michelle Tchoub');
  });

  it('a clean spelling beats an annotated, uncapitalised, badly spaced or decorated one', () => {
    expect(choose([at('Sienna Steele (GK) 10', 'enrichment'), at('Sienna Steele', 'maxpreps-roster')]).name).toBe('Sienna Steele');
    expect(choose([at('Iris jin', 'all-league', '25-26'), at('Iris Jin', 'maxpreps-roster')]).name).toBe('Iris Jin');
    expect(choose([at('Hayven Medeiros- Schomberg', 'enrichment'), at('Hayven Medeiros-Schomberg', 'maxpreps-roster')]).name).toBe('Hayven Medeiros-Schomberg');
    expect(choose([at('𝐿𝓊𝓅𝒾𝓉𝒶 Cervantes', 'enrichment'), at('Lupita Cervantes', 'maxpreps-roster')]).name).toBe('Lupita Cervantes');
    // A particle is written small by custom.
    expect(choose([at('Colette Von Klemperer', 'maxpreps-roster'), at('Colette von Klemperer', 'school-jv-roster')]).name).toBe('Colette von Klemperer');
  });

  it('accents, apostrophes and hyphens are kept over the same letters without them', () => {
    expect(choose([at('Tea Hunnius', 'maxpreps-roster'), at('Téa Hunnius', 'maxpreps-roster')]).name).toBe('Téa Hunnius');
    expect(choose([at('Bea ONeil', 'school-jv-roster'), at("Bea O'Neil", 'maxpreps-roster')]).name).toBe("Bea O'Neil");
  });

  it('words in another order are a variant', () => {
    expect(kinds(choose([at('Dan Wataro', 'maxpreps-roster'), at('Wataro Dan', 'maxpreps-stats', '25-26')]))).toEqual({ 'Wataro Dan': 'variant' });
  });

  it('a person decides the official name and the names given up, which need not be any source\'s', () => {
    const seen = [at('Domingo Jhayde', 'maxpreps-roster'), at('Jhayde Domingo', 'maxpreps-stats', '25-26')];
    expect(choose(seen).name).toBe('Domingo Jhayde');
    expect(choose(seen, { official: 'Jhayde Domingo' })).toEqual({ name: 'Jhayde Domingo', decidedBy: 'person', aliases: [{ name: 'Domingo Jhayde', kind: 'variant' }] });
    expect(choose([at('Jhaylen Roy-Richard', 'maxpreps-roster')], { previous: ['Jhaylen Richards'] })).toEqual({
      name: 'Jhaylen Roy-Richard',
      decidedBy: 'only',
      aliases: [{ name: 'Jhaylen Richards', kind: 'previous' }],
    });
  });

  it('a name a person says she no longer goes by is never official, even when it is the fuller one', () => {
    // PR #167 review: a curated `previous` alone used to compete, and win, on the fullest-name rule.
    const seen = [at('Maddie Smith', 'maxpreps-roster'), at('Madeleine Smith', 'all-league', '25-26')];
    expect(choose(seen).name).toBe('Madeleine Smith');
    expect(choose(seen, { previous: ['Madeleine Smith'] })).toEqual({
      name: 'Maddie Smith',
      decidedBy: 'only',
      aliases: [{ name: 'Madeleine Smith', kind: 'previous' }],
    });
  });

  it('picks the same name whatever order the spellings arrive in', () => {
    const seen = [at('Olivia Seaman', 'maxpreps-roster'), at('Olivia Seamane', 'enrichment'), at('Olivia Seaman', 'maxpreps-jv-roster')];
    const names = [...new Set(seen.map((s) => s.name))];
    expect(chooseNames(names, seen).name).toBe(chooseNames([...names].reverse(), [...seen].reverse()).name);
  });
});
