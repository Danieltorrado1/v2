from pathlib import Path
src_path = Path('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaEconomicaTabs.tsx')
component_path = Path('tmp/salary-component.txt')
source = src_path.read_text(encoding='utf-8').replace('\r\n', '\n')
component = component_path.read_text(encoding='utf-8').replace('\r\n', '\n').lstrip('\ufeff')
marker = 'export function SalaryCategoriesTab() {'
start = source.find(marker)
if start == -1:
    raise SystemExit('marker not found')
source = source[:start] + component
src_path.write_text(source.replace('\n', '\r\n'), encoding='utf-8')
