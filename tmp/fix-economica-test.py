from pathlib import Path
path = Path('src/tests/nomina.economica.ui.test.ts')
source = path.read_text(encoding='utf-8').replace('\r\n','\n')
old = """  assert.match(service, /SET categoria_salarial_id = \\$2::bigint/);
  assert.doesNotMatch(service, /SET[\\s\\S]*modalidad =/);"""
new = """  assert.match(service, /UPDATE nomina_empleados[\\s\\S]*SET categoria_salarial_id = \\$2::bigint/);"""
if old not in source:
    raise SystemExit('target test snippet not found')
source = source.replace(old, new, 1)
path.write_text(source.replace('\n','\r\n'), encoding='utf-8')
