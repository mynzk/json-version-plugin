# Path A patch plan — adopt real napi-rs v3 publish model

**Goal:** Update the existing branch (`refactor/split-core-npm-package`) so the release actually works: the published `@frada/json-version-core` will resolve on consumer installs because `napi pre-publish` merges per-platform satellite packages into `optionalDependencies`.

**Source of truth:** [2026-07-16-split-core-npm-package-design.md §Amendment](../specs/2026-07-16-split-core-npm-package-design.md) and the upstream [`napi-rs/package-template-pnpm`](https://github.com/napi-rs/package-template-pnpm) template.

**What this plan replaces:**

- Task 5 (shape `crates/json_version_core/package.json`) — `files:` is now smaller, `scripts.artifacts` is added. The diff is small enough to amend, not rewrite.
- Task 3 (`.gitignore`) — `prebuilds/` and `artifacts.json` lines are replaced with `npm/`.
- Task 9 (split `release.yml`) — `publish-core` job gets a different layout: combined `download-artifact`, `pnpm napi create-npm-dirs`, `pnpm artifacts`, then `pnpm publish`. The build matrix's upload path simplifies to `'*.node'` (single file).

**Tech Stack:** pnpm + `@napi-rs/cli`, pnpm workspace, GitHub Actions. Same as the original plan.

---

## File deltas (compact view)

```
crates/json_version_core/package.json      (replace files: and add artifacts script)
.github/workflows/release.yml              (rewrite publish-core, simplify build upload)
.gitignore                                  (swap two lines)
```

Three files in three commits. No other files change.

---

### Task 1: Update `crates/json_version_core/package.json`

**Files:**
- Modify: `crates/json_version_core/package.json` (only the `files` and `scripts` blocks)

The current committed version was correct for "bundle into tarball." Now we shrink `files:` and add an `artifacts` script alias.

- [ ] **Step 1: Apply the Edit operations**

Read the current `crates/json_version_core/package.json`, then make two `Edit` calls:

**Edit 1 — `scripts` block**: add `"artifacts": "napi artifacts"` between `build:debug` and `prepublishOnly`.

Old (lines 25-29 of the committed file):
```json
  "scripts": {
    "build": "napi build --platform --release --strip --dts index.d.ts --output-dir .",
    "build:debug": "napi build --platform --dts index.d.ts --output-dir .",
    "prepublishOnly": "napi pre-publish -t npm --no-gh-release"
  },
```

New:
```json
  "scripts": {
    "build": "napi build --platform --release --strip --dts index.d.ts --output-dir .",
    "build:debug": "napi build --platform --dts index.d.ts --output-dir .",
    "artifacts": "napi artifacts",
    "prepublishOnly": "napi pre-publish -t npm --no-gh-release"
  },
```

**Edit 2 — `files` block**: shrink to loader + types.

Old:
```json
  "files": [
    "index.js",
    "index.d.ts",
    "artifacts.json",
    "prebuilds/"
  ],
```

New:
```json
  "files": [
    "index.js",
    "index.d.ts"
  ],
```

- [ ] **Step 2: Verify `pnpm install` still resolves**

```bash
pnpm install --prefer-offline
```

Expected: `ok`. No drift in the lockfile (this change is metadata-only — no dep version changes).

- [ ] **Step 3: Commit**

```bash
git add crates/json_version_core/package.json
git commit -m "refactor(crate): shrink files whitelist; add artifacts script alias"
```

### Task 2: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Replace the two previous lines with the `npm/` line**

Find the block that was added in Task 3 of the original plan:

```gitignore
# napi-rs prebuilds — populated by CI (download-artifact) and by `napi
# pre-publish -t npm --no-gh-release`. Never committed.
crates/json_version_core/prebuilds/
crates/json_version_core/artifacts.json
```

Replace with:

```gitignore
# napi-rs per-platform staging dir — created by `napi create-npm-dirs`
# at publish time. Never committed.
crates/json_version_core/npm/
```

- [ ] **Step 2: Verify `git diff .gitignore` shows the exact diff**

Expected: header comment differs, `prebuilds/` and `artifacts.json` lines are removed, `npm/` line is added.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(gitignore): switch from prebuilds/ to napi-rs v3 npm/ staging dir"
```

### Task 3: Rewrite `.github/workflows/release.yml`

**Files:**
- Modify: `.github/workflows/release.yml`

The previous `publish-core` job downloaded four artifacts per-leg into `prebuilds/` and called `pnpm publish`. The new shape: one combined `download-artifact` call, then `create-npm-dirs` + `artifacts`, then `pnpm publish`. The build matrix's upload path also simplifies from a per-leg subdir to the bare `*.node` glob.

- [ ] **Step 1: Apply two `Edit` calls**

**Edit A — Build job's `Build native module` step** (between "Install workspace deps" and "Verify produced filename"). Add an echo and use `--output-dir .` so the `.node` lands at the package root where `*.node` will find it:

Old:
```yaml
      - name: Build native module
        working-directory: crates/json_version_core
        shell: bash
        run: |
          mkdir -p "$RUNNER_TEMP/napi-out/${{ matrix.suffix }}"
          pnpm exec napi build \
            --target "$MATRIX_TARGET" \
            --platform \
            --release --strip --no-js \
            --output-dir "$RUNNER_TEMP/napi-out/${{ matrix.suffix }}"
        env:
          MATRIX_TARGET: ${{ matrix.target }}
```

New:
```yaml
      - name: Build native module
        working-directory: crates/json_version_core
        shell: bash
        run: |
          pnpm exec napi build \
            --target "$MATRIX_TARGET" \
            --platform \
            --release --strip --no-js \
            --output-dir .
        env:
          MATRIX_TARGET: ${{ matrix.target }}
```

**Edit B — `Verify produced filename` step**, update the path since we no longer nest under `$RUNNER_TEMP/napi-out/${{ matrix.suffix }}/`:

Old:
```yaml
      - name: Verify produced filename
        shell: bash
        run: |
          expected="json-version-core.${{ matrix.suffix }}.node"
          f="$RUNNER_TEMP/napi-out/${{ matrix.suffix }}/$expected"
          if [ ! -s "$f" ]; then
            echo "::error::missing or empty $expected, got:"
            ls -la "$RUNNER_TEMP/napi-out/${{ matrix.suffix }}"
            exit 1
          fi
```

New:
```yaml
      - name: Verify produced filename
        shell: bash
        working-directory: crates/json_version_core
        run: |
          expected="json-version-core.${{ matrix.suffix }}.node"
          if [ ! -s "$expected" ]; then
            echo "::error::missing or empty $expected, got:"
            ls -la *.node || true
            exit 1
          fi
```

**Edit C — `upload-artifact` step**, simplify `path:`:

Old:
```yaml
      - uses: actions/upload-artifact@v4
        with:
          name: native-${{ matrix.suffix }}
          path: ${{ runner.temp }}/napi-out/${{ matrix.suffix }}/
          if-no-files-found: error
          retention-days: 14
```

New:
```yaml
      - uses: actions/upload-artifact@v4
        with:
          name: native-${{ matrix.suffix }}
          path: '*.node'
          if-no-files-found: error
          retention-days: 14
```

**Edit D — Replace the entire `publish-core` job** (everything between the `publish-core:` job header line and the `publish-plugin:` line). The new body is:

```yaml
  publish-core:
    name: publish @frada/json-version-core
    needs: build
    if: |
      (github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v'))
      || (github.event_name == 'workflow_dispatch' && inputs.dry_run != 'true')
    timeout-minutes: 10
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org/'

      # Pulls every `native-*` artifact at once; each lands in its own
      # subdir under ./artifacts/. napi artifacts walks that tree when
      # populating npm/<triple>/ in a later step.
      - uses: actions/download-artifact@v4
        with: {}

      - name: Install workspace deps
        run: pnpm install --frozen-lockfile --prefer-offline

      - name: Create per-platform npm dirs
        working-directory: crates/json_version_core
        run: pnpm napi create-npm-dirs

      - name: Move binaries into npm/<triple>/
        working-directory: crates/json_version_core
        run: pnpm artifacts

      - name: Sanity-check layout before publish
        shell: bash
        run: |
          set -e
          for s in linux-x64-gnu darwin-x64 darwin-arm64 win32-x64-msvc; do
            f="crates/json_version_core/npm/$s/json-version-core.$s.node"
            if [ ! -s "$f" ]; then
              echo "::error::missing or empty $f. contents of npm/:"
              ls -la crates/json_version_core/npm || true
              exit 1
            fi
          done
          echo "ok: all four native binaries staged under npm/"

      - name: Verify version matches tag
        if: github.event_name == 'push'
        shell: bash
        run: |
          set -e
          v=$(jq -r .version crates/json_version_core/package.json)
          tag=${GITHUB_REF#refs/tags/v}
          if [ "$v" != "$tag" ]; then
            echo "::error::core version mismatch: package.json=$v, tag=$tag"
            exit 1
          fi
          echo "ok: publishing $v"

      - name: Verify npm auth
        run: npm whoami --registry=https://registry.npmjs.org/
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      # prepublishOnly (napi pre-publish -t npm --no-gh-release) runs first
      # inside this pnpm publish. It publishes the four satellite packages
      # and merges optionalDependencies into the root package.json. Then the
      # pnpm publish itself publishes the root @frada/json-version-core.
      - name: Publish @frada/json-version-core
        working-directory: crates/json_version_core
        run: pnpm publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

`publish-plugin` is unchanged from the original plan.

- [ ] **Step 2: Verify the YAML parses**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('valid yaml')"
```

Expected: `valid yaml`.

Sanity check the `needs:` chain:

```bash
node -e "
  const yaml = require('fs').readFileSync('.github/workflows/release.yml', 'utf8');
  console.log('lines:', yaml.split('\n').length);
  console.log('publish-plugin needs:', yaml.match(/publish-plugin:[\s\S]*?needs: ([^\n]+)/)?.[1] ?? 'NOT FOUND');
"
```

Expected: `publish-plugin needs: publish-core`. If it ever says `build`, the
import is wrong — re-apply Edit D.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: switch publish-core to napi-rs v3 create-npm-dirs + artifacts flow"
```

### Task 4: Local verification

**Files:** (verification only)

- [ ] **Step 1: Sanity-check that `pnpm artifacts` script resolves**

```bash
cd crates/json_version_core
node -e "const p = require('./package.json'); console.log('artifacts script:', p.scripts.artifacts); console.log('files:', p.files);"
```

Expected:
```
artifacts script: napi artifacts
files: [ 'index.js', 'index.d.ts' ]
```

- [ ] **Step 2: Confirm `pnpm install` is still clean**

```bash
cd ../..
pnpm install --prefer-offline
```

Expected: `ok`. No lockfile drift.

- [ ] **Step 3: Confirm tests still pass**

```bash
pnpm -r test
cd crates/json_version_core && cargo test && cd ../..
```

Expected: 6/6 plugin tests + all cargo unit tests pass. No regression from the patch.

- [ ] **Step 4: Confirm working tree is clean apart from the known benign `Cargo.lock`**

```bash
git status --short
```

Expected: only `M crates/json_version_core/Cargo.lock` (or empty if the previous
session's run already settled it).

## Self-review

| Spec §Amendment requirement | Implementation |
|---|---|
| scripts.artifacts: "napi artifacts" | Task 1 Edit 1 |
| files: ["index.js", "index.d.ts"] | Task 1 Edit 2 |
| .gitignore: replace prebuilds/+artifacts.json with npm/ | Task 2 |
| Build matrix: `--output-dir .`, `path: '*.node'` | Task 3 Edits A, B, C |
| publish-core: combined download-artifact, create-npm-dirs, artifacts, pnpm publish | Task 3 Edit D |
| publish-plugin unchanged | (left as-is in Edit D) |
| `--no-gh-release` preserved | (untouched in Task 1 Edit 1) |

No placeholder text. All code blocks complete. The four commits stay independent
and reorder-safely (build → gitignore → yml → verify).
