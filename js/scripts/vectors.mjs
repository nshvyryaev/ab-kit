/**
 * Пересборка тестовых векторов spec/vectors/bucketing.json из JS-реализации.
 *
 * Векторы — договор между реализациями на разных языках: пересобирать их
 * можно только вместе с осознанной сменой алгоритма (и версии в префиксе
 * хеша). Иначе тест любой другой реализации начнёт падать «ни с того ни с
 * сего», а на деле разойдутся назначения живых игроков.
 */
import { writeFileSync } from 'node:fs';
import { bucketOf, boundaries, variantIndex } from '../src/core/bucket.mjs';

const units = [
  'u1', 'u2', 'player-42', 'sXq3k9vT1bQ', 'anon:0f3c', 'p:2:vk:123456', 'p:2:ok:987654321',
  'игрок', 'Ёжик-ёж', 'абвгдежзийклмнопрстуфхцчшщъыьэюя', '😀', ' ', 'a:b:c',
];
const cases = [
  { salt: 'onboarding-v2-2026-10', weights: [50, 50] },
  { salt: 'onboarding-v2-2026-10', weights: [10, 90] },
  { salt: 'соль-по-русски', weights: [1, 1, 1] },
  { salt: 'three', weights: [20, 30, 50] },
  { salt: 'zero', weights: [0, 1, 1] },
  { salt: 'zero-middle', weights: [3, 0, 7] },
];

const vectors = [];
for (const { salt, weights } of cases) {
  for (const unit of units) {
    const bucket = bucketOf(salt, unit);
    vectors.push({ salt, unit, weights, boundaries: boundaries(weights), bucket, variant: variantIndex(bucket, weights) });
  }
}
// Граничные вёдра: проверяют сравнение «строго меньше» у реализаций.
for (const weights of [[50, 50], [1, 1, 1], [0, 1, 1]]) {
  const edges = boundaries(weights);
  for (const bucket of [0, edges[0] - 1, edges[0], 9999]) {
    if (bucket < 0) continue;
    vectors.push({ weights, boundaries: edges, bucket, variant: variantIndex(bucket, weights) });
  }
}

const file = new URL('../../spec/vectors/bucketing.json', import.meta.url);
// По вектору на строку: так файл читается глазами и правка видна в diff.
const lines = vectors.map((v) => `  ${JSON.stringify(v)}`).join(',\n');
writeFileSync(file, `{"algorithm": "ab:v1", "vectors": [\n${lines}\n]}\n`);
console.log(`векторов: ${vectors.length}`);
