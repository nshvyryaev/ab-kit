/**
 * Ручка `POST /v1/ab/assign` для сервера хозяина. Протокол — spec/README.md.
 *
 * Кто такой игрок, решает хозяин (`resolveUnit`): в игре личность уже
 * устанавливается по подписи площадки, и дублировать эту проверку здесь
 * значило бы завести вторую, которая однажды разойдётся с первой.
 *
 * Ручка живёт в процессе, который принимает деньги. Поэтому 500 из-за ab-kit
 * не бывает: всё, что не ошибка запроса, отвечает 200 — в худшем случае
 * контролем без записи.
 */
import { createAssigner } from '../core/assign.mjs';

export const MAX_EXPERIMENTS = 20;
export const MAX_BODY_BYTES = 8 * 1024;
export const PATH = '/v1/ab/assign';

const bad = (error) => ({ status: 400, body: { error } });

export function createAbHandler({ experiments, store, resolveUnit, now, path = PATH }) {
  if (typeof resolveUnit !== 'function') throw new Error('ab-kit: нужен resolveUnit');
  const assigner = createAssigner({ experiments, store, now });

  /**
   * Разбор уже прочитанного тела. Для хозяев, которые читают тело сами (как
   * игра для ручек аналитики), — без HTTP-обвязки.
   */
  async function handle(body, request) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('body');
    const { experiments: keys, enroll = [] } = body;
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) return bad('experiments');
    if (keys.length > MAX_EXPERIMENTS) return bad('too_many');
    if (!Array.isArray(enroll)) return bad('enroll');

    let unit = null;
    try {
      unit = await resolveUnit(request, body);
    } catch {
      // Сломанная личность — не повод отказывать: игрок получит контроль и в
      // выборку не попадёт, а это ровно то, что нужно при сомнении.
      unit = null;
    }

    const wanted = new Set(enroll.filter((k) => typeof k === 'string'));
    const assignments = {};
    for (const key of new Set(keys)) {
      assignments[key] = await assigner.assign(key, typeof unit === 'string' ? unit : '', {
        enroll: wanted.has(key),
      });
    }
    return { status: 200, body: { assignments } };
  }

  /**
   * Обработчик для `node:http`. Возвращает true, если запрос его: так хозяин
   * встраивает ручку одной строкой в свою маршрутизацию.
   */
  async function handler(request, response) {
    const url = new URL(request.url ?? '/', 'http://local');
    if (request.method !== 'POST' || url.pathname !== path) return false;

    let result;
    try {
      const text = await readBody(request);
      if (text === null) result = bad('too_large');
      else {
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
        result = body === undefined ? bad('json') : await handle(body, request);
      }
    } catch {
      result = bad('read');
    }
    response.writeHead(result.status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify(result.body));
    return true;
  }

  handler.handle = handle;
  handler.assign = assigner.assign;
  return handler;
}

/** Тело целиком, не больше MAX_BODY_BYTES; больше — null без дочитывания. */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    request.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        // Остаток тела сливаем, не копя: иначе соединение повиснет на
        // недочитанном потоке.
        request.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}
