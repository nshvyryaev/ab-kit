/**
 * Проверка конфига экспериментов. Ошибка — при создании, а не при первом
 * назначении: конфиг лежит в коде хозяина и меняется деплоем, и опечатка,
 * найденная на старте сервера, стоит перезапуска, а найденная на живом игроке
 * — испорченной выборки.
 */

export const STATUSES = ['running', 'paused', 'concluded'];

const isText = (v) => typeof v === 'string' && v.length > 0;

function fail(key, message) {
  throw new Error(`ab-kit: эксперимент «${key ?? '?'}»: ${message}`);
}

function checkOne(raw) {
  if (!raw || typeof raw !== 'object') fail(undefined, 'ожидался объект');
  const { key, salt, variants, status = 'running', winner } = raw;
  if (!isText(key)) fail(key, 'нет ключа');
  if (!isText(salt)) fail(key, 'пустая соль');
  if (!STATUSES.includes(status)) fail(key, `неизвестный статус ${status}`);
  if (!Array.isArray(variants) || variants.length === 0) fail(key, 'нет вариантов');

  const seen = new Set();
  for (const v of variants) {
    if (!v || !isText(v.key)) fail(key, 'вариант без ключа');
    if (seen.has(v.key)) fail(key, `повтор варианта ${v.key}`);
    seen.add(v.key);
    if (!Number.isInteger(v.weight) || v.weight < 0) {
      fail(key, `вес варианта ${v.key} должен быть целым и не меньше нуля`);
    }
  }
  if (variants.reduce((sum, v) => sum + v.weight, 0) === 0) fail(key, 'сумма весов равна нулю');

  // Победитель обязателен у завершённого и запрещён у прочих: «завершён без
  // победителя» некуда вести игроков, а победитель у идущего эксперимента —
  // почти наверняка забытая правка статуса.
  if (status === 'concluded' && !seen.has(winner)) fail(key, 'у завершённого нет победителя из вариантов');
  if (status !== 'concluded' && winner !== undefined) fail(key, 'победитель задан, а эксперимент не завершён');

  return Object.freeze({
    key,
    salt,
    status,
    winner: status === 'concluded' ? winner : undefined,
    variants: Object.freeze(variants.map((v) => Object.freeze({ key: v.key, weight: v.weight }))),
    // Первый вариант — контроль: его получает всякий, кого не записали.
    control: variants[0].key,
  });
}

/** Список экспериментов → неизменяемая карта по ключу. */
export function defineExperiments(list) {
  if (!Array.isArray(list)) throw new Error('ab-kit: конфиг — массив экспериментов');
  const map = new Map();
  for (const raw of list) {
    const experiment = checkOne(raw);
    if (map.has(experiment.key)) fail(experiment.key, 'повтор ключа эксперимента');
    map.set(experiment.key, experiment);
  }
  return map;
}
