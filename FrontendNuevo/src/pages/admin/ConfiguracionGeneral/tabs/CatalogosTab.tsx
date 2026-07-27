import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, MapPin, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { configuracionApi } from '../../../../services/configuracionApi';
import type {
  CatalogoItem,
  Departamento,
  MetodoPagoPermitido,
  Municipio,
} from '../../../../types/configuracion.types';
import { getErrorMessage, hasAnyPermission } from './adminTabUtils';

type CatalogState = {
  arl: CatalogoItem[];
  cajas: CatalogoItem[];
  departamentos: Departamento[];
  eps: CatalogoItem[];
  estadosCiviles: CatalogoItem[];
  fondos: CatalogoItem[];
  jornadas: CatalogoItem[];
  niveles: CatalogoItem[];
  sexos: CatalogoItem[];
  tiposDocumento: CatalogoItem[];
  tiposVinculacion: CatalogoItem[];
  zonas: CatalogoItem[];
};

type CatalogColumn<T> = {
  key: keyof T;
  label: string;
};

const EMPTY_STATE: CatalogState = {
  arl: [],
  cajas: [],
  departamentos: [],
  eps: [],
  estadosCiviles: [],
  fondos: [],
  jornadas: [],
  niveles: [],
  sexos: [],
  tiposDocumento: [],
  tiposVinculacion: [],
  zonas: [],
};

async function getAllPages<T>(
  loader: (params: { page: number; limit: number }) => Promise<{ items: T[]; pagination: { total_pages: number } }>,
): Promise<T[]> {
  const firstPage = await loader({ page: 1, limit: 100 });
  const items = [...firstPage.items];

  for (let page = 2; page <= firstPage.pagination.total_pages; page += 1) {
    const nextPage = await loader({ page, limit: 100 });
    items.push(...nextPage.items);
  }

  return items;
}

function renderCellValue(value: unknown): string {
  if (value === true) {
    return 'Si';
  }
  if (value === false) {
    return 'No';
  }
  if (value === null || value === undefined || value === '') {
    return 'No disponible';
  }

  return String(value);
}

function CatalogCard<T extends object>({
  title,
  items,
  emptyLabel,
  columns,
}: {
  title: string;
  items: T[];
  emptyLabel: string;
  columns: Array<CatalogColumn<T>>;
}) {
  return (
    <div className="cg-catalog-card">
      <div className="cg-catalog-card-header">
        <h5>{title}</h5>
        <span className="adm-badge neutral">{items.length}</span>
      </div>
      <div className="cg-catalog-table-wrap">
        <table className="adm-history cg-compact-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="cg-table-empty">{emptyLabel}</td>
              </tr>
            )}
            {items.map((item, index) => (
              <tr key={`${title}-${index}`}>
                {columns.map((column) => {
                  const cellValue = item[column.key];
                  return (
                    <td key={String(column.key)} title={renderCellValue(cellValue)}>
                      {renderCellValue(cellValue)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CatalogosTab() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canRead = hasAnyPermission(permissions, ['configuracion.read', 'catalogos.read']);

  const [catalogs, setCatalogs] = useState<CatalogState>(EMPTY_STATE);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoPermitido[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioDepartamentoId, setMunicipioDepartamentoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [municipiosLoading, setMunicipiosLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canRead) {
      setCatalogs(EMPTY_STATE);
      setMetodosPago([]);
      setMunicipios([]);
      setError('No tienes permisos para consultar catalogos.');
      return;
    }

    let cancelled = false;

    async function loadCatalogs() {
      setLoading(true);
      setError('');

      try {
        const [
          tiposVinculacion,
          jornadas,
          metodos,
          departamentos,
          zonas,
          eps,
          arl,
          fondos,
          cajas,
          niveles,
          estadosCiviles,
          sexos,
          tiposDocumento,
        ] = await Promise.all([
          getAllPages((params) => configuracionApi.listarTiposVinculacion(params)),
          getAllPages((params) => configuracionApi.listarTiposJornada(params)),
          configuracionApi.listarMetodosPago(),
          getAllPages((params) => configuracionApi.listarDepartamentos(params)),
          getAllPages((params) => configuracionApi.listarZonas(params)),
          getAllPages((params) => configuracionApi.listarEps(params)),
          getAllPages((params) => configuracionApi.listarArl(params)),
          getAllPages((params) => configuracionApi.listarFondosPension(params)),
          getAllPages((params) => configuracionApi.listarCajasCompensacion(params)),
          getAllPages((params) => configuracionApi.listarNivelesEstudio(params)),
          getAllPages((params) => configuracionApi.listarEstadosCiviles(params)),
          getAllPages((params) => configuracionApi.listarSexos(params)),
          getAllPages((params) => configuracionApi.listarTiposDocumento(params)),
        ]);

        if (cancelled) {
          return;
        }

        setCatalogs({
          arl,
          cajas,
          departamentos,
          eps,
          estadosCiviles,
          fondos,
          jornadas,
          niveles,
          sexos,
          tiposDocumento,
          tiposVinculacion,
          zonas,
        });
        setMetodosPago(metodos);
        setMunicipioDepartamentoId(departamentos[0] ? String(departamentos[0].id) : '');
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'No fue posible cargar los catalogos.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCatalogs();

    return () => {
      cancelled = true;
    };
  }, [canRead]);

  useEffect(() => {
    if (!canRead || !municipioDepartamentoId) {
      setMunicipios([]);
      return;
    }

    let cancelled = false;

    async function loadMunicipios() {
      setMunicipiosLoading(true);
      try {
        const response = await getAllPages((params) =>
          configuracionApi.listarMunicipios({
            ...params,
            departamento_id: Number(municipioDepartamentoId),
          }),
        );
        if (!cancelled) {
          setMunicipios(response);
        }
      } catch {
        if (!cancelled) {
          setMunicipios([]);
        }
      } finally {
        if (!cancelled) {
          setMunicipiosLoading(false);
        }
      }
    }

    void loadMunicipios();

    return () => {
      cancelled = true;
    };
  }, [canRead, municipioDepartamentoId]);

  const totalCatalogRecords = useMemo(() => {
    return (
      catalogs.arl.length +
      catalogs.cajas.length +
      catalogs.departamentos.length +
      catalogs.eps.length +
      catalogs.estadosCiviles.length +
      catalogs.fondos.length +
      catalogs.jornadas.length +
      catalogs.niveles.length +
      catalogs.sexos.length +
      catalogs.tiposDocumento.length +
      catalogs.tiposVinculacion.length +
      catalogs.zonas.length +
      municipios.length +
      metodosPago.length
    );
  }, [catalogs, metodosPago.length, municipios.length]);

  if (!canRead) {
    return (
      <div className="adm-notice warning">
        <AlertTriangle size={14} /> No tienes permisos para consultar catalogos.
      </div>
    );
  }

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary">
          <div className="adm-kpi-icon"><BookOpen size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">14</span>
            <span className="adm-kpi-lbl">Catalogos conectados</span>
          </div>
        </div>
        <div className="adm-kpi success">
          <div className="adm-kpi-icon"><BookOpen size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{totalCatalogRecords}</span>
            <span className="adm-kpi-lbl">Registros cargados</span>
          </div>
        </div>
        <div className="adm-kpi info">
          <div className="adm-kpi-icon"><MapPin size={16} /></div>
          <div className="adm-kpi-body">
            <span className="adm-kpi-val">{municipios.length}</span>
            <span className="adm-kpi-lbl">Municipios filtrados</span>
          </div>
        </div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><BookOpen size={15} /> Catalogos</h4>
          <p className="cg-tab-subtitle">Catalogos reales agrupados por uso. Solo lectura.</p>
        </div>
      </div>

      {error && (
        <div className="adm-notice warning" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="adm-card">
          <div className="adm-empty"><p>Cargando catalogos...</p></div>
        </div>
      ) : (
        <div className="cg-catalog-sections">
          <section className="adm-card">
            <h4 className="adm-card-title"><Users size={15} /> Laborales</h4>
            <div className="cg-catalog-grid">
              <CatalogCard
                title="Tipos de vinculacion"
                items={catalogs.tiposVinculacion}
                emptyLabel="Sin tipos de vinculacion"
                columns={[
                  { key: 'codigo', label: 'Codigo' },
                  { key: 'label', label: 'Nombre' },
                ]}
              />
              <CatalogCard
                title="Tipos de jornada"
                items={catalogs.jornadas}
                emptyLabel="Sin tipos de jornada"
                columns={[{ key: 'label', label: 'Nombre' }]}
              />
              <CatalogCard
                title="Metodos de pago"
                items={metodosPago}
                emptyLabel="Sin metodos de pago"
                columns={[
                  { key: 'valor', label: 'Valor' },
                  { key: 'etiqueta', label: 'Etiqueta' },
                ]}
              />
            </div>
          </section>

          <section className="adm-card">
            <h4 className="adm-card-title"><MapPin size={15} /> Ubicacion</h4>
            <div className="cg-catalog-grid">
              <CatalogCard
                title="Departamentos"
                items={catalogs.departamentos}
                emptyLabel="Sin departamentos"
                columns={[
                  { key: 'codigo_dane', label: 'Codigo DANE' },
                  { key: 'label', label: 'Nombre' },
                ]}
              />
              <div className="cg-catalog-card">
                <div className="cg-catalog-card-header">
                  <h5>Municipios por departamento</h5>
                  <span className="adm-badge neutral">{municipios.length}</span>
                </div>
                <div className="cg-filters" style={{ marginBottom: 10 }}>
                  <select
                    className="adm-select cg-filter-select"
                    value={municipioDepartamentoId}
                    onChange={(event) => setMunicipioDepartamentoId(event.target.value)}
                  >
                    {catalogs.departamentos.map((departamento) => (
                      <option key={departamento.id} value={departamento.id}>{departamento.label}</option>
                    ))}
                  </select>
                </div>
                <div className="cg-catalog-table-wrap">
                  <table className="adm-history cg-compact-table">
                    <thead>
                      <tr>
                        <th>Codigo DANE</th>
                        <th>Municipio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {municipiosLoading ? (
                        <tr>
                          <td colSpan={2} className="cg-table-empty">Cargando municipios...</td>
                        </tr>
                      ) : municipios.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="cg-table-empty">Sin municipios para el departamento seleccionado</td>
                        </tr>
                      ) : (
                        municipios.map((municipio) => (
                          <tr key={municipio.id}>
                            <td>{municipio.codigo_dane ?? 'No disponible'}</td>
                            <td>{municipio.label}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <CatalogCard
                title="Zonas"
                items={catalogs.zonas}
                emptyLabel="Sin zonas"
                columns={[{ key: 'label', label: 'Nombre' }]}
              />
            </div>
          </section>

          <section className="adm-card">
            <h4 className="adm-card-title"><ShieldCheck size={15} /> Seguridad social</h4>
            <div className="cg-catalog-grid">
              <CatalogCard title="EPS" items={catalogs.eps} emptyLabel="Sin EPS" columns={[{ key: 'label', label: 'Nombre' }, { key: 'activo', label: 'Activo' }]} />
              <CatalogCard title="ARL" items={catalogs.arl} emptyLabel="Sin ARL" columns={[{ key: 'label', label: 'Nombre' }, { key: 'activo', label: 'Activo' }]} />
              <CatalogCard title="Fondos de pension" items={catalogs.fondos} emptyLabel="Sin fondos" columns={[{ key: 'label', label: 'Nombre' }, { key: 'activo', label: 'Activo' }]} />
              <CatalogCard title="Cajas de compensacion" items={catalogs.cajas} emptyLabel="Sin cajas" columns={[{ key: 'label', label: 'Nombre' }, { key: 'activo', label: 'Activo' }]} />
            </div>
          </section>

          <section className="adm-card">
            <h4 className="adm-card-title"><Users size={15} /> Personal</h4>
            <div className="cg-catalog-grid">
              <CatalogCard title="Niveles de estudio" items={catalogs.niveles} emptyLabel="Sin niveles" columns={[{ key: 'codigo', label: 'Codigo' }, { key: 'label', label: 'Nombre' }]} />
              <CatalogCard title="Estados civiles" items={catalogs.estadosCiviles} emptyLabel="Sin estados civiles" columns={[{ key: 'label', label: 'Nombre' }]} />
              <CatalogCard title="Sexos" items={catalogs.sexos} emptyLabel="Sin sexos" columns={[{ key: 'label', label: 'Nombre' }]} />
              <CatalogCard
                title="Tipos de documento"
                items={catalogs.tiposDocumento}
                emptyLabel="Sin tipos de documento"
                columns={[
                  { key: 'codigo', label: 'Codigo' },
                  { key: 'label', label: 'Nombre' },
                  { key: 'categoria_documento', label: 'Categoria' },
                ]}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
