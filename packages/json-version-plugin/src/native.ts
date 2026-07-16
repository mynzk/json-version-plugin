import { createRequire } from 'node:module';

// createRequire anchored to this file so resolution of
// `@frada/json-version-core` works regardless of caller (Vite, Jest, tsx,
// bundled CJS). `createRequire(import.meta.url)` is the only reliable cross-
// context hook after ESM bundling rewrites `__filename`.
const nodeRequire = createRequire(import.meta.url);

export interface ComputeOptionsNative {
  root: string;
  include: string[];
  length: number;
}

export interface NativeModule {
  computeVersion(opts: ComputeOptionsNative): string;
}

let cached: NativeModule | undefined;

/**
 * Test-only seam. Lets test suites inject a deterministic fake without
 * having to write a `.node` stub to disk and set NATIVE_BINARY_PATH.
 * Production code must NOT call this — `loadNative()` resolves
 * `@frada/json-version-core` from the published npm package.
 */
export function __setNativeForTests(mod: NativeModule): void {
  cached = mod;
}

export async function loadNative(): Promise<NativeModule> {
  if (cached) return cached;
  const mod = nodeRequire('@frada/json-version-core') as NativeModule;
  if (typeof mod.computeVersion !== 'function') {
    throw new Error(
      'json-version-plugin: @frada/json-version-core did not export computeVersion'
    );
  }
  cached = mod;
  return cached;
}