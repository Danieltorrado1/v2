import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Save, XCircle } from 'lucide-react';

import { ApiClientError } from '../../services/apiClient';
import {
  createPersonalExportTemplate,
  downloadPersonalExport,
  getPersonalExportFieldCatalog,
  listPersonalExportTemplates,
  type PersonalExportGeneratePayload,
} from '../../services/personasApi';
import type {
  PersonalExportFieldDefinitionApi,
  PersonalExportTemplateApi,
} from '../../types/personas.types';
import type { ContractPersonalFilters } from '../../types/vinculaciones.types';
import './OperationalImportModal.css';

type ExportScope = 'TODOS' | 'FILTRADOS' | 'SELECCIONADOS';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function PersonalExportModal({
  contratoId,
  filters,
  selectedVinculacionIds,
  onClose,
}: {
  contratoId: number;
  filters: ContractPersonalFilters;
  selectedVinculacionIds: number[];
  onClose: () => void;
}) {
  const [scope, setScope] = useState<ExportScope>('FILTRADOS');
  const [fields, setFields] = useState<PersonalExportFieldDefinitionApi[]>([]);
  const [templates, setTemplates] = useState<PersonalExportTemplateApi[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getPersonalExportFieldCatalog(), listPersonalExportTemplates()])
      .then(([catalog, storedTemplates]) => {
        if (cancelled) return;
        setFields(catalog);
        setTemplates(storedTemplates);
        setSelectedFields(catalog.slice(0, 6).map((item) => item.code));
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(getErrorMessage(nextError, 'No fue posible cargar el catalogo de exportacion.'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, PersonalExportFieldDefinitionApi[]>();
    for (const field of fields) {
      const bucket = groups.get(field.group) ?? [];
      bucket.push(field);
      groups.set(field.group, bucket);
    }
    return Array.from(groups.entries());
  }, [fields]);

  const canExport = selectedFields.length > 0 && (scope !== 'SELECCIONADOS' || selectedVinculacionIds.length > 0);

  function toggleField(code: string): void {
    setSelectedFields((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    );
  }

  async function handleSaveTemplate(): Promise<void> {
    if (!templateName.trim() || selectedFields.length === 0) {
      setError('Define un nombre y al menos un campo antes de guardar la plantilla.');
      return;
    }

    setSavingTemplate(true);
    setError('');
    try {
      const created = await createPersonalExportTemplate({
        nombre: templateName.trim(),
        campos: selectedFields,
        orden: selectedFields,
        formato: 'csv',
      });
      setTemplates((current) => [...current, created].sort((left, right) => left.nombre.localeCompare(right.nombre)));
      setTemplateName('');
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'No fue posible guardar la plantilla.'));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleExport(): Promise<void> {
    if (!canExport) {
      setError('Selecciona campos y, si corresponde, trabajadores.');
      return;
    }

    const payload: PersonalExportGeneratePayload = {
      scope,
      formato: 'csv',
      contrato_id: contratoId,
      fecha: filters.fecha,
      contrato_cargo_id: filters.contrato_cargo_id ?? null,
      municipio_id: filters.municipio_id ?? null,
      institucion_id: filters.institucion_id ?? null,
      sede_id: filters.sede_id ?? null,
      modalidad_id: filters.modalidad_id ?? null,
      ubicacion_laboral_id: filters.ubicacion_laboral_id ?? null,
      cobertura: filters.cobertura,
      licitacion: filters.licitacion,
      estado_vinculacion: filters.estado_vinculacion,
      search: filters.search ?? null,
      fields: selectedFields,
      selected_vinculacion_ids: scope === 'SELECCIONADOS' ? selectedVinculacionIds : [],
    };

    setExporting(true);
    setError('');
    try {
      await downloadPersonalExport(payload);
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'No fue posible exportar el archivo.'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="op-import-layer" onClick={onClose}>
      <div className="op-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="op-import-header">
          <div>
            <h2>Exportar personal</h2>
            <p>Genera la poblacion completa, filtrada o seleccionada sin limitarte a la pagina visible.</p>
          </div>
          <button type="button" className="op-close-button" onClick={onClose} aria-label="Cerrar">
            <XCircle size={18} />
          </button>
        </div>

        {error ? <div className="op-import-alert error"><AlertTriangle size={16} /> {error}</div> : null}

        <div className="op-import-summary-grid op-export-summary-grid">
          <div>
            <strong>{selectedVinculacionIds.length}</strong>
            <span>Seleccionados</span>
          </div>
          <div>
            <strong>{fields.length}</strong>
            <span>Campos soportados</span>
          </div>
          <div>
            <strong>{templates.length}</strong>
            <span>Plantillas</span>
          </div>
        </div>

        <section className="op-import-table-wrap op-export-section">
          <div className="op-export-toolbar">
            <strong>Poblacion</strong>
            <label><input type="radio" name="scope" checked={scope === 'TODOS'} onChange={() => setScope('TODOS')} /> Todos</label>
            <label><input type="radio" name="scope" checked={scope === 'FILTRADOS'} onChange={() => setScope('FILTRADOS')} /> Filtrados actuales</label>
            <label><input type="radio" name="scope" checked={scope === 'SELECCIONADOS'} onChange={() => setScope('SELECCIONADOS')} /> Seleccionados</label>
          </div>

          <div className="op-export-toolbar">
            <strong>Plantillas</strong>
            <select
              defaultValue=""
              onChange={(event) => {
                const template = templates.find((item) => String(item.id) === event.target.value);
                if (template) {
                  setSelectedFields(template.orden.length > 0 ? template.orden : template.campos);
                }
              }}
            >
              <option value="">Seleccionar plantilla</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.nombre}</option>
              ))}
            </select>
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Guardar como plantilla"
            />
            <button type="button" className="op-button secondary" onClick={() => void handleSaveTemplate()} disabled={savingTemplate || selectedFields.length === 0}>
              <Save size={15} /> Guardar plantilla
            </button>
          </div>

          {loading ? (
            <div className="op-import-empty-card">Cargando catalogo de campos...</div>
          ) : (
            <div className="op-export-groups">
              {groupedFields.map(([group, items]) => (
                <div key={group} className="op-export-group">
                  <h3>{group.replace('_', ' ')}</h3>
                  <div className="op-export-field-list">
                    {items.map((field) => (
                      <label key={field.code} className="op-export-field">
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(field.code)}
                          onChange={() => toggleField(field.code)}
                        />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="op-import-toolbar">
          <span className="op-count-inline">
            {scope === 'SELECCIONADOS'
              ? `${selectedVinculacionIds.length} vinculaciones seleccionadas`
              : scope === 'FILTRADOS'
                ? 'Se reutilizaran exactamente los filtros activos de /personal'
                : 'Se exportara toda la poblacion del contrato'}
          </span>
          <button type="button" className="op-button primary" onClick={() => void handleExport()} disabled={!canExport || exporting}>
            <Download size={15} /> Exportar
          </button>
        </div>
      </div>
    </div>
  );
}
