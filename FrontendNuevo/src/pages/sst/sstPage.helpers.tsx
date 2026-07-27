import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type SstTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

export type SstOption = {
  value: string;
  label: string;
};

function parseSstDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  return new Date(value);
}

export function titleCase(value: string | null | undefined): string {
  if (!value) {
    return "No disponible";
  }

  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "No disponible";
  }

  const parsed = parseSstDate(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(parsed);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "No disponible";
  }

  const parsed = parseSstDate(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0";
  }

  return value.toLocaleString("es-CO");
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0%";
  }

  return `${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
}

export function normalizeTextValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function todayIso(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toInputDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export function toInputTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 5);
}

export function getPageRange(current: number, totalPages: number): number[] {
  if (totalPages <= 0) {
    return [];
  }

  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, start + 4);
  const adjustedStart = Math.max(1, end - 4);
  const pages: number[] = [];

  for (let page = adjustedStart; page <= end; page += 1) {
    pages.push(page);
  }

  return pages;
}

export function StateCard({
  title,
  message,
  tone = "neutral",
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  tone?: "neutral" | "error";
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`sst-state-card ${tone}`}>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="sst-button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function InlineNotice({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: ReactNode;
  tone?: SstTone;
}) {
  return (
    <div className={`sst-inline-notice ${tone}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function Paginator({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = getPageRange(page, totalPages);

  return (
    <div className="sst-pagination">
      <span>{`Pagina ${page} de ${Math.max(totalPages, 1)} - ${formatNumber(total)} registros`}</span>
      <div className="sst-pagination-actions">
        <button type="button" className="sst-button" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft size={16} />
          Anterior
        </button>
        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={`sst-page-button${pageNumber === page ? " active" : ""}`}
            onClick={() => onChange(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          className="sst-button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Siguiente
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="sst-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="sst-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="sst-modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="sst-icon-button" onClick={onClose} aria-label="Cerrar modal">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="sst-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
