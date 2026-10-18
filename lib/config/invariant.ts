/**
 * Import-free: the typed failure of a violated configuration or registry invariant (SPEC §7.5
 * run-abort trigger 2). `assertLeagues()` and `assertRegistry()` run at module load, and the lookups
 * in lib/config/leagues.ts and lib/registry/teams.ts throw on an id the config does not hold; scripts/fetch-data.ts
 * loads those modules inside main() so that such a failure is reported as an abort ("previous
 * snapshot kept"), not a crash. lib/pipeline/run-failure.ts recognises the class (or its `name`)
 * instead of matching the message against a module-path prefix.
 *
 * The message keeps its `<module>: ` prefix, which names the module that detected the violation.
 */

export class ConfigInvariantError extends Error {
  override readonly name = 'ConfigInvariantError';
}

/** Throw a ConfigInvariantError whose message is `<module>: <message>`. */
export function failInvariant(module: string, message: string): never {
  throw new ConfigInvariantError(`${module}: ${message}`);
}
