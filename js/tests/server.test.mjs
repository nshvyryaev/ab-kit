import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAbHandler, MAX_BODY_BYTES } from '../src/server/index.mjs';
import { createMemoryStore } from '../src/store/memory.mjs';

const experiments = [
  { key: 'onb', salt: 's', variants: [{ key: 'control', weight: 0 }, { key: 'v2', weight: 1 }] },
  { key: 'other', salt: 's2', variants: [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }] },
];

/** Поднять настоящий http-сервер с ручкой и вернуть функцию запроса. */
async function serve(options) {
  const handler = createAbHandler({ experiments, store: createMemoryStore(), ...options });
  const server = createServer(async (request, response) => {
    if (!(await handler(request, response))) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const post = async (body, path = '/v1/ab/assign') => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { post, close: () => new Promise((resolve) => server.close(resolve)), handler };
}

test('ручка отвечает по протоколу; единицу определяет только resolveUnit хозяина', async () => {
  const seen = [];
  const { post, close } = await serve({
    resolveUnit: (request, body) => {
      seen.push(body.anonId);
      return `unit:${body.anonId}`;
    },
  });
  try {
    const res = await post({ experiments: ['onb', 'other'], enroll: ['onb'], anonId: 'x1' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.assignments.onb, { variant: 'v2', enrolled: true });
    assert.deepEqual(res.body.assignments.other, { variant: 'a', enrolled: false });
    assert.deepEqual(seen, ['x1']);
  } finally {
    await close();
  }
});

test('resolveUnit вернул пусто или упал — контроль без записи, ответ 200', async () => {
  for (const resolveUnit of [() => null, () => '', () => { throw new Error('подпись'); }, async () => undefined]) {
    const store = createMemoryStore();
    const { post, close } = await serve({ resolveUnit, store });
    try {
      const res = await post({ experiments: ['onb'], enroll: ['onb'] });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.assignments.onb, { variant: 'control', enrolled: false });
      assert.deepEqual(await store.count('onb'), {});
    } finally {
      await close();
    }
  }
});

test('неизвестный эксперимент — variant null', async () => {
  const { post, close } = await serve({ resolveUnit: () => 'u' });
  try {
    const res = await post({ experiments: ['нет'], enroll: ['нет'] });
    assert.deepEqual(res.body.assignments['нет'], { variant: null, enrolled: false });
  } finally {
    await close();
  }
});

test('больше 20 экспериментов или тело больше 8 КБ — 400; кривое тело — 400', async () => {
  const { post, close } = await serve({ resolveUnit: () => 'u' });
  try {
    assert.deepEqual(await post({ experiments: Array.from({ length: 21 }, (_, i) => `e${i}`) }), {
      status: 400, body: { error: 'too_many' },
    });
    assert.equal((await post({ experiments: Array.from({ length: 20 }, (_, i) => `e${i}`) })).status, 200);
    const big = { experiments: ['onb'], pad: 'я'.repeat(MAX_BODY_BYTES) };
    assert.deepEqual(await post(big), { status: 400, body: { error: 'too_large' } });
    assert.deepEqual(await post('{не json'), { status: 400, body: { error: 'json' } });
    assert.deepEqual(await post([1]), { status: 400, body: { error: 'body' } });
    assert.deepEqual(await post({ experiments: 'onb' }), { status: 400, body: { error: 'experiments' } });
    assert.deepEqual(await post({ experiments: ['onb'], enroll: 'onb' }), { status: 400, body: { error: 'enroll' } });
  } finally {
    await close();
  }
});

test('ручка никогда не отвечает 500 из-за ab-kit: сломанное хранилище — 200 с контролем', async () => {
  const fail = async () => {
    throw new Error('диск');
  };
  const store = { get: fail, claim: fail, count: fail, close: async () => {} };
  const { post, close } = await serve({ resolveUnit: () => 'u', store });
  try {
    const res = await post({ experiments: ['onb'], enroll: ['onb'] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.assignments.onb, { variant: 'control', enrolled: false, error: true });
  } finally {
    await close();
  }
});

test('чужие пути и методы ручка не трогает', async () => {
  const { post, close } = await serve({ resolveUnit: () => 'u' });
  try {
    assert.equal((await post({ experiments: ['onb'] }, '/v1/other')).status, 404);
  } finally {
    await close();
  }
});

test('handle — разбор уже прочитанного тела без HTTP', async () => {
  const handler = createAbHandler({ experiments, store: createMemoryStore(), resolveUnit: () => 'u' });
  assert.deepEqual(await handler.handle({ experiments: ['onb'], enroll: ['onb'] }, {}), {
    status: 200, body: { assignments: { onb: { variant: 'v2', enrolled: true } } },
  });
});

test('без resolveUnit ручка не создаётся', () => {
  assert.throws(() => createAbHandler({ experiments, store: createMemoryStore() }), /resolveUnit/);
});
