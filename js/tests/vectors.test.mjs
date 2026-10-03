import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bucketOf, boundaries, variantIndex } from '../src/core/bucket.mjs';

const { algorithm, vectors } = JSON.parse(
  readFileSync(new URL('../../spec/vectors/bucketing.json', import.meta.url), 'utf8'),
);

test('векторов не меньше 50, и в них есть все обязательные случаи', () => {
  assert.equal(algorithm, 'ab:v1');
  assert.ok(vectors.length >= 50, `векторов ${vectors.length}`);
  assert.ok(vectors.some((v) => /[а-яё]/i.test(v.unit ?? '')), 'кириллица в единице');
  assert.ok(vectors.some((v) => v.weights.length === 3), 'три варианта');
  assert.ok(vectors.some((v) => new Set(v.weights).size > 1), 'неравные веса');
  assert.ok(vectors.some((v) => v.weights.includes(0)), 'вес 0');
});

test('JS-реализация проходит все векторы', () => {
  for (const v of vectors) {
    assert.deepEqual(boundaries(v.weights), v.boundaries, JSON.stringify(v));
    if (v.salt !== undefined) assert.equal(bucketOf(v.salt, v.unit), v.bucket, JSON.stringify(v));
    assert.equal(variantIndex(v.bucket, v.weights), v.variant, JSON.stringify(v));
  }
});

test('вариант с весом 0 не выпадает ни на одном ведре', () => {
  for (const weights of [[0, 1, 1], [3, 0, 7], [1, 1, 0]]) {
    const zero = weights.indexOf(0);
    for (let b = 0; b < 10000; b++) assert.notEqual(variantIndex(b, weights), zero);
  }
});
