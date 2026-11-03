/**
 * A phrase that opens a sentence: 'Five' from 'five', 'The winner of 8 v 9' from 'the winner of 8 v 9'.
 * Every feature that opens a sentence with a phrase shares it (the /playoffs cards and pairings, the San Diego
 * bracket's sentences, a game's description, /about's section cards, …). Client-safe: it imports nothing.
 */
export function capitalized(words: string): string {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
