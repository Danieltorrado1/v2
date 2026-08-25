import assert from "node:assert/strict";

import {
  buildCompanyScopedStorageKey,
  pickAvailableScopedId,
  pickAuthorizedCompanyId,
  readCompanyScopedStorage,
  writeCompanyScopedStorage,
} from "./companyScope";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function run() {
  assert.equal(buildCompanyScopedStorageKey("nomina.periodo_id", 15), "nomina.periodo_id:15");
  assert.equal(buildCompanyScopedStorageKey("nomina.periodo_id", null), "nomina.periodo_id:global");

  const storage = new MemoryStorage();
  writeCompanyScopedStorage(storage, "nomina.periodo_id", 1, "A");
  writeCompanyScopedStorage(storage, "nomina.periodo_id", 2, "B");
  assert.equal(readCompanyScopedStorage(storage, "nomina.periodo_id", 1), "A");
  assert.equal(readCompanyScopedStorage(storage, "nomina.periodo_id", 2), "B");
  assert.equal(readCompanyScopedStorage(storage, "nomina.periodo_id", 3), null);

  writeCompanyScopedStorage(storage, "nomina.periodo_id", 1, null);
  assert.equal(readCompanyScopedStorage(storage, "nomina.periodo_id", 1), null);

  assert.equal(
    pickAvailableScopedId(
      [{ id: "10" }, { id: "20" }],
      "20",
      "10",
    ),
    "20",
  );
  assert.equal(
    pickAvailableScopedId(
      [{ id: "10" }, { id: "20" }],
      "999",
      "20",
    ),
    "20",
  );
  assert.equal(
    pickAvailableScopedId(
      [{ id: "10" }, { id: "20" }],
      "999",
      "888",
    ),
    "10",
  );
  assert.equal(pickAvailableScopedId([], "999", "888"), null);

  const companies = [{ id: 10 }, { id: 20 }];
  assert.equal(pickAuthorizedCompanyId(companies, 20, 10), 20);
  assert.equal(pickAuthorizedCompanyId(companies, 999, 20), 20);
  assert.equal(pickAuthorizedCompanyId(companies, 999, 888), 10);
  assert.equal(pickAuthorizedCompanyId([{ id: 10 }], 999, 888), 10);
  assert.equal(pickAuthorizedCompanyId([], 999, 888), null);

  console.log("companyScope helper checks passed");
}

run();
