import type { CSSProperties, ReactNode } from "react";

export function SstTable({
  columns,
  gridTemplateColumns,
  minWidth = 960,
  maxHeight = 520,
  children,
}: {
  columns: string[];
  gridTemplateColumns: string;
  minWidth?: number;
  maxHeight?: number;
  children: ReactNode;
}) {
  const scrollStyle = {
    "--sst-cols": gridTemplateColumns,
    minWidth,
    maxHeight,
  } as CSSProperties;

  return (
    <div className="sst-table-wrap">
      <div className="sst-table-scroll" style={scrollStyle}>
        <div className="sst-table-head">
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>

        {children}
      </div>
    </div>
  );
}
