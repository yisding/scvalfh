/**
 * A phrase that opens a sentence: 'Five' from 'five', 'The winner of 8 v 9' from 'the winner of 8 v 9'.
 * The /playoffs no-postseason cards (components/playoffs/NoPostseasonCard.tsx) and the San Diego bracket's
 * sentences (components/playoffs/sds-bracket-view.ts) share it. Client-safe: it imports nothing.
 */
export function capitalized(words: string): string {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
