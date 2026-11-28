/**
 * Common short forms of given names: the table lib/players/note-stats.ts reads a coach's note by and
 * lib/players/official-name.ts tells a nickname from a full name by. Lower case, accents folded.
 */

/**
 * Common short forms of given names, each mapped to the full names it stands for. Matching goes
 * both ways (a note's "Gabby" finds a roster's Gabrielle, a note's "Gabrielle" a roster's Gabby),
 * and two short forms of one name match each other ("Maddie" and "Madi").
 */
export const NICKNAMES: Record<string, readonly string[]> = {
  abby: ['abigail'], abbie: ['abigail'], abbey: ['abigail'],
  addie: ['addison', 'adelaide', 'adeline'], addy: ['addison', 'adelaide', 'adeline'],
  alex: ['alexandra', 'alexa', 'alexis', 'alexandria'], lexi: ['alexandra', 'alexis', 'alexa'], lexie: ['alexandra', 'alexis', 'alexa'],
  ally: ['allison', 'alison', 'alexandra', 'alyssa'], allie: ['allison', 'alison', 'alexandra', 'alyssa'], ali: ['allison', 'alison', 'alexandra', 'alyssa'],
  annie: ['anna', 'ann', 'anne', 'annabel', 'annabelle'],
  becca: ['rebecca'], becky: ['rebecca'],
  bella: ['isabella', 'isabel', 'isabelle', 'annabella', 'arabella'], izzy: ['isabella', 'isabel', 'isabelle'], izzie: ['isabella', 'isabel', 'isabelle'],
  cat: ['catherine', 'katherine', 'kathryn', 'caitlin'], kat: ['katherine', 'kathryn', 'catherine'],
  kate: ['katherine', 'kathryn', 'catherine', 'kaitlyn'], katie: ['katherine', 'kathryn', 'catherine', 'kaitlyn'], kathy: ['katherine', 'kathryn', 'catherine'],
  cece: ['cecilia', 'cecelia'], charlie: ['charlotte'], callie: ['caroline', 'calista'], caro: ['caroline', 'carolina'],
  ella: ['eleanor', 'elena', 'gabriella', 'isabella', 'ellen'], ellie: ['eleanor', 'elizabeth', 'ellen', 'elena', 'eliana'],
  liz: ['elizabeth'], lizzie: ['elizabeth'], lizzy: ['elizabeth'], beth: ['elizabeth', 'bethany'], libby: ['elizabeth'], eliza: ['elizabeth'], betsy: ['elizabeth'],
  em: ['emma', 'emily', 'emerson', 'emilia'], emmy: ['emma', 'emily', 'emilia'],
  gabby: ['gabrielle', 'gabriella'], gabbi: ['gabrielle', 'gabriella'], gabbie: ['gabrielle', 'gabriella'], gabi: ['gabrielle', 'gabriella'], gaby: ['gabrielle', 'gabriella'],
  jen: ['jennifer'], jenny: ['jennifer'], jess: ['jessica'], jessie: ['jessica'], josie: ['josephine'],
  kenzie: ['mackenzie', 'mckenzie'],
  maddie: ['madison', 'madeline', 'madelyn', 'madeleine'], maddy: ['madison', 'madeline', 'madelyn', 'madeleine'], madi: ['madison', 'madeline', 'madelyn'],
  mandy: ['amanda'], meg: ['megan', 'margaret'], maggie: ['margaret', 'magdalena'],
  nat: ['natalie', 'natalia'], nikki: ['nicole', 'nicola'], liv: ['olivia'], livvy: ['olivia'], livi: ['olivia'],
  rosie: ['rose', 'rosalind', 'rosemary'], sam: ['samantha'], sammy: ['samantha'], sophie: ['sophia'],
  steph: ['stephanie'], tori: ['victoria'], vicky: ['victoria'], val: ['valerie', 'valentina'], andie: ['andrea'],
  stella: ['styliani', 'estella', 'estelle'], maisy: ['margaret'], frankie: ['francine', 'frances', 'francesca'],
  gigi: ['gabriella', 'giuliana', 'gisella', 'georgina', 'virginia'],
  nate: ['nathaniel', 'nathan'],
};

/** The full names a given name can stand for, itself included. */
export function givenForms(name: string): Set<string> {
  const out = new Set([name, ...(NICKNAMES[name] ?? [])]);
  for (const [short, full] of Object.entries(NICKNAMES)) if (full.includes(name)) out.add(short);
  return out;
}
