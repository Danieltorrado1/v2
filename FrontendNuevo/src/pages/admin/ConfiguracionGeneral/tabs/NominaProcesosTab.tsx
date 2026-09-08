import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiClient } from '../../../../services/apiClient';
import { configuracionApi } from '../../../../services/configuracionApi';
import { useCompanyContext } from '../../../../context/CompanyContext';
import type { Contrato } from '../../../../types/configuracion.types';
import {
  PayrollParametersTab,
  SalaryCategoriesTab,
  TurnShiftRatesTab,
} from './NominaEconomicaTabs';

type Process = 'COBERTURA' | 'ASISTENCIA' | 'OPS';

type Responsibility = {
  id: string;
  contrato_id?: string | null;
  proceso: Process;
  activo: boolean;
  municipio_ids: number[];
  area_ids: number[];
};

type Area = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number | null;
};

type Municipality = {
  id: number;
  label?: string;
  nombre_municipio?: string;
  nombre?: string;
  departamento_id?: number;
};

type Department = {
  id: number;
  label?: string;
  nombre?: string;
};

type AssignableUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  roles: string[];
  empresaIds: number[];
};

type NominaConfigTab =
  | 'asignaciones'
  | 'parametros'
  | 'tarifas-turnos'
  | 'categorias'
  | 'areas';

const processes: Process[] = ['COBERTURA', 'ASISTENCIA', 'OPS'];
const MUNICIPALITY_PAGE_SIZE = 100;

const municipalityName = (municipality: Municipality): string =>
  municipality.label ?? municipality.nombre_municipio ?? municipality.nombre ?? '';

const municipalityId = (value: number | string): number => Number(value);

async function loadAllMunicipalities(): Promise<Municipality[]> {
  const firstPage = await configuracionApi.listarMunicipios({
    page: 1,
    limit: MUNICIPALITY_PAGE_SIZE,
  });
  const totalPages = Math.max(1, firstPage.pagination?.total_pages ?? 1);

  if (totalPages === 1) {
    return firstPage.items ?? [];
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      configuracionApi.listarMunicipios({
        page: index + 2,
        limit: MUNICIPALITY_PAGE_SIZE,
      }),
    ),
  );

  const municipalities = [
    ...(firstPage.items ?? []),
    ...remainingPages.flatMap((page) => page.items ?? []),
  ];

  return Array.from(
    new Map(municipalities.map((municipality) => [municipality.id, municipality])).values(),
  );
}

async function loadAllDepartments(): Promise<Department[]> {
  const firstPage = await configuracionApi.listarDepartamentos({
    page: 1,
    limit: MUNICIPALITY_PAGE_SIZE,
  });
  const totalPages = Math.max(1, firstPage.pagination?.total_pages ?? 1);
  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      configuracionApi.listarDepartamentos({
        page: index + 2,
        limit: MUNICIPALITY_PAGE_SIZE,
      }),
    ),
  );
  const departments = [
    ...(firstPage.items ?? []),
    ...remainingPages.flatMap((page) => page.items ?? []),
  ];
  return Array.from(new Map(departments.map((department) => [department.id, department])).values());
}

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export function NominaProcesosTab({ initialTab = 'asignaciones' }: { initialTab?: NominaConfigTab } = {}) {
  const { empresaActual } = useCompanyContext();

  const [tab, setTab] = useState<NominaConfigTab>(initialTab);

  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [contracts, setContracts] = useState<Contrato[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [responsibilities, setResponsibilities] = useState<
    Record<string, Responsibility[]>
  >({});

  const [areas, setAreas] = useState<Area[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [selected, setSelected] = useState<AssignableUser | null>(null);
  const [selectedProcesses, setSelectedProcesses] = useState<Process[]>([]);
  const [municipalityIds, setMunicipalityIds] = useState<number[]>([]);
  const [visibleMunicipalityIds, setVisibleMunicipalityIds] = useState<number[]>([]);
  const [areaIds, setAreaIds] = useState<number[]>([]);

  const [search, setSearch] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);

  const [processFilter, setProcessFilter] = useState<'TODOS' | Process>(
    'TODOS',
  );

  const [stateFilter, setStateFilter] = useState<
    'ACTIVO' | 'SIN_ASIGNACION' | 'TODOS'
  >('TODOS');

  const [drawer, setDrawer] = useState(false);
  const [areaModal, setAreaModal] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [areaName, setAreaName] = useState('');
  const [message, setMessage] = useState('');

  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!empresaActual) {
      return;
    }

    setUsersLoading(true);
    setUsersError('');
    setCatalogError('');

    try {
      const [usersResult, areaResult, municipalityResult, departmentResult, contractsResult] = await Promise.allSettled([
        apiClient.get<{ data: AssignableUser[] }>(
          '/nomina/procesos/usuarios-asignables',
          {
            params: {
              empresa_id: empresaActual.id,
            },
          },
        ),

        apiClient.get<{ data: Area[] }>('/nomina/procesos/areas', {
          params: {
            empresa_id: empresaActual.id,
          },
        }),

        loadAllMunicipalities(),
        loadAllDepartments(),
        configuracionApi.listarContratos({ empresa_id: empresaActual.id, activo: true, page: 1, limit: 100 }),
      ]);

      if (usersResult.status === 'rejected') {
        throw usersResult.reason;
      }

      const companyUsers = usersResult.value.data.filter((user) => user.active);
      const companyContracts = contractsResult.status === 'fulfilled'
        ? contractsResult.value.items ?? []
        : [];
      const resolvedContractId = selectedContractId && companyContracts.some((contract) => contract.id === selectedContractId)
        ? selectedContractId
        : companyContracts[0]?.id ?? null;
      setContracts(companyContracts);
      setSelectedContractId(resolvedContractId);

      const responsibilityResults = resolvedContractId
        ? await Promise.allSettled(
            companyUsers.map(async (user) => {
          const response = await apiClient.get<{ data: Responsibility[] }>(
            '/nomina/procesos/responsabilidades',
            {
              params: {
                usuario_id: user.id,
                empresa_id: empresaActual.id,
                contrato_id: resolvedContractId,
              },
            },
          );

          const normalized = response.data.map((row) => ({
            ...row,
            municipio_ids: (row.municipio_ids ?? [])
              .map(municipalityId)
              .filter(Number.isInteger),
            area_ids: (row.area_ids ?? [])
              .map(Number)
              .filter(Number.isInteger),
          }));

          return [user.id, normalized] as const;
            }),
          )
        : [];

      const rows = responsibilityResults.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );

      const failedResources = [
        contractsResult.status === 'rejected' ? 'contratos' : null,
        areaResult.status === 'rejected' ? 'áreas' : null,
        municipalityResult.status === 'rejected' ? 'municipios' : null,
        departmentResult.status === 'rejected' ? 'departamentos' : null,
        responsibilityResults.some((result) => result.status === 'rejected')
          ? 'responsabilidades'
          : null,
        !resolvedContractId ? 'contrato activo' : null,
      ].filter((resource): resource is string => Boolean(resource));

      setUsers(companyUsers);
      setAreas(areaResult.status === 'fulfilled' ? areaResult.value.data : []);
      setMunicipalities(
        municipalityResult.status === 'fulfilled' ? municipalityResult.value : [],
      );
      setDepartments(
        departmentResult.status === 'fulfilled' ? departmentResult.value : [],
      );
      setResponsibilities(Object.fromEntries(rows));

      if (failedResources.length > 0) {
        setCatalogError(`No fue posible cargar ${failedResources.join(', ')}. Los usuarios sí fueron cargados; intenta recargar.`);
      }
    } catch (error) {
      console.error('No fue posible cargar la configuración de nómina', error);

      setUsers([]);
      setResponsibilities({});

      setUsersError(
        error instanceof Error
          ? error.message
          : 'Error inesperado del servidor.',
      );
      setCatalogError('No fue posible cargar los usuarios.');
    } finally {
      setUsersLoading(false);
    }
  }, [empresaActual, selectedContractId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const open = async (user: AssignableUser) => {
    if (!empresaActual || !selectedContractId) {
      setAssignmentError('Selecciona un contrato activo antes de asignar un usuario.');
      return;
    }

    setAssignmentError('');
    setSelected(user);

    try {
      const [responsibilityResponse, scopeResponse] = await Promise.all([
        apiClient.get<{ data: Responsibility[] }>(
          '/nomina/procesos/responsabilidades',
          { params: { usuario_id: user.id, empresa_id: empresaActual.id, contrato_id: selectedContractId } },
        ),
        apiClient.get<{ data: { municipios_visibles_ids: number[]; municipios_nomina_ids: number[] } }>(
          '/nomina/procesos/alcance-municipal',
          { params: { usuario_id: user.id, empresa_id: empresaActual.id, contrato_id: selectedContractId } },
        ),
      ]);
      const rows = responsibilityResponse.data.map((row) => ({
        ...row,
        municipio_ids: (row.municipio_ids ?? []).map(municipalityId),
        area_ids: (row.area_ids ?? []).map(Number),
      }));
      setResponsibilities((current) => ({ ...current, [user.id]: rows }));
      const scope = scopeResponse.data;

      setSelectedProcesses(rows.filter((row) => row.activo).map((row) => row.proceso));

      const existingMunicipalityIds = (scope.municipios_nomina_ids.length > 0
        ? scope.municipios_nomina_ids
        : (rows.find((row) => row.proceso === 'COBERTURA')?.municipio_ids ?? []))
        .map(municipalityId)
        .filter(Number.isInteger);
      setMunicipalityIds(existingMunicipalityIds);
      setVisibleMunicipalityIds([...new Set(scope.municipios_visibles_ids.map(municipalityId).concat(existingMunicipalityIds))]);
      const existingDepartment = municipalities.find((item) => existingMunicipalityIds.includes(item.id))?.departamento_id;
      setSelectedDepartmentId(existingDepartment ?? null);

      setAreaIds(rows.find((row) => row.proceso === 'ASISTENCIA')?.area_ids ?? []);
      setPickerSearch('');
      setMunicipalitySearch('');
      setDrawer(true);
    } catch (error) {
      console.error('No fue posible cargar las asignaciones del usuario', error);
      setAssignmentError('No fue posible cargar las asignaciones territoriales. Intenta recargar.');
    }
  };

  const start = () => {
    setSelected(null);
    setSelectedProcesses([]);
    setMunicipalityIds([]);
    setVisibleMunicipalityIds([]);
    setSelectedDepartmentId(null);
    setAreaIds([]);
    setPickerSearch('');
    setMunicipalitySearch('');
    setDrawer(true);
  };

  const save = async () => {
    if (!empresaActual || !selected || !selectedContractId) {
      return;
    }

    setSaving(true);
    setAssignmentError('');
    try {
      await Promise.all(
      [
        ...processes.map((proceso) => apiClient.put('/nomina/procesos/responsabilidades', {
          usuario_id: selected.id,
          empresa_id: empresaActual.id,
          contrato_id: selectedContractId,
          proceso,

          municipio_ids:
            proceso === 'COBERTURA' &&
            selectedProcesses.includes(proceso)
              ? [...new Set(municipalityIds.map(municipalityId).filter(Number.isInteger))]
              : [],

          area_ids:
            proceso === 'ASISTENCIA' &&
            selectedProcesses.includes(proceso)
              ? areaIds
              : [],
        })),
        apiClient.put('/nomina/procesos/alcance-municipal', {
          usuario_id: selected.id,
          empresa_id: empresaActual.id,
          municipios_visibles_ids: [...new Set(visibleMunicipalityIds.concat(municipalityIds))],
        }),
      ],
    );

      setDrawer(false);
      setMessage('Asignación guardada correctamente.');

      await reload();
    } catch (error) {
      console.error('No fue posible guardar las asignaciones', error);
      setAssignmentError('No fue posible guardar las asignaciones. Verifica el contrato y los permisos.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (user: AssignableUser) => {
    if (
      !empresaActual ||
      !selectedContractId ||
      !window.confirm(
        'Este usuario dejará de tener asignaciones operativas de nómina para esta empresa.',
      )
    ) {
      return;
    }

    await Promise.all(
      processes.map((proceso) =>
        apiClient.put('/nomina/procesos/responsabilidades', {
          usuario_id: user.id,
          empresa_id: empresaActual.id,
          contrato_id: selectedContractId,
          proceso,
          municipio_ids: [],
          area_ids: [],
        }),
      ),
    );

    setMessage('Asignación retirada correctamente.');

    await reload();
  };

  const saveArea = async () => {
    if (!empresaActual || !areaName.trim()) {
      return;
    }

    if (editingArea) {
      await apiClient.patch(`/nomina/procesos/areas/${editingArea.id}`, {
        nombre: areaName.trim(),
      });
    } else {
      await apiClient.post('/nomina/procesos/areas', {
        empresa_id: empresaActual.id,
        codigo: slug(areaName),
        nombre: areaName.trim(),
      });
    }

    setAreaModal(false);
    setAreaName('');
    setEditingArea(null);

    await reload();
  };

  const visible = users.filter((user) => {
    const active = (responsibilities[user.id] ?? []).filter(
      (row) => row.activo,
    );

    const matchesSearch = `${user.name} ${user.email}`
      .toLowerCase()
      .includes(search.toLowerCase());

    if (!matchesSearch) {
      return false;
    }

    if (
      processFilter !== 'TODOS' &&
      !active.some((row) => row.proceso === processFilter)
    ) {
      return false;
    }

    if (stateFilter === 'TODOS') {
      return true;
    }

    if (stateFilter === 'ACTIVO') {
      return active.length > 0;
    }

    return active.length === 0;
  });

  const pickerUsers = useMemo(
    () =>
      users
        .filter((user) =>
          `${user.name} ${user.email}`
            .toLowerCase()
            .includes(pickerSearch.toLowerCase()),
        )
        .slice(0, 10),
    [users, pickerSearch],
  );

  const shownMunicipalities = municipalities.filter((item) =>
    item.departamento_id === selectedDepartmentId &&
    municipalityName(item)
      .toLowerCase()
      .includes(municipalitySearch.toLowerCase()),
  );

  const assignmentLabel = (row: Responsibility) => {
    if (row.proceso === 'OPS') {
      return 'Sin alcance adicional';
    }

    if (row.proceso === 'COBERTURA') {
      return row.municipio_ids
        .map((id) => {
          const municipality = municipalities.find(
            (item) => item.id === id,
          );

          return municipality ? municipalityName(municipality) : undefined;
        })
        .filter(Boolean)
        .join(' · ');
    }

    return row.area_ids
      .map(
        (id) =>
          areas.find((item) => Number(item.id) === id)?.nombre,
      )
      .filter(Boolean)
      .join(' · ');
  };

  if (!empresaActual) {
    return (
      <div className="adm-empty">
        Seleccione una empresa autorizada.
      </div>
    );
  }

  return (
    <div className="nomina-config">
      <div className="adm-card">
        <h2>Configuración de Nómina</h2>

        <p>
          Empresa activa:{' '}
          <strong>{empresaActual.nombre_empresa}</strong>
        </p>

        <label className="adm-field" style={{ maxWidth: 420 }}>
          <span className="adm-label">Contrato de asignación</span>
          <select
            className="adm-select"
            value={selectedContractId ?? ''}
            onChange={(event) => {
              setDrawer(false);
              setSelected(null);
              setMunicipalityIds([]);
              setVisibleMunicipalityIds([]);
              setSelectedProcesses([]);
              setSelectedContractId(event.target.value ? Number(event.target.value) : null);
            }}
          >
            <option value="">Seleccione un contrato</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.numero_contrato || `Contrato ${contract.id}`}
              </option>
            ))}
          </select>
        </label>

        <div className="cg-cat-tabs">
          <button
            className={tab === 'asignaciones' ? 'active' : ''}
            onClick={() => setTab('asignaciones')}
          >
            ASIGNACIONES DE NÓMINA
          </button>

          <button
            className={tab === 'parametros' ? 'active' : ''}
            onClick={() => setTab('parametros')}
          >
            PARÁMETROS ECONÓMICOS
          </button>

          <button
            className={tab === 'tarifas-turnos' ? 'active' : ''}
            onClick={() => setTab('tarifas-turnos')}
          >
            TARIFAS DE TURNOS
          </button>

          <button
            className={tab === 'categorias' ? 'active' : ''}
            onClick={() => setTab('categorias')}
          >
            CATEGORÍAS SALARIALES
          </button>

          <button
            className={tab === 'areas' ? 'active' : ''}
            onClick={() => setTab('areas')}
          >
            ÁREAS
          </button>
        </div>
      </div>

      {tab === 'parametros' && <PayrollParametersTab />}

      {tab === 'tarifas-turnos' && <TurnShiftRatesTab />}

      {tab === 'categorias' && <SalaryCategoriesTab />}

      {tab === 'asignaciones' && (
        <div className="adm-card">
          <div className="nomina-section-head">
            <div>
              <h3>Asignaciones</h3>
              <p>¿Quién va a gestionar qué?</p>
            </div>

            <button
              className="adm-btn primary"
              onClick={start}
            >
              + Asignar usuario
            </button>
          </div>

          {catalogError ? <p role="alert">{catalogError}</p> : null}

          <div className="nomina-assignment-filters">
            <input
              placeholder="Buscar por nombre o correo..."
              aria-label="Buscar por nombre o correo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              aria-label="Proceso"
              value={processFilter}
              onChange={(event) =>
                setProcessFilter(
                  event.target.value as typeof processFilter,
                )
              }
            >
              <option value="TODOS">
                Todos los procesos
              </option>

              {processes.map((item) => (
                <option key={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              aria-label="Estado"
              value={stateFilter}
              onChange={(event) =>
                setStateFilter(
                  event.target.value as typeof stateFilter,
                )
              }
            >
              <option value="ACTIVO">
                Activo
              </option>

              <option value="SIN_ASIGNACION">
                Sin asignación
              </option>

              <option value="TODOS">
                Todos
              </option>
            </select>
          </div>

          <div className="nomina-assignment-table">
            <div className="nomina-assignment-head">
              <span>USUARIO / ROL</span>
              <span>PROCESO</span>
              <span>ASIGNACIÓN</span>
              <span>ESTADO</span>
              <span>ACCIÃ“N</span>
            </div>

            {visible.map((user) => {
              const active = (
                responsibilities[user.id] ?? []
              ).filter((row) => row.activo);

              return (
                <div
                  className="nomina-assignment-row"
                  key={user.id}
                >
                  <span className="nomina-assignment-user">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                    <small>{user.roles.length ? user.roles.map((role) => role.replace(/_/g, ' ')).join(' · ') : 'Sin rol'}</small>
                  </span>

                  <span className="nomina-process-chips">
                    {active.map((row) => (
                      <b key={row.proceso}>
                        {row.proceso}
                      </b>
                    ))}
                  </span>

                  <span className="nomina-assignment-scope">
                    {active
                      .map(assignmentLabel)
                      .filter(Boolean)
                      .join(' / ') || 'Sin asignar'}
                  </span>

                  <span className={active.length ? 'nomina-assignment-status-badge active' : 'nomina-assignment-status-badge'}>
                    {active.length
                      ? 'Activo'
                      : 'Sin asignación'}
                  </span>

                  <span>
                    <button
                      className="adm-btn ghost sm"
                      onClick={() => open(user)}
                    >
                      Editar
                    </button>

                    {active.length > 0 && (
                      <button
                        className="adm-btn ghost sm"
                        onClick={() => void remove(user)}
                      >
                        Quitar asignación
                      </button>
                    )}
                  </span>
                </div>
              );
            })}

            {!usersLoading && !usersError && visible.length === 0 ? (
              <div className="nomina-assignment-empty">
                No se encontraron usuarios con los filtros actuales.
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'areas' && (
        <div className="adm-card">
          <div className="nomina-section-head">
            <div>
              <h3>Áreas de asistencia</h3>
              <p>
                Configuración secundaria para ASISTENCIA.
              </p>
            </div>

            <button
              className="adm-btn primary"
              onClick={() => {
                setEditingArea(null);
                setAreaName('');
                setAreaModal(true);
              }}
            >
              + Nueva área
            </button>
          </div>

          <table className="adm-history">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {areas.map((area) => (
                <tr key={area.id}>
                  <td>{area.nombre}</td>

                  <td>
                    {area.activo ? 'Activa' : 'Inactiva'}
                  </td>

                  <td>
                    <button
                      className="adm-btn ghost sm"
                      onClick={() => {
                        setEditingArea(area);
                        setAreaName(area.nombre);
                        setAreaModal(true);
                      }}
                    >
                      Editar
                    </button>

                    <button
                      className="adm-btn ghost sm"
                      onClick={() =>
                        void apiClient
                          .patch(
                            `/nomina/procesos/areas/${area.id}`,
                            {
                              activo: !area.activo,
                            },
                          )
                          .then(reload)
                      }
                    >
                      {area.activo
                        ? 'Desactivar'
                        : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <div className="nomina-drawer-backdrop">
          <aside className="nomina-drawer nomina-assignment-drawer">
            <button
              className="nomina-close"
              onClick={() => setDrawer(false)}
            >
              ×
            </button>

            <div className="nomina-drawer-header">
            <h3>
              {selected
                ? 'Editar asignación'
                : 'Asignar usuario'}
            </h3>
            <p>Configura los procesos y el alcance operativo del usuario para el contrato seleccionado.</p>
            <strong>{contracts.find((contract) => contract.id === selectedContractId)?.numero_contrato ?? 'Sin contrato'}</strong>
            </div>

            <div className="nomina-drawer-content">
            <label>
              Usuario

              <input
                placeholder="Buscar usuario por nombre o correo..."
                value={
                  selected
                    ? `${selected.name} · ${selected.email}`
                    : pickerSearch
                }
                readOnly={Boolean(selected)}
                onChange={(event) =>
                  setPickerSearch(event.target.value)
                }
              />
            </label>

            {!selected && usersLoading ? (
              <p>Cargando usuarios...</p>
            ) : null}

            {!selected && usersError ? (
              <p role="alert">
                No fue posible cargar los usuarios:{' '}
                {usersError}
              </p>
            ) : null}

            {selected && assignmentError ? (
              <p role="alert">{assignmentError}</p>
            ) : null}

            {!selected &&
            !usersLoading &&
            !usersError &&
            pickerUsers.length === 0 ? (
              <p>
                No hay usuarios disponibles para esta empresa.
              </p>
            ) : null}

            {!selected ? (
              pickerUsers.map((user) => (
                <button
                  className="nomina-user-option"
                  key={user.id}
                  onClick={() => open(user)}
                >
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                  <small>{user.roles.length ? user.roles.map((role) => role.replace(/_/g, ' ')).join(' · ') : 'Sin rol'}</small>
                </button>
              ))
            ) : (
              <>
                <div className="nomina-selected-user-summary">
                  <strong>USUARIO SELECCIONADO</strong>
                  <span>Rol: {selected.roles.length ? selected.roles.join(' · ') : 'Sin rol'}</span>
                  <span>Empresa: {empresaActual.nombre_empresa}</span>
                  <span>Contrato: {contracts.find((contract) => contract.id === selectedContractId)?.numero_contrato ?? selectedContractId}</span>
                </div>
                <AssignmentForm
                selectedProcesses={selectedProcesses}
                setSelectedProcesses={setSelectedProcesses}
                municipalityIds={municipalityIds}
                setMunicipalityIds={setMunicipalityIds}
                visibleMunicipalityIds={visibleMunicipalityIds}
                setVisibleMunicipalityIds={setVisibleMunicipalityIds}
                areaIds={areaIds}
                setAreaIds={setAreaIds}
                municipalities={shownMunicipalities}
                departmentMunicipalities={municipalities.filter((item) => item.departamento_id === selectedDepartmentId)}
                departments={departments}
                selectedDepartmentId={selectedDepartmentId}
                setSelectedDepartmentId={setSelectedDepartmentId}
                areas={areas}
                municipalitySearch={municipalitySearch}
                setMunicipalitySearch={
                  setMunicipalitySearch
                }
                onSave={() => void save()}
                onCancel={() => setDrawer(false)}
                saveDisabled={saving || Boolean(assignmentError) || !selectedContractId || departments.length === 0 || municipalities.length === 0}
                />
              </>
            )}
            </div>
          </aside>
        </div>
      )}

      {areaModal && (
        <div className="nomina-drawer-backdrop">
          <div className="nomina-modal">
            <h3>
              {editingArea ? 'Editar área' : 'Nueva área'}
            </h3>

            <label>
              Nombre del área

              <input
                autoFocus
                value={areaName}
                onChange={(event) =>
                  setAreaName(event.target.value)
                }
              />
            </label>

            <button
              className="adm-btn primary"
              onClick={() => void saveArea()}
            >
              Guardar
            </button>

            <button
              className="adm-btn ghost"
              onClick={() => setAreaModal(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function AssignmentForm(props: {
  selectedProcesses: Process[];
  setSelectedProcesses: React.Dispatch<
    React.SetStateAction<Process[]>
  >;
  municipalityIds: number[];
  setMunicipalityIds: React.Dispatch<
    React.SetStateAction<number[]>
  >;
  visibleMunicipalityIds: number[];
  setVisibleMunicipalityIds: React.Dispatch<React.SetStateAction<number[]>>;
  areaIds: number[];
  setAreaIds: React.Dispatch<
    React.SetStateAction<number[]>
  >;
  municipalities: Municipality[];
  departmentMunicipalities: Municipality[];
  departments: Department[];
  selectedDepartmentId: number | null;
  setSelectedDepartmentId: (value: number | null) => void;
  areas: Area[];
  municipalitySearch: string;
  setMunicipalitySearch: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveDisabled: boolean;
}) {
  const departmentMunicipalityIds = props.departmentMunicipalities.map((item) => item.id);
  const updateDepartmentSelection = (ids: number[]): void => {
    props.setMunicipalityIds((current) => [
      ...new Set([...current.filter((id) => !departmentMunicipalityIds.includes(id)), ...ids]),
    ]);
    if (ids.length > 0) {
      props.setVisibleMunicipalityIds((current) => [...new Set([...current, ...ids])]);
    }
  };

  const updateVisibleSelection = (ids: number[]) =>
    props.setVisibleMunicipalityIds((current) => [
      ...new Set([
        ...current.filter((id) => !departmentMunicipalityIds.includes(id)),
        ...ids,
      ]),
    ]);

  const toggleProcess = (
    process: Process,
    checked: boolean,
  ) =>
    props.setSelectedProcesses((current) =>
      checked
        ? [...current, process]
        : current.filter((item) => item !== process),
    );

  return (
    <>
      <fieldset className="nomina-process-selector">
        <legend>¿Qué proceso gestionará?</legend>

        {processes.map((process) => (
          <label className="nomina-process-card" key={process}>
            <input
              type="checkbox"
              checked={props.selectedProcesses.includes(
                process,
              )}
              onChange={(event) =>
                toggleProcess(
                  process,
                  event.target.checked,
                )
              }
            />

            <span>
              <strong>{process}</strong>
              <small>
                {process === 'COBERTURA'
                  ? 'AsignaciÃ³n por municipios'
                  : process === 'ASISTENCIA'
                    ? 'AsignaciÃ³n por Ã¡reas'
                    : 'Alcance operativo segÃºn configuraciÃ³n'}
              </small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="nomina-scope-fieldset nomina-visibility-fieldset">
        <legend>Municipios visibles en plataforma</legend>
        <label className="nomina-department-field">
          Departamento
          <select value={props.selectedDepartmentId ?? ''} onChange={(event) => props.setSelectedDepartmentId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Seleccionar departamento</option>
            {props.departments.map((department) => <option key={department.id} value={department.id}>{department.label ?? department.nombre}</option>)}
          </select>
        </label>
        {props.selectedDepartmentId === null ? <p className="nomina-scope-empty">Selecciona un departamento para ver sus municipios.</p> : <>
          <div className="nomina-scope-summary"><strong>{props.visibleMunicipalityIds.length} municipio{props.visibleMunicipalityIds.length === 1 ? '' : 's'} visible{props.visibleMunicipalityIds.length === 1 ? '' : 's'}</strong><span>Puede consultar información territorial</span></div>
          <input placeholder="Buscar municipio" value={props.municipalitySearch} onChange={(event) => props.setMunicipalitySearch(event.target.value)} />
          <div className="nomina-scope-tools"><button type="button" onClick={() => updateVisibleSelection(departmentMunicipalityIds)}>Seleccionar todos</button><button type="button" onClick={() => updateVisibleSelection([])}>Limpiar</button></div>
          <div className="nomina-scope-grid">
            {props.municipalities.map((item) => {
              const requiredByNomina = props.municipalityIds.includes(item.id);
              return <label className="nomina-scope-option" key={`visible-${item.id}`} title={requiredByNomina ? 'Este municipio está asignado a Nómina y debe permanecer visible.' : undefined}>
                <input type="checkbox" checked={props.visibleMunicipalityIds.includes(item.id)} disabled={requiredByNomina} onChange={(event) => props.setVisibleMunicipalityIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} />
                <span title={municipalityName(item)}>{municipalityName(item)}</span>
              </label>;
            })}
          </div>
          {props.municipalities.length === 0 && <p className="nomina-scope-empty">No hay municipios que coincidan con la búsqueda.</p>}
        </>}
      </fieldset>

      {props.selectedProcesses.includes('COBERTURA') && (
        <fieldset className="nomina-scope-fieldset">
          <legend>RESPONSABLE DE NÓMINA</legend>
          <label className="nomina-department-field">
            Departamento
            <select
              value={props.selectedDepartmentId ?? ''}
              onChange={(event) =>
                props.setSelectedDepartmentId(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">Seleccionar departamento</option>
              {props.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.label ?? department.nombre}
                </option>
              ))}
            </select>
          </label>

          <h4 className="nomina-scope-subheading">Municipios a cargo de Nómina</h4>

          {props.selectedDepartmentId === null ? (
            <p className="nomina-scope-empty">Selecciona un departamento para ver sus municipios.</p>
          ) : (
          <div className="nomina-scope-summary">
            <strong>
              {props.municipalityIds.length} municipio{props.municipalityIds.length === 1 ? '' : 's'} seleccionado{props.municipalityIds.length === 1 ? '' : 's'}
            </strong>
            <span>Define el alcance territorial de COBERTURA</span>
          </div>
          )}

          {props.selectedDepartmentId !== null && <input
            placeholder="Buscar municipio..."
            value={props.municipalitySearch}
            onChange={(event) =>
              props.setMunicipalitySearch(
                event.target.value,
              )
            }
          />}

          {props.selectedDepartmentId !== null && <div className="nomina-scope-tools">
            <button
              type="button"
              onClick={() =>
                updateDepartmentSelection(departmentMunicipalityIds)
              }
            >
              Seleccionar todos
            </button>

            <button
              type="button"
              onClick={() =>
                updateDepartmentSelection([])
              }
            >
              Limpiar selección
            </button>
          </div>}

          {props.selectedDepartmentId !== null && <div className="nomina-scope-grid">
              {props.municipalities.map((item) => (
            <label className="nomina-scope-option" key={item.id}>
              <input
                type="checkbox"
                checked={props.municipalityIds.includes(
                  item.id,
                )}
                onChange={(event) => {
                  props.setMunicipalityIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, item.id])]
                      : current.filter((id) => id !== item.id),
                  );
                  if (event.target.checked) {
                    props.setVisibleMunicipalityIds((current) => [...new Set([...current, item.id])]);
                  }
                }}
              />

              <span title={municipalityName(item)}>{municipalityName(item)}</span>
            </label>
          ))}
          </div>}

          {props.selectedDepartmentId !== null && props.municipalities.length === 0 && (
            <p className="nomina-scope-empty">
              {props.municipalitySearch
                ? 'No hay municipios que coincidan con la búsqueda.'
                : 'Este departamento no tiene municipios en el catálogo.'}
            </p>
          )}
        </fieldset>
      )}

      {props.selectedProcesses.includes(
        'ASISTENCIA',
      ) && (
        <fieldset className="nomina-scope-fieldset">
          <legend>
            Áreas que puede gestionar
          </legend>

          <div className="nomina-scope-summary">
            <strong>{props.areaIds.length} Ã¡rea{props.areaIds.length === 1 ? '' : 's'} seleccionada{props.areaIds.length === 1 ? '' : 's'}</strong>
            <span>Define el alcance de ASISTENCIA</span>
          </div>

          {props.areas
            .filter((item) => item.activo)
            .map((item) => (
              <label className="nomina-scope-option" key={item.id}>
                <input
                  type="checkbox"
                  checked={props.areaIds.includes(
                    Number(item.id),
                  )}
                  onChange={(event) =>
                    props.setAreaIds((current) =>
                      event.target.checked
                        ? [
                            ...current,
                            Number(item.id),
                          ]
                        : current.filter(
                            (id) =>
                              id !== Number(item.id),
                          ),
                    )
                  }
                />

                <span>{item.nombre}</span>
              </label>
            ))}
        </fieldset>
      )}

      {props.selectedProcesses.includes('OPS') && (
        <p className="nomina-ops-note">
          Este usuario podrá gestionar el proceso OPS de la empresa.
        </p>
      )}

      <div className="nomina-drawer-actions">
        <button
          type="button"
          className="adm-btn ghost"
          onClick={props.onCancel}
        >
          Cancelar
        </button>

        <button
          type="button"
          className="adm-btn primary"
          onClick={props.onSave}
          disabled={props.saveDisabled}
        >
          Guardar asignación
        </button>
      </div>

      {props.selectedProcesses.length === 0 && (
        <p>
          Sin asignación de nómina. No tendrá procesos operativos
          asignados para esta empresa.
        </p>
      )}
    </>
  );
}
