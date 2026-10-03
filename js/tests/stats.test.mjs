import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProportions, sampleSize, normalCdf, normalQuantile } from '../src/stats/index.mjs';

const close = (a, b, digits = 3) => assert.ok(Math.abs(a - b) < 0.5 * 10 ** -digits, `${a} ≠ ${b}`);

test('нормальное распределение: опорные значения', () => {
  close(normalCdf(1.96), 0.975, 4);
  close(normalCdf(0), 0.5, 6);
  close(normalCdf(-1), 0.158655, 5);
  close(normalQuantile(0.975), 1.959964, 5);
  close(normalQuantile(0.8), 0.841621, 5);
  close(normalQuantile(0.01), -2.326348, 5);
});

/*
 * Эталоны посчитаны вручную.
 *
 * 1) a 20/200, b 40/200: pa 0,1, pb 0,2, разница 0,1.
 *    Объединённая доля 60/400 = 0,15; se0 = √(0,15·0,85·(1/200+1/200)) = 0,035707;
 *    z = 0,1 / 0,035707 = 2,8006; p = 2·(1 − Φ(2,8006)) = 0,00510.
 *    se = √(0,1·0,9/200 + 0,2·0,8/200) = √0,00125 = 0,035355;
 *    интервал 0,1 ± 1,96·0,035355 = [0,0307; 0,1693].
 * 2) a 50/500, b 55/500: разница 0,01; объединённая 0,105;
 *    se0 = √(0,105·0,895·0,004) = 0,019389; z = 0,5158; p = 0,606.
 *    se = √(0,1·0,9/500 + 0,11·0,89/500) = 0,019339; интервал [−0,0279; 0,0479].
 */
test('compareProportions совпадает с ручным расчётом до третьего знака', () => {
  const one = compareProportions({ a: { n: 200, x: 20 }, b: { n: 200, x: 40 } });
  close(one.pa, 0.1); close(one.pb, 0.2); close(one.diff, 0.1); close(one.lift, 1);
  close(one.z, 2.8006); close(one.pValue, 0.0051);
  close(one.ci[0], 0.0307); close(one.ci[1], 0.1693);

  const two = compareProportions({ a: { n: 500, x: 50 }, b: { n: 500, x: 55 } });
  close(two.diff, 0.01); close(two.z, 0.5158); close(two.pValue, 0.606);
  close(two.ci[0], -0.0279); close(two.ci[1], 0.0479);
});

test('compareProportions: равные крайние доли — разницы нет, p = 1; кривой вход — ошибка', () => {
  const none = compareProportions({ a: { n: 10, x: 0 }, b: { n: 10, x: 0 } });
  assert.equal(none.pValue, 1);
  assert.equal(none.lift, null);
  assert.throws(() => compareProportions({ a: { n: 0, x: 0 }, b: { n: 1, x: 0 } }));
  assert.throws(() => compareProportions({ a: { n: 5, x: 6 }, b: { n: 5, x: 1 } }));
});

test('sampleSize для 10% → 15% — 680 ± 5 на вариант при α 0,05 и мощности 80%', () => {
  const n = sampleSize({ p: 0.1, mde: 0.05 });
  assert.ok(Math.abs(n - 680) <= 5, `n = ${n}`);
  // Чем меньше разница, тем больше нужно: 10% → 12% — тысячи.
  assert.ok(sampleSize({ p: 0.1, mde: 0.02 }) > 3500);
  assert.throws(() => sampleSize({ p: 0.1, mde: 0 }));
});
