/**
 * Размер браузерной части в бандле хозяина: минифицированный код в gzip.
 * Мерить исходник с комментариями бессмысленно — в бандл они не попадают.
 *
 * Своего минификатора у пакета нет и не будет (зависимостей нет нарочно),
 * поэтому берём rolldown из проекта хозяина:
 *
 *   ROLLDOWN_FROM=E:/projects/word-chain node js/scripts/size.mjs
 */
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 1536;
const from = process.env.ROLLDOWN_FROM;
if (!from) {
  console.error('укажите ROLLDOWN_FROM — проект, где установлен rolldown');
  process.exit(2);
}
const require = createRequire(join(from, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('rolldown')).href);

const input = fileURLToPath(new URL('../src/browser/index.mjs', import.meta.url));
const result = await build({ input, write: false, output: { format: 'esm', minify: true } });
const code = result.output[0].code;
const gz = gzipSync(code, { level: 9 }).length;
console.log(`минифицировано ${code.length} Б, gzip ${gz} Б, предел ${LIMIT} Б`);
process.exit(gz <= LIMIT ? 0 : 1);
