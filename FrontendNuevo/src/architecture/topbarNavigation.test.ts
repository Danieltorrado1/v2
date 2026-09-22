import assert from "node:assert/strict";
import test from "node:test";
import { moduleCatalog, type ModuleEntry } from "./moduleCatalog";
import { topbarNavigation } from "./topbarNavigation";

const minimal = (code: string, route: string, children: ModuleEntry[] = []): ModuleEntry => ({
  id: code,
  code,
  label: code,
  description: "",
  icon: moduleCatalog[0].icon,
  scope: "TENANT",
  route,
  order: 0,
  permission: [],
  featureCode: code,
  legacyCodes: [],
  aliases: [],
  sections: [],
  children,
  dependencies: [],
  state: "PRODUCCION",
  version: null,
});

test("Nómina aparece después de Personal y apunta a Planilla Operativa", () => {
  const navigation = topbarNavigation([
    minimal("NOMINA", "/nomina"),
    minimal("OPERACION", "/operacion/estadisticas"),
    minimal("PERSONAL", "/personal", [minimal("PERSONAL_BASE_DATOS", "/personal/base-datos")]),
    minimal("LOGISTICA", "/logistica/estadisticas"),
    minimal("SST", "/sst"),
  ]);

  assert.deepEqual(navigation.map((item) => item.code), ["PERSONAL", "NOMINA", "OPERACION", "LOGISTICA", "SST"]);
  assert.equal(navigation.find((item) => item.code === "NOMINA")?.route, "/nomina/planilla-operativa");
});

test("Nómina es un módulo top-level del catálogo", () => {
  const nomina = moduleCatalog.find((item) => item.code === "NOMINA");
  const personal = moduleCatalog.find((item) => item.code === "PERSONAL");

  assert.equal(nomina?.route, "/nomina");
  assert.equal(personal?.children.some((child) => child.code === "NOMINA"), false);
});
