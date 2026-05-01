// Tarball acquisition + extraction.
//
// We shell out to the system `tar` rather than parsing the format ourselves
// because:
//   - It's available everywhere we run (macOS, Linux, Win10+).
//   - It handles edge cases (symlinks, permissions, sparse files) correctly.
//   - It's faster than any pure-JS implementation for the file sizes we deal
//     with (~50KB-1MB tarballs).
// The tradeoff is one shelled-out process per install. Acceptable.

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface TarballSource {
  /** GitHub repo "owner/name". */
  repo: string;
  /** Tag or branch name. "latest" is resolved before this is called. */
  ref: string;
  /** True when ref is a branch (uses heads/), false when it's a tag (uses tags/). */
  isBranch?: boolean;
  /** Test hook: when set, skip network and copy this file as the tarball. */
  localPath?: string;
}

export class TarballError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TarballError";
  }
}

/** Resolve "latest" to a concrete tag via the GitHub releases API. */
export async function resolveLatestTag(repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    throw new TarballError(`Could not resolve latest release for ${repo} (HTTP ${res.status}). Try --version=main or specify --version=vX.Y.Z.`);
  }
  const json = (await res.json()) as { tag_name?: string };
  if (!json.tag_name) throw new TarballError(`Latest release for ${repo} has no tag_name.`);
  return json.tag_name;
}

/** Download (or copy from local) and extract; returns the path of the
 *  extracted source root (e.g. `<tmp>/iago-0.1.1`). */
export async function fetchAndExtract(src: TarballSource, tmpDir: string): Promise<string> {
  mkdirSync(tmpDir, { recursive: true });
  const tarPath = join(tmpDir, "iago.tar.gz");

  if (src.localPath) {
    // Test-hook path. We copy rather than reuse the file so a buggy extract
    // can't damage the original.
    const data = await Bun.file(src.localPath).arrayBuffer().catch(() => null);
    if (!data) throw new TarballError(`Local tarball not found: ${src.localPath}`);
    await Bun.write(tarPath, data);
  } else {
    const refPath = src.isBranch ? "heads" : "tags";
    const url = `https://codeload.github.com/${src.repo}/tar.gz/refs/${refPath}/${src.ref}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new TarballError(`Download failed (HTTP ${res.status}): ${url}`);
    }
    await Bun.write(tarPath, await res.arrayBuffer());
  }

  // Extract.
  const proc = Bun.spawn(["tar", "-xzf", tarPath, "-C", tmpDir], {
    stderr: "pipe",
    stdout: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new TarballError(`tar extraction failed: ${err.trim()}`);
  }

  // Find the top-level dir (codeload produces "iago-<tag>/").
  const entries = readdirSync(tmpDir).filter((name) => {
    if (!name.startsWith("iago-")) return false;
    const full = join(tmpDir, name);
    try { return statSync(full).isDirectory(); } catch { return false; }
  });
  if (entries.length === 0) {
    throw new TarballError(`No extracted source dir found under ${tmpDir}.`);
  }
  return join(tmpDir, entries[0]!);
}

// Helper for tests that need a fake tarball with the right shape.
// Mirrors the structure produced by GitHub's codeload.
export async function buildFakeTarball(
  outPath: string,
  version: string,
  scratchDir: string,
): Promise<void> {
  const root = join(scratchDir, `iago-${version}`);
  mkdirSync(join(root, "iago", "scripts"), { recursive: true });
  mkdirSync(join(root, "iago", "references"), { recursive: true });
  mkdirSync(join(root, "iago", "examples"), { recursive: true });
  mkdirSync(join(root, "squawk"), { recursive: true });

  writeFileSync(join(root, "iago", "SKILL.md"),
    `---\nname: iago\ndescription: fake skill for tests\n---\n# fake iago ${version}\n`);
  writeFileSync(join(root, "squawk", "SKILL.md"),
    `---\nname: squawk\ndescription: fake alias for tests\n---\n# fake squawk ${version}\n`);
  writeFileSync(join(root, "iago", "scripts", "append_diagram.sh"),
    "#!/usr/bin/env bash\necho fake\n");
  writeFileSync(join(root, "iago", "references", "diagram-selection.md"), "fake\n");
  writeFileSync(join(root, "iago", "references", "mermaid-templates.md"), "fake\n");
  writeFileSync(join(root, "iago", "examples", "sequence.md"), "fake\n");

  const proc = Bun.spawn(["tar", "-czf", outPath, "-C", scratchDir, `iago-${version}`], {
    stdout: "pipe", stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`tar create failed: ${err}`);
  }
}
