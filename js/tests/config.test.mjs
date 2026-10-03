import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineExperiments } from '../src/core/config.mjs';
import { createAssigner } from '../src/core/assign.mjs';
import { createMemoryStore } from '../src/store/memory.mjs';

const good = { key: 'e', salt: 's', variants: [{ key: 'control', weight: 1 }, { key: 'v2', weight: 1 }] };

test('верный конфиг принимается, первый вариант — контроль, статус по умолчанию running', () => {
  const e = defineExperiments([good]).get('e');
  assert.equal(e.control, 'control');
  assert.equal(e.status, 'running');
});

const broken = {
  'нет вариантов': { ...good, variants: [] },
  'отрицательный вес': { ...good, variants: [{ key: 'a', weight: -1 }, { key: 'b', weight: 2 }] },
  'нецелый вес': { ...good, variants: [{ key: 'a', weight: 0.5 }, { key: 'b', weight: 1 }] },
  'сумма весов ноль': { ...good, variants: [{ key: 'a', weight: 0 }] },
  'повтор варианта': { ...good, variants: [{ key: 'a', weight: 1 }, { key: 'a', weight: 1 }] },
  'winner не из вариантов': { ...good, status: 'concluded', winner: 'нет' },
  'concluded без winner': { ...good, status: 'concluded' },
  'winner у идущего': { ...good, winner: 'v2' },
  'пустая соль': { ...good, salt: '' },
  'нет ключа': { ...good, key: '' },
  'неизвестный статус': { ...good, status: 'stopped' },
};

for (const [name, raw] of Object.entries(broken)) {
  test(`конфиг отвергается при создании: ${name}`, () => {
    assert.throws(() => defineExperiments([raw]), /ab-kit/);
    // И при создании назначателя — до первого назначения, а не в нём.
    assert.throws(() => createAssigner({ experiments: [raw], store: createMemoryStore() }), /ab-kit/);
  });
}

test('конфиг отвергается при создании: повтор ключа эксперимента', () => {
  assert.throws(() => defineExperiments([good, { ...good }]), /повтор ключа/);
});
