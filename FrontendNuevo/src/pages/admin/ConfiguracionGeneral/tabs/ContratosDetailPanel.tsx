import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  FileText,
  History,
  Plus,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react';

import { configuracionApi } from '../../../../services/configuracionApi';
import { ContratoRequisitosDocumentalesPanel } from './ContratoRequisitosDocumentalesPanel';
import type {
  CatalogoItem,
  ContratoAlertaRecord,
  ContratoChecklistItem,
  ContratoDetail,
  ContratoDocumentoRecord,
  ContratoEventoRecord,
  ContratoExcepcionRecord,
  CreateContratoEventoPayload,
  CreateContratoExcepcionPayload,
  DevolverContratoDocumentoPayload,
  ReviewContratoDocumentoPayload,
  RevocarContratoExcepcionPayload,
  UploadContratoDocumentoPayload,
} from '../../../../types/configuracion.types';
import { FormModal } from '../components/FormModal';
import { formatDate, formatDateTime, hasAnyPermission, mapKnownError, toNullableText, type AdminFeedback } from './adminTabUtils';

type DetailTab = 'resumen' | 'expediente' | 'requisitos' | 'checklist' | 'eventos' | 'excepciones' | 'alertas';
type DocumentCategory = 'CREACION_EMPRESA_JURIDICA' | 'INICIO_CONTRATO' | 'EJECUCION' | 'CIERRE';
type DocumentActionMode = 'send_review' | 'approve' | 'return' | 'annul';
type ExceptionActionMode = 'regularize' | 'revoke';

type EventForm = {
  tipo_evento: string;
  fecha_evento: string;
  fecha_efecto_desde: string;
  fecha_efecto_hasta: string;
  descripcion: string;
  motivo: string;
  documento_soporte_id: string;
  fecha_final_estimada: string;
  fecha_final_real: string;
  observaciones: string;
};

type DocumentForm = {
  requisito_id: string;
  tipo_documento_id: string;
  categoria: DocumentCategory;
  fecha_expedicion: string;
  fecha_vencimiento: string;
  vigencia_dias_configurada: string;
  observaciones: string;
  file: File | null;
};

type ExceptionForm = {
  requisito_id: string;
  documento_id: string;
  soporte_documento_id: string;
  motivo: string;
  fecha_limite_regularizacion: string;
  observaciones: string;
};

type UploadContext = {
  categoria: DocumentCategory;
  requisito?: ContratoChecklistItem | null;
  documentoBase?: ContratoDocumentoRecord | null;
} | null;

interface Props {
  contratoId: number | null;
  detail: ContratoDetail | null;
  detailLoading: boolean;
  detailTab: DetailTab;
  onDetailTabChange: (tab: DetailTab) => void;
  onFeedback: (feedback: AdminFeedback) => void;
  onRefresh: () => Promise<void>;
  permissions: string[];
  tiposDocumento: CatalogoItem[];
}

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'expediente', label: 'Expediente' },
  { id: 'requisitos', label: 'Requisitos' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'excepciones', label: 'Excepciones' },
  { id: 'alertas', label: 'Alertas' },
];

const EVENT_TYPES = ['CREACION', 'ACTA_INICIO', 'PRORROGA', 'ADICION', 'OTROSI', 'MODIFICACION', 'SUSPENSION', 'REINICIO', 'TERMINACION', 'LIQUIDACION', 'CAMBIO_REPRESENTANTE', 'CAMBIO_SUPERVISOR', 'CAMBIO_COBERTURA', 'OTRO'] as const;
const SENSITIVE_EVENTS = new Set(['SUSPENSION', 'REINICIO', 'TERMINACION', 'LIQUIDACION']);
const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  CREACION_EMPRESA_JURIDICA: 'Creacion empresa juridica',
  INICIO_CONTRATO: 'Inicio contrato',
  EJECUCION: 'Ejecucion',
  CIERRE: 'Cierre',
};

const blankEventForm = (): EventForm => ({ tipo_evento: 'OTRO', fecha_evento: '', fecha_efecto_desde: '', fecha_efecto_hasta: '', descripcion: '', motivo: '', documento_soporte_id: '', fecha_final_estimada: '', fecha_final_real: '', observaciones: '' });
const blankDocumentForm = (): DocumentForm => ({ requisito_id: '', tipo_documento_id: '', categoria: 'EJECUCION', fecha_expedicion: '', fecha_vencimiento: '', vigencia_dias_configurada: '', observaciones: '', file: null });
const blankExceptionForm = (): ExceptionForm => ({ requisito_id: '', documento_id: '', soporte_documento_id: '', motivo: '', fecha_limite_regularizacion: '', observaciones: '' });

function flattenDocuments(detail: ContratoDetail): ContratoDocumentoRecord[] {
  return detail.expediente.categorias.flatMap((item) => item.documentos);
}

function badgeTone(value: string): 'active' | 'inactive' | 'warning' | 'primary' | 'neutral' {
  if (['APROBADO', 'VIGENTE', 'CARGADO', 'REGULARIZADA', 'ACTIVO', 'ABIERTA'].includes(value)) return 'active';
  if (['PENDIENTE', 'EN_REVISION', 'PROXIMO_A_VENCER', 'PRORROGADO', 'SUSPENDIDO'].includes(value)) return 'warning';
  if (['DEVUELTO', 'VENCIDO', 'ANULADO', 'REVOCADA', 'VENCIDA', 'LIQUIDADO', 'FINALIZADO'].includes(value)) return 'inactive';
  if (['BORRADOR', 'PENDIENTE_INICIO'].includes(value)) return 'neutral';
  return 'primary';
}

function resolveAlertTab(route: string | null | undefined): DetailTab | null {
  const value = /\/view\/([^/]+)/.exec(route ?? '')?.[1];
  return value === 'resumen' || value === 'expediente' || value === 'requisitos' || value === 'checklist' || value === 'eventos' || value === 'excepciones' || value === 'alertas' ? value : null;
}

function getVersions(detail: ContratoDetail, document: ContratoDocumentoRecord): ContratoDocumentoRecord[] {
  return flattenDocuments(detail)
    .filter((item) => document.requisito_id !== null
      ? item.requisito_id === document.requisito_id
      : item.requisito_id === null && item.tipo_documento.id === document.tipo_documento.id && item.categoria === document.categoria)
    .sort((a, b) => b.version - a.version || b.id - a.id);
}

export function ContratosDetailPanel({ contratoId, detail, detailLoading, detailTab, onDetailTabChange, onFeedback, onRefresh, permissions, tiposDocumento }: Props) {
  const canRead = hasAnyPermission(permissions, ['configuracion.read', 'contratos.read', 'contracts.read']);
  const canCreateEvents = hasAnyPermission(permissions, ['contratos.update', 'contracts.events.create']);
  const canUploadDocuments = hasAnyPermission(permissions, ['documentos.upload', 'contracts.documents.upload']);
  const canReviewDocuments = hasAnyPermission(permissions, ['documentos.update', 'contracts.documents.review']);
  const canDownloadDocuments = hasAnyPermission(permissions, ['documentos.download', 'contracts.documents.download', 'contracts.documents.read']);
  const canCreateExceptions = hasAnyPermission(permissions, ['contratos.update', 'contracts.exceptions.create']);
  const canResolveExceptions = hasAnyPermission(permissions, ['contratos.update', 'contracts.exceptions.resolve']);

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState<EventForm>(blankEventForm());
  const [eventFormError, setEventFormError] = useState('');
  const [eventCancelTarget, setEventCancelTarget] = useState<ContratoEventoRecord | null>(null);
  const [eventCancelReason, setEventCancelReason] = useState('');
  const [uploadContext, setUploadContext] = useState<UploadContext>(null);
  const [documentForm, setDocumentForm] = useState<DocumentForm>(blankDocumentForm());
  const [documentFormError, setDocumentFormError] = useState('');
  const [documentAction, setDocumentAction] = useState<{ mode: DocumentActionMode; document: ContratoDocumentoRecord } | null>(null);
  const [documentActionReason, setDocumentActionReason] = useState('');
  const [documentActionObservation, setDocumentActionObservation] = useState('');
  const [exceptionCreateOpen, setExceptionCreateOpen] = useState(false);
  const [exceptionForm, setExceptionForm] = useState<ExceptionForm>(blankExceptionForm());
  const [exceptionFormError, setExceptionFormError] = useState('');
  const [exceptionAction, setExceptionAction] = useState<{ mode: ExceptionActionMode; exception: ContratoExcepcionRecord } | null>(null);
  const [exceptionActionReason, setExceptionActionReason] = useState('');
  const [exceptionActionObservation, setExceptionActionObservation] = useState('');
  const [historyDocument, setHistoryDocument] = useState<ContratoDocumentoRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!canRead) return <div className="adm-empty"><p>No tienes permisos para consultar el detalle contractual.</p></div>;
  if (detailLoading) return <div className="adm-empty"><p>Cargando detalle contractual...</p></div>;
  if (!detail || !contratoId) return <div className="adm-empty"><p>Selecciona un contrato para ver su expediente contractual.</p></div>;

  const currentContratoId = detail.contrato.id ?? contratoId;
  const documents = flattenDocuments(detail);
  const requisitos = detail.checklist.items;
  const checklistSummary = detail.checklist.resumen;

  const openUploadModal = (context: UploadContext) => {
    setUploadContext(context);
    setDocumentForm({
      requisito_id: context?.requisito?.requisito_id ? String(context.requisito.requisito_id) : context?.documentoBase?.requisito_id ? String(context.documentoBase.requisito_id) : '',
      tipo_documento_id: context?.documentoBase?.tipo_documento.id ? String(context.documentoBase.tipo_documento.id) : context?.requisito?.tipo_documento?.id ? String(context.requisito.tipo_documento.id) : '',
      categoria: context?.categoria ?? 'EJECUCION',
      fecha_expedicion: '',
      fecha_vencimiento: '',
      vigencia_dias_configurada: '',
      observaciones: context?.documentoBase?.observaciones ?? '',
      file: null,
    });
    setDocumentFormError('');
  };
  const handleDownload = async (documentId: number) => {
    try {
      const data = await configuracionApi.obtenerContratoDocumentoDownloadUrl(currentContratoId, documentId);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onFeedback({ tone: 'error', text: mapKnownError(error, 'No fue posible abrir el documento.', {}) });
    }
  };

  const saveEvent = async () => {
    if (!eventForm.fecha_evento) return setEventFormError('La fecha del evento es obligatoria.');
    if (eventForm.tipo_evento === 'PRORROGA' && !eventForm.fecha_final_estimada) return setEventFormError('La prorroga requiere una nueva fecha final estimada.');
    if (eventForm.tipo_evento === 'TERMINACION' && !eventForm.fecha_final_real) return setEventFormError('La terminacion requiere fecha final real.');
    if (SENSITIVE_EVENTS.has(eventForm.tipo_evento) && !window.confirm(`Confirmar ${eventForm.tipo_evento.toLowerCase()} contractual.`)) return;

    const payload: CreateContratoEventoPayload = {
      tipo_evento: eventForm.tipo_evento,
      fecha_evento: eventForm.fecha_evento,
      fecha_efecto_desde: eventForm.fecha_efecto_desde || null,
      fecha_efecto_hasta: eventForm.fecha_efecto_hasta || null,
      descripcion: toNullableText(eventForm.descripcion),
      motivo: toNullableText(eventForm.motivo),
      documento_soporte_id: eventForm.documento_soporte_id ? Number(eventForm.documento_soporte_id) : undefined,
      cambios_contrato: {
        fecha_final_estimada: eventForm.fecha_final_estimada || null,
        fecha_final_real: eventForm.fecha_final_real || null,
        observaciones: toNullableText(eventForm.observaciones),
      },
    };

    setSubmitting(true);
    setEventFormError('');
    try {
      await configuracionApi.crearContratoEvento(currentContratoId, payload);
      setEventModalOpen(false);
      setEventForm(blankEventForm());
      onFeedback({ tone: 'success', text: 'Evento contractual registrado correctamente.' });
      await onRefresh();
    } catch (error) {
      setEventFormError(mapKnownError(error, 'No fue posible registrar el evento.', {
        CONTRATO_EVENTO_INVALIDO: 'La transicion no es valida para el estado contractual actual.',
        CONTRATO_PRORROGA_REQUIERE_FECHA: 'La prorroga requiere una nueva fecha final estimada.',
        CONTRATO_TERMINACION_REQUIERE_FECHA: 'La terminacion requiere fecha final real.',
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const saveEventCancellation = async () => {
    if (!eventCancelTarget || !eventCancelReason.trim()) return;
    if (!window.confirm('Confirmar anulacion logica del evento.')) return;
    setSubmitting(true);
    try {
      await configuracionApi.anularContratoEvento(currentContratoId, eventCancelTarget.id, { motivo: eventCancelReason.trim() });
      setEventCancelTarget(null);
      setEventCancelReason('');
      onFeedback({ tone: 'success', text: 'Evento anulado correctamente.' });
      await onRefresh();
    } catch (error) {
      onFeedback({ tone: 'error', text: mapKnownError(error, 'No fue posible anular el evento.', {}) });
    } finally {
      setSubmitting(false);
    }
  };

  const saveDocument = async () => {
    if (!documentForm.file) return setDocumentFormError('Debes seleccionar un archivo.');
    if (!documentForm.tipo_documento_id) return setDocumentFormError('Debes seleccionar un tipo documental.');

    const payload: UploadContratoDocumentoPayload = {
      requisito_id: documentForm.requisito_id ? Number(documentForm.requisito_id) : undefined,
      tipo_documento_id: Number(documentForm.tipo_documento_id),
      categoria: documentForm.categoria,
      fecha_expedicion: documentForm.fecha_expedicion || null,
      fecha_vencimiento: documentForm.fecha_vencimiento || null,
      vigencia_dias_configurada: documentForm.vigencia_dias_configurada ? Number(documentForm.vigencia_dias_configurada) : null,
      observaciones: toNullableText(documentForm.observaciones),
    };

    setSubmitting(true);
    setDocumentFormError('');
    try {
      await configuracionApi.subirContratoDocumento(currentContratoId, documentForm.file, payload);
      setUploadContext(null);
      setDocumentForm(blankDocumentForm());
      onFeedback({ tone: 'success', text: 'Documento contractual cargado correctamente.' });
      await onRefresh();
      onDetailTabChange('expediente');
    } catch (error) {
      setDocumentFormError(mapKnownError(error, 'No fue posible cargar el documento.', {}));
    } finally {
      setSubmitting(false);
    }
  };

  const saveDocumentAction = async () => {
    if (!documentAction) return;
    setSubmitting(true);
    try {
      if (documentAction.mode === 'send_review') {
        const payload: ReviewContratoDocumentoPayload = { estado: 'EN_REVISION', observacion: toNullableText(documentActionObservation) };
        await configuracionApi.revisarContratoDocumento(currentContratoId, documentAction.document.id, payload);
      }
      if (documentAction.mode === 'approve') {
        const payload: ReviewContratoDocumentoPayload = { estado: 'APROBADO', observacion: toNullableText(documentActionObservation) };
        await configuracionApi.revisarContratoDocumento(currentContratoId, documentAction.document.id, payload);
      }
      if (documentAction.mode === 'return') {
        if (!documentActionReason.trim()) return;
        const payload: DevolverContratoDocumentoPayload = { motivo: documentActionReason.trim(), observacion: toNullableText(documentActionObservation) };
        await configuracionApi.devolverContratoDocumento(currentContratoId, documentAction.document.id, payload);
      }
      if (documentAction.mode === 'annul') {
        if (!documentActionReason.trim()) return;
        if (!window.confirm('Confirmar anulacion logica del documento.')) return;
        await configuracionApi.anularContratoDocumento(currentContratoId, documentAction.document.id, { motivo: documentActionReason.trim() });
      }
      setDocumentAction(null);
      setDocumentActionReason('');
      setDocumentActionObservation('');
      onFeedback({ tone: 'success', text: 'Accion documental ejecutada correctamente.' });
      await onRefresh();
    } catch (error) {
      onFeedback({ tone: 'error', text: mapKnownError(error, 'No fue posible gestionar el documento.', {}) });
    } finally {
      setSubmitting(false);
    }
  };

  const saveException = async () => {
    if (!exceptionForm.fecha_limite_regularizacion) return setExceptionFormError('La fecha limite es obligatoria.');
    if (!exceptionForm.motivo.trim()) return setExceptionFormError('El motivo es obligatorio.');
    if (!exceptionForm.requisito_id && !exceptionForm.documento_id) return setExceptionFormError('Debes seleccionar un requisito o documento.');

    const payload: CreateContratoExcepcionPayload = {
      requisito_id: exceptionForm.requisito_id ? Number(exceptionForm.requisito_id) : undefined,
      documento_id: exceptionForm.documento_id ? Number(exceptionForm.documento_id) : undefined,
      soporte_documento_id: exceptionForm.soporte_documento_id ? Number(exceptionForm.soporte_documento_id) : undefined,
      motivo: exceptionForm.motivo.trim(),
      fecha_limite_regularizacion: exceptionForm.fecha_limite_regularizacion,
      observaciones: toNullableText(exceptionForm.observaciones),
    };

    setSubmitting(true);
    setExceptionFormError('');
    try {
      await configuracionApi.crearContratoExcepcion(currentContratoId, payload);
      setExceptionCreateOpen(false);
      setExceptionForm(blankExceptionForm());
      onFeedback({ tone: 'success', text: 'Excepcion documental registrada correctamente.' });
      await onRefresh();
    } catch (error) {
      setExceptionFormError(mapKnownError(error, 'No fue posible crear la excepcion.', {}));
    } finally {
      setSubmitting(false);
    }
  };

  const saveExceptionAction = async () => {
    if (!exceptionAction) return;
    setSubmitting(true);
    try {
      if (exceptionAction.mode === 'regularize') {
        await configuracionApi.regularizarContratoExcepcion(currentContratoId, exceptionAction.exception.id, { observaciones: toNullableText(exceptionActionObservation) });
      }
      if (exceptionAction.mode === 'revoke') {
        if (!exceptionActionReason.trim()) return;
        if (!window.confirm('Confirmar revocacion de la excepcion.')) return;
        const payload: RevocarContratoExcepcionPayload = { motivo: exceptionActionReason.trim(), observaciones: toNullableText(exceptionActionObservation) };
        await configuracionApi.revocarContratoExcepcion(currentContratoId, exceptionAction.exception.id, payload);
      }
      setExceptionAction(null);
      setExceptionActionReason('');
      setExceptionActionObservation('');
      onFeedback({ tone: 'success', text: 'Accion sobre excepcion ejecutada correctamente.' });
      await onRefresh();
    } catch (error) {
      onFeedback({ tone: 'error', text: mapKnownError(error, 'No fue posible gestionar la excepcion.', {}) });
    } finally {
      setSubmitting(false);
    }
  };

  const openRequirementUpload = (item: ContratoChecklistItem) => {
    openUploadModal({ categoria: item.categoria as DocumentCategory, requisito: item, documentoBase: item.documento_actual });
  };

  const openAlertContext = (alerta: ContratoAlertaRecord) => {
    const nextTab = resolveAlertTab(alerta.ruta_accion);
    if (nextTab) onDetailTabChange(nextTab);
  };

  const openExceptionCreate = (item?: ContratoChecklistItem) => {
    setExceptionCreateOpen(true);
    setExceptionForm(item ? { ...blankExceptionForm(), requisito_id: String(item.requisito_id), documento_id: item.documento_actual ? String(item.documento_actual.id) : '' } : blankExceptionForm());
    setExceptionFormError('');
  };

  const openDocumentAction = (mode: DocumentActionMode, document: ContratoDocumentoRecord) => {
    setDocumentAction({ mode, document });
    setDocumentActionReason('');
    setDocumentActionObservation('');
  };
  return (
    <div>
      <div className="cg-filters" style={{ marginBottom: 12 }}>
        <div className="cg-cat-tabs" style={{ marginBottom: 0 }}>
          {DETAIL_TABS.map((tab) => (
            <button key={tab.id} className={`cg-cat-tab ${detailTab === tab.id ? 'active' : ''}`} onClick={() => onDetailTabChange(tab.id)} type="button">
              {tab.label}
            </button>
          ))}
        </div>
        <button className="adm-btn secondary sm" type="button" onClick={() => void onRefresh()}><RefreshCcw size={13} /> Recargar</button>
      </div>

      {detailTab === 'resumen' && (
        <div className="cg-detail-grid">
          <div><span className="cg-detail-label">Numero</span><strong>{detail.contrato.numero_contrato}</strong></div>
          <div><span className="cg-detail-label">Empresa</span><strong>{detail.contrato.empresa.nombre_empresa ?? 'No disponible'}</strong></div>
          <div><span className="cg-detail-label">Estado contractual</span><strong>{detail.contrato.estado_contractual}</strong></div>
          <div><span className="cg-detail-label">Completitud</span><strong>{detail.checklist.completitud_porcentaje}%</strong></div>
          <div><span className="cg-detail-label">Fecha inicio</span><strong>{formatDate(detail.contrato.fecha_inicio)}</strong></div>
          <div><span className="cg-detail-label">Fecha final estimada</span><strong>{formatDate(detail.contrato.fecha_final_estimada)}</strong></div>
          <div><span className="cg-detail-label">Fecha final real</span><strong>{formatDate(detail.contrato.fecha_final_real)}</strong></div>
          <div><span className="cg-detail-label">Contrato padre</span><strong>{detail.contrato.contrato_padre_id ?? 'No aplica'}</strong></div>
          <div className="cg-detail-full"><span className="cg-detail-label">Objeto contractual</span><strong>{detail.contrato.objeto_contractual ?? 'No disponible'}</strong></div>
          <div className="cg-detail-full"><span className="cg-detail-label">Observaciones</span><strong>{detail.contrato.observaciones ?? 'Sin observaciones'}</strong></div>
          <div className="cg-detail-full"><span className="cg-detail-label">Indicadores</span><div className="cg-actions" style={{ flexWrap: 'wrap' }}><span className="adm-badge warning">Pendientes: {checklistSummary.pendientes}</span><span className="adm-badge inactive">Vencidos: {checklistSummary.vencidos}</span><span className="adm-badge warning">Revision: {checklistSummary.en_revision}</span><span className="adm-badge inactive">Devueltos: {checklistSummary.devueltos}</span><span className="adm-badge active">Alertas: {detail.alertas.length}</span></div></div>
          <div className="cg-detail-full"><span className="cg-detail-label">Ultimas actuaciones</span>{detail.resumen.ultimas_actuaciones.length === 0 ? <strong>Sin actuaciones registradas.</strong> : <div className="cg-chip-wrap">{detail.resumen.ultimas_actuaciones.map((evento) => <span key={evento.id} className={`adm-badge ${badgeTone(evento.estado_evento)}`}>{evento.tipo_evento} · {formatDate(evento.fecha_evento)}</span>)}</div>}</div>
        </div>
      )}

      {detailTab === 'expediente' && (
        <div>
          {detail.expediente.categorias.map((categoria) => (
            <div key={categoria.categoria} className="cg-table-card">
              <div className="cg-tab-header" style={{ padding: '14px 16px 0' }}>
                <div><h4 className="cg-tab-title"><FileText size={14} /> {CATEGORY_LABELS[categoria.categoria as DocumentCategory] ?? categoria.categoria}</h4><p className="cg-tab-subtitle">Documentos asociados a la categoria contractual.</p></div>
                {canUploadDocuments && <button className="adm-btn secondary sm" type="button" onClick={() => openUploadModal({ categoria: categoria.categoria as DocumentCategory })}><Upload size={13} /> Subir documento</button>}
              </div>
              {categoria.documentos.length === 0 ? <div className="cg-table-empty">Sin documentos en esta categoria.</div> : (
                <table className="adm-history">
                  <thead><tr><th>Documento</th><th>Tipo</th><th>Estado</th><th>Fechas</th><th>Version</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {categoria.documentos.map((documento) => (
                      <tr key={documento.id}>
                        <td><div className="cg-primary-cell">{documento.nombre_original}</div><div className="cg-secondary-cell">{documento.observaciones ?? 'Sin observaciones'}</div></td>
                        <td>{documento.tipo_documento.nombre ?? 'Sin tipo'}</td>
                        <td><span className={`adm-badge ${badgeTone(documento.estado_documental)}`}>{documento.estado_documental}</span></td>
                        <td><div className="cg-primary-cell">Exp.: {formatDate(documento.fecha_expedicion)}</div><div className="cg-secondary-cell">Vence: {formatDate(documento.fecha_vencimiento)}</div></td>
                        <td><div className="cg-primary-cell">v{documento.version}</div><div className="cg-secondary-cell">{documento.es_vigente ? 'Vigente' : 'Historica'}</div></td>
                        <td><div className="cg-actions" style={{ flexWrap: 'wrap' }}>
                          {canDownloadDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => void handleDownload(documento.id)}><Eye size={13} /> Ver</button>}
                          {canDownloadDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => void handleDownload(documento.id)}><Download size={13} /> Descargar</button>}
                          {canUploadDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => openUploadModal({ categoria: documento.categoria as DocumentCategory, documentoBase: documento })}><Plus size={13} /> Nueva version</button>}
                          <button className="adm-btn ghost sm" type="button" onClick={() => setHistoryDocument(documento)}><History size={13} /> Historial</button>
                          {canReviewDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => openDocumentAction('send_review', documento)}><FileClock size={13} /> Revision</button>}
                          {canReviewDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => openDocumentAction('approve', documento)}><CheckCircle2 size={13} /> Aprobar</button>}
                          {canReviewDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => openDocumentAction('return', documento)}><RotateCcw size={13} /> Devolver</button>}
                          {canReviewDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => openDocumentAction('annul', documento)}><Ban size={13} /> Anular</button>}
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {detailTab === 'requisitos' && (
        <ContratoRequisitosDocumentalesPanel
          contratoId={currentContratoId}
          onFeedback={onFeedback}
          permissions={permissions}
          tiposDocumentoBase={tiposDocumento}
        />
      )}

      {detailTab === 'checklist' && (
        <div className="cg-table-card">
          <div className="cg-tab-header" style={{ padding: '14px 16px 0' }}>
            <div><h4 className="cg-tab-title"><ShieldAlert size={14} /> Checklist contractual</h4><p className="cg-tab-subtitle">Estado por requisito, vigencia y excepcion.</p></div>
            <div className="cg-actions" style={{ flexWrap: 'wrap' }}><span className="adm-badge warning">Pendiente: {checklistSummary.pendientes}</span><span className="adm-badge active">Cumplido: {checklistSummary.cumplidos}</span><span className="adm-badge inactive">Vencido: {checklistSummary.vencidos}</span><span className="adm-badge warning">Revision: {checklistSummary.en_revision}</span><span className="adm-badge inactive">Devuelto: {checklistSummary.devueltos}</span><span className="adm-badge primary">Excepcion: {checklistSummary.aprobado_provisional}</span></div>
          </div>
          <table className="adm-history">
            <thead><tr><th>Requisito</th><th>Estado</th><th>Vencimiento</th><th>Criticidad</th><th>Responsable</th><th>Acciones</th></tr></thead>
            <tbody>
              {detail.checklist.items.map((item) => (
                <tr key={item.requisito_id}>
                  <td><div className="cg-primary-cell">{item.nombre_requisito}</div><div className="cg-secondary-cell">{item.documento_actual?.nombre_original ?? item.excepcion_actual?.motivo ?? 'Sin soporte actual'}</div></td>
                  <td><span className={`adm-badge ${badgeTone(item.estado)}`}>{item.estado}</span></td>
                  <td>{formatDate(item.fecha_vencimiento)}</td>
                  <td>{item.criticidad}</td>
                  <td>{item.responsable ?? 'No asignado'}</td>
                  <td><div className="cg-actions" style={{ flexWrap: 'wrap' }}>
                    <button className="adm-btn ghost sm" type="button" onClick={() => onDetailTabChange('expediente')}><Eye size={13} /> Abrir</button>
                    {canUploadDocuments && <button className="adm-btn ghost sm" type="button" onClick={() => openRequirementUpload(item)}><Upload size={13} /> Cargar</button>}
                    {canCreateExceptions && <button className="adm-btn ghost sm" type="button" onClick={() => openExceptionCreate(item)}><ShieldAlert size={13} /> Excepcion</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailTab === 'eventos' && (
        <div className="cg-table-card">
          <div className="cg-tab-header" style={{ padding: '14px 16px 0' }}>
            <div><h4 className="cg-tab-title"><ShieldAlert size={14} /> Historial de eventos</h4><p className="cg-tab-subtitle">Actuaciones con trazabilidad y anulacion logica.</p></div>
            {canCreateEvents && <button className="adm-btn primary sm" type="button" onClick={() => { setEventForm(blankEventForm()); setEventFormError(''); setEventModalOpen(true); }}><Plus size={13} /> Registrar evento</button>}
          </div>
          <table className="adm-history">
            <thead><tr><th>Evento</th><th>Fecha</th><th>Descripcion</th><th>Usuario</th><th>Soporte</th><th>Acciones</th></tr></thead>
            <tbody>
              {detail.eventos.items.map((evento) => (
                <tr key={evento.id}>
                  <td><div className="cg-primary-cell">{evento.tipo_evento}</div><div className="cg-secondary-cell">{evento.estado_evento}</div></td>
                  <td><div className="cg-primary-cell">{formatDate(evento.fecha_evento)}</div><div className="cg-secondary-cell">Creado: {formatDateTime(evento.created_at)}</div></td>
                  <td>{evento.descripcion ?? evento.motivo ?? 'Sin descripcion'}</td>
                  <td>{evento.usuario_creador.nombre ?? 'No disponible'}</td>
                  <td>{evento.documento_soporte_id ? `Documento #${evento.documento_soporte_id}` : 'Sin soporte'}</td>
                  <td><div className="cg-actions">{canCreateEvents && evento.activo && <button className="adm-btn ghost sm" type="button" onClick={() => { setEventCancelTarget(evento); setEventCancelReason(''); }}><XCircle size={13} /> Anular</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailTab === 'excepciones' && (
        <div className="cg-table-card">
          <div className="cg-tab-header" style={{ padding: '14px 16px 0' }}>
            <div><h4 className="cg-tab-title"><ShieldAlert size={14} /> Excepciones documentales</h4><p className="cg-tab-subtitle">Continuidad controlada con fecha limite y auditoria.</p></div>
            {canCreateExceptions && <button className="adm-btn primary sm" type="button" onClick={() => openExceptionCreate()}><Plus size={13} /> Crear excepcion</button>}
          </div>
          {detail.excepciones.length === 0 ? <div className="cg-table-empty">Sin excepciones registradas.</div> : (
            <table className="adm-history">
              <thead><tr><th>Contexto</th><th>Estado</th><th>Fecha limite</th><th>Autorizador</th><th>Motivo</th><th>Acciones</th></tr></thead>
              <tbody>
                {detail.excepciones.map((excepcion) => (
                  <tr key={excepcion.id}>
                    <td><div className="cg-primary-cell">{excepcion.requisito.nombre ?? excepcion.documento.nombre_original ?? 'Sin contexto'}</div><div className="cg-secondary-cell">Soporte: {excepcion.soporte_documento_id ? `Documento #${excepcion.soporte_documento_id}` : 'No registrado'}</div></td>
                    <td><span className={`adm-badge ${badgeTone(excepcion.estado)}`}>{excepcion.estado}</span></td>
                    <td>{formatDate(excepcion.fecha_limite_regularizacion)}</td>
                    <td>{excepcion.usuario_autorizador.nombre ?? 'No disponible'}</td>
                    <td>{excepcion.motivo}</td>
                    <td><div className="cg-actions" style={{ flexWrap: 'wrap' }}>
                      {canResolveExceptions && excepcion.estado === 'ABIERTA' && <button className="adm-btn ghost sm" type="button" onClick={() => { setExceptionAction({ mode: 'regularize', exception: excepcion }); setExceptionActionReason(''); setExceptionActionObservation(''); }}><CheckCircle2 size={13} /> Regularizar</button>}
                      {canResolveExceptions && excepcion.estado === 'ABIERTA' && <button className="adm-btn ghost sm" type="button" onClick={() => { setExceptionAction({ mode: 'revoke', exception: excepcion }); setExceptionActionReason(''); setExceptionActionObservation(''); }}><Ban size={13} /> Revocar</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {detailTab === 'alertas' && (
        <div>
          {detail.alertas.length === 0 ? <div className="adm-empty"><p>Sin alertas activas para este contrato.</p></div> : detail.alertas.map((alerta) => (
            <div key={`${alerta.tipo_alerta}-${alerta.fecha_alerta ?? 'na'}-${alerta.ruta_accion}`} className="adm-card">
              <div className="cg-tab-header" style={{ marginBottom: 10 }}>
                <div><h4 className="cg-tab-title"><AlertTriangle size={14} /> {alerta.titulo}</h4><p className="cg-tab-subtitle">{alerta.descripcion}</p></div>
                <span className={`adm-badge ${badgeTone(alerta.severidad)}`}>{alerta.severidad}</span>
              </div>
              <div className="cg-detail-grid">
                <div><span className="cg-detail-label">Tipo</span><strong>{alerta.tipo_alerta}</strong></div>
                <div><span className="cg-detail-label">Estado</span><strong>{alerta.estado}</strong></div>
                <div><span className="cg-detail-label">Fecha alerta</span><strong>{formatDate(alerta.fecha_alerta)}</strong></div>
                <div><span className="cg-detail-label">Fecha vencimiento</span><strong>{formatDate(alerta.fecha_vencimiento)}</strong></div>
                <div><span className="cg-detail-label">Dias restantes</span><strong>{alerta.dias_restantes ?? 'No aplica'}</strong></div>
                <div><span className="cg-detail-label">Ruta</span><strong>{alerta.ruta_accion || 'Sin ruta'}</strong></div>
              </div>
              {alerta.ruta_accion && <div className="cg-actions" style={{ marginTop: 12 }}><button className="adm-btn secondary sm" type="button" onClick={() => openAlertContext(alerta)}><Eye size={13} /> Abrir contexto</button></div>}
            </div>
          ))}
        </div>
      )}

      {eventModalOpen && <FormModal title="Registrar evento contractual" onClose={() => setEventModalOpen(false)} onSave={() => void saveEvent()} saving={submitting} saveLabel="Registrar evento" wide>
        <div className="adm-form-grid">
          <div className="adm-field"><label className="adm-label">Tipo</label><select className="adm-select" value={eventForm.tipo_evento} onChange={(event) => setEventForm((current) => ({ ...current, tipo_evento: event.target.value }))}>{EVENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
          <div className="adm-field"><label className="adm-label">Fecha *</label><input className="adm-input" type="date" value={eventForm.fecha_evento} onChange={(event) => setEventForm((current) => ({ ...current, fecha_evento: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Efecto desde</label><input className="adm-input" type="date" value={eventForm.fecha_efecto_desde} onChange={(event) => setEventForm((current) => ({ ...current, fecha_efecto_desde: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Efecto hasta</label><input className="adm-input" type="date" value={eventForm.fecha_efecto_hasta} onChange={(event) => setEventForm((current) => ({ ...current, fecha_efecto_hasta: event.target.value }))} /></div>
          <div className="adm-field full-width"><label className="adm-label">Descripcion</label><textarea className="adm-textarea" rows={3} value={eventForm.descripcion} onChange={(event) => setEventForm((current) => ({ ...current, descripcion: event.target.value }))} /></div>
          <div className="adm-field full-width"><label className="adm-label">Motivo</label><textarea className="adm-textarea" rows={3} value={eventForm.motivo} onChange={(event) => setEventForm((current) => ({ ...current, motivo: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Soporte</label><select className="adm-select" value={eventForm.documento_soporte_id} onChange={(event) => setEventForm((current) => ({ ...current, documento_soporte_id: event.target.value }))}><option value="">Sin soporte asociado</option>{documents.map((documento) => <option key={documento.id} value={documento.id}>{documento.nombre_original} · v{documento.version}</option>)}</select></div>
          <div className="adm-field"><label className="adm-label">Nueva fecha estimada</label><input className="adm-input" type="date" value={eventForm.fecha_final_estimada} onChange={(event) => setEventForm((current) => ({ ...current, fecha_final_estimada: event.target.value }))} /></div>
          <div className="adm-field"><label className="adm-label">Fecha final real</label><input className="adm-input" type="date" value={eventForm.fecha_final_real} onChange={(event) => setEventForm((current) => ({ ...current, fecha_final_real: event.target.value }))} /></div>
          <div className="adm-field full-width"><label className="adm-label">Observaciones contractuales</label><textarea className="adm-textarea" rows={3} value={eventForm.observaciones} onChange={(event) => setEventForm((current) => ({ ...current, observaciones: event.target.value }))} /></div>
        </div>
        {eventFormError && <div className="adm-notice warning"><AlertTriangle size={13} /> {eventFormError}</div>}
      </FormModal>}

      {eventCancelTarget && <FormModal title={`Anular evento ${eventCancelTarget.tipo_evento}`} onClose={() => setEventCancelTarget(null)} onSave={() => void saveEventCancellation()} saving={submitting} saveLabel="Anular evento"><div className="adm-field"><label className="adm-label">Motivo *</label><textarea className="adm-textarea" rows={4} value={eventCancelReason} onChange={(event) => setEventCancelReason(event.target.value)} /></div></FormModal>}
      {uploadContext && <FormModal title={uploadContext.documentoBase ? 'Subir nueva version documental' : 'Subir documento contractual'} onClose={() => setUploadContext(null)} onSave={() => void saveDocument()} saving={submitting} saveLabel="Cargar documento" wide><div className="adm-form-grid"><div className="adm-field"><label className="adm-label">Requisito</label><select className="adm-select" value={documentForm.requisito_id} onChange={(event) => setDocumentForm((current) => ({ ...current, requisito_id: event.target.value }))}><option value="">Sin requisito explicito</option>{requisitos.map((item) => <option key={item.requisito_id} value={item.requisito_id}>{item.nombre_requisito}</option>)}</select></div><div className="adm-field"><label className="adm-label">Tipo documental *</label><select className="adm-select" value={documentForm.tipo_documento_id} onChange={(event) => setDocumentForm((current) => ({ ...current, tipo_documento_id: event.target.value }))}><option value="">Seleccionar</option>{tiposDocumento.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><div className="adm-field"><label className="adm-label">Categoria</label><select className="adm-select" value={documentForm.categoria} onChange={(event) => setDocumentForm((current) => ({ ...current, categoria: event.target.value as DocumentCategory }))}><option value="CREACION_EMPRESA_JURIDICA">CREACION_EMPRESA_JURIDICA</option><option value="INICIO_CONTRATO">INICIO_CONTRATO</option><option value="EJECUCION">EJECUCION</option><option value="CIERRE">CIERRE</option></select></div><div className="adm-field"><label className="adm-label">Fecha expedicion</label><input className="adm-input" type="date" value={documentForm.fecha_expedicion} onChange={(event) => setDocumentForm((current) => ({ ...current, fecha_expedicion: event.target.value }))} /></div><div className="adm-field"><label className="adm-label">Fecha vencimiento</label><input className="adm-input" type="date" value={documentForm.fecha_vencimiento} onChange={(event) => setDocumentForm((current) => ({ ...current, fecha_vencimiento: event.target.value }))} /></div><div className="adm-field"><label className="adm-label">Vigencia dias</label><input className="adm-input" type="number" value={documentForm.vigencia_dias_configurada} onChange={(event) => setDocumentForm((current) => ({ ...current, vigencia_dias_configurada: event.target.value }))} /></div><div className="adm-field full-width"><label className="adm-label">Archivo *</label><input className="adm-input" type="file" onChange={(event) => setDocumentForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} /></div><div className="adm-field full-width"><label className="adm-label">Observaciones</label><textarea className="adm-textarea" rows={3} value={documentForm.observaciones} onChange={(event) => setDocumentForm((current) => ({ ...current, observaciones: event.target.value }))} /></div></div>{documentFormError && <div className="adm-notice warning"><AlertTriangle size={13} /> {documentFormError}</div>}</FormModal>}
      {documentAction && <FormModal title={`Gestionar documento ${documentAction.document.nombre_original}`} onClose={() => setDocumentAction(null)} onSave={() => void saveDocumentAction()} saving={submitting} saveLabel="Guardar accion"><div className="adm-notice info"><FileText size={13} /> Estado actual: {documentAction.document.estado_documental}</div>{(documentAction.mode === 'return' || documentAction.mode === 'annul') && <div className="adm-field"><label className="adm-label">Motivo *</label><textarea className="adm-textarea" rows={4} value={documentActionReason} onChange={(event) => setDocumentActionReason(event.target.value)} /></div>}<div className="adm-field"><label className="adm-label">Observacion</label><textarea className="adm-textarea" rows={3} value={documentActionObservation} onChange={(event) => setDocumentActionObservation(event.target.value)} /></div></FormModal>}
      {exceptionCreateOpen && <FormModal title="Crear excepcion documental" onClose={() => setExceptionCreateOpen(false)} onSave={() => void saveException()} saving={submitting} saveLabel="Registrar excepcion" wide><div className="adm-form-grid"><div className="adm-field"><label className="adm-label">Requisito</label><select className="adm-select" value={exceptionForm.requisito_id} onChange={(event) => setExceptionForm((current) => ({ ...current, requisito_id: event.target.value }))}><option value="">Seleccionar</option>{requisitos.map((item) => <option key={item.requisito_id} value={item.requisito_id}>{item.nombre_requisito}</option>)}</select></div><div className="adm-field"><label className="adm-label">Documento</label><select className="adm-select" value={exceptionForm.documento_id} onChange={(event) => setExceptionForm((current) => ({ ...current, documento_id: event.target.value }))}><option value="">Seleccionar</option>{documents.map((documento) => <option key={documento.id} value={documento.id}>{documento.nombre_original}</option>)}</select></div><div className="adm-field"><label className="adm-label">Soporte</label><select className="adm-select" value={exceptionForm.soporte_documento_id} onChange={(event) => setExceptionForm((current) => ({ ...current, soporte_documento_id: event.target.value }))}><option value="">Sin soporte</option>{documents.map((documento) => <option key={documento.id} value={documento.id}>{documento.nombre_original}</option>)}</select></div><div className="adm-field"><label className="adm-label">Fecha limite *</label><input className="adm-input" type="date" value={exceptionForm.fecha_limite_regularizacion} onChange={(event) => setExceptionForm((current) => ({ ...current, fecha_limite_regularizacion: event.target.value }))} /></div><div className="adm-field full-width"><label className="adm-label">Motivo *</label><textarea className="adm-textarea" rows={3} value={exceptionForm.motivo} onChange={(event) => setExceptionForm((current) => ({ ...current, motivo: event.target.value }))} /></div><div className="adm-field full-width"><label className="adm-label">Observaciones</label><textarea className="adm-textarea" rows={3} value={exceptionForm.observaciones} onChange={(event) => setExceptionForm((current) => ({ ...current, observaciones: event.target.value }))} /></div></div>{exceptionFormError && <div className="adm-notice warning"><AlertTriangle size={13} /> {exceptionFormError}</div>}</FormModal>}
      {exceptionAction && <FormModal title={exceptionAction.mode === 'regularize' ? 'Regularizar excepcion' : 'Revocar excepcion'} onClose={() => setExceptionAction(null)} onSave={() => void saveExceptionAction()} saving={submitting} saveLabel="Guardar accion">{exceptionAction.mode === 'revoke' && <div className="adm-field"><label className="adm-label">Motivo *</label><textarea className="adm-textarea" rows={4} value={exceptionActionReason} onChange={(event) => setExceptionActionReason(event.target.value)} /></div>}<div className="adm-field"><label className="adm-label">Observaciones</label><textarea className="adm-textarea" rows={3} value={exceptionActionObservation} onChange={(event) => setExceptionActionObservation(event.target.value)} /></div></FormModal>}
      {historyDocument && <FormModal title={`Historial de versiones · ${historyDocument.nombre_original}`} onClose={() => setHistoryDocument(null)} onSave={() => setHistoryDocument(null)} saveLabel="Cerrar" wide><div className="cg-table-card" style={{ marginBottom: 0 }}><table className="adm-history"><thead><tr><th>Version</th><th>Estado</th><th>Fechas</th><th>Revision</th></tr></thead><tbody>{getVersions(detail, historyDocument).map((item) => <tr key={item.id}><td><div className="cg-primary-cell">v{item.version}</div><div className="cg-secondary-cell">{item.es_vigente ? 'Vigente' : 'Historica'}</div></td><td><span className={`adm-badge ${badgeTone(item.estado_documental)}`}>{item.estado_documental}</span></td><td><div className="cg-primary-cell">Carga: {formatDateTime(item.fecha_carga)}</div><div className="cg-secondary-cell">Vence: {formatDate(item.fecha_vencimiento)}</div></td><td>{item.revisado_por?.nombre ?? 'Sin revision registrada'}</td></tr>)}</tbody></table></div></FormModal>}
    </div>
  );
}
