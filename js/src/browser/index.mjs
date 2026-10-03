/**
 * Клиент для игры: спрашивает варианты у сервера и помнит последний ответ.
 *
 * Правило одно — наружу не бросаем никогда и долго не ждём. Эксперимент,
 * задержавший или уронивший запуск игры, хуже отсутствующего. Без ответа
 * сервера — последний сохранённый ответ (игрок видит то же, что вчера), а без
 * него — вариант по умолчанию из `defaults` (обычно контроль) или null.
 */

const STORAGE_KEY = 'ab-kit:v1';

export function createAbClient({
  endpoint,
  storage,
  timeoutMs = 1500,
  defaults = {},
  fetch: send = (...args) => globalThis.fetch(...args),
}) {
  async function load() {
    try {
      const text = await storage.get(STORAGE_KEY);
      const parsed = text ? JSON.parse(text) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function save(cache) {
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // Не сохранилось — в следующий раз спросим сервер ещё раз, только и всего.
    }
  }

  async function request(keys, enroll, payload) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller?.abort();
        resolve(null);
      }, timeoutMs);
    });
    const call = (async () => {
      const response = await send(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, experiments: keys, enroll }),
        signal: controller?.signal,
      });
      if (!response.ok) return null;
      const body = await response.json();
      return body && typeof body.assignments === 'object' ? body.assignments : null;
    })().catch(() => null);
    try {
      return await Promise.race([call, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Варианты для ключей. `enroll` — в каких записывать, если записи нет;
   * `payload` — поля хозяина для его resolveUnit (параметры запуска,
   * анонимный id). Ответ: `{ [key]: { variant, enrolled, source } }`, где
   * source — 'server', 'cache' или 'default'.
   */
  async function assign(keys, { enroll = [], payload = {} } = {}) {
    const out = {};
    try {
      const cache = await load();
      const fresh = await request(keys, enroll, payload);
      for (const key of keys) {
        const got = fresh?.[key];
        if (got && typeof got === 'object') {
          out[key] = { variant: got.variant ?? null, enrolled: got.enrolled === true, source: 'server' };
          cache[key] = { variant: out[key].variant, enrolled: out[key].enrolled };
        } else if (cache[key]) {
          out[key] = { variant: cache[key].variant ?? null, enrolled: cache[key].enrolled === true, source: 'cache' };
        } else {
          out[key] = { variant: defaults[key] ?? null, enrolled: false, source: 'default' };
        }
      }
      if (fresh) await save(cache);
    } catch {
      for (const key of keys) out[key] ??= { variant: defaults[key] ?? null, enrolled: false, source: 'default' };
    }
    return out;
  }

  return { assign };
}
