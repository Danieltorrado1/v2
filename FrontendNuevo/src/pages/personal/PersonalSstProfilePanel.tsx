import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Loader2, PencilLine } from 'lucide-react';

import {
  getPersonaSstPerfil,
  getPersonaSstPerfilHistorial,
  updatePersonaSstPerfil,
  type UpdatePersonaSstPerfilPayload
} from '../../services/personasApi';
import type {
  SstPerfilOrigenApi,
  SstPerfilSociodemograficoApi,
  SstPerfilSociodemograficoVersionApi,
  VinculacionExpedienteApi
} from '../../types/personas.types';

type FieldProps = {
  label: string;
  children: ReactNode;
};

type FormState = {
  fecha_caracterizacion: string;
  origen: SstPerfilOrigenApi | '';
  nacionalidad: string;
  estrato_socioeconomico: string;
  tipo_vivienda: string;
  grupo_etnico: string;
  nivel_escolaridad: string;
  profesion_ocupacion: string;
  personas_dependen_economicamente: string;
  cabeza_familia: '' | 'SI' | 'NO';
  total_hijos: string;
  hijos_viven_con_usted: string;
  hijos_menores_edad: string;
  hijos_mayores_edad: string;
  tiene_discapacidad: '' | 'SI' | 'NO';
  tipo_discapacidad: string;
  redes_apoyo_social: string;
  presenta_alergias: string;
  medicamentos_permanentes: string;
  enfermedad: string;
  autorizacion_tratamiento_datos: '' | 'SI' | 'NO';
  observaciones: string;
  motivo_cambio: string;
};

const EMPTY_FORM: FormState = {
  fecha_caracterizacion: '',
  origen: '',
  nacionalidad: '',
  estrato_socioeconomico: '',
  tipo_vivienda: '',
  grupo_etnico: '',
  nivel_escolaridad: '',
  profesion_ocupacion: '',
  personas_dependen_economicamente: '',
  cabeza_familia: '',
  total_hijos: '',
  hijos_viven_con_usted: '',
  hijos_menores_edad: '',
  hijos_mayores_edad: '',
  tiene_discapacidad: '',
  tipo_discapacidad: '',
  redes_apoyo_social: '',
  presenta_alergias: '',
  medicamentos_permanentes: '',
  enfermedad: '',
  autorizacion_tratamiento_datos: '',
  observaciones: '',
  motivo_cambio: ''
};

const ORIGIN_OPTIONS: Array<{ value: SstPerfilOrigenApi; label: string }> = [
  { value: 'FORMULARIO_DIGITAL', label: 'Formulario digital' },
  { value: 'FORMULARIO_FISICO', label: 'Formulario fisico' },
  { value: 'IMPORTACION', label: 'Importacion' },
  { value: 'EDICION_MANUAL', label: 'Edicion manual' },
  { value: 'PORTAL_COLABORADOR', label: 'Portal colaborador' }
];

function Field({ label, children }: FieldProps) {
  return (
    <label className="pmd-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="pmd-data-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StateBlock({
  message,
  tone = 'info'
}: {
  message: string;
  tone?: 'info' | 'error' | 'empty';
}) {
  return <div className={`pmd-state-block ${tone}`}>{message}</div>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin registrar';
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Sin registrar';
  return String(value);
}

function formatBooleanLabel(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return 'Sin registrar';
  return value ? 'Si' : 'No';
}

function yearsSince(value: string | null | undefined): string {
  if (!value) return 'Sin registrar';
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) return value;

  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const monthDiff = now.getMonth() - start.getMonth();
  const dayDiff = now.getDate() - start.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years >= 0 ? `${years} año${years === 1 ? '' : 's'}` : 'Sin registrar';
}

function toBooleanPayload(value: FormState['cabeza_familia']): boolean | null | undefined {
  if (value === '') return undefined;
  return value === 'SI';
}

function buildFormState(profile: SstPerfilSociodemograficoApi | null): FormState {
  if (!profile) return EMPTY_FORM;

  return {
    fecha_caracterizacion: profile.fecha_caracterizacion ?? '',
    origen: profile.origen ?? '',
    nacionalidad: profile.values.nacionalidad ?? '',
    estrato_socioeconomico: profile.values.estrato_socioeconomico ?? '',
    tipo_vivienda: profile.values.tipo_vivienda ?? '',
    grupo_etnico: profile.values.grupo_etnico ?? '',
    nivel_escolaridad: profile.values.nivel_escolaridad ?? '',
    profesion_ocupacion: profile.values.profesion_ocupacion ?? '',
    personas_dependen_economicamente:
      profile.values.personas_dependen_economicamente !== null && profile.values.personas_dependen_economicamente !== undefined
        ? String(profile.values.personas_dependen_economicamente)
        : '',
    cabeza_familia:
      profile.values.cabeza_familia === null || profile.values.cabeza_familia === undefined
        ? ''
        : profile.values.cabeza_familia
          ? 'SI'
          : 'NO',
    total_hijos:
      profile.values.total_hijos !== null && profile.values.total_hijos !== undefined
        ? String(profile.values.total_hijos)
        : '',
    hijos_viven_con_usted:
      profile.values.hijos_viven_con_usted !== null && profile.values.hijos_viven_con_usted !== undefined
        ? String(profile.values.hijos_viven_con_usted)
        : '',
    hijos_menores_edad:
      profile.values.hijos_menores_edad !== null && profile.values.hijos_menores_edad !== undefined
        ? String(profile.values.hijos_menores_edad)
        : '',
    hijos_mayores_edad:
      profile.values.hijos_mayores_edad !== null && profile.values.hijos_mayores_edad !== undefined
        ? String(profile.values.hijos_mayores_edad)
        : '',
    tiene_discapacidad:
      profile.values.tiene_discapacidad === null || profile.values.tiene_discapacidad === undefined
        ? ''
        : profile.values.tiene_discapacidad
          ? 'SI'
          : 'NO',
    tipo_discapacidad: profile.values.tipo_discapacidad ?? '',
    redes_apoyo_social: profile.values.redes_apoyo_social ?? '',
    presenta_alergias: profile.values.presenta_alergias ?? '',
    medicamentos_permanentes: profile.values.medicamentos_permanentes ?? '',
    enfermedad: profile.values.enfermedad ?? '',
    autorizacion_tratamiento_datos:
      profile.values.autorizacion_tratamiento_datos === null || profile.values.autorizacion_tratamiento_datos === undefined
        ? ''
        : profile.values.autorizacion_tratamiento_datos
          ? 'SI'
          : 'NO',
    observaciones: profile.values.observaciones ?? '',
    motivo_cambio: ''
  };
}

function hasAnyPermission(current: string[], expected: string[]): boolean {
  return expected.some((permission) => current.includes(permission));
}

export default function PersonalSstProfilePanel({
  expediente,
  permissions,
  onRefresh
}: {
  expediente: VinculacionExpedienteApi;
  permissions: string[];
  onRefresh: () => void;
}) {
  const [profile, setProfile] = useState<SstPerfilSociodemograficoApi | null>(null);
  const [history, setHistory] = useState<SstPerfilSociodemograficoVersionApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const canEdit = useMemo(
    () => hasAnyPermission(permissions, ['sst.perfil.crear', 'sst.perfil.editar']),
    [permissions]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setEditing(false);

    void Promise.all([
      getPersonaSstPerfil(expediente.persona.id),
      getPersonaSstPerfilHistorial(expediente.persona.id)
    ])
      .then(([detail, versions]) => {
        if (cancelled) return;
        setProfile(detail);
        setHistory(versions);
        setForm(buildFormState(detail));
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'No fue posible cargar el perfil SST.');
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
  }, [expediente.persona.id]);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(): Promise<void> {
    if (!form.motivo_cambio.trim()) {
      setSaveError('El motivo es obligatorio para guardar el perfil SST.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const payload: UpdatePersonaSstPerfilPayload = {
        fecha_caracterizacion: form.fecha_caracterizacion || null,
        origen: form.origen || undefined,
        nacionalidad: form.nacionalidad.trim() || null,
        estrato_socioeconomico: form.estrato_socioeconomico.trim() || null,
        tipo_vivienda: form.tipo_vivienda.trim() || null,
        grupo_etnico: form.grupo_etnico.trim() || null,
        nivel_escolaridad: form.nivel_escolaridad.trim() || null,
        profesion_ocupacion: form.profesion_ocupacion.trim() || null,
        personas_dependen_economicamente: form.personas_dependen_economicamente ? Number(form.personas_dependen_economicamente) : null,
        cabeza_familia: toBooleanPayload(form.cabeza_familia),
        total_hijos: form.total_hijos ? Number(form.total_hijos) : null,
        hijos_viven_con_usted: form.hijos_viven_con_usted ? Number(form.hijos_viven_con_usted) : null,
        hijos_menores_edad: form.hijos_menores_edad ? Number(form.hijos_menores_edad) : null,
        hijos_mayores_edad: form.hijos_mayores_edad ? Number(form.hijos_mayores_edad) : null,
        tiene_discapacidad: toBooleanPayload(form.tiene_discapacidad),
        tipo_discapacidad: form.tipo_discapacidad.trim() || null,
        redes_apoyo_social: form.redes_apoyo_social.trim() || null,
        presenta_alergias: form.presenta_alergias.trim() || null,
        medicamentos_permanentes: form.medicamentos_permanentes.trim() || null,
        enfermedad: form.enfermedad.trim() || null,
        autorizacion_tratamiento_datos: toBooleanPayload(form.autorizacion_tratamiento_datos),
        observaciones: form.observaciones.trim() || null,
        motivo_cambio: form.motivo_cambio.trim()
      };

      const updated = await updatePersonaSstPerfil(expediente.persona.id, payload);
      const versions = await getPersonaSstPerfilHistorial(expediente.persona.id);
      setProfile(updated);
      setHistory(versions);
      setForm(buildFormState(updated));
      setEditing(false);
      onRefresh();
    } catch (nextError) {
      setSaveError(nextError instanceof Error ? nextError.message : 'No fue posible guardar el perfil SST.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) {
    return <StateBlock message="Cargando perfil sociodemografico SST..." />;
  }

  if (error && !profile) {
    return <StateBlock tone="error" message={error} />;
  }

  return (
    <div className="pmd-stack">
      <section className="pmd-card">
        <div className="pmd-card-header">
          <div>
            <h3>Resumen SST</h3>
            <p>Perfil sociodemografico versionado dentro del mismo expediente.</p>
          </div>
          <button
            type="button"
            className="pmd-button ghost"
            onClick={() => {
              setForm(buildFormState(profile));
              setEditing((current) => !current);
              setSaveError('');
            }}
            disabled={!canEdit}
          >
            <PencilLine size={15} />
            {editing ? 'Cancelar edicion' : 'Editar perfil SST'}
          </button>
        </div>

        <div className="pmd-info-grid compact-four">
          <DataItem label="Completitud" value={`${profile?.completitud.porcentaje ?? 0}%`} />
          <DataItem label="Estado" value={profile?.completitud.estado ?? 'NO_REALIZADA'} />
          <DataItem label="Origen" value={profile?.origen_resuelto ?? 'SIN_REGISTRO'} />
          <DataItem label="Actualizado" value={formatDate(profile?.updated_at)} />
          <DataItem label="Fecha caracterizacion" value={formatDate(profile?.fecha_caracterizacion)} />
          <DataItem label="Version vigente" value={displayValue(profile?.version_actual)} />
          <DataItem label="Edad" value={profile?.edad !== null && profile?.edad !== undefined ? `${profile.edad} años` : 'Sin registrar'} />
          <DataItem label="Historial" value={displayValue(profile?.history_count)} />
        </div>
      </section>

      <section className="pmd-card">
        <div className="pmd-card-header">
          <div>
            <h3>Informacion ocupacional y fuente unica</h3>
            <p>Los datos laborales se leen dinamicamente desde Vinculacion y no se duplican en SST.</p>
          </div>
        </div>
        <div className="pmd-info-grid compact-four">
          <DataItem label="Cargo actual" value={displayValue(expediente.cargo.nombre_cargo)} />
          <DataItem label="Ingreso" value={formatDate(expediente.vinculacion.fecha_inicio)} />
          <DataItem label="Antiguedad" value={yearsSince(expediente.vinculacion.fecha_inicio)} />
          <DataItem label="Estado vinculacion" value={displayValue(expediente.vinculacion.estado_vinculacion)} />
          <DataItem label="Fecha nacimiento" value={formatDate(expediente.persona.fecha_nacimiento)} />
          <DataItem label="Sexo" value={displayValue(expediente.persona.sexo)} />
          <DataItem label="Estado civil" value={displayValue(expediente.persona.estado_civil)} />
          <DataItem label="Cobertura / sede" value={displayValue(expediente.personal_contexto.asignacion_operativa_actual?.sede ?? expediente.personal_contexto.asignacion_laboral_actual?.nombre_ubicacion)} />
        </div>
      </section>

      <section className="pmd-card">
        <div className="pmd-card-header">
          <div>
            <h3>Perfil sociodemografico</h3>
            <p>
              Completitud: {profile?.completitud.campos_completos.length ?? 0}/{profile?.completitud.campos_requeridos.length ?? 0}
              {profile?.sensitive_fields_hidden ? ' · Algunos campos sensibles estan ocultos para este rol.' : ''}
            </p>
          </div>
        </div>

        {editing ? (
          <div className="pmd-edit-layout">
            <div className="pmd-grid two">
              <Field label="Fecha caracterizacion"><input type="date" value={form.fecha_caracterizacion} onChange={(event) => setField('fecha_caracterizacion', event.target.value)} /></Field>
              <Field label="Origen"><select value={form.origen} onChange={(event) => setField('origen', event.target.value as FormState['origen'])}><option value="">Sin registrar</option>{ORIGIN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              <Field label="Nacionalidad"><input value={form.nacionalidad} onChange={(event) => setField('nacionalidad', event.target.value)} /></Field>
              <Field label="Nivel educativo"><input value={form.nivel_escolaridad} onChange={(event) => setField('nivel_escolaridad', event.target.value)} /></Field>
              <Field label="Estrato"><input value={form.estrato_socioeconomico} onChange={(event) => setField('estrato_socioeconomico', event.target.value)} /></Field>
              <Field label="Tipo vivienda"><input value={form.tipo_vivienda} onChange={(event) => setField('tipo_vivienda', event.target.value)} /></Field>
              <Field label="Grupo etnico"><input value={form.grupo_etnico} onChange={(event) => setField('grupo_etnico', event.target.value)} /></Field>
              <Field label="Profesion / ocupacion"><input value={form.profesion_ocupacion} onChange={(event) => setField('profesion_ocupacion', event.target.value)} /></Field>
              <Field label="Personas a cargo"><input type="number" value={form.personas_dependen_economicamente} onChange={(event) => setField('personas_dependen_economicamente', event.target.value)} /></Field>
              <Field label="Cabeza de familia"><select value={form.cabeza_familia} onChange={(event) => setField('cabeza_familia', event.target.value as FormState['cabeza_familia'])}><option value="">Sin registrar</option><option value="SI">Si</option><option value="NO">No</option></select></Field>
              <Field label="Total hijos"><input type="number" value={form.total_hijos} onChange={(event) => setField('total_hijos', event.target.value)} /></Field>
              <Field label="Hijos viven con usted"><input type="number" value={form.hijos_viven_con_usted} onChange={(event) => setField('hijos_viven_con_usted', event.target.value)} /></Field>
              <Field label="Hijos menores"><input type="number" value={form.hijos_menores_edad} onChange={(event) => setField('hijos_menores_edad', event.target.value)} /></Field>
              <Field label="Hijos mayores"><input type="number" value={form.hijos_mayores_edad} onChange={(event) => setField('hijos_mayores_edad', event.target.value)} /></Field>
              <Field label="Redes de apoyo"><input value={form.redes_apoyo_social} onChange={(event) => setField('redes_apoyo_social', event.target.value)} /></Field>
              <Field label="Autorizacion datos"><select value={form.autorizacion_tratamiento_datos} onChange={(event) => setField('autorizacion_tratamiento_datos', event.target.value as FormState['autorizacion_tratamiento_datos'])}><option value="">Sin registrar</option><option value="SI">Si</option><option value="NO">No</option></select></Field>
              {!profile?.sensitive_fields_hidden && (
                <>
                  <Field label="Tiene discapacidad"><select value={form.tiene_discapacidad} onChange={(event) => setField('tiene_discapacidad', event.target.value as FormState['tiene_discapacidad'])}><option value="">Sin registrar</option><option value="SI">Si</option><option value="NO">No</option></select></Field>
                  <Field label="Tipo discapacidad"><input value={form.tipo_discapacidad} onChange={(event) => setField('tipo_discapacidad', event.target.value)} /></Field>
                  <Field label="Alergias"><input value={form.presenta_alergias} onChange={(event) => setField('presenta_alergias', event.target.value)} /></Field>
                  <Field label="Medicamentos permanentes"><input value={form.medicamentos_permanentes} onChange={(event) => setField('medicamentos_permanentes', event.target.value)} /></Field>
                  <Field label="Enfermedad relevante"><input value={form.enfermedad} onChange={(event) => setField('enfermedad', event.target.value)} /></Field>
                </>
              )}
            </div>

            <Field label="Observaciones"><textarea value={form.observaciones} onChange={(event) => setField('observaciones', event.target.value)} /></Field>
            <Field label="Motivo del cambio *"><textarea value={form.motivo_cambio} onChange={(event) => setField('motivo_cambio', event.target.value)} /></Field>
            {saveError ? <StateBlock tone="error" message={saveError} /> : null}
            <div className="pmd-actions-row">
              <button type="button" className="pmd-button secondary" onClick={() => setEditing(false)}>Cancelar</button>
              <button type="button" className="pmd-button primary" onClick={() => { void handleSave(); }} disabled={saving}>
                {saving ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                Guardar perfil SST
              </button>
            </div>
          </div>
        ) : (
          <div className="pmd-profile-sections">
            <section className="pmd-info-section">
              <h4>Demografico y familiar</h4>
              <div className="pmd-info-grid compact-four">
                <DataItem label="Nacionalidad" value={displayValue(profile?.values.nacionalidad)} />
                <DataItem label="Nivel educativo" value={displayValue(profile?.values.nivel_escolaridad)} />
                <DataItem label="Estrato" value={displayValue(profile?.values.estrato_socioeconomico)} />
                <DataItem label="Tipo vivienda" value={displayValue(profile?.values.tipo_vivienda)} />
                <DataItem label="Grupo etnico" value={displayValue(profile?.values.grupo_etnico)} />
                <DataItem label="Profesion / ocupacion" value={displayValue(profile?.values.profesion_ocupacion)} />
                <DataItem label="Personas a cargo" value={displayValue(profile?.values.personas_dependen_economicamente)} />
                <DataItem label="Cabeza de familia" value={formatBooleanLabel(profile?.values.cabeza_familia)} />
                <DataItem label="Total hijos" value={displayValue(profile?.values.total_hijos)} />
                <DataItem label="Hijos con usted" value={displayValue(profile?.values.hijos_viven_con_usted)} />
                <DataItem label="Hijos menores" value={displayValue(profile?.values.hijos_menores_edad)} />
                <DataItem label="Hijos mayores" value={displayValue(profile?.values.hijos_mayores_edad)} />
              </div>
            </section>

            <section className="pmd-info-section">
              <h4>Entorno y condiciones relevantes</h4>
              <div className="pmd-info-grid compact-four">
                <DataItem label="Redes de apoyo" value={displayValue(profile?.values.redes_apoyo_social)} />
                <DataItem label="Autorizacion datos" value={formatBooleanLabel(profile?.values.autorizacion_tratamiento_datos)} />
                {!profile?.sensitive_fields_hidden && (
                  <>
                    <DataItem label="Tiene discapacidad" value={formatBooleanLabel(profile?.values.tiene_discapacidad)} />
                    <DataItem label="Tipo discapacidad" value={displayValue(profile?.values.tipo_discapacidad)} />
                    <DataItem label="Alergias" value={displayValue(profile?.values.presenta_alergias)} />
                    <DataItem label="Medicamentos" value={displayValue(profile?.values.medicamentos_permanentes)} />
                    <DataItem label="Enfermedad" value={displayValue(profile?.values.enfermedad)} />
                  </>
                )}
                <DataItem label="Observaciones" value={displayValue(profile?.values.observaciones)} />
              </div>
            </section>
          </div>
        )}
      </section>

      <section className="pmd-card">
        <div className="pmd-card-header">
          <div>
            <h3>Historial SST</h3>
            <p>Versiones anteriores del perfil sociodemografico.</p>
          </div>
        </div>
        {history.length === 0 ? (
          <StateBlock tone="empty" message="Aun no hay versiones historicas del perfil SST." />
        ) : (
          <div className="pmd-history-list">
            {history.map((item) => (
              <details key={item.id} className="pmd-inline-history">
                <summary>
                  Version {item.version_numero} · {item.es_vigente ? 'Vigente' : 'Historica'} · {formatDate(item.fecha_caracterizacion)} · {item.origen ?? 'Sin origen'}
                </summary>
                <div className="pmd-info-grid compact-four">
                  <DataItem label="Desde" value={formatDate(item.vigente_desde)} />
                  <DataItem label="Hasta" value={formatDate(item.vigencia_hasta)} />
                  <DataItem label="Motivo" value={displayValue(item.motivo_cambio)} />
                  <DataItem label="Nacionalidad" value={displayValue(item.values.nacionalidad)} />
                  <DataItem label="Nivel educativo" value={displayValue(item.values.nivel_escolaridad)} />
                  <DataItem label="Estrato" value={displayValue(item.values.estrato_socioeconomico)} />
                  <DataItem label="Tipo vivienda" value={displayValue(item.values.tipo_vivienda)} />
                  <DataItem label="Hijos" value={displayValue(item.values.total_hijos)} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
