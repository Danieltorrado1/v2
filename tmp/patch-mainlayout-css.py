from pathlib import Path
path = Path('FrontendNuevo/src/layouts/MainLayout.css')
source = path.read_text(encoding='utf-8').replace('\r\n','\n')
source = source.replace(""".logo-area {
  min-width: 196px;
  min-height: 56px;
}

.logo-link {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  text-decoration: none;
  overflow: hidden;
}

.logo-image {
  max-width: 100%;
  display: block;
  object-fit: contain;
  object-position: left center;
}

.logo-image--dark {
  width: 220px;
  height: 56px;
}

.logo-image--light {
  width: 188px;
  height: 52px;
}""", """.logo-area {
  width: 196px;
  height: 56px;
  min-width: 196px;
  min-height: 56px;
  flex: 0 0 196px;
}

.logo-link {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  text-decoration: none;
  overflow: hidden;
}

.logo-image {
  width: 100%;
  height: 100%;
  max-width: none;
  display: block;
  object-fit: contain;
  object-position: left center;
}

.logo-image--light {
  transform: scale(1);
  transform-origin: left center;
}

.logo-image--dark {
  object-fit: cover;
  object-position: left center;
  transform: translateX(-2px) scale(1.08);
  transform-origin: left center;
}""", 1)
source = source.replace("""/* Shared shell geometry stays identical across themes. */
.layout { height: 100dvh; min-height: 100dvh; }
.logo-area { width: 196px; height: 56px; min-width: 196px; min-height: 56px; flex: 0 0 196px; }
.logo-link { width: 196px; height: 56px; flex: 0 0 196px; }
.logo-image--light, .logo-image--dark { width: 196px; height: 56px; flex: 0 0 196px; object-fit: contain; }
.content, .page-scroll, .page-content { min-height: 0; }
@media (max-width: 900px) { .topbar { gap: 14px; padding-inline: 18px; } .logo-area, .logo-link, .logo-image--light, .logo-image--dark { width: 160px; min-width: 160px; flex-basis: 160px; } }""", """/* Shared shell geometry stays identical across themes. */
.layout { height: 100dvh; min-height: 100dvh; }
.logo-link { flex: 0 0 auto; }
.logo-image--light, .logo-image--dark { width: 100%; height: 100%; }
.content, .page-scroll, .page-content { min-height: 0; }
@media (max-width: 900px) {
  .topbar { gap: 14px; padding-inline: 18px; }
  .logo-area { width: 160px; min-width: 160px; flex-basis: 160px; }
}
""", 1)
path.write_text(source.replace('\n','\r\n'), encoding='utf-8')
