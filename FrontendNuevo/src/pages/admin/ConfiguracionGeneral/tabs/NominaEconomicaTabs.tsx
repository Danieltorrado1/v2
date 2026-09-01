import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../../context/AuthContext';
import { useCompanyContext } from '../../../../context/CompanyContext';
import { apiClient } from '../../../../services/apiClient';
import { getNominaPeriodos } from '../../../../services/nominaApi';
import type { NominaPeriodoApi } from '../../../../types/nomina.types';
import { formatDate, hasAnyPermission, mapKnownError, toNullableText } from './adminTabUtils';

type Parameter = {
  id: number | string;
  vigente_desde: string;
  vigente_hasta?: string | null;
  salario_minimo?: number | string | null;
  auxilio_transporte?: number | string | null;
};

type ContractOption = {
  id: number | string;
  numero_contrato?: string | null;
};

type Category = {
  id: number | string;
  contrato_id: number | string;
  numero_contrato?: string | null;
  codigo_categoria: string;
  nombre_categoria: string;
  modalidad?: string | null;
  descripcion?: string | null;
  salario_base: number | string;
  auxilio_transporte: number | string;
  otros_recargos?: number | string | null;
  vigente_desde: string;
  vigente_hasta?: string | null;
  activo: boolean;
};

type ParameterForm = {
  vigente_desde: string;
  vigente_hasta: string;
  salario_minimo: number | '';
  auxilio_transporte: number | '';
  regla_redondeo: 'NEAREST' | 'FLOOR' | 'CEIL' | 'NONE';
};

type CategoryForm = {
  contrato_id: string;
  codigo_categoria: string;
  nombre_categoria: string;
  modalidad: string;
  descripcion: string;
  vigente_desde: string;
  vigente_hasta: string;
  salario_base: number | '';
  auxilio_transporte: number | '';
  otros_recargos: number | '';
  activo: boolean;
};

type AssignmentCurrentCategory = {
  id: string;
  codigo_categoria: string | null;
  nombre_categoria: string | null;
};

type AssignmentPreviewItem = {
  nomina_empleado_id: string;
  vinculacion_id: string;
  persona_id: string;
  nombre_completo: string;
  numero_documento: string | null;
  cargo: string | null;
  contrato_cargo_id: string | null;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  modalidad_codigo: string | null;
  metodo_pago: string | null;
  estado_vinculacion: string | null;
  aplica_cobertura: boolean;
  institucion_sede_count: number;
  categoria_salarial_actual: AssignmentCurrentCategory | null;
};

type AssignmentControl = {
  categorias_usadas: number;
  con_categoria: number;
  inconsistencias: string[];
  sin_categoria: number;
  sin_contexto_operativo: number;
  total_empleados: number;
};

type AssignmentPreviewResponse = {
  periodo: {
    id: string;
    contrato_id: string;
    nombre_periodo: string;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    estado: string;
    numero_contrato: string | null;
  };
  categoria_destino: Category | null;
  resumen: {
    total_encontrados: number;
    instituciones: number;
    sedes: number;
    salario_base: number | string | null;
    auxilio_transporte: number | string | null;
    otros_recargos: number | string | null;
  };
  items: AssignmentPreviewItem[];
  sql_reference: string;
};

type AssignmentApplyResponse = {
  periodo: AssignmentPreviewResponse['periodo'];
  categoria_destino: Category | null;
  procesados: number;
  asignados: number;
  omitidos: number;
  mensaje: string;
  control: AssignmentControl;
};

const CONTRACT_LIMIT = 100;
const PERIOD_LIMIT = 100;
const ASSIGNMENT_LIMIT = 1000;

const money = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? '—'
    : new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
      }).format(Number(value));

const emptyParameterForm = (): ParameterForm => ({
  vigente_desde: '',
  vigente_hasta: '',
  salario_minimo: '',
  auxilio_transporte: '',
  regla_redondeo: 'NEAREST'
});

const emptyCategoryForm = (): CategoryForm => ({
  contrato_id: '',
  codigo_categoria: '',
  nombre_categoria: '',
  modalidad: '',
  descripcion: '',
  vigente_desde: '',
  vigente_hasta: '',
  salario_base: '',
  auxilio_transporte: '',
  otros_recargos: '',
  activo: true
});

const normalizeNumberInput = (value: string): number | '' =>
  value.trim() === '' ? '' : Number(value);

const compactPayload = (input: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== '' && value !== undefined)
  );

const mapCategoryToForm = (category: Category): CategoryForm => ({
  contrato_id: String(category.contrato_id),
  codigo_categoria: category.codigo_categoria,
  nombre_categoria: category.nombre_categoria,
  modalidad: category.modalidad ?? '',
  descripcion: category.descripcion ?? '',
  vigente_desde: category.vigente_desde,
  vigente_hasta: category.vigente_hasta ?? '',
  salario_base: Number(category.salario_base),
  auxilio_transporte: Number(category.auxilio_transporte),
  otros_recargos:
    category.otros_recargos === null || category.otros_recargos === undefined
      ? ''
      : Number(category.otros_recargos),
  activo: category.activo
});

const describeCategory = (
  category:
    | Pick<Category, 'codigo_categoria' | 'nombre_categoria'>
    | AssignmentCurrentCategory
    | null
    | undefined
): string => {
  if (!category) {
    return 'Retirar categoría';
  }

  return `${category.codigo_categoria ?? 'SIN-CODIGO'} · ${category.nombre_categoria ?? 'Sin nombre'}`;
};

const describeInconsistency = (code: string): string => {
  switch (code) {
    case 'EMPLEADOS_SIN_CONTEXTO_OPERATIVO':
      return 'Hay trabajadores sin institución o sede vigente en el periodo.';
    case 'CATEGORIAS_FUERA_DE_VIGENCIA':
      return 'Hay categorías asignadas fuera de la vigencia del periodo.';
    default:
      return code;
  }
};

const periodOptionLabel = (period: NominaPeriodoApi): string => {
  const contractLabel = period.contrato?.numero_contrato ?? period.contrato_id ?? 'Sin contrato';
  return `${period.nombre_periodo} · ${period.estado} · ${contractLabel}`;
};

const buildCategoryPayload = (form: CategoryForm) =>
  compactPayload({
    nombre_categoria: form.nombre_categoria.trim(),
    modalidad: toNullableText(form.modalidad),
    descripcion: toNullableText(form.descripcion),
    vigente_desde: form.vigente_desde,
    vigente_hasta: toNullableText(form.vigente_hasta),
    salario_base: Number(form.salario_base),
    auxilio_transporte: Number(form.auxilio_transporte),
    otros_recargos: form.otros_recargos === '' ? undefined : Number(form.otros_recargos),
    activo: form.activo
  });

export function PayrollParametersTab() {
  const { user } = useAuth();
  const { empresaActual } = useCompanyContext();
  const permissions = user?.permissions ?? [];
  const canRead = hasAnyPermission(permissions, ['nomina.economico.read']);
  const canManage = hasAnyPermission(permissions, ['nomina.parametros.manage']);

  const [rows, setRows] = useState<Parameter[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ParameterForm>(emptyParameterForm);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    if (!empresaActual || !canRead) {
      setRows([]);
      return;
    }

    try {
      const response = await apiClient.get<{ data: Parameter[] }>(
        `/company-settings/${empresaActual.id}/payroll-parameters`
      );
      setRows(response.data);
      setLoadError('');
    } catch (error) {
      setRows([]);
      setLoadError(
        mapKnownError(error, 'No fue posible cargar los parámetros económicos.', {
          FORBIDDEN: 'No tienes permiso para consultar los parámetros económicos.'
        })
      );
    }
  }, [canRead, empresaActual]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = rows[0];

  const setField = <T extends keyof ParameterForm>(field: T, value: ParameterForm[T]) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  };

  const closeDrawer = () => {
    setOpen(false);
    setSaveError('');
    setForm(emptyParameterForm());
  };

  const save = async () => {
    if (!empresaActual || !canManage) {
      setSaveError('No tienes permiso para crear o versionar parámetros económicos.');
      return;
    }

    if (!form.vigente_desde) {
      setSaveError('La vigencia desde es obligatoria.');
      return;
    }

    try {
      await apiClient.post(
        `/company-settings/${empresaActual.id}/payroll-parameters`,
        compactPayload(form)
      );
      closeDrawer();
      await load();
    } catch (error) {
      setSaveError(
        mapKnownError(error, 'No se pudo guardar la vigencia económica.', {
          FORBIDDEN: 'No tienes permiso para crear o versionar parámetros económicos.',
          VALIDATION_ERROR: 'Revisa la vigencia y los valores enviados antes de guardar.'
        })
      );
    }
  };

  if (!empresaActual) {
    return <div className="adm-empty">Seleccione una empresa autorizada.</div>;
  }

  if (!canRead) {
    return (
      <div className="adm-empty">
        No tienes permiso para consultar la configuración económica de nómina.
      </div>
    );
  }

  return (
    <section className="nomina-economic">
      <div className="adm-card">
        <div className="nomina-section-head">
          <div>
            <h3>Parámetros base</h3>
            <p>Referencias generales de empresa; no sobrescriben valores específicos de categoría.</p>
          </div>
          {canManage ? (
            <button className="adm-btn primary" onClick={() => setOpen(true)}>
              + Nueva vigencia
            </button>
          ) : null}
        </div>

        {loadError ? <p role="alert">{loadError}</p> : null}

        {current ? (
          <>
            <div className="nomina-economic-grid">
              <div>
                <h4>Referencia general</h4>
                <p>
                  Salario mínimo/base <strong>{money(current.salario_minimo)}</strong>
                </p>
                <p>
                  Auxilio de transporte de referencia <strong>{money(current.auxilio_transporte)}</strong>
                </p>
                <p>
                  Vigencia{' '}
                  <strong>
                    {formatDate(current.vigente_desde)} – {current.vigente_hasta ? formatDate(current.vigente_hasta) : 'abierta'}
                  </strong>
                </p>
              </div>
              <div>
                <p className="nomina-config-note">
                  El salario y auxilio de una categoría prevalecen para el cálculo operativo.
                  Esta referencia no sincroniza ni modifica categorías.
                </p>
              </div>
            </div>

            <h4>Historial</h4>
            <table className="adm-history">
              <thead>
                <tr>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Salario base</th>
                  <th>Auxilio referencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{formatDate(row.vigente_desde)}</td>
                    <td>{row.vigente_hasta ? formatDate(row.vigente_hasta) : 'Abierta'}</td>
                    <td>{money(row.salario_minimo)}</td>
                    <td>{money(row.auxilio_transporte)}</td>
                    <td>
                      <span className="adm-status active">Vigente</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p>No hay parámetros configurados.</p>
        )}
      </div>

      {open ? (
        <div className="nomina-drawer-backdrop">
          <aside className="nomina-drawer">
            <button className="nomina-close" onClick={closeDrawer}>
              ×
            </button>
            <h3>Nueva vigencia base</h3>

            <label>
              Vigencia desde
              <input
                type="date"
                value={form.vigente_desde}
                onChange={(event) => setField('vigente_desde', event.target.value)}
              />
            </label>

            <label>
              Vigencia hasta
              <input
                type="date"
                value={form.vigente_hasta}
                onChange={(event) => setField('vigente_hasta', event.target.value)}
              />
            </label>

            <label>
              Salario mínimo/base
              <input
                type="number"
                value={form.salario_minimo}
                onChange={(event) => setField('salario_minimo', normalizeNumberInput(event.target.value))}
              />
            </label>

            <label>
              Auxilio de transporte de referencia
              <input
                type="number"
                value={form.auxilio_transporte}
                onChange={(event) => setField('auxilio_transporte', normalizeNumberInput(event.target.value))}
              />
            </label>

            {saveError ? <p role="alert">{saveError}</p> : null}

            <div className="nomina-drawer-actions">
              <button className="adm-btn ghost" onClick={closeDrawer}>
                Cancelar
              </button>
              <button className="adm-btn primary" onClick={() => void save()}>
                Guardar vigencia
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export function SalaryCategoriesTab() {
  const { user } = useAuth();
  const { empresaActual } = useCompanyContext();
  const permissions = user?.permissions ?? [];
  const canRead = hasAnyPermission(permissions, ['nomina.economico.read']);
  const canManage = hasAnyPermission(permissions, ['nomina.categorias.manage']);

  const [rows, setRows] = useState<Category[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [periods, setPeriods] = useState<NominaPeriodoApi[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('TODOS');
  const [open, setOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyCategoryForm);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [assignmentCategoryId, setAssignmentCategoryId] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentCargo, setAssignmentCargo] = useState('');
  const [assignmentMunicipio, setAssignmentMunicipio] = useState('');
  const [assignmentInstitucion, setAssignmentInstitucion] = useState('');
  const [assignmentSede, setAssignmentSede] = useState('');
  const [assignmentMethod, setAssignmentMethod] = useState('');
  const [assignmentObservation, setAssignmentObservation] = useState('');
  const [withoutCategoryOnly, setWithoutCategoryOnly] = useState(false);
  const [preview, setPreview] = useState<AssignmentPreviewResponse | null>(null);
  const [assignmentControl, setAssignmentControl] = useState<AssignmentControl | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  const load = useCallback(async () => {
    if (!empresaActual || !canRead) {
      setRows([]);
      setContracts([]);
      setPeriods([]);
      setSelectedPeriodId('');
      return;
    }

    try {
      const [categoriesResponse, contractsResponse, periodsResponse] = await Promise.all([
        apiClient.get<{ data: Category[] }>(`/company-settings/${empresaActual.id}/salary-categories`),
        apiClient.get<{ data: { items: ContractOption[] } }>('/configuracion/contratos', {
          params: {
            empresa_id: empresaActual.id,
            limit: CONTRACT_LIMIT
          }
        }),
        getNominaPeriodos({
          empresa_id: String(empresaActual.id),
          limit: PERIOD_LIMIT
        })
      ]);

      const nextPeriods = periodsResponse.items ?? [];
      setRows(categoriesResponse.data);
      setContracts(contractsResponse.data.items ?? []);
      setPeriods(nextPeriods);
      setSelectedPeriodId((current) => {
        if (nextPeriods.some((period) => String(period.id) === current)) {
          return current;
        }

        return nextPeriods.find((period) => period.estado === 'ABIERTO')?.id ?? nextPeriods[0]?.id ?? '';
      });
      setLoadError('');
    } catch (error) {
      setRows([]);
      setContracts([]);
      setPeriods([]);
      setLoadError(
        mapKnownError(error, 'No fue posible cargar categorías, contratos o periodos.', {
          FORBIDDEN: 'No tienes permiso para consultar la configuración económica.',
          VALIDATION_ERROR: 'No fue posible consultar los datos con los filtros solicitados.'
        })
      );
    }
  }, [canRead, empresaActual]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPeriod = useMemo(
    () => periods.find((period) => String(period.id) === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const matchesState =
          active === 'TODOS' || (active === 'ACTIVOS' ? row.activo : !row.activo);
        const haystack = `${row.codigo_categoria} ${row.nombre_categoria} ${row.numero_contrato ?? ''}`.toLowerCase();
        return matchesState && haystack.includes(query.toLowerCase());
      }),
    [active, query, rows]
  );

  const assignableCategories = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.activo &&
          (!selectedPeriod?.contrato_id || String(row.contrato_id) === String(selectedPeriod.contrato_id))
      ),
    [rows, selectedPeriod]
  );

  useEffect(() => {
    if (
      assignmentCategoryId &&
      !assignableCategories.some((row) => String(row.id) === assignmentCategoryId)
    ) {
      setAssignmentCategoryId('');
    }
  }, [assignmentCategoryId, assignableCategories]);

  useEffect(() => {
    setPreview(null);
    setAssignmentControl(null);
    setSelectedEmployeeIds([]);
    setAssignmentError('');
    setAssignmentMessage('');
  }, [selectedPeriodId]);

  const selectedTargetCategory = useMemo(
    () =>
      assignableCategories.find((row) => String(row.id) === assignmentCategoryId) ??
      rows.find((row) => String(row.id) === assignmentCategoryId) ??
      null,
    [assignmentCategoryId, assignableCategories, rows]
  );

  const allPreviewSelected =
    preview !== null &&
    preview.items.length > 0 &&
    selectedEmployeeIds.length === preview.items.length;

  const isEditing = editingCategoryId !== null;

  const setField = <T extends keyof CategoryForm>(field: T, value: CategoryForm[T]) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  };

  const openCreateDrawer = () => {
    setEditingCategoryId(null);
    setForm(emptyCategoryForm());
    setSaveError('');
    setOpen(true);
  };

  const openEditDrawer = (category: Category) => {
    setEditingCategoryId(String(category.id));
    setForm(mapCategoryToForm(category));
    setSaveError('');
    setOpen(true);
  };

  const closeDrawer = () => {
    setOpen(false);
    setEditingCategoryId(null);
    setSaveError('');
    setForm(emptyCategoryForm());
  };

  const save = async () => {
    if (!empresaActual || !canManage) {
      setSaveError('No tienes permiso para crear o corregir categorías salariales.');
      return;
    }

    if (!form.nombre_categoria.trim() || !form.vigente_desde) {
      setSaveError('Nombre y vigencia desde son obligatorios.');
      return;
    }

    if (!isEditing && (!form.contrato_id || !form.codigo_categoria.trim())) {
      setSaveError('Contrato y código son obligatorios para crear una categoría.');
      return;
    }

    if (form.salario_base === '' || form.auxilio_transporte === '') {
      setSaveError('Salario base y auxilio de transporte son obligatorios.');
      return;
    }

    try {
      const payload = buildCategoryPayload(form);

      if (isEditing && editingCategoryId) {
        await apiClient.patch(
          `/company-settings/${empresaActual.id}/salary-categories/${editingCategoryId}`,
          payload
        );
      } else {
        await apiClient.post(
          `/company-settings/${empresaActual.id}/salary-categories`,
          compactPayload({
            ...payload,
            contrato_id: Number(form.contrato_id),
            codigo_categoria: form.codigo_categoria.trim()
          })
        );
      }

      closeDrawer();
      await load();
    } catch (error) {
      setSaveError(
        mapKnownError(
          error,
          isEditing
            ? 'No se pudo corregir la categoría salarial.'
            : 'No se pudo guardar la categoría salarial.',
          {
            FORBIDDEN: 'No tienes permiso para crear o corregir categorías salariales.',
            CONTRACT_COMPANY_MISMATCH: 'El contrato seleccionado no pertenece a la empresa activa.',
            CATEGORY_VIGENCIA_OVERLAP: 'Ya existe una vigencia activa que se solapa para ese código.',
            CATEGORY_NOT_FOUND: 'La categoría seleccionada ya no existe.',
            VALIDATION_ERROR: 'Revisa la vigencia y los valores obligatorios antes de guardar.'
          }
        )
      );
    }
  };

  const loadPreview = useCallback(
    async (preserveMessage = false) => {
      if (!empresaActual || !canRead) {
        setAssignmentError('No tienes permiso para consultar la asignación de categorías.');
        return null;
      }

      if (!selectedPeriodId) {
        setAssignmentError('Selecciona un periodo antes de previsualizar.');
        return null;
      }

      setPreviewLoading(true);
      setAssignmentError('');
      if (!preserveMessage) {
        setAssignmentMessage('');
      }

      try {
        const response = await apiClient.post<{ data: AssignmentPreviewResponse }>(
          `/company-settings/${empresaActual.id}/salary-categories/assignments/preview`,
          compactPayload({
            periodo_id: Number(selectedPeriodId),
            target_category_id: assignmentCategoryId ? Number(assignmentCategoryId) : null,
            search: toNullableText(assignmentSearch),
            cargo: toNullableText(assignmentCargo),
            municipio: toNullableText(assignmentMunicipio),
            institucion: toNullableText(assignmentInstitucion),
            sede: toNullableText(assignmentSede),
            metodo_pago: toNullableText(assignmentMethod),
            without_category: withoutCategoryOnly || undefined,
            limit: ASSIGNMENT_LIMIT
          })
        );

        const nextPreview = response.data;
        setPreview(nextPreview);
        setSelectedEmployeeIds(nextPreview.items.map((item) => item.nomina_empleado_id));
        if (!preserveMessage) {
          setAssignmentMessage(
            nextPreview.items.length > 0
              ? `Previsualización cargada con ${nextPreview.items.length} trabajadores.`
              : 'No se encontraron trabajadores con los filtros actuales.'
          );
        }
        return nextPreview;
      } catch (error) {
        setPreview(null);
        setSelectedEmployeeIds([]);
        setAssignmentError(
          mapKnownError(error, 'No se pudo construir la previsualización.', {
            FORBIDDEN: 'No tienes permiso para consultar la asignación de categorías.',
            CATEGORY_PERIOD_CONTRACT_MISMATCH:
              'La categoría destino no pertenece al contrato del periodo seleccionado.',
            VALIDATION_ERROR: 'Revisa periodo, categoría y filtros antes de continuar.'
          })
        );
        return null;
      } finally {
        setPreviewLoading(false);
      }
    },
    [
      assignmentCargo,
      assignmentCategoryId,
      assignmentInstitucion,
      assignmentMethod,
      assignmentMunicipio,
      assignmentSearch,
      assignmentSede,
      canRead,
      empresaActual,
      selectedPeriodId,
      withoutCategoryOnly
    ]
  );

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((value) => value !== employeeId)
        : [...current, employeeId]
    );
  };

  const applyAssignment = async () => {
    if (!empresaActual || !canManage) {
      setAssignmentError('No tienes permiso para aplicar asignaciones de categorías.');
      return;
    }

    if (!selectedPeriodId) {
      setAssignmentError('Selecciona un periodo antes de aplicar cambios.');
      return;
    }

    if (selectedEmployeeIds.length === 0) {
      setAssignmentError('Selecciona al menos un trabajador de la previsualización.');
      return;
    }

    setApplyLoading(true);
    setAssignmentError('');

    try {
      const response = await apiClient.post<{ data: AssignmentApplyResponse }>(
        `/company-settings/${empresaActual.id}/salary-categories/assignments/apply`,
        compactPayload({
          periodo_id: Number(selectedPeriodId),
          target_category_id: assignmentCategoryId ? Number(assignmentCategoryId) : null,
          nomina_empleado_ids: selectedEmployeeIds.map((value) => Number(value)),
          observacion: toNullableText(assignmentObservation)
        })
      );

      setAssignmentControl(response.data.control);
      setAssignmentMessage(response.data.mensaje);
      await load();
      await loadPreview(true);
    } catch (error) {
      setAssignmentError(
        mapKnownError(error, 'No se pudo aplicar la asignación de categorías.', {
          FORBIDDEN: 'No tienes permiso para aplicar asignaciones de categorías.',
          CATEGORY_ASSIGNMENT_SELECTION_REQUIRED:
            'Selecciona al menos un trabajador antes de aplicar cambios.',
          CATEGORY_ASSIGNMENT_INVALID_SELECTION:
            'La selección ya no coincide con el periodo actual. Refresca la previsualización.',
          CATEGORY_ASSIGNMENT_PERIODO_CERRADO:
            'El periodo debe permanecer abierto para asignar categorías.',
          CATEGORY_PERIOD_CONTRACT_MISMATCH:
            'La categoría destino no pertenece al contrato del periodo seleccionado.'
        })
      );
    } finally {
      setApplyLoading(false);
    }
  };

  if (!empresaActual) {
    return <div className="adm-empty">Seleccione una empresa autorizada.</div>;
  }

  if (!canRead) {
    return (
      <div className="adm-empty">
        No tienes permiso para consultar la configuración económica de nómina.
      </div>
    );
  }

  return (
    <section className="nomina-economic">
      <div className="adm-card">
        <div className="nomina-section-head">
          <div>
            <h3>Categorías salariales</h3>
            <p>Valores específicos por contrato y categoría, con histórico y corrección versionada.</p>
          </div>
          {canManage ? (
            <button className="adm-btn primary" onClick={openCreateDrawer}>
              + Nueva vigencia
            </button>
          ) : null}
        </div>

        {loadError ? <p role="alert">{loadError}</p> : null}

        <div className="nomina-assignment-filters">
          <input
            placeholder="Buscar código, nombre o contrato"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="TODOS">Todas</option>
            <option value="ACTIVOS">Vigentes</option>
            <option value="INACTIVOS">Inactivas</option>
          </select>
        </div>

        <div className="cg-table-wrap">
          <table className="adm-history">
            <thead>
              <tr>
                <th>Código / nombre</th>
                <th>Contrato</th>
                <th>Modalidad</th>
                <th>Salario base</th>
                <th>Auxilio transporte</th>
                <th>Recargos adicionales</th>
                <th>Vigencia</th>
                <th>Estado</th>
                {canManage ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8}>No hay categorías que coincidan con el filtro actual.</td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={String(row.id)} className={row.activo ? 'cg-row-active' : undefined}>
                    <td>
                      <div className="cg-primary-cell">{row.codigo_categoria}</div>
                      <div className="cg-secondary-cell">{row.nombre_categoria}</div>
                    </td>
                    <td>{row.numero_contrato ?? row.contrato_id}</td>
                    <td>{row.modalidad ?? 'Todas'}</td>
                    <td>{money(row.salario_base)}</td>
                    <td>{money(row.auxilio_transporte)}</td>
                    <td>{money(row.otros_recargos)}</td>
                    <td>
                      {formatDate(row.vigente_desde)} –{' '}
                      {row.vigente_hasta ? formatDate(row.vigente_hasta) : 'abierta'}
                    </td>
                    <td>
                      <span className={`adm-status ${row.activo ? 'active' : 'inactive'}`}>
                        {row.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    {canManage ? (
                      <td>
                        <button className="adm-btn ghost sm" onClick={() => openEditDrawer(row)}>
                          Corregir
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="adm-card">
        <div className="nomina-section-head">
          <div>
            <h3>Asignación operativa de categorías</h3>
            <p>
              Filtra trabajadores del periodo, previsualiza el alcance y aplica la categoría manual
              antes de recalcular nómina.
            </p>
          </div>
          <button
            className="adm-btn secondary"
            disabled={!selectedPeriodId || previewLoading}
            onClick={() => void loadPreview()}
          >
            {previewLoading ? 'Cargando...' : 'Previsualizar selección'}
          </button>
        </div>

        <div className="adm-form-grid cols-3">
          <div className="adm-field">
            <label className="adm-label">Periodo</label>
            <select
              className="adm-select"
              value={selectedPeriodId}
              onChange={(event) => setSelectedPeriodId(event.target.value)}
            >
              <option value="">Seleccione</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {periodOptionLabel(period)}
                </option>
              ))}
            </select>
          </div>

          <div className="adm-field">
            <label className="adm-label">Categoría destino</label>
            <select
              className="adm-select"
              value={assignmentCategoryId}
              onChange={(event) => setAssignmentCategoryId(event.target.value)}
            >
              <option value="">Retirar categoría</option>
              {assignableCategories.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {describeCategory(row)}
                </option>
              ))}
            </select>
          </div>

          <div className="adm-field">
            <label className="adm-label">Observación de auditoría</label>
            <input
              className="adm-input"
              placeholder="Motivo visible en auditoría"
              value={assignmentObservation}
              onChange={(event) => setAssignmentObservation(event.target.value)}
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Buscar trabajador</label>
            <input
              className="adm-input"
              placeholder="Nombre, documento o código"
              value={assignmentSearch}
              onChange={(event) => setAssignmentSearch(event.target.value)}
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Cargo</label>
            <input
              className="adm-input"
              placeholder="Filtrar por cargo"
              value={assignmentCargo}
              onChange={(event) => setAssignmentCargo(event.target.value)}
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Municipio</label>
            <input
              className="adm-input"
              placeholder="Filtrar por municipio"
              value={assignmentMunicipio}
              onChange={(event) => setAssignmentMunicipio(event.target.value)}
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Institución</label>
            <input
              className="adm-input"
              placeholder="Filtrar por institución"
              value={assignmentInstitucion}
              onChange={(event) => setAssignmentInstitucion(event.target.value)}
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Sede</label>
            <input
              className="adm-input"
              placeholder="Filtrar por sede"
              value={assignmentSede}
              onChange={(event) => setAssignmentSede(event.target.value)}
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Método de pago</label>
            <input
              className="adm-input"
              placeholder="COBERTURA, ASISTENCIA u otro"
              value={assignmentMethod}
              onChange={(event) => setAssignmentMethod(event.target.value)}
            />
          </div>
        </div>

        <label className="cg-checkbox-row">
          <input
            checked={withoutCategoryOnly}
            onChange={(event) => setWithoutCategoryOnly(event.target.checked)}
            type="checkbox"
          />
          Mostrar solo trabajadores sin categoría salarial actual.
        </label>

        {selectedPeriod ? (
          <div className="adm-notice info" role="status">
            Periodo activo para asignación: <strong>{selectedPeriod.nombre_periodo}</strong> · contrato{' '}
            <strong>{selectedPeriod.contrato?.numero_contrato ?? selectedPeriod.contrato_id ?? 'Sin contrato'}</strong> ·
            vigencia <strong>{formatDate(selectedPeriod.fecha_inicio)}</strong> a{' '}
            <strong>{formatDate(selectedPeriod.fecha_fin)}</strong>.
          </div>
        ) : null}

        {!selectedTargetCategory && selectedPeriod ? (
          <div className="adm-notice warning" role="status">
            La acción actual retirará la categoría salarial de los trabajadores seleccionados.
          </div>
        ) : null}

        {selectedTargetCategory ? (
          <div className="adm-notice info" role="status">
            Categoría destino: <strong>{describeCategory(selectedTargetCategory)}</strong> · salario base{' '}
            <strong>{money(selectedTargetCategory.salario_base)}</strong> · auxilio{' '}
            <strong>{money(selectedTargetCategory.auxilio_transporte)}</strong>.
          </div>
        ) : null}

        {assignmentError ? (
          <div className="adm-notice warning" role="alert">
            {assignmentError}
          </div>
        ) : null}

        {assignmentMessage ? (
          <div className="adm-notice info" role="status">
            {assignmentMessage}
          </div>
        ) : null}

        {preview ? (
          <>
            <div className="adm-kpi-row">
              <div className="adm-kpi neutral">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Trabajadores encontrados</span>
                  <strong className="adm-kpi-val">{preview.resumen.total_encontrados}</strong>
                </div>
              </div>
              <div className="adm-kpi info">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Instituciones cubiertas</span>
                  <strong className="adm-kpi-val">{preview.resumen.instituciones}</strong>
                </div>
              </div>
              <div className="adm-kpi info">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Sedes cubiertas</span>
                  <strong className="adm-kpi-val">{preview.resumen.sedes}</strong>
                </div>
              </div>
              <div className="adm-kpi primary">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Seleccionados</span>
                  <strong className="adm-kpi-val">{selectedEmployeeIds.length}</strong>
                </div>
              </div>
            </div>

            <div className="adm-form-actions with-test">
              <span className="cg-secondary-cell">
                SQL ref: {preview.sql_reference}. Recalcula el periodo después de terminar las asignaciones.
              </span>
              <div className="cg-actions">
                <button
                  className="adm-btn ghost"
                  onClick={() => setSelectedEmployeeIds(preview.items.map((item) => item.nomina_empleado_id))}
                >
                  Seleccionar todo
                </button>
                <button className="adm-btn ghost" onClick={() => setSelectedEmployeeIds([])}>
                  Limpiar selección
                </button>
                <button
                  className="adm-btn primary"
                  disabled={!canManage || applyLoading || selectedEmployeeIds.length === 0}
                  onClick={() => void applyAssignment()}
                >
                  {applyLoading
                    ? 'Aplicando...'
                    : assignmentCategoryId
                      ? 'Asignar categoría seleccionada'
                      : 'Retirar categoría'}
                </button>
              </div>
            </div>

            <div className="cg-table-wrap">
              <table className="adm-history">
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="Seleccionar todos los trabajadores"
                        checked={allPreviewSelected}
                        onChange={(event) =>
                          setSelectedEmployeeIds(
                            event.target.checked
                              ? preview.items.map((item) => item.nomina_empleado_id)
                              : []
                          )
                        }
                        type="checkbox"
                      />
                    </th>
                    <th>Trabajador</th>
                    <th>Cargo</th>
                    <th>Ubicación</th>
                    <th>Categoría actual</th>
                    <th>Contexto</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((item) => {
                    const checked = selectedEmployeeIds.includes(item.nomina_empleado_id);
                    return (
                      <tr key={item.nomina_empleado_id} className={checked ? 'cg-row-selected' : undefined}>
                        <td>
                          <input
                            aria-label={`Seleccionar ${item.nombre_completo}`}
                            checked={checked}
                            onChange={() => toggleEmployee(item.nomina_empleado_id)}
                            type="checkbox"
                          />
                        </td>
                        <td>
                          <div className="cg-primary-cell">{item.nombre_completo}</div>
                          <div className="cg-secondary-cell">{item.numero_documento ?? 'Sin documento'}</div>
                        </td>
                        <td>{item.cargo ?? 'Sin cargo'}</td>
                        <td>
                          <div className="cg-primary-cell">{item.municipio ?? 'Sin municipio'}</div>
                          <div className="cg-secondary-cell">
                            {item.institucion ?? 'Sin institución'} · {item.sede ?? 'Sin sede'}
                          </div>
                        </td>
                        <td>
                          {item.categoria_salarial_actual ? (
                            <>
                              <div className="cg-primary-cell">
                                {item.categoria_salarial_actual.codigo_categoria ?? 'SIN-CODIGO'}
                              </div>
                              <div className="cg-secondary-cell">
                                {item.categoria_salarial_actual.nombre_categoria ?? 'Sin nombre'}
                              </div>
                            </>
                          ) : (
                            'Sin categoría'
                          )}
                        </td>
                        <td>
                          <div className="cg-primary-cell">{item.metodo_pago ?? 'Sin método'}</div>
                          <div className="cg-secondary-cell">
                            {item.modalidad ?? 'Sin modalidad'} · {item.estado_vinculacion ?? 'Sin estado'} ·{' '}
                            {item.aplica_cobertura ? 'Con cobertura' : 'Sin cobertura'} · {item.institucion_sede_count} sedes
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="cg-secondary-cell">
            Selecciona periodo, categoría y filtros; luego usa <strong>Previsualizar selección</strong>.
          </p>
        )}

        {assignmentControl ? (
          <>
            <h4>Control posterior a la asignación</h4>
            <div className="adm-kpi-row">
              <div className="adm-kpi neutral">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Total empleados</span>
                  <strong className="adm-kpi-val">{assignmentControl.total_empleados}</strong>
                </div>
              </div>
              <div className="adm-kpi success">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Con categoría</span>
                  <strong className="adm-kpi-val">{assignmentControl.con_categoria}</strong>
                </div>
              </div>
              <div className="adm-kpi warning">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Sin categoría</span>
                  <strong className="adm-kpi-val">{assignmentControl.sin_categoria}</strong>
                </div>
              </div>
              <div className="adm-kpi info">
                <div className="adm-kpi-body">
                  <span className="adm-kpi-lbl">Categorías usadas</span>
                  <strong className="adm-kpi-val">{assignmentControl.categorias_usadas}</strong>
                </div>
              </div>
            </div>

            {assignmentControl.inconsistencias.length > 0 ? (
              <div className="adm-notice warning" role="alert">
                {assignmentControl.inconsistencias.map(describeInconsistency).join(' ')}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {open ? (
        <div className="nomina-drawer-backdrop">
          <aside className="nomina-drawer">
            <button className="nomina-close" onClick={closeDrawer}>
              ×
            </button>
            <h3>{isEditing ? 'Corregir categoría / vigencia' : 'Nueva categoría / vigencia'}</h3>

            <label>
              Contrato
              <select
                disabled={isEditing}
                value={form.contrato_id}
                onChange={(event) => setField('contrato_id', event.target.value)}
              >
                <option value="">Seleccione</option>
                {contracts.map((contract) => (
                  <option key={String(contract.id)} value={String(contract.id)}>
                    {contract.numero_contrato ?? contract.id}
                  </option>
                ))}
              </select>
            </label>

            {contracts.length === 0 ? <p>No hay contratos válidos para la empresa seleccionada.</p> : null}

            <label>
              Código
              <input
                disabled={isEditing}
                type="text"
                value={form.codigo_categoria}
                onChange={(event) => setField('codigo_categoria', event.target.value)}
              />
            </label>

            <label>
              Nombre
              <input
                type="text"
                value={form.nombre_categoria}
                onChange={(event) => setField('nombre_categoria', event.target.value)}
              />
            </label>

            <label>
              Modalidad
              <input
                type="text"
                value={form.modalidad}
                onChange={(event) => setField('modalidad', event.target.value)}
              />
            </label>

            <label>
              Descripción
              <textarea
                value={form.descripcion}
                onChange={(event) => setField('descripcion', event.target.value)}
              />
            </label>

            <label>
              Desde
              <input
                type="date"
                value={form.vigente_desde}
                onChange={(event) => setField('vigente_desde', event.target.value)}
              />
            </label>

            <label>
              Hasta
              <input
                type="date"
                value={form.vigente_hasta}
                onChange={(event) => setField('vigente_hasta', event.target.value)}
              />
            </label>

            <label>
              Salario base
              <input
                type="number"
                value={form.salario_base}
                onChange={(event) => setField('salario_base', normalizeNumberInput(event.target.value))}
              />
            </label>

            <label>
              Auxilio transporte
              <input
                type="number"
                value={form.auxilio_transporte}
                onChange={(event) => setField('auxilio_transporte', normalizeNumberInput(event.target.value))}
              />
            </label>

            <label>
              Recargos adicionales mensuales
              <input
                type="number"
                value={form.otros_recargos}
                onChange={(event) => setField('otros_recargos', normalizeNumberInput(event.target.value))}
              />
            </label>

            <label className="cg-checkbox-row">
              <input
                checked={form.activo}
                onChange={(event) => setField('activo', event.target.checked)}
                type="checkbox"
              />
              Mantener categoría activa
            </label>

            {saveError ? <p role="alert">{saveError}</p> : null}

            <div className="nomina-drawer-actions">
              <button className="adm-btn ghost" onClick={closeDrawer}>
                Cancelar
              </button>
              <button className="adm-btn primary" onClick={() => void save()}>
                {isEditing ? 'Guardar corrección' : 'Guardar vigencia'}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
