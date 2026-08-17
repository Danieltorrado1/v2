import { useState } from 'react';

import {
  createPersonaIdentificacion,
  isPersonaDuplicateDocumentError,
  type CreatePersonaIdentificacionPayload,
} from '../../services/personasApi';
import type { PersonaIdentificacionApi } from '../../types/personas.types';

interface ChangeIdentificationModalProps {
  currentIdentification: PersonaIdentificacionApi | null;
  onClose: () => void;
  onSuccess: (identificacion: PersonaIdentificacionApi) => void;
  personaId: number;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 400,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const boxStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border-color)',
  borderRadius: 16,
  padding: '28px 32px',
  maxWidth: 520,
  width: '92%',
  boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const fieldInputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  boxSizing: 'border-box',
};

export default function ChangeIdentificationModal({
  currentIdentification,
  onClose,
  onSuccess,
  personaId,
}: ChangeIdentificationModalProps) {
  const [form, setForm] = useState<CreatePersonaIdentificacionPayload>({
    tipo_documento_id: currentIdentification?.tipo_documento_id ?? 0,
    numero_documento: currentIdentification?.numero_documento ?? '',
    fecha_expedicion_documento: currentIdentification?.fecha_expedicion_documento ?? null,
    municipio_expedicion_id: currentIdentification?.municipio_expedicion_id ?? null,
    motivo_cambio: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  function setField<K extends keyof CreatePersonaIdentificacionPayload>(
    field: K,
    value: CreatePersonaIdentificacionPayload[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.tipo_documento_id || form.tipo_documento_id <= 0) {
      setApiError('Ingrese un tipo de documento válido.');
      return;
    }

    if (!form.numero_documento.trim()) {
      setApiError('El número de documento es obligatorio.');
      return;
    }

    if (!form.motivo_cambio.trim()) {
      setApiError('El motivo del cambio es obligatorio.');
      return;
    }

    setSubmitting(true);
    setApiError(null);

    try {
      const created = await createPersonaIdentificacion(personaId, {
        tipo_documento_id: form.tipo_documento_id,
        numero_documento: form.numero_documento.trim(),
        fecha_expedicion_documento: form.fecha_expedicion_documento || null,
        municipio_expedicion_id: form.municipio_expedicion_id ?? null,
        motivo_cambio: form.motivo_cambio.trim(),
      });
      onSuccess(created);
    } catch (error) {
      if (isPersonaDuplicateDocumentError(error)) {
        setApiError('Ya existe una persona con ese número de documento vigente.');
      } else {
        setApiError(error instanceof Error ? error.message : 'Error al actualizar la identificación.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={boxStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 20 }}>Cambiar identificación vigente</h3>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Se conservará el historial anterior y solo la nueva identificación quedará vigente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={(event) => { void handleSubmit(event); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={fieldLabelStyle}>
                Tipo documento *
                <input
                  type="number"
                  min={1}
                  required
                  style={fieldInputStyle}
                  value={form.tipo_documento_id || ''}
                  onChange={(event) => setField('tipo_documento_id', parseInt(event.target.value, 10) || 0)}
                />
              </label>

              <label style={fieldLabelStyle}>
                Municipio expedición
                <input
                  type="number"
                  min={1}
                  style={fieldInputStyle}
                  value={form.municipio_expedicion_id ?? ''}
                  onChange={(event) => setField('municipio_expedicion_id', parseInt(event.target.value, 10) || null)}
                />
              </label>
            </div>

            <label style={fieldLabelStyle}>
              Número documento *
              <input
                type="text"
                required
                style={fieldInputStyle}
                value={form.numero_documento}
                onChange={(event) => setField('numero_documento', event.target.value)}
              />
            </label>

            <label style={fieldLabelStyle}>
              Fecha expedición
              <input
                type="date"
                style={fieldInputStyle}
                value={form.fecha_expedicion_documento ?? ''}
                onChange={(event) => setField('fecha_expedicion_documento', event.target.value || null)}
              />
            </label>

            <label style={fieldLabelStyle}>
              Motivo del cambio *
              <textarea
                required
                style={{ ...fieldInputStyle, minHeight: 84, resize: 'vertical' }}
                value={form.motivo_cambio}
                onChange={(event) => setField('motivo_cambio', event.target.value)}
                placeholder="Ej: corrección de documento, cambio de tipo, ajuste por validación documental..."
              />
            </label>
          </div>

          {apiError && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(220, 38, 38, 0.08)',
                color: 'var(--color-danger)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {apiError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                border: '1px solid var(--border-color)',
                borderRadius: 10,
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 16px',
                border: '1px solid rgba(14, 116, 144, 0.3)',
                borderRadius: 10,
                background: 'rgba(14, 116, 144, 0.14)',
                color: 'var(--color-primary)',
                cursor: submitting ? 'wait' : 'pointer',
                fontWeight: 700,
              }}
            >
              {submitting ? 'Guardando...' : 'Guardar identificación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
