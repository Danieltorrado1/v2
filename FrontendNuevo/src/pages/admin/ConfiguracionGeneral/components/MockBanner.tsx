import { AlertTriangle } from 'lucide-react';

interface MockBannerProps {
  entity: string;
}

export function MockBanner({ entity }: MockBannerProps) {
  return (
    <div className="adm-notice warning" style={{ marginBottom: 16, fontSize: 12 }}>
      <AlertTriangle size={13} />
      <strong>MOCK</strong> — {entity}: sin endpoint backend real. Los datos mostrados son de muestra.
    </div>
  );
}
