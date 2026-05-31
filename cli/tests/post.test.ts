import { describe, expect, test } from "bun:test";
import {
  findReviewCommentId,
  replaceOrAppendBlock,
  type Comment,
} from "../../iago/scripts/post.ts";

function c(id: number, created_at: string, body: string, login = "me"): Comment {
  return { id, created_at, body, user: { login } };
}

describe("findReviewCommentId", () => {
  test("marker match wins over heading and picks newest marked", () => {
    const comments = [
      c(1, "2024-01-01T00:00:00Z", "## Review old", "me"),
      c(2, "2024-01-02T00:00:00Z", "diagram <!-- review-skill --> here", "bot"),
      c(3, "2024-01-03T00:00:00Z", "## Review newer by me", "me"),
    ];
    expect(findReviewCommentId(comments, "me")).toBe(2);
  });

  test("falls back to newest '## Review' by viewer when no marker", () => {
    const comments = [
      c(1, "2024-01-01T00:00:00Z", "## Review one", "me"),
      c(2, "2024-01-05T00:00:00Z", "## Review two", "me"),
      c(3, "2024-01-09T00:00:00Z", "## Review elsewhere", "other"),
    ];
    expect(findReviewCommentId(comments, "me")).toBe(2);
  });

  test("returns null when nothing matches", () => {
    expect(findReviewCommentId([c(1, "2024-01-01T00:00:00Z", "hi", "me")], "me")).toBeNull();
  });
});

describe("replaceOrAppendBlock", () => {
  const block = "<!-- iago:begin -->\nNEW\n<!-- iago:end -->";

  test("appends when there is no prior block", () => {
    const out = replaceOrAppendBlock("## Review\nbody", block);
    expect(out).toContain("## Review\nbody");
    expect(out).toContain("<!-- iago:begin -->\nNEW\n<!-- iago:end -->");
  });

  test("replaces a prior block and is idempotent", () => {
    const first = replaceOrAppendBlock("## Review", block);
    const second = replaceOrAppendBlock(first, block);
    expect(second).toBe(first);
    expect((second.match(/iago:begin/g) ?? []).length).toBe(1);
  });

  test("does not interpret $ in the block as a regex replacement token", () => {
    const dollar = "<!-- iago:begin -->\ncost is $1 per $&\n<!-- iago:end -->";
    const seeded = replaceOrAppendBlock("x", block);
    const out = replaceOrAppendBlock(seeded, dollar);
    expect(out).toContain("cost is $1 per $&");
  });
});

import { post } from "../../iago/scripts/post.ts";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function tmpFile(body: string): string {
  const p = join(tmpdir(), `iago-test-${process.pid}-${Math.abs(hash(body))}.md`);
  writeFileSync(p, body);
  return p;
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

describe("post", () => {
  test("mode=comment always posts a new comment", () => {
    const f = tmpFile("<!-- iago:begin -->\nx\n<!-- iago:end -->");
    const calls: string[][] = [];
    const gh = (args: string[]): string => {
      calls.push(args);
      return "https://gh/comment/1";
    };
    try {
      const url = post({ repo: "o/r", pr: "5", mode: "comment", diagramFile: f }, gh);
      expect(url).toBe("https://gh/comment/1");
      expect(calls[0]?.slice(0, 2)).toEqual(["pr", "comment"]);
    } finally {
      rmSync(f, { force: true });
    }
  });

  test("append with marker patches the matched comment", () => {
    const f = tmpFile("<!-- iago:begin -->\nDIAG\n<!-- iago:end -->");
    const gh = (args: string[]): string => {
      if (args[1] === "graphql") return "me\n";
      if (args.includes("--slurp")) {
        return JSON.stringify([
          [{ id: 7, created_at: "2024-01-01T00:00:00Z", body: "## Review <!-- review-skill -->", user: { login: "me" } }],
        ]);
      }
      if (args.includes("PATCH")) return JSON.stringify({ html_url: "https://gh/comment/7" });
      return "";
    };
    try {
      const url = post({ repo: "o/r", pr: "5", mode: "append", diagramFile: f }, gh);
      expect(url).toBe("https://gh/comment/7");
    } finally {
      rmSync(f, { force: true });
    }
  });

  test("append falls back to a new comment when no review comment found", () => {
    const f = tmpFile("<!-- iago:begin -->\nDIAG\n<!-- iago:end -->");
    const gh = (args: string[]): string => {
      if (args[1] === "graphql") return "me\n";
      if (args.includes("--slurp")) return JSON.stringify([[]]);
      if (args[0] === "pr" && args[1] === "comment") return "https://gh/comment/new";
      return "";
    };
    try {
      const url = post({ repo: "o/r", pr: "5", mode: "append", diagramFile: f }, gh);
      expect(url).toBe("https://gh/comment/new");
    } finally {
      rmSync(f, { force: true });
    }
  });
});

test("post throws a clear error when the diagram file is missing", () => {
  expect(() =>
    post({ repo: "o/r", pr: "5", mode: "comment", diagramFile: "/no/such/iago-file.md" }, () => ""),
  ).toThrow(/Diagram file not found/);
});
