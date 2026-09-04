import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiClient } from '../../../../services/apiClient';
import { configuracionApi } from '../../../../services/configuracionApi';
import { useCompanyContext } from '../../../../context/CompanyContext';
import {
  PayrollParametersTab,
  SalaryCategoriesTab,
  TurnShiftRatesTab,
} from './NominaEconomicaTabs';

type Process = 'COBERTURA' | 'ASISTENCIA' | 'OPS';

type Responsibility = {
  id: string;
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

export function NominaProcesosTab() {
  const { empresaActual } = useCompanyContext();

  const [tab, setTab] = useState<NominaConfigTab>('asignaciones');

  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [responsibilities, setResponsibilities] = useState<
    Record<string, Responsibility[]>
  >({});

  const [areas, setAreas] = useState<Area[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [selected, setSelected] = useState<AssignableUser | null>(null);
  const [selectedProcesses, setSelectedProcesses] = useState<Process[]>([]);
  const [municipalityIds, setMunicipalityIds] = useState<number[]>([]);
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

  const reload = useCallback(async () => {
    if (!empresaActual) {
      return;
    }

    setUsersLoading(true);
    setUsersError('');

    try {
      const [usersResult, areaResult, municipalityResult, departmentResult] = await Promise.allSettled([
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
      ]);

      if (usersResult.status === 'rejected') {
        throw usersResult.reason;
      }

      const companyUsers = usersResult.value.data.filter((user) => user.active);

      const responsibilityResults = await Promise.allSettled(
        companyUsers.map(async (user) => {
          const response = await apiClient.get<{ data: Responsibility[] }>(
            '/nomina/procesos/responsabilidades',
            {
              params: {
                usuario_id: user.id,
                empresa_id: empresaActual.id,
              },
            },
          );

          return [user.id, response.data] as const;
        }),
      );

      const rows = responsibilityResults.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );

      const secondaryErrors = [areaResult, municipalityResult, departmentResult, ...responsibilityResults]
        .some((result) => result.status === 'rejected');

      setUsers(companyUsers);
      setAreas(areaResult.status === 'fulfilled' ? areaResult.value.data : []);
      setMunicipalities(
        municipalityResult.status === 'fulfilled' ? municipalityResult.value : [],
      );
      setDepartments(
        departmentResult.status === 'fulfilled' ? departmentResult.value : [],
      );
      setResponsibilities(Object.fromEntries(rows));

      if (secondaryErrors) {
        setUsersError('Usuarios cargados. Algunas asignaciones o catálogos no pudieron actualizarse; intente recargar.');
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
    } finally {
      setUsersLoading(false);
    }
  }, [empresaActual]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const open = (user: AssignableUser) => {
    const rows = responsibilities[user.id] ?? [];

    setSelected(user);

    setSelectedProcesses(
      rows.filter((row) => row.activo).map((row) => row.proceso),
    );

    setMunicipalityIds(
      rows.find((row) => row.proceso === 'COBERTURA')?.municipio_ids ?? [],
    );
    const existingMunicipalityIds = rows.find((row) => row.proceso === 'COBERTURA')?.municipio_ids ?? [];
    const existingDepartment = municipalities.find((item) => existingMunicipalityIds.includes(item.id))?.departamento_id;
    setSelectedDepartmentId(existingDepartment ?? null);

    setAreaIds(
      rows.find((row) => row.proceso === 'ASISTENCIA')?.area_ids ?? [],
    );

    setPickerSearch('');
    setDrawer(true);
  };

  const start = () => {
    setSelected(null);
    setSelectedProcesses([]);
    setMunicipalityIds([]);
    setSelectedDepartmentId(null);
    setAreaIds([]);
    setPickerSearch('');
    setDrawer(true);
  };

  const save = async () => {
    if (!empresaActual || !selected) {
      return;
    }

    await Promise.all(
      processes.map((proceso) =>
        apiClient.put('/nomina/procesos/responsabilidades', {
          usuario_id: selected.id,
          empresa_id: empresaActual.id,
          proceso,

          municipio_ids:
            proceso === 'COBERTURA' &&
            selectedProcesses.includes(proceso)
              ? municipalityIds
              : [],

          area_ids:
            proceso === 'ASISTENCIA' &&
            selectedProcesses.includes(proceso)
              ? areaIds
              : [],
        }),
      ),
    );

    setDrawer(false);
    setMessage('Asignación guardada correctamente.');

    await reload();
  };

  const remove = async (user: AssignableUser) => {
    if (
      !empresaActual ||
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
    (item.nombre_municipio ?? item.nombre ?? '')
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

          return municipality?.nombre_municipio ?? municipality?.nombre;
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

        <div className="cg-cat-tabs">
          <button
            className={tab === 'asignaciones' ? 'active' : ''}
            onClick={() => setTab('asignaciones')}
          >
            ASIGNACIONES
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
            <p>Configura los procesos y el alcance operativo del usuario.</p>
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
              <AssignmentForm
                selectedProcesses={selectedProcesses}
                setSelectedProcesses={setSelectedProcesses}
                municipalityIds={municipalityIds}
                setMunicipalityIds={setMunicipalityIds}
                areaIds={areaIds}
                setAreaIds={setAreaIds}
                municipalities={shownMunicipalities}
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
              />
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
  areaIds: number[];
  setAreaIds: React.Dispatch<
    React.SetStateAction<number[]>
  >;
  municipalities: Municipality[];
  departments: Department[];
  selectedDepartmentId: number | null;
  setSelectedDepartmentId: (value: number | null) => void;
  areas: Area[];
  municipalitySearch: string;
  setMunicipalitySearch: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
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

      {props.selectedProcesses.includes('COBERTURA') && (
        <fieldset className="nomina-scope-fieldset">
          <label className="nomina-department-field">
            Departamento
            <select
              value={props.selectedDepartmentId ?? ''}
              onChange={(event) =>
                props.setSelectedDepartmentId(
                  event.target.value ? Number(event.target.value) : null,
                )
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

          <legend>
            Municipios que puede gestionar
          </legend>

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
                props.setMunicipalityIds(
                  props.municipalities.map(
                    (item) => item.id,
                  ),
                )
              }
            >
              Seleccionar todos
            </button>

            <button
              type="button"
              onClick={() =>
                props.setMunicipalityIds([])
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
                onChange={(event) =>
                  props.setMunicipalityIds(
                    (current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter(
                            (id) => id !== item.id,
                          ),
                  )
                }
              />

              <span>{item.nombre_municipio ?? item.nombre}</span>
            </label>
          ))}
          </div>}
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
