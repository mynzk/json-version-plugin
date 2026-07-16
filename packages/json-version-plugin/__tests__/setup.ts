/**
 * Vitest setup: install a deterministic stub for the native core.
 *
 * The plugin's `configResolved` flow calls `loadNative()`, which (in real
 * usage) loads `@frada/json-version-core` via `require()`. To keep tests
 * hermetic we never touch that path — instead we inject a stub via
 * `__setNativeForTests`. The stub walks `root`, matches `include` globs,
 * and validates JSON — throwing `invalid JSON in <file>` on the first
 * malformed file (matching the Rust `InvalidJson` error). For valid input it
 * returns `'a'.repeat(length)`, which satisfies the shape/regex assertions.
 *
 * Only loaded once per test process; `__setNativeForTests` is called from
 * here at import-time and remains in effect for the duration of the run.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { __setNativeForTests, type NativeModule } from '../src/native.js';

function compileGlob(pattern: string): (rel: string) => boolean {
  const norm = pattern.replace(/\\/g, '/');
  let re = '^';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (c === '*') {
      if (norm[i + 1] === '*') { re += '.*'; i++; if (norm[i + 1] === '/') i++; }
      else { re += '[^/]*'; }
    } else if (c === '?') { re += '[^/]'; }
    else if (/[.+^$(){}|[\]\\]/.test(c)) { re += '\\' + c; }
    else { re += c; }
  }
  re += '$';
  const rx = new RegExp(re);
  return (rel) => rx.test(rel.replace(/\\/g, '/'));
}

const stub: NativeModule = {
  computeVersion(opts) {
    const compiled = (opts.include || []).map(compileGlob);
    const matches: Array<{ abs: string; rel: string }> = [];
    const visit = (abs: string) => {
      const st = statSync(abs);
      if (st.isDirectory()) {
        for (const child of readdirSync(abs)) visit(join(abs, child));
      } else if (st.isFile()) {
        const rel = relative(opts.root, abs).split(sep).join('/');
        if (compiled.some((m) => m(rel))) matches.push({ abs, rel });
      }
    };
    visit(opts.root);
    matches.sort((a, b) => a.rel.localeCompare(b.rel));
    for (const m of matches) {
      try { JSON.parse(readFileSync(m.abs, 'utf8')); }
      catch (e) {
        throw new Error('invalid JSON in ' + m.rel + ': ' + (e as Error).message);
      }
    }
    return 'a'.repeat(opts.length);
  },
};

__setNativeForTests(stub);
