export type DiffPart = { text: string; kind: "same" | "add" | "del" };

function tokens(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

/** Word-level LCS diff; good enough for paragraphs of a few hundred words. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > 400_000) {
    return [
      { text: before, kind: "del" },
      { text: " ", kind: "same" },
      { text: after, kind: "add" },
    ];
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] =
        a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const parts: DiffPart[] = [];
  const push = (text: string, kind: DiffPart["kind"]) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i]!, "same");
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push(a[i++]!, "del");
    else push(b[j++]!, "add");
  }
  while (i < a.length) push(a[i++]!, "del");
  while (j < b.length) push(b[j++]!, "add");
  return parts;
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/** Jaccard similarity of word sets. */
export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Pair each removed paragraph with its most similar added one (if similar enough). */
export function pairChanges(removed: string[], added: string[]) {
  const usedAdded = new Set<number>();
  const pairs: { before: string; after: string }[] = [];
  const lonelyRemoved: string[] = [];
  for (const r of removed) {
    let best = -1;
    let bestScore = 0.45;
    added.forEach((a, k) => {
      if (usedAdded.has(k)) return;
      const score = similarity(r, a);
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    });
    if (best >= 0) {
      usedAdded.add(best);
      pairs.push({ before: r, after: added[best]! });
    } else lonelyRemoved.push(r);
  }
  const lonelyAdded = added.filter((_, k) => !usedAdded.has(k));
  return { pairs, lonelyRemoved, lonelyAdded };
}

/** For a stale quote: the added paragraph that most likely replaced it. */
export function replacementFor(quote: string, added: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0.35;
  for (const a of added) {
    const score = similarity(quote, a);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}
