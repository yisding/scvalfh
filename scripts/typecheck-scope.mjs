#!/usr/bin/env node
/**
 * Scoped typecheck for agents working concurrently in one tree (SPEC §0.4, §12.1 "Tooling").
 *
 *   node scripts/typecheck-scope.mjs <glob> [<glob>…]
 *
 * Runs `pnpm exec next typegen`, then `pnpm exec tsc --noEmit -p tsconfig.json --pretty false`
 * once over the whole project, and keeps only the diagnostics whose file path (relative to the
 * repo root, forward slashes) matches one of the globs. Those are printed and the exit code is 1
 * if any remain, 0 otherwise. Diagnostics outside the globs (other agents' files, possibly
 * mid-edit) are only counted, never fatal.
 *
 * Glob syntax: `**` any number of path segments (including none), `*` any run of characters
 * within one segment, `?` one character within a segment, `{a,b}` alternation (nestable).
 * Exit codes: 0 clean inside the globs, 1 diagnostics inside the globs, 2 usage error or a tool
 * that could not run (next typegen failed, tsc crashed without diagnostics).
 *
 * Node built-ins only.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Translate one glob into an anchored RegExp source. */
export function globToRegExpSource(glob) {
  let out = '';
  let i = 0;
  const g = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        const atStart = i === 0 || g[i - 1] === '/';
        const next = g[i + 2];
        if (atStart && next === '/') {
          out += '(?:[^/]*/)*'; // `**/` — zero or more whole segments
          i += 3;
        } else if (atStart && next === undefined) {
          out += '.*'; // trailing `**` — everything below
          i += 2;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (c === '{') {
      // Find the matching close brace, splitting top-level alternatives on commas.
      let depth = 0;
      let j = i;
      const parts = [];
      let start = i + 1;
      for (; j < g.length; j++) {
        if (g[j] === '{') depth++;
        else if (g[j] === '}') {
          depth--;
          if (depth === 0) break;
        } else if (g[j] === ',' && depth === 1) {
          parts.push(g.slice(start, j));
          start = j + 1;
        }
      }
      if (j >= g.length) {
        out += '\\{'; // unbalanced: literal brace
        i += 1;
        continue;
      }
      parts.push(g.slice(start, j));
      out += `(?:${parts.map(globToRegExpSource).join('|')})`;
      i = j + 1;
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return out;
}

export function globToRegExp(glob) {
  return new RegExp(`^${globToRegExpSource(glob)}$`);
}

/** Split tsc `--pretty false` output into diagnostics (first line + indented continuation lines). */
export function parseDiagnostics(text) {
  const diags = [];
  const head = /^(.+?)\((\d+),(\d+)\): (error|warning|message) (TS\d+): /;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = head.exec(line);
    if (m) {
      const file = path.relative(ROOT, path.resolve(ROOT, m[1])).split(path.sep).join('/');
      diags.push({ file, lines: [line] });
    } else if (/^\s/.test(line) && diags.length) {
      diags[diags.length - 1].lines.push(line);
    } else if (/^(error|warning) TS\d+:/.test(line)) {
      diags.push({ file: null, lines: [line] }); // project-level diagnostic, no file
    }
  }
  return diags;
}

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function main(argv) {
  const globs = argv.filter((a) => a.length > 0);
  if (globs.length === 0 || globs.includes('--help') || globs.includes('-h')) {
    console.error('usage: node scripts/typecheck-scope.mjs <glob> [<glob>…]');
    return 2;
  }
  const matchers = globs.map(globToRegExp);

  const typegen = run('pnpm', ['exec', 'next', 'typegen']);
  if (typegen.status !== 0) {
    process.stderr.write(typegen.stdout ?? '');
    process.stderr.write(typegen.stderr ?? '');
    console.error(`typecheck-scope: next typegen failed (exit ${typegen.status ?? typegen.signal})`);
    return 2;
  }

  const tsc = run('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false']);
  const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`;
  const diags = parseDiagnostics(output);
  if (tsc.status !== 0 && diags.length === 0) {
    process.stderr.write(output);
    console.error(`typecheck-scope: tsc exited ${tsc.status ?? tsc.signal} without parseable diagnostics`);
    return 2;
  }

  const inside = diags.filter((d) => d.file !== null && matchers.some((re) => re.test(d.file)));
  const outside = diags.length - inside.length;
  for (const d of inside) console.log(d.lines.join('\n'));
  console.log(
    `typecheck-scope: ${inside.length} error${inside.length === 1 ? '' : 's'} inside ${globs.join(' ')}; ` +
      `${outside} outside (informational)`,
  );
  return inside.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
