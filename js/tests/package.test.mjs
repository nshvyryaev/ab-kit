import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('пакет без зависимостей', () => {
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.peerDependencies, undefined);
  assert.equal(manifest.optionalDependencies, undefined);
});

test('каждый экспорт указывает на существующий модуль и импортируется', async () => {
  for (const [name, target] of Object.entries(manifest.exports)) {
    const file = typeof target === 'string' ? target : target.default;
    const mod = await import(new URL(`../../${file}`, import.meta.url));
    assert.ok(Object.keys(mod).length > 0, `${name} пуст`);
  }
});
