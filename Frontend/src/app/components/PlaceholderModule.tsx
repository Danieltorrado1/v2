import { Construction } from "lucide-react";

interface PlaceholderModuleProps {
  title: string;
  description: string;
}

export function PlaceholderModule({ title, description }: PlaceholderModuleProps) {
  return (
    <div className="p-6">
      <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>{title}</h1>
      <p className="text-muted-foreground text-xs mt-0.5 mb-8">{description}</p>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Construction className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-foreground" style={{ fontWeight: 600 }}>Módulo en construcción</p>
        <p className="text-muted-foreground text-sm mt-1 max-w-xs">Este módulo estará disponible próximamente. Contacta al administrador para más información.</p>
      </div>
    </div>
  );
}
