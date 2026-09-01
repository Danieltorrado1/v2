from pathlib import Path
path = Path('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaEconomicaTabs.tsx')
source = path.read_text(encoding='utf-8').replace('\r\n','\n')
old = """type AssignmentApplyResponse = {
  periodo: AssignmentPreviewResponse['periodo'];
  categoria_destino: Category | null;
  procesados: number;
  asignados: number;
  omitidos: number;
  mensaje: string;
  control: AssignmentControl;
};"""
new = """type AssignmentApplyResponse = {
  periodo: AssignmentPreviewResponse['periodo'];
  categoria_destino: Category | null;
  procesados: number;
  asignados: number;
  omitidos: number;
  mensaje: string;
  control: AssignmentControl;
};

type AssignmentModalityOption = {
  id: string | null;
  codigo: string | null;
  nombre: string | null;
  etiqueta: string;
};

type AssignmentOptionsResponse = {
  periodo: AssignmentPreviewResponse['periodo'];
  modalidades: AssignmentModalityOption[];
};

type AssignmentCountOperator = '' | 'EQ' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'BETWEEN';"""
if old not in source:
    raise SystemExit('type block not found')
source = source.replace(old, new, 1)
path.write_text(source.replace('\n','\r\n'), encoding='utf-8')
