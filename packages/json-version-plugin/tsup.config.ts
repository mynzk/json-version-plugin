import { defineConfig } from 'tsup';

// Vite plugin package — bundled for both CJS and ESM consumers.
// `vite` stays external because it is a peer dependency; bundlers running
// inside the user's Vite install will resolve it from there.
// Output filenames use explicit `.cjs` / `.mjs` so Node can pick the right
// runtime regardless of the package's "type" field.
export default defineConfig({
  entry: ['src/index.ts'],
  // Output to dist/js/ so the JS bundle and the prebuilt native binaries
  // (downloaded into dist/native/ by CI) don't share a directory — tsup's
  // `clean: true` would otherwise wipe the .node files mid-publish.
  outDir: 'dist/js',
  format: ['cjs', 'esm'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
  dts: true,
  // Cleans only dist/js/ — dist/native/ is untouched, so downloaded
  // prebuilt binaries survive a subsequent `pnpm build`.
  clean: true,
  target: 'es2022',
  sourcemap: true,
  external: ['vite'],
  // `src/native.ts` accesses `import.meta.url` but falls back to `__filename`
  // when bundled to CJS, so the runtime is safe. The static reference still
  // trips esbuild's "empty-import-meta" warning during the CJS build, which
  // we silence here.
  esbuildOptions(options) {
    options.logOverride = { 'empty-import-meta': 'silent' };
  },
});
