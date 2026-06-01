// Idempotently append/replace an Iago Mermaid block inside the most recent
// /review comment on a GitHub PR; if there's no /review comment but a prior
// standalone Iago comment exists, replace that one in place; otherwise post a
// new comment. Runtime: bun + gh.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitize } from "./sanitize.ts";

export interface Comment {
  id: number;
  created_at: string;
  body: string;
  user: { login: string };
}

const MARKER = "<!-- review-skill -->";
const HEADING = /^\s*#{1,3}\s+Review\b/m;
const IAGO_BLOCK = /<!--\s*iago:begin\s*-->[\s\S]*?<!--\s*iago:end\s*-->/;

export function findTargetCommentId(comments: Comment[], viewer: string): number | null {
  const byDate = (a: Comment, b: Comment): number => a.created_at.localeCompare(b.created_at);

  // Preference order: the canonical /review comment (a review-skill marker,
  // then a "Review" heading we authored), then a prior diagram we posted as a
  // standalone comment (mode=comment, or the postNew() fallback — no marker,
  // no heading, just our own Iago block). Replacing whichever we find first
  // keeps one block per PR across re-runs.
  const tiers: Array<(x: Comment) => boolean> = [
    (x) => x.body.includes(MARKER),
    (x) => x.user.login === viewer && HEADING.test(x.body),
    (x) => x.user.login === viewer && IAGO_BLOCK.test(x.body),
  ];

  for (const match of tiers) {
    const found = comments.filter(match).sort(byDate);
    if (found.length > 0) return found[found.length - 1]!.id;
  }

  return null;
}

export function replaceOrAppendBlock(currentBody: string, block: string): string {
  const trimmed = block.trim();
  // Use a replacer function so '$' sequences in the block aren't treated as
  // regex replacement tokens.
  if (IAGO_BLOCK.test(currentBody)) return currentBody.replace(IAGO_BLOCK, () => trimmed);
  const sep = currentBody.endsWith("\n") ? "" : "\n";
  return currentBody + sep + "\n" + trimmed + "\n";
}

export type GhRunner = (args: string[], input?: string) => string;

const defaultGh: GhRunner = (args, input) =>
  execFileSync("gh", args, input === undefined ? { encoding: "utf8" } : { encoding: "utf8", input });

export interface PostOpts {
  repo: string;
  pr: string;
  mode: "append" | "comment";
  diagramFile: string;
}

function ghJson<T>(gh: GhRunner, args: string[]): T {
  return JSON.parse(gh(args)) as T;
}

export function post(opts: PostOpts, gh: GhRunner = defaultGh): string {
  const [owner, name] = opts.repo.split("/");
  if (!owner || !name) throw new Error(`Invalid --repo (want OWNER/REPO): ${opts.repo}`);
  if (!existsSync(opts.diagramFile)) throw new Error(`Diagram file not found: ${opts.diagramFile}`);

  const block = sanitize(readFileSync(opts.diagramFile, "utf8"));

  const postNew = (): string => {
    const tmp = join(tmpdir(), `iago-${process.pid}-${Date.now()}.md`);
    writeFileSync(tmp, block);
    try {
      const out = gh(["pr", "comment", opts.pr, "--repo", opts.repo, "--body-file", tmp]).trim();
      return out.split("\n").pop() ?? out;
    } finally {
      rmSync(tmp, { force: true });
    }
  };

  if (opts.mode === "comment") return postNew();

  const viewer = gh(["api", "graphql", "-f", "query={viewer{login}}", "-q", ".data.viewer.login"]).trim();
  const pages = ghJson<Comment[][]>(gh, [
    "api", "--paginate", "--slurp",
    "-H", "Accept: application/vnd.github+json",
    `/repos/${owner}/${name}/issues/${opts.pr}/comments`,
  ]);
  const comments = pages.flat();

  const targetId = findTargetCommentId(comments, viewer);
  if (targetId === null) return postNew();

  const current = comments.find((x) => x.id === targetId)!.body;
  const newBody = replaceOrAppendBlock(current, block);
  const resp = ghJson<{ html_url: string }>(gh, [
    "api", "-X", "PATCH",
    "-H", "Accept: application/vnd.github+json",
    `/repos/${owner}/${name}/issues/comments/${targetId}`,
    "-f", `body=${newBody}`,
  ]);
  return resp.html_url;
}

export function main(argv: string[]): number {
  const opts: Partial<PostOpts> = { mode: "append" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--repo":
        opts.repo = next();
        break;
      case "--pr":
        opts.pr = next();
        break;
      case "--mode": {
        const m = next();
        if (m !== "append" && m !== "comment") throw new Error(`--mode must be append|comment, got: ${m}`);
        opts.mode = m;
        break;
      }
      case "--diagram-file":
        opts.diagramFile = next();
        break;
      default:
        throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (!opts.repo) throw new Error("Missing required arg: --repo");
  if (!opts.pr) throw new Error("Missing required arg: --pr");
  if (!opts.diagramFile) throw new Error("Missing required arg: --diagram-file");

  console.log(post(opts as PostOpts));
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}
