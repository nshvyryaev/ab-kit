import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAssigner } from '../src/core/assign.mjs';
import { createMemoryStore } from '../src/store/memory.mjs';
import { createSqliteStore } from '../src/store/sqlite.mjs';

const experiment = (over = {}) => ({
  key: 'onb', salt: 'onb-salt', variants: [{ key: 'control', weight: 50 }, { key: 'v2', weight: 50 }], ...over,
});
const only = (variant) => [
  { key: 'control', weight: variant === 'control' ? 1 : 0 },
  { key: 'v2', weight: variant === 'v2' ? 1 : 0 },
];

function tempFile() {
  const dir = mkdtempSync(join(tmpdir(), 'ab-kit-'));
  return { file: join(dir, 'ab.sqlite'), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('одна единица — один вариант: повторным вызовом и после пересоздания хранилища на том же файле', async () => {
  const { file, done } = tempFile();
  try {
    const store1 = createSqliteStore({ file });
    const first = createAssigner({ experiments: [experiment()], store: store1 });
    const results = [];
    for (let i = 0; i < 50; i++) results.push((await first.assign('onb', `u${i}`, { enroll: true })).variant);
    for (let i = 0; i < 50; i++) assert.equal((await first.assign('onb', `u${i}`, { enroll: true })).variant, results[i]);
    await store1.close();

    const store2 = createSqliteStore({ file });
    const second = createAssigner({ experiments: [experiment()], store: store2 });
    for (let i = 0; i < 50; i++) {
      assert.deepEqual(await second.assign('onb', `u${i}`), { variant: results[i], enrolled: true });
    }
    await store2.close();
  } finally {
    done();
  }
});

test('записанный вариант не меняется при смене весов', async () => {
  const store = createMemoryStore();
  const before = createAssigner({ experiments: [experiment()], store });
  const was = [];
  for (let i = 0; i < 100; i++) was.push((await before.assign('onb', `u${i}`, { enroll: true })).variant);
  assert.ok(was.includes('control') && was.includes('v2'), 'в выборке оба варианта — проверка не пустая');
  const after = createAssigner({ experiments: [experiment({ variants: only('v2') })], store });
  for (let i = 0; i < 100; i++) assert.equal((await after.assign('onb', `u${i}`, { enroll: true })).variant, was[i]);
});

test('без enroll новая единица получает контроль без записи', async () => {
  const store = createMemoryStore();
  const { assign } = createAssigner({ experiments: [experiment()], store });
  for (let i = 0; i < 20; i++) assert.deepEqual(await assign('onb', `u${i}`), { variant: 'control', enrolled: false });
  assert.deepEqual(await store.count('onb'), {});
});

test('paused: новых не записывает, записанные получают свой вариант', async () => {
  const store = createMemoryStore();
  const running = createAssigner({ experiments: [experiment({ variants: only('v2') })], store });
  await running.assign('onb', 'старый', { enroll: true });
  const paused = createAssigner({ experiments: [experiment({ status: 'paused' })], store });
  assert.deepEqual(await paused.assign('onb', 'старый', { enroll: true }), { variant: 'v2', enrolled: true });
  assert.deepEqual(await paused.assign('onb', 'новый', { enroll: true }), { variant: 'control', enrolled: false });
  assert.deepEqual(await store.count('onb'), { v2: 1 });
});

test('concluded: все, записанные тоже, получают winner', async () => {
  const store = createMemoryStore();
  await store.claim({ experiment: 'onb', unit: 'старый', variant: 'control', assigned_at: 1 });
  const done = createAssigner({ experiments: [experiment({ status: 'concluded', winner: 'v2' })], store });
  assert.deepEqual(await done.assign('onb', 'старый'), { variant: 'v2', enrolled: false });
  assert.deepEqual(await done.assign('onb', 'новый', { enroll: true }), { variant: 'v2', enrolled: false });
});

test('две одновременные попытки записать одну единицу: одна запись, один вариант у обоих', async () => {
  const { file, done } = tempFile();
  try {
    for (const make of [() => createMemoryStore(), () => createSqliteStore({ file })]) {
      const store = make();
      // Два назначателя с противоположными весами: без атомарного claim они
      // записали бы разные варианты.
      const toControl = createAssigner({ experiments: [experiment({ variants: only('control') })], store });
      const toV2 = createAssigner({ experiments: [experiment({ variants: only('v2') })], store });
      const [x, y] = await Promise.all([
        toControl.assign('onb', 'гонка', { enroll: true }),
        toV2.assign('onb', 'гонка', { enroll: true }),
      ]);
      assert.equal(x.variant, y.variant);
      assert.equal(x.enrolled && y.enrolled, true);
      const counts = await store.count('onb');
      assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 1);
      await store.close();
    }
  } finally {
    done();
  }
});

test('ошибка хранилища не выходит наружу: контроль, enrolled false, error true', async () => {
  const fail = async () => {
    throw new Error('диск');
  };
  const broken = { get: fail, claim: fail, count: async () => ({}), close: async () => {} };
  const first = createAssigner({ experiments: [experiment()], store: broken });
  assert.deepEqual(await first.assign('onb', 'u', { enroll: true }), { variant: 'control', enrolled: false, error: true });
  const claimOnly = { ...createMemoryStore(), claim: fail };
  const second = createAssigner({ experiments: [experiment()], store: claimOnly });
  assert.deepEqual(await second.assign('onb', 'u', { enroll: true }), { variant: 'control', enrolled: false, error: true });
});

test('неизвестный эксперимент — variant null; пустая единица — контроль без записи', async () => {
  const store = createMemoryStore();
  const { assign } = createAssigner({ experiments: [experiment()], store });
  assert.deepEqual(await assign('нет', 'u', { enroll: true }), { variant: null, enrolled: false });
  assert.deepEqual(await assign('onb', '', { enroll: true }), { variant: 'control', enrolled: false });
  assert.deepEqual(await store.count('onb'), {});
});

test('вариант, удалённый из конфига, отдаётся контролем, а запись остаётся', async () => {
  const store = createMemoryStore();
  await store.claim({ experiment: 'onb', unit: 'u', variant: 'v3', assigned_at: 1 });
  const { assign } = createAssigner({ experiments: [experiment()], store });
  assert.deepEqual(await assign('onb', 'u'), { variant: 'control', enrolled: true });
  assert.deepEqual(await store.get('onb', 'u'), { variant: 'v3', assigned_at: 1 });
});
