/**
 * Общий набор тестов для любого хранилища. Подмена БД — это новая
 * реализация четырёх методов; без общего набора она тихо сломала бы главное
 * свойство — что записанный вариант не меняется.
 *
 *   import { runStoreContract } from 'ab-kit/store/contract';
 *   runStoreContract('postgres', async () => createPgStore(...));
 *
 * `makeStore` вызывается заново для каждого теста и должен давать пустое
 * хранилище. `reopen` (необязателен) — открыть то же хранилище заново, для
 * проверки, что записи переживают закрытие.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

export function runStoreContract(name, makeStore, { reopen } = {}) {
  const record = (over = {}) => ({ experiment: 'e', unit: 'u', variant: 'a', assigned_at: 1000, ...over });

  test(`${name}: пустое хранилище не знает единицу`, async () => {
    const store = await makeStore();
    assert.equal(await store.get('e', 'u'), null);
    assert.deepEqual(await store.count('e'), {});
    await store.close();
  });

  test(`${name}: claim записывает и возвращает запись`, async () => {
    const store = await makeStore();
    assert.deepEqual(await store.claim(record()), { variant: 'a', assigned_at: 1000 });
    assert.deepEqual(await store.get('e', 'u'), { variant: 'a', assigned_at: 1000 });
    await store.close();
  });

  test(`${name}: повторный claim не перезаписывает — побеждает первая запись`, async () => {
    const store = await makeStore();
    await store.claim(record());
    assert.deepEqual(await store.claim(record({ variant: 'b', assigned_at: 2000 })), {
      variant: 'a', assigned_at: 1000,
    });
    await store.close();
  });

  test(`${name}: одновременные claim одной единицы дают одну запись`, async () => {
    const store = await makeStore();
    const [x, y] = await Promise.all([store.claim(record()), store.claim(record({ variant: 'b' }))]);
    assert.equal(x.variant, y.variant);
    assert.deepEqual(await store.count('e'), { [x.variant]: 1 });
    await store.close();
  });

  test(`${name}: эксперименты и единицы не смешиваются`, async () => {
    const store = await makeStore();
    await store.claim(record());
    await store.claim(record({ experiment: 'f', variant: 'b' }));
    await store.claim(record({ unit: 'v', variant: 'b' }));
    assert.deepEqual(await store.get('f', 'u'), { variant: 'b', assigned_at: 1000 });
    assert.deepEqual(await store.count('e'), { a: 1, b: 1 });
    assert.deepEqual(await store.count('f'), { b: 1 });
    await store.close();
  });

  test(`${name}: кириллица и длинные ключи хранятся как есть`, async () => {
    const store = await makeStore();
    const unit = 'игрок-' + 'ё'.repeat(200);
    await store.claim(record({ unit, experiment: 'обучение' }));
    assert.deepEqual(await store.get('обучение', unit), { variant: 'a', assigned_at: 1000 });
    await store.close();
  });

  if (reopen) {
    test(`${name}: запись переживает закрытие`, async () => {
      const store = await makeStore();
      await store.claim(record());
      await store.close();
      const again = await reopen();
      assert.deepEqual(await again.get('e', 'u'), { variant: 'a', assigned_at: 1000 });
      await again.close();
    });
  }
}
