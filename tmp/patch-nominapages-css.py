from pathlib import Path
path = Path('FrontendNuevo/src/pages/nomina/NominaPages.css')
source = path.read_text(encoding='utf-8').replace('\r\n','\n')
source = source.replace(""".payroll-process-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:1rem; }
.payroll-process-card { display:flex; flex-direction:column; gap:.45rem; padding:1.25rem; border:1px solid var(--border-color,#d7dbe2); border-radius:12px; text-decoration:none; color:inherit; background:var(--surface-color,#fff); }
.payroll-process-card small { color:var(--accent-color,#2563eb); font-weight:600; }""", """.payroll-process-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:1rem; }
.payroll-process-card {
  display:flex;
  flex-direction:column;
  gap:.5rem;
  padding:1.25rem;
  border:1px solid color-mix(in srgb, var(--border-color) 82%, var(--color-primary) 18%);
  border-radius:16px;
  text-decoration:none;
  color:var(--text-primary);
  background:color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-panel) 12%);
  box-shadow:var(--shadow-soft);
  transition:border-color .15s ease, background-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.payroll-process-card strong { color:var(--text-primary); font-size:1.05rem; }
.payroll-process-card span { color:var(--text-secondary); line-height:1.45; }
.payroll-process-card small { color:var(--color-primary); font-weight:700; }
.payroll-process-card:hover {
  border-color:color-mix(in srgb, var(--color-primary) 34%, var(--border-color));
  background:color-mix(in srgb, var(--bg-secondary) 70%, var(--color-primary) 6%);
  transform:translateY(-1px);
}
.payroll-process-card:focus-visible {
  outline:none;
  border-color:var(--color-primary);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--color-primary) 16%, transparent), var(--shadow-soft);
}
[data-theme="dark"] .payroll-process-card {
  background:color-mix(in srgb, var(--bg-secondary) 84%, var(--bg-panel) 16%);
  border-color:color-mix(in srgb, var(--border-color) 72%, var(--color-primary) 28%);
}
[data-theme="dark"] .payroll-process-card span { color:color-mix(in srgb, var(--text-primary) 78%, var(--text-secondary) 22%); }
[data-theme="dark"] .payroll-process-card small { color:color-mix(in srgb, var(--color-primary) 78%, #ffffff 22%); }""", 1)
append = """
.nomina-assignment-flow { display:flex; flex-direction:column; gap:16px; }
.nomina-assignment-step-title {
  font-size:12px;
  font-weight:800;
  letter-spacing:.04em;
  text-transform:uppercase;
  color:var(--text-secondary);
}
.nomina-assignment-summary {
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  gap:10px 16px;
  padding:12px 14px;
  border:1px solid var(--border-color);
  border-radius:12px;
  background:var(--bg-panel);
  color:var(--text-primary);
}
.nomina-assignment-summary strong { font-size:13px; }
.nomina-assignment-summary span { font-size:12px; color:var(--text-secondary); }
.nomina-assignment-final {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  padding:16px;
  border:1px solid color-mix(in srgb, var(--color-primary) 22%, var(--border-color));
  border-radius:14px;
  background:color-mix(in srgb, var(--color-primary) 6%, var(--bg-secondary));
}
.nomina-assignment-final .cg-actions { display:flex; flex-wrap:wrap; gap:10px; }
@media (max-width: 760px) {
  .nomina-assignment-final { flex-direction:column; }
}
"""
if append not in source:
    source = source + append
path.write_text(source.replace('\n','\r\n'), encoding='utf-8')
