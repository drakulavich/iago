# Publishing iago to Public Plugin Directories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the iago plugin discoverable in public Claude Code directories — the `claude-community` marketplace as the trust anchor, plus algorithmic aggregators in parallel.

**Architecture:** Collapse the marketplace manifest to a single `iago` plugin bundling both skills, lock that in with manifest tests + a CI validation job, then perform the external publishing actions (GitHub topics, community-marketplace form submission, awesome-list PRs). Most repo work is TDD-able; the form submission and awesome-list PRs are external/human-gated steps with exact commands and checklists.

**Tech Stack:** Bash + bats (existing test suite), `jq`, `claude plugin validate` CLI, `gh` CLI (authenticated as `drakulavich`), GitHub Actions.

---

## Reality check (verified before planning)

- `claude plugin validate .` and `claude plugin validate . --strict` **already pass** on the current repo. The two-plugin layout is *not* a hard validation failure.
- The real defect: `marketplace.json` lists a second plugin named `squawk` with `source: "./"`, but the `plugin.json` at `./` is named `iago`. So `iago@iago-marketplace` and `squawk@iago-marketplace` resolve to the **same** source — a duplicate, mislabeled listing. The approved design collapses this to one `iago` plugin that ships both the `iago` and `squawk` skills (already declared in `plugin.json`).
- `claude` CLI and authenticated `gh` are present on this machine.

## File structure

| File | Responsibility | Change |
|---|---|---|
| `.claude-plugin/marketplace.json` | Marketplace catalog | Modify — drop the `squawk` plugin entry; keep one `iago` plugin |
| `.claude-plugin/plugin.json` | Plugin manifest (already lists both skills) | No change (verified in Task 1) |
| `tests/manifest.bats` | Lock manifest shape + validation | Create |
| `.github/workflows/test.yml` | CI | Modify — add a `validate` job running `claude plugin validate . --strict` |
| `README.md` | Docs | Modify — add the `@claude-community` install line (post-acceptance) |
| Live GitHub repo settings | Discoverability | Topics via `gh` (Task 4); external submissions (Tasks 6–7) |

---

### Task 1: Collapse marketplace.json to a single `iago` plugin

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Test: `tests/manifest.bats` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/manifest.bats`:

```bash
#!/usr/bin/env bats
#
# Tests for the plugin/marketplace manifests.
# Structural assertions use jq; the validate test gates on the claude CLI.

load 'helpers/common'

setup()    { setup_common; }   # sets $REPO_ROOT
teardown() { teardown_common; }

MANIFEST() { echo "$REPO_ROOT/.claude-plugin/marketplace.json"; }

@test "marketplace.json is valid JSON" {
  command -v jq >/dev/null || skip "jq not installed"
  run jq empty "$(MANIFEST)"
  assert_success
}

@test "marketplace lists exactly one plugin" {
  command -v jq >/dev/null || skip "jq not installed"
  run jq '.plugins | length' "$(MANIFEST)"
  assert_success
  [ "$output" -eq 1 ]
}

@test "the single marketplace plugin is named iago" {
  command -v jq >/dev/null || skip "jq not installed"
  run jq -r '.plugins[0].name' "$(MANIFEST)"
  assert_success
  assert_output_contains "iago"
}

@test "no marketplace plugin is named squawk" {
  command -v jq >/dev/null || skip "jq not installed"
  run jq -r '[.plugins[].name] | index("squawk") // "absent"' "$(MANIFEST)"
  assert_success
  assert_output_contains "absent"
}

@test "claude plugin validate --strict passes" {
  command -v claude >/dev/null || skip "claude CLI not installed"
  run claude plugin validate "$REPO_ROOT" --strict
  assert_success
  assert_output_contains "Validation passed"
}
```

- [ ] **Step 2: Run the test to verify the squawk-related ones fail**

Run: `bats --print-output-on-failure tests/manifest.bats`
Expected: `marketplace lists exactly one plugin`, `the single marketplace plugin is named iago`, and `no marketplace plugin is named squawk` FAIL (current file has 2 plugins, `plugins[0].name` is `iago` so that one may already pass, the length and squawk tests fail). The JSON-valid and validate tests PASS.

- [ ] **Step 3: Edit `.claude-plugin/marketplace.json` to a single plugin**

Replace the entire file with:

```json
{
  "$schema": "https://docs.claude.com/schemas/marketplace.json",
  "name": "iago-marketplace",
  "owner": {
    "name": "drakulavich",
    "url": "https://github.com/drakulavich"
  },
  "metadata": {
    "description": "Iago — Greptile-style Mermaid diagrams for AI code reviews. Skill, alias, and GitHub Action.",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "iago",
      "source": "./",
      "description": "Append a Mermaid diagram (sequence/flow/class/er) to a GitHub PR's /review comment. Auto-detects type from the diff. Bundles the /iago skill and its /squawk alias. Greptile-style, but driven by your AI coding agent.",
      "version": "0.1.0",
      "author": {
        "name": "Anton Yakutovich",
        "url": "https://github.com/drakulavich"
      },
      "homepage": "https://github.com/drakulavich/iago",
      "repository": "https://github.com/drakulavich/iago",
      "license": "MIT",
      "keywords": ["pr", "review", "mermaid", "diagram", "github", "code-review", "greptile", "squawk"]
    }
  ]
}
```

- [ ] **Step 4: Verify `plugin.json` already ships both skills (no change expected)**

Run: `jq -r '.skills[]' .claude-plugin/plugin.json`
Expected output (both skills present, so the single `iago` plugin still provides `/iago:iago` and `/iago:squawk`):

```
./iago
./squawk
```

If this does NOT list both, stop — the design assumption is broken and the spec needs revisiting. (It currently lists both, verified.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bats --print-output-on-failure tests/manifest.bats`
Expected: all tests PASS (or `skip` if `jq`/`claude` absent on the runner).

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/marketplace.json tests/manifest.bats
git commit -m "fix(marketplace): collapse to single iago plugin bundling both skills

The squawk entry pointed at source ./ whose plugin.json is named iago, so
iago@ and squawk@ resolved to the same source — a duplicate, mislabeled
listing. squawk stays as a skill inside the iago plugin (/iago:squawk).
Adds tests/manifest.bats to lock the manifest shape + strict validation."
```

---

### Task 2: Add a `validate` job to CI

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Add the job**

Append this job under `jobs:` in `.github/workflows/test.yml` (sibling to `shellcheck`, `bats`, `cli`), matching the existing two-space indentation:

```yaml
  validate:
    name: plugin validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "20"
      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code
      - name: Validate marketplace + plugin manifests
        # validate is offline (no API call / no auth needed); --strict fails on
        # unrecognized fields and missing metadata.
        run: claude plugin validate . --strict
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/test.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 3: Verify the validate command locally (proxy for what CI runs)**

Run: `claude plugin validate . --strict`
Expected: `✔ Validation passed`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: validate plugin/marketplace manifests with claude plugin validate --strict"
```

> **Note:** If a later CI run shows `claude plugin validate` requiring auth or network, the structural `tests/manifest.bats` jq checks remain the always-green safety net; downgrade this job to non-blocking (`continue-on-error: true`) rather than removing the manifest tests.

---

### Task 3: Add the community-marketplace install line to the README

**Files:**
- Modify: `README.md` (the "Option 4 — Claude Code (skill)" section, around line 104–120)

- [ ] **Step 1: Edit the README**

In `README.md`, find the "Via the Claude Code marketplace:" block under "Option 4":

```
Via the Claude Code marketplace:

\`\`\`bash
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
\`\`\`
```

Replace it with:

```
Via your own marketplace (works today):

\`\`\`bash
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
\`\`\`

Or, once accepted into Anthropic's community marketplace:

\`\`\`bash
/plugin marketplace add anthropics/claude-plugins-community
/plugin install iago@claude-community
\`\`\`
```

- [ ] **Step 2: Verify the install commands in the README match the manifest name**

Run: `grep -n "iago@iago-marketplace\|iago@claude-community" README.md`
Expected: both lines present.

Run: `jq -r '.name' .claude-plugin/marketplace.json`
Expected: `iago-marketplace` (confirms `iago@iago-marketplace` is correct).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document community-marketplace install path"
```

---

### Task 4: Set GitHub repository topics

**Files:** none (live repo settings via `gh`)

- [ ] **Step 1: Read current topics**

Run: `gh repo view drakulavich/iago --json repositoryTopics -q '.repositoryTopics[].name'`
Expected: prints existing topics (possibly empty).

- [ ] **Step 2: Add discovery topics**

Run:

```bash
gh repo edit drakulavich/iago \
  --add-topic claude-code \
  --add-topic claude-plugin \
  --add-topic claude-code-plugin \
  --add-topic mermaid \
  --add-topic code-review
```

Expected: command exits 0.

- [ ] **Step 3: Verify**

Run: `gh repo view drakulavich/iago --json repositoryTopics -q '[.repositoryTopics[].name] | sort | join(", ")'`
Expected output contains: `claude-code, claude-code-plugin, claude-plugin, code-review, mermaid`

> No commit — this changes repo metadata on GitHub, not files.

---

### Task 5: Open the PR for the manifest/CI/docs changes and merge to `main`

The community marketplace pins a commit SHA from the repo's default branch, so the manifest fix must be on `main` before submission (Task 6).

- [ ] **Step 1: Push the branch**

Run: `git push -u origin publish-to-marketplaces`
Expected: branch pushed.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head publish-to-marketplaces \
  --title "Publish iago to public plugin directories" \
  --body "$(cat <<'EOF'
Collapses the marketplace manifest to a single \`iago\` plugin (bundling the
\`iago\` and \`squawk\` skills), locks it in with \`tests/manifest.bats\` and a CI
\`claude plugin validate --strict\` job, and documents the community-marketplace
install path. Prep for submitting to \`anthropics/claude-plugins-community\` and
the awesome-lists.

Design: docs/superpowers/specs/2026-05-29-publish-iago-to-marketplaces-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI green, then merge**

Run: `gh pr checks --watch`
Expected: all checks pass.

Run: `gh pr merge --squash --delete-branch`
Expected: merged to `main`.

- [ ] **Step 4: Sync local main**

Run: `git checkout main && git pull`
Expected: local `main` includes the merge.

---

### Task 6: Submit iago to the `claude-community` marketplace (human-gated)

> **This step requires you (the human).** Submission is a web form behind your Claude account — it cannot be driven by `gh` or the CLI.

- [ ] **Step 1: Pre-submission validation gate**

Run: `claude plugin validate . --strict`
Expected: `✔ Validation passed`.

- [ ] **Step 2: Real-user install smoke test**

In a Claude Code session:

```
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
/reload-plugins
```

Then confirm both skills load and run end-to-end:

```
/iago:iago
/iago:squawk
```

Expected: both appear and execute against a test PR.

- [ ] **Step 3: Submit via the in-app form**

Open one of these and submit the repo `drakulavich/iago`:
- Claude.ai: https://claude.ai/settings/plugins/submit
- Console: https://platform.claude.com/plugins/submit

The pipeline runs `claude plugin validate` + automated safety screening. On approval, iago is SHA-pinned in `anthropics/claude-plugins-community` and CI auto-bumps the pin on new commits.

- [ ] **Step 4: Confirm it landed (after nightly sync)**

The public catalog syncs nightly, so allow a delay. Check:

Run: `gh api repos/anthropics/claude-plugins-community/contents/.claude-plugin/marketplace.json --jq '.content' | base64 -d | jq -r '.plugins[].name' | grep -i iago`
Expected (once synced): prints `iago`.

Then verify install:

```
/plugin marketplace add anthropics/claude-plugins-community
/plugin install iago@claude-community
```

---

### Task 7: Open awesome-list PRs (breadth)

> Each list has its own entry format. Read its `README.md`/`CONTRIBUTING.md` first and match the exact line style — do not invent a format.

Do this for each of:
- `hesreallyhim/awesome-claude-code`
- `Chat2AnyLLM/awesome-claude-plugins`

- [ ] **Step 1: Fork and clone (per list; example shown for one)**

```bash
gh repo fork hesreallyhim/awesome-claude-code --clone --remote
cd awesome-claude-code
```

- [ ] **Step 2: Read the contribution format**

Run: `sed -n '1,80p' README.md; ls; cat CONTRIBUTING.md 2>/dev/null | head -60`
Expected: shows where plugin entries go and the exact bullet format (many lists also have a script like `make add` or a structured data file — use it if present rather than hand-editing).

- [ ] **Step 3: Add the iago entry in that list's format**

Template bullet (adapt to the list's exact style discovered in Step 2):

```markdown
- [iago](https://github.com/drakulavich/iago) — Appends Greptile-style Mermaid diagrams (sequence/flow/class/er) to a PR's /review comment. Skill + alias (`/squawk`) + GitHub Action.
```

- [ ] **Step 4: Branch, commit, push, PR**

```bash
git checkout -b add-iago
git add -A
git commit -m "Add iago — Mermaid diagrams for AI code reviews"
git push -u origin add-iago
gh pr create --title "Add iago" --body "Adds iago: appends Mermaid diagrams (sequence/flow/class/er) to a PR's /review comment. Skill + /squawk alias + GitHub Action. https://github.com/drakulavich/iago"
```

Expected: PR opened against the upstream list.

- [ ] **Step 5: Repeat Steps 1–4 for `Chat2AnyLLM/awesome-claude-plugins`.**

> claudemarketplaces.com and similar crawlers are algorithmic (stars/installs/votes) — no submit step. The GitHub topics from Task 4 plus the community listing are what surface iago to them over time.

---

## Self-review

**Spec coverage:**
- Spec §1 (fix validation blocker / collapse to one plugin) → Task 1. Reframed from "validation blocker" to "duplicate listing" per verified `validate` result; the collapse action is unchanged.
- Spec §2 (local validation gate) → Task 6 Steps 1–2 (validate + real-user install smoke test); also continuously enforced by Task 1 tests + Task 2 CI.
- Spec §3 (community submission) → Task 6.
- Spec §4 (aggregator track: topics, awesome PRs, README install above the fold) → Task 4 (topics), Task 7 (PRs), Task 3 (README; the `/plugin marketplace add` one-liner already sits above the fold — unchanged).
- Spec §5 (maintenance: version lockstep, validate in CI) → Task 2 (CI validate). Version-bump lockstep is an ongoing release-process note, not a code change; called out here and in the spec, no task required.
- Spec success criteria → Tasks 1 (one plugin), 2/6 (validate passes), 6 (community accepted), 4+7 (topics + PRs).

**Placeholder scan:** No TBD/TODO. Task 7's bullet is explicitly a template to adapt after reading each list's format (the one place a fixed format can't be pinned, by the nature of external repos) — concrete commands and a concrete template line are provided.

**Type/name consistency:** Marketplace name `iago-marketplace`, plugin name `iago`, skills `/iago:iago` + `/iago:squawk`, community install `iago@claude-community` — used consistently across Tasks 1, 3, 6. `tests/manifest.bats` helper names (`setup_common`, `assert_success`, `assert_output_contains`) match `tests/helpers/common.bash`.
