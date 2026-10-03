/**
 * Хранилище в памяти. Для тестов и как образец интерфейса: новая БД
 * реализует ровно эти четыре метода и проходит runStoreContract.
 *
 * Методы асинхронные, хотя память отвечает сразу: интерфейс общий для всех
 * хранилищ, а сетевая БД синхронно ответить не сможет.
 */
export function createMemoryStore() {
  const records = new Map();
  const id = (experiment, unit) => `${experiment.length}:${experiment}:${unit}`;

  return {
    async get(experiment, unit) {
      const record = records.get(id(experiment, unit));
      return record ? { variant: record.variant, assigned_at: record.assigned_at } : null;
    },
    async claim(record) {
      const key = id(record.experiment, record.unit);
      // Проверка и вставка — один синхронный шаг: между ними нет await, и
      // вторая попытка уже видит первую запись.
      if (!records.has(key)) records.set(key, { ...record });
      const stored = records.get(key);
      return { variant: stored.variant, assigned_at: stored.assigned_at };
    },
    async count(experiment) {
      const out = {};
      for (const record of records.values()) {
        if (record.experiment === experiment) out[record.variant] = (out[record.variant] ?? 0) + 1;
      }
      return out;
    },
    async close() {},
  };
}
