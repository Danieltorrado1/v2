import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../../context/AuthContext';
import { useCompanyContext } from '../../../../context/CompanyContext';
import { apiClient } from '../../../../services/apiClient';
import { hasAnyPermission, mapKnownError } from './adminTabUtils';

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
  vigente_desde: string;
  vigente_hasta: string;
  salario_base: number | '';
  auxilio_transporte: number | '';
  otros_recargos: number | '';
  activo: boolean;
};

const CONTRACT_LIMIT = 100;

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
      await apiClient.post(`/company-settings/${empresaActual.id}/payroll-parameters`, compactPayload(form));
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
    return <div className="adm-empty">No tienes permiso para consultar la configuración económica de nómina.</div>;
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
                    {current.vigente_desde} – {current.vigente_hasta ?? 'abierta'}
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
                    <td>{row.vigente_desde}</td>
                    <td>{row.vigente_hasta ?? 'Abierta'}</td>
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
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('TODOS');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CategoryForm>(emptyCategoryForm);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    if (!empresaActual || !canRead) {
      setRows([]);
      setContracts([]);
      return;
    }

    try {
      const [categoriesResponse, contractsResponse] = await Promise.all([
        apiClient.get<{ data: Category[] }>(`/company-settings/${empresaActual.id}/salary-categories`),
        apiClient.get<{ data: { items: ContractOption[] } }>('/configuracion/contratos', {
          params: {
            empresa_id: empresaActual.id,
            limit: CONTRACT_LIMIT
          }
        })
      ]);

      setRows(categoriesResponse.data);
      setContracts(contractsResponse.data.items ?? []);
      setLoadError('');
    } catch (error) {
      setRows([]);
      setContracts([]);
      setLoadError(
        mapKnownError(error, 'No fue posible cargar las categorías o contratos disponibles.', {
          FORBIDDEN: 'No tienes permiso para consultar la configuración económica.',
          VALIDATION_ERROR: 'No fue posible consultar contratos con los filtros solicitados.'
        })
      );
    }
  }, [canRead, empresaActual]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const matchesState =
          active === 'TODOS' || (active === 'ACTIVOS' ? row.activo : !row.activo);
        const haystack = `${row.codigo_categoria} ${row.nombre_categoria}`.toLowerCase();
        return matchesState && haystack.includes(query.toLowerCase());
      }),
    [active, query, rows]
  );

  const setField = <T extends keyof CategoryForm>(field: T, value: CategoryForm[T]) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  };

  const closeDrawer = () => {
    setOpen(false);
    setSaveError('');
    setForm(emptyCategoryForm());
  };

  const save = async () => {
    if (!empresaActual || !canManage) {
      setSaveError('No tienes permiso para crear o corregir categorías salariales.');
      return;
    }

    if (!form.contrato_id || !form.codigo_categoria.trim() || !form.nombre_categoria.trim() || !form.vigente_desde) {
      setSaveError('Contrato, código, nombre y vigencia desde son obligatorios.');
      return;
    }

    if (form.salario_base === '' || form.auxilio_transporte === '') {
      setSaveError('Salario base y auxilio de transporte son obligatorios.');
      return;
    }

    try {
      await apiClient.post(`/company-settings/${empresaActual.id}/salary-categories`, compactPayload({
        ...form,
        contrato_id: Number(form.contrato_id),
        salario_base: Number(form.salario_base),
        auxilio_transporte: Number(form.auxilio_transporte),
        otros_recargos: form.otros_recargos === '' ? undefined : Number(form.otros_recargos)
      }));
      closeDrawer();
      await load();
    } catch (error) {
      setSaveError(
        mapKnownError(error, 'No se pudo guardar la categoría salarial.', {
          FORBIDDEN: 'No tienes permiso para crear o corregir categorías salariales.',
          CONTRACT_COMPANY_MISMATCH: 'El contrato seleccionado no pertenece a la empresa activa.',
          CATEGORY_VIGENCIA_OVERLAP: 'Ya existe una vigencia activa que se solapa para ese código.',
          VALIDATION_ERROR: 'Revisa la vigencia y los valores obligatorios antes de guardar.'
        })
      );
    }
  };

  if (!empresaActual) {
    return <div className="adm-empty">Seleccione una empresa autorizada.</div>;
  }

  if (!canRead) {
    return <div className="adm-empty">No tienes permiso para consultar la configuración económica de nómina.</div>;
  }

  return (
    <section className="nomina-economic">
      <div className="adm-card">
        <div className="nomina-section-head">
          <div>
            <h3>Categorías salariales</h3>
            <p>Valores específicos por contrato y categoría; conservan histórico.</p>
          </div>
          {canManage ? (
            <button className="adm-btn primary" onClick={() => setOpen(true)}>
              + Nueva vigencia
            </button>
          ) : null}
        </div>

        {loadError ? <p role="alert">{loadError}</p> : null}

        <div className="nomina-assignment-filters">
          <input
            placeholder="Buscar código o nombre"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="TODOS">Todas</option>
            <option value="ACTIVOS">Vigentes</option>
            <option value="INACTIVOS">Inactivas</option>
          </select>
        </div>

        <table className="adm-history">
          <thead>
            <tr>
              <th>Código / nombre</th>
              <th>Contrato</th>
              <th>Salario base</th>
              <th>Auxilio transporte</th>
              <th>Recargos adicionales</th>
              <th>Vigencia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <strong>{row.codigo_categoria}</strong>
                  <br />
                  <small>{row.nombre_categoria}</small>
                </td>
                <td>{row.numero_contrato ?? row.contrato_id}</td>
                <td>{money(row.salario_base)}</td>
                <td>{money(row.auxilio_transporte)}</td>
                <td>{money(row.otros_recargos)}</td>
                <td>
                  {row.vigente_desde} – {row.vigente_hasta ?? 'abierta'}
                </td>
                <td>
                  <span className={`adm-status ${row.activo ? 'active' : 'inactive'}`}>
                    {row.activo ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="nomina-drawer-backdrop">
          <aside className="nomina-drawer">
            <button className="nomina-close" onClick={closeDrawer}>
              ×
            </button>
            <h3>Nueva categoría/vigencia</h3>

            <label>
              Contrato
              <select
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
