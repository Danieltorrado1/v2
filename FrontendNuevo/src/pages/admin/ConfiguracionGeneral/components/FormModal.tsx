import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface FormModalProps {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  children: ReactNode;
  wide?: boolean;
}

export function FormModal({ title, onClose, onSave, saving, saveLabel = 'Guardar', children, wide }: FormModalProps) {
  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div
        className="adm-modal"
        style={wide ? { maxWidth: 700 } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-modal-header">
          <h3>{title}</h3>
          <button className="adm-btn ghost sm" type="button" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="adm-modal-body">{children}</div>
        <div className="adm-modal-footer">
          <button className="adm-btn secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="adm-btn primary" type="button" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando...' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
