// src/utils/math.ts

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export function topK<T>(
  items: T[],
  scores: number[],
  k: number
): Array<{ item: T; score: number }> {
  const indexed = items.map((item, i) => ({ item, score: scores[i] }));
  indexed.sort((a, b) => b.score - a.score);
  return indexed.slice(0, k);
}
