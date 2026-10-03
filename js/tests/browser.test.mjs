import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAbClient } from '../src/browser/index.mjs';

function memoryStorage() {
  const data = new Map();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) };
}

const reply = (assignments, ok = true) => async () => ({ ok, json: async () => ({ assignments }) });

test('возвращает варианты сервера и отправляет тело по протоколу', async () => {
  let sent;
  const client = createAbClient({
    endpoint: '/v1/ab/assign',
    storage: memoryStorage(),
    fetch: async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ assignments: { onb: { variant: 'v2', enrolled: true } } }) };
    },
  });
  const got = await client.assign(['onb'], { enroll: ['onb'], payload: { anonId: 'a1' } });
  assert.deepEqual(got, { onb: { variant: 'v2', enrolled: true, source: 'server' } });
  assert.deepEqual(sent, { url: '/v1/ab/assign', body: { anonId: 'a1', experiments: ['onb'], enroll: ['onb'] } });
});

test('таймаут или ошибка сети — последний сохранённый ответ', async () => {
  const storage = memoryStorage();
  await createAbClient({ endpoint: '/x', storage, fetch: reply({ onb: { variant: 'v2', enrolled: true } }) }).assign(['onb']);
  const slow = createAbClient({ endpoint: '/x', storage, timeoutMs: 20, fetch: () => new Promise(() => {}) });
  assert.deepEqual(await slow.assign(['onb']), { onb: { variant: 'v2', enrolled: true, source: 'cache' } });
  const down = createAbClient({ endpoint: '/x', storage, fetch: async () => { throw new Error('сеть'); } });
  assert.deepEqual(await down.assign(['onb']), { onb: { variant: 'v2', enrolled: true, source: 'cache' } });
  const http500 = createAbClient({ endpoint: '/x', storage, fetch: reply({}, false) });
  assert.deepEqual(await http500.assign(['onb']), { onb: { variant: 'v2', enrolled: true, source: 'cache' } });
});

test('без сохранённого ответа — вариант по умолчанию, а без него null', async () => {
  const client = createAbClient({
    endpoint: '/x', storage: memoryStorage(), timeoutMs: 20, defaults: { onb: 'control' }, fetch: () => new Promise(() => {}),
  });
  const started = Date.now();
  assert.deepEqual(await client.assign(['onb', 'other']), {
    onb: { variant: 'control', enrolled: false, source: 'default' },
    other: { variant: null, enrolled: false, source: 'default' },
  });
  assert.ok(Date.now() - started < 1000, 'таймаут соблюдён');
});

test('исключений наружу не бросает: сломанное хранилище, кривой ответ, бросающий fetch', async () => {
  const broken = { get: async () => { throw new Error('a'); }, set: async () => { throw new Error('b'); } };
  const cases = [
    createAbClient({ endpoint: '/x', storage: broken, fetch: reply({ onb: { variant: 'v2', enrolled: true } }) }),
    createAbClient({ endpoint: '/x', storage: { get: async () => '{не json', set: async () => {} }, fetch: async () => ({ ok: true, json: async () => { throw new Error('json'); } }) }),
    createAbClient({ endpoint: '/x', storage: memoryStorage(), fetch: () => { throw new Error('синхронно'); } }),
  ];
  for (const client of cases) {
    const got = await client.assign(['onb']);
    assert.ok(got.onb && 'variant' in got.onb);
  }
  assert.deepEqual(await cases[0].assign(['onb']), { onb: { variant: 'v2', enrolled: true, source: 'server' } });
});
