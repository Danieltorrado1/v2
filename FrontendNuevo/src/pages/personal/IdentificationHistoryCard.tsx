import { useMemo, useState } from 'react';
import { FileClock, IdCard, RefreshCw } from 'lucide-react';

import type {
  PersonaApi,
  PersonaIdentificacionApi,
  VinculacionExpedientePersona,
} from '../../types/personas.types';

type ActiveTab = 'vigente' | 'historial';

interface IdentificationHistoryCardProps {
  expedientePersona?: VinculacionExpedientePersona | null;
  identificaciones: PersonaIdentificacionApi[] | null;
  identificacionesError: string | null;
  identificacionesLoading: boolean;
  onRequestChange: () => void;
  persona: PersonaApi | VinculacionExpedientePersona | null;
}

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  border: active ? '1px solid rgba(14, 116, 144, 0.35)' : '1px solid var(--border-color)',
  borderRadius: 999,
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 700,
  background: active ? 'rgba(14, 116, 144, 0.12)' : 'transparent',
  color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
  cursor: 'pointer',
});

function formatFechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function formatFechaHora(fecha: string | null | undefined): string {
  if (!fecha) return '—';

  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) {
    return fecha;
  }

  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildFallbackIdentification(
  persona: PersonaApi | VinculacionExpedientePersona | null,
): PersonaIdentificacionApi | null {
  if (!persona) {
    return null;
  }

  return {
    id: 0,
    persona_id: persona.id,
    tipo_documento_id: persona.tipo_documento_id ?? 0,
    tipo_documento_nombre: null,
    numero_documento: persona.numero_documento,
    fecha_expedicion_documento: persona.fecha_expedicion_documento,
    municipio_expedicion_id: persona.municipio_expedicion_id,
    municipio_expedicion_nombre: null,
    es_vigente: true,
    motivo_cambio: 'IDENTIFICACION_VIGENTE',
    registrado_por_usuario_id: null,
    registrado_por_usuario_nombre: null,
    registrado_por_usuario_correo: null,
    registrado_en: '',
    vigente_desde: '',
    vigente_hasta: null,
    reemplaza_identificacion_id: null,
  };
}

export default function IdentificationHistoryCard({
  expedientePersona,
  identificaciones,
  identificacionesError,
  identificacionesLoading,
  onRequestChange,
  persona,
}: IdentificationHistoryCardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vigente');

  const currentIdentification = useMemo(() => {
    const personaConVigente = persona && 'identificacion_vigente' in persona
      ? persona.identificacion_vigente
      : null;

    return personaConVigente
      ?? identificaciones?.find((item) => item.es_vigente)
      ?? buildFallbackIdentification(persona ?? expedientePersona ?? null);
  }, [expedientePersona, identificaciones, persona]);

  const historyItems = identificaciones ?? [];

  return (
    <section className="profile-card">
      <div className="card-title" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IdCard size={18} />
          <div>
            <h3 style={{ marginBottom: 4 }}>Identificación vigente</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              Solo una identificación puede permanecer vigente por persona.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRequestChange}
          style={{
            border: '1px solid rgba(14, 116, 144, 0.25)',
            borderRadius: 10,
            background: 'rgba(14, 116, 144, 0.08)',
            color: 'var(--color-primary)',
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <RefreshCw size={14} />
          Cambiar identificación
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" style={tabButtonStyle(activeTab === 'vigente')} onClick={() => setActiveTab('vigente')}>
          Vigente
        </button>
        <button
          type="button"
          style={tabButtonStyle(activeTab === 'historial')}
          onClick={() => setActiveTab('historial')}
        >
          Historial de Identificaciones
        </button>
      </div>

      {activeTab === 'vigente' && (
        currentIdentification ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {[
              ['Tipo documento', currentIdentification.tipo_documento_nombre ?? `Tipo ${currentIdentification.tipo_documento_id}`],
              ['Número', currentIdentification.numero_documento],
              ['Fecha expedición', formatFechaCorta(currentIdentification.fecha_expedicion_documento)],
              ['Municipio expedición', currentIdentification.municipio_expedicion_nombre ?? '—'],
              ['Motivo del cambio', currentIdentification.motivo_cambio],
              ['Registrado por', currentIdentification.registrado_por_usuario_nombre ?? currentIdentification.registrado_por_usuario_correo ?? 'Sistema'],
              ['Registrado en', formatFechaHora(currentIdentification.registrado_en || currentIdentification.vigente_desde)],
              ['Estado', currentIdentification.es_vigente ? 'Vigente' : 'Histórica'],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: 'rgba(148, 163, 184, 0.04)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {value || '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-card-state">No hay identificación vigente registrada.</div>
        )
      )}

      {activeTab === 'historial' && (
        <div>
          {identificacionesLoading && historyItems.length === 0 ? (
            <div className="empty-card-state">Cargando historial de identificaciones...</div>
          ) : identificacionesError && historyItems.length === 0 ? (
            <div className="empty-card-state">{identificacionesError}</div>
          ) : historyItems.length === 0 ? (
            <div className="empty-card-state">No hay historial de identificaciones disponible.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {historyItems.map((item) => (
                <div
                  key={`${item.id}-${item.numero_documento}`}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    background: item.es_vigente ? 'rgba(14, 116, 144, 0.06)' : 'rgba(15, 23, 42, 0.03)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileClock size={14} style={{ color: 'var(--text-secondary)' }} />
                      <strong style={{ fontSize: 13 }}>
                        {item.tipo_documento_nombre ?? `Tipo ${item.tipo_documento_id}`} · {item.numero_documento}
                      </strong>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: item.es_vigente ? 'var(--color-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {item.es_vigente ? 'VIGENTE' : 'HISTÓRICA'}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>Motivo: {item.motivo_cambio}</span>
                    <span>Desde: {formatFechaHora(item.vigente_desde)}</span>
                    <span>Hasta: {formatFechaHora(item.vigente_hasta)}</span>
                    <span>Registró: {item.registrado_por_usuario_nombre ?? item.registrado_por_usuario_correo ?? 'Sistema'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
