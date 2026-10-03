/**
 * Назначение варианта поверх хранилища. Порядок шагов — docs/design.md,
 * «Поведение assign».
 *
 * Решает не хеш, а запись: первое назначение пишется, дальше отдаётся
 * записанное. Поэтому смена весов на ходу не перебрасывает уже записанных, а
 * хеш нужен лишь затем, чтобы две гонящиеся попытки до записи посчитали одно.
 */
import { bucketOf, variantIndex } from './bucket.mjs';
import { defineExperiments } from './config.mjs';

export function createAssigner({ experiments, store, now = Date.now }) {
  // Готовая карта тоже принимается: хозяин может проверить конфиг сам на
  // старте и передать результат сюда и в ручку.
  const config = experiments instanceof Map ? experiments : defineExperiments(experiments);
  if (!store) throw new Error('ab-kit: нужно хранилище');

  /**
   * Вариант эксперимента для единицы. Никогда не бросает: эксперимент не
   * вправе ронять игру. Любая ошибка — контроль без записи и `error: true`,
   * чтобы хозяин мог её посчитать, не разбирая исключений.
   */
  async function assign(key, unit, { enroll = false } = {}) {
    const experiment = config.get(key);
    if (!experiment) return { variant: null, enrolled: false };
    if (experiment.status === 'concluded') return { variant: experiment.winner, enrolled: false };
    if (typeof unit !== 'string' || unit.length === 0) {
      return { variant: experiment.control, enrolled: false };
    }

    try {
      const stored = await store.get(key, unit);
      if (stored) return { variant: known(experiment, stored.variant), enrolled: true };
      if (!enroll || experiment.status !== 'running') {
        return { variant: experiment.control, enrolled: false };
      }

      const weights = experiment.variants.map((v) => v.weight);
      const variant = experiment.variants[variantIndex(bucketOf(experiment.salt, unit), weights)].key;
      // claim возвращает то, что лежит в хранилище после вставки: при гонке
      // двух вызовов побеждает первая запись, и второй получает её вариант.
      const claimed = await store.claim({ experiment: key, unit, variant, assigned_at: now() });
      return { variant: known(experiment, claimed.variant), enrolled: true };
    } catch {
      return { variant: experiment.control, enrolled: false, error: true };
    }
  }

  return { assign, experiments: config };
}

/**
 * Записанный вариант, которого больше нет в конфиге (его удалили правкой),
 * отдавать нельзя — хозяин не знает, что с ним показывать. Такой игрок
 * получает контроль, но запись остаётся: вернут вариант — вернётся и он.
 */
function known(experiment, variant) {
  return experiment.variants.some((v) => v.key === variant) ? variant : experiment.control;
}
