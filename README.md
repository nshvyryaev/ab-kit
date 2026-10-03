# ab-kit

Простые A/B-эксперименты: детерминированное и закреплённое назначение
варианта, запись назначений в подменяемое хранилище, HTTP-ручка для сервера
хозяина, маленький клиент для браузера и сравнение долей.

Дизайн — `docs/design.md`. Как вести эксперимент от гипотезы до уборки —
`docs/guide.md`. Критерии приёмки — `docs/acceptance/`.

## Подключение

```
npm install github:nshvyryaev/ab-kit#v0.1.0
```

Сервер хозяина (`node:http`):

```js
import { createAbHandler } from 'ab-kit/server';
import { createSqliteStore } from 'ab-kit/store/sqlite';

const ab = createAbHandler({
  experiments: [
    {
      key: 'onboarding-v2',
      salt: 'onboarding-v2-2026-10',
      status: 'running',
      variants: [{ key: 'control', weight: 50 }, { key: 'v2', weight: 50 }],
    },
  ],
  store: createSqliteStore({ file: '/data/ab.sqlite' }),
  // Кто игрок — решает хозяин; пусто → контроль без записи.
  resolveUnit: (request, body) => playerSubjectFrom(body.launch, body.anonId),
});

http.createServer(async (request, response) => {
  if (await ab(request, response)) return; // POST /v1/ab/assign
  // …прочие ручки
});
```

Хозяин, который читает тело сам, зовёт `ab.handle(body, request)` и получает
`{ status, body }`.

Клиент:

```js
import { createAbClient } from 'ab-kit/browser';

const ab = createAbClient({
  endpoint: '/v1/ab/assign',
  storage: platformStorage, // { get(key), set(key, value) } — промисы
  timeoutMs: 1500,
  defaults: { 'onboarding-v2': 'control' },
});

const { 'onboarding-v2': onboarding } = await ab.assign(['onboarding-v2'], {
  enroll: onboarded ? [] : ['onboarding-v2'],
  payload: { anonId, launch },
});
// onboarding = { variant: 'v2', enrolled: true, source: 'server' }
```

Сравнение:

```js
import { compareProportions, sampleSize } from 'ab-kit/stats';

compareProportions({ a: { n: 200, x: 20 }, b: { n: 200, x: 40 } });
// { pa, pb, diff, lift, ci: [lo, hi], z, pValue }
sampleSize({ p: 0.1, mde: 0.05 }); // 683 на вариант
```

Новое хранилище — модуль с методами `get`, `claim`, `count`, `close`,
проходящий `runStoreContract` из `ab-kit/store/contract`.

## Проверки

```
npm test                                         тесты и векторы
npm run vectors                                  пересобрать векторы (только при смене алгоритма)
ROLLDOWN_FROM=<проект с rolldown> npm run size   размер браузерной части в gzip
```

## Языки

Алгоритм и протокол общие, описаны в `spec/` и закреплены тестовыми
векторами. Реализации лежат каждая в своей папке и проходят одни и те же
векторы:

- `js/` — Node ≥ 22 и браузер, без зависимостей.

Корневой `package.json` принадлежит JS-реализации: `npm install
github:…#tag` ищет манифест в корне репозитория.
