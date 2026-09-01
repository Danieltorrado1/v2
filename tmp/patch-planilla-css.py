from pathlib import Path
path = Path('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css')
source = path.read_text(encoding='utf-8').replace('\r\n','\n')
needle = ".op-cell.pending-attendance {\n  background: color-mix(in srgb, #2563eb 16%, transparent);\n  box-shadow: inset 0 0 0 1px #2563eb;\n}\n"
replacement = needle + "\n.op-attendance-pending-mark {\n  font-size: 13px;\n  font-weight: 800;\n  color: #1d4ed8;\n}\n"
if needle not in source:
    raise SystemExit('pending attendance block not found')
source = source.replace(needle, replacement, 1)
path.write_text(source.replace('\n','\r\n'), encoding='utf-8')
