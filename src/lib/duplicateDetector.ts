import { Post } from "../types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function wordSet(text: string): Set<string> {
  return new Set(normalize(text).split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersectionSize = 0;
  for (const word of a) {
    if (b.has(word)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

export interface DuplicateHookGroup {
  posts: Post[];
  similarity: number;
}

// Flags hooks that read as near-identical across different brands in the same campaign —
// exactly what the AI generation prompt's "anti-duplicate wording" rule is meant to prevent,
// but doesn't always succeed at. Only compares across brands (identical hooks within the
// same brand across days/slots aren't flagged — that's a separate, less severe concern).
export function findDuplicateHooks(posts: Post[], threshold = 0.6): DuplicateHookGroup[] {
  const groups: DuplicateHookGroup[] = [];
  const claimed = new Set<string>();

  for (let i = 0; i < posts.length; i++) {
    if (claimed.has(posts[i].id) || !posts[i].hook) continue;
    const setA = wordSet(posts[i].hook);
    if (setA.size === 0) continue;

    const matches: Post[] = [posts[i]];
    let maxSim = 0;

    for (let j = i + 1; j < posts.length; j++) {
      if (claimed.has(posts[j].id) || posts[j].brandId === posts[i].brandId || !posts[j].hook) continue;
      const setB = wordSet(posts[j].hook);
      const sim = jaccardSimilarity(setA, setB);
      if (sim >= threshold) {
        matches.push(posts[j]);
        claimed.add(posts[j].id);
        maxSim = Math.max(maxSim, sim);
      }
    }

    if (matches.length > 1) {
      claimed.add(posts[i].id);
      groups.push({ posts: matches, similarity: maxSim });
    }
  }

  return groups.sort((a, b) => b.similarity - a.similarity);
}
