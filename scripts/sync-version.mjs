#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

// Cargo.toml is the source of truth. Read `version = "X.Y.Z"` from it, then
// overwrite `version` in the two published package.json files.
const cargoToml = readFileSync('crates/json_version_core/Cargo.toml', 'utf8');
const v = cargoToml.match(/^version = "([^"]+)"/m);
if (!v) {
  console.error('Could not find `version = "..."` in crates/json_version_core/Cargo.toml');
  process.exit(1);
}
const target = targets(v[1]);
console.log(`synced version ${target}`);

function targets(version) {
  const paths = [
    'crates/json_version_core/package.json',
    'packages/json-version-plugin/package.json',
  ];
  for (const p of paths) {
    const json = JSON.parse(readFileSync(p, 'utf8'));
    if (json.version === version) continue;
    json.version = version;
    writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
  }
  return version;
}
