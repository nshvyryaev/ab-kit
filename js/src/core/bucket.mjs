/**
 * Алгоритм назначения. Один для всех языков: описан в spec/README.md и
 * закреплён векторами spec/vectors/bucketing.json. Меняется здесь —
 * меняется спецификация и пересобираются векторы, иначе реализации на других
 * языках молча разойдутся с этой и один игрок окажется в двух вариантах.
 */
import { createHash } from 'node:crypto';

/** Число вёдер. Доли считаются в сотых процента: точнее не бывает нужно. */
export const BUCKETS = 10000;

/**
 * Префикс версии в хешируемой строке. Он нужен на случай, если алгоритм
 * когда-нибудь придётся сменить: новая версия даст другие вёдра всем сразу,
 * а не части игроков, совпавшей по случайности.
 */
const VERSION = 'ab:v1:';

/**
 * Ведро единицы в эксперименте: первые четыре байта SHA-256 как беззнаковое
 * целое старшим байтом вперёд, по модулю BUCKETS.
 *
 * Соль своя у каждого эксперимента — без неё разбиения разных экспериментов
 * совпадали бы, и одни и те же игроки всегда попадали бы в «первую половину».
 */
export function bucketOf(salt, unit) {
  const digest = createHash('sha256').update(`${VERSION}${salt}:${unit}`, 'utf8').digest();
  return digest.readUInt32BE(0) % BUCKETS;
}

/**
 * Границы вариантов: накопленная доля в вёдрах, в целых. У последнего — ровно
 * BUCKETS, чтобы округление вниз не оставило крайние вёдра без варианта.
 * Вариант с весом 0 получает ту же границу, что предыдущий, и не выпадает
 * никогда.
 */
export function boundaries(weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let running = 0;
  return weights.map((w, i) => {
    running += w;
    return i === weights.length - 1 ? BUCKETS : Math.floor((BUCKETS * running) / total);
  });
}

/** Индекс варианта для ведра: первый, чья граница больше ведра. */
export function variantIndex(bucket, weights) {
  const edges = boundaries(weights);
  for (let i = 0; i < edges.length; i++) if (bucket < edges[i]) return i;
  return edges.length - 1;
}
