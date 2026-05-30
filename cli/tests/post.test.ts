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
