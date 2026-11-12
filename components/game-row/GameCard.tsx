/**
 * @deprecated There is one game row (DESIGN §33): `GameCard` is `GameRow` under its old name, kept
 * until the pages stop importing it. The card-only options (`showRecap`, `showStream`, `linkStyle`)
 * are accepted and ignored.
 */
export { GameRow as GameCard, GameRow as default } from './GameRow';
export type { GameRowProps as GameCardProps } from './GameRow';
