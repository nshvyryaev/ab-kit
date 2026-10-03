import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bucketOf, variantIndex } from '../src/core/bucket.mjs';

const N = 100_000;
const units = Array.from({ length: N }, () => randomUUID());

function shares(salt, weights) {
  const counts = weights.map(() => 0);
  for (const unit of units) counts[variantIndex(bucketOf(salt, unit), weights)]++;
  return counts.map((c) => c / N);
}

test('на 100 000 единиц доли 50/50 и 10/90 отклоняются не больше чем на 1 п. п.', () => {
  for (const weights of [[50, 50], [10, 90]]) {
    const total = weights.reduce((a, b) => a + b, 0);
    shares('распределение', weights).forEach((share, i) => {
      assert.ok(Math.abs(share - weights[i] / total) <= 0.01, `${weights}: вариант ${i} — ${share}`);
    });
  }
});

test('разбиения экспериментов с разной солью независимы: совпадает около половины', () => {
  let same = 0;
  for (const unit of units) {
    if (variantIndex(bucketOf('эксперимент-1', unit), [1, 1]) === variantIndex(bucketOf('эксперимент-2', unit), [1, 1])) same++;
  }
  const share = same / N;
  assert.ok(share > 0.48 && share < 0.52, `совпало ${share}`);
});
