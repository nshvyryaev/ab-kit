/**
 * Хранилище на SQLite из самого Node (`node:sqlite`) — без зависимостей, как
 * в analytics-kit. Свой файл базы: назначения переживают и перезапуск, и
 * переезд, и не делят таблиц ни с кошельком, ни с аналитикой.
 */
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS assignments (
    experiment  TEXT    NOT NULL,
    unit        TEXT    NOT NULL,
    variant     TEXT    NOT NULL,
    assigned_at INTEGER NOT NULL,
    PRIMARY KEY (experiment, unit)
  ) WITHOUT ROWID;
`;

export function createSqliteStore({ file }) {
  if (typeof file !== 'string' || file.length === 0) throw new Error('ab-kit: нужен путь к файлу базы');
  const db = new DatabaseSync(file);
  // WAL: читатели (отчёт, резервная копия) не ждут писателя и не мешают ему.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const select = db.prepare('SELECT variant, assigned_at FROM assignments WHERE experiment = ? AND unit = ?');
  // INSERT OR IGNORE по первичному ключу и есть «вставить, если нет»: вторая
  // попытка той же единицы молча ничего не делает, и обе потом читают одну
  // запись — первую.
  const insert = db.prepare(
    'INSERT OR IGNORE INTO assignments (experiment, unit, variant, assigned_at) VALUES (?, ?, ?, ?)',
  );
  const counts = db.prepare('SELECT variant, COUNT(*) AS n FROM assignments WHERE experiment = ? GROUP BY variant');

  const read = (experiment, unit) => {
    const row = select.get(experiment, unit);
    return row ? { variant: row.variant, assigned_at: Number(row.assigned_at) } : null;
  };

  return {
    async get(experiment, unit) {
      return read(experiment, unit);
    },
    async claim({ experiment, unit, variant, assigned_at }) {
      insert.run(experiment, unit, variant, assigned_at);
      return read(experiment, unit);
    },
    async count(experiment) {
      const out = {};
      for (const row of counts.all(experiment)) out[row.variant] = Number(row.n);
      return out;
    },
    async close() {
      db.close();
    },
  };
}
