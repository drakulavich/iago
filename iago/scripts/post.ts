// Idempotently append/replace an Iago Mermaid block inside the most recent
// /review comment on a GitHub PR, falling back to a new comment. Pure helpers
// here; orchestration + CLI entry are added in a later task. Runtime: bun + gh.

export interface Comment {
  id: number;
  created_at: string;
  body: string;
  user: { login: string };
}

const MARKER = "<!-- review-skill -->";
const HEADING = /^\s*#{1,3}\s+Review\b/m;
const IAGO_BLOCK = /<!--\s*iago:begin\s*-->[\s\S]*?<!--\s*iago:end\s*-->/;

export function findReviewCommentId(comments: Comment[], viewer: string): number | null {
  const byDate = (a: Comment, b: Comment): number => a.created_at.localeCompare(b.created_at);

  const marked = comments.filter((x) => x.body.includes(MARKER)).sort(byDate);
  if (marked.length > 0) return marked[marked.length - 1]!.id;

  const headed = comments
    .filter((x) => x.user.login === viewer && HEADING.test(x.body))
    .sort(byDate);
  if (headed.length > 0) return headed[headed.length - 1]!.id;

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
