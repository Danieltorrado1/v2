import type { ComponentType } from "react";
import { ChevronDown, Search } from "lucide-react";

export type SstToolbarAction = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  primary?: boolean;
  onClick?: () => void;
};

export function SstToolbar({
  actions,
  searchPlaceholder,
  filters,
}: {
  actions: SstToolbarAction[];
  searchPlaceholder?: string;
  filters?: string[];
}) {
  return (
    <div className="sst-toolbar">
      <div className="sst-toolbar-row">
        <div className="sst-toolbar-actions">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.label}
                type="button"
                className={`sst-button ${action.primary ? "primary" : ""}`}
                onClick={action.onClick}
              >
                <Icon size={16} />
                {action.label}
              </button>
            );
          })}
        </div>

        {searchPlaceholder && (
          <div className="sst-search">
            <Search size={17} />
            <input placeholder={searchPlaceholder} />
          </div>
        )}
      </div>

      {filters && filters.length > 0 && (
        <div className="sst-filters">
          {filters.map((label) => (
            <div className="sst-select-wrap" key={label}>
              <select className="sst-select" defaultValue={label}>
                <option value={label}>{label}</option>
              </select>
              <ChevronDown size={14} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
