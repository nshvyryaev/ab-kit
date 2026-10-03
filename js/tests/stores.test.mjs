import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStoreContract } from '../src/store/contract.mjs';
import { createMemoryStore } from '../src/store/memory.mjs';
import { createSqliteStore } from '../src/store/sqlite.mjs';

runStoreContract('память', () => createMemoryStore());

// Каждому тесту — свой файл: контракт требует пустое хранилище на входе.
let last;
runStoreContract(
  'sqlite',
  () => {
    last = join(mkdtempSync(join(tmpdir(), 'ab-kit-contract-')), 'ab.sqlite');
    return createSqliteStore({ file: last });
  },
  { reopen: () => createSqliteStore({ file: last }) },
);
