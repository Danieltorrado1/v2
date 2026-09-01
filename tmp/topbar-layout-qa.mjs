import fs from "node:fs";
import path from "node:path";
import { chromium } from "../tmp-sst-qa/node_modules/playwright-core/index.mjs";

const EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const css = fs.readFileSync(path.resolve("FrontendNuevo/src/layouts/MainLayout.css"), "utf8");

const baseStyles = `
:root {
  --bg-primary: #f4f7fb;
  --bg-secondary: #ffffff;
  --text-primary: #132238;
  --text-secondary: #49586d;
  --text-muted: #6f7f91;
  --border-color: rgba(17, 39, 72, 0.12);
  --topbar-bg: rgba(255, 255, 255, 0.95);
  --color-primary: #1167d8;
  --color-danger: #d92d20;
  --danger-foreground: #ffffff;
  --radius-button: 12px;
  --radius-card: 18px;
  --shadow-soft: 0 10px 30px rgba(16, 34, 64, 0.08);
}
html, body { margin: 0; padding: 0; }
body { font-family: Segoe UI, Arial, sans-serif; }
[data-theme="dark"] {
  --bg-primary: #0c1726;
  --bg-secondary: #122033;
  --text-primary: #eef4ff;
  --text-secondary: #c3d3ea;
  --text-muted: #92a8c4;
  --border-color: rgba(199, 218, 247, 0.14);
  --topbar-bg: rgba(10, 22, 36, 0.95);
  --color-primary: #6ab0ff;
  --color-danger: #ff6b6b;
  --danger-foreground: #0f1720;
  --shadow-soft: 0 10px 30px rgba(0, 0, 0, 0.28);
}
.qa-shell { min-height: 100vh; background: var(--bg-primary); }
.qa-icon { display: inline-flex; width: 14px; justify-content: center; font-size: 12px; }
`;

const logoSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="188" height="48" viewBox="0 0 188 48">
  <rect width="188" height="48" rx="8" fill="transparent"/>
  <text x="0" y="31" font-family="Segoe UI, Arial" font-size="26" font-weight="700" fill="#1167d8">EMPIRIA</text>
</svg>`);

function html(theme) {
  return `<!doctype html>
  <html data-theme="${theme}">
    <head>
      <meta charset="utf-8" />
      <style>${baseStyles}\n${css}</style>
    </head>
    <body>
      <div class="qa-shell">
        <header class="topbar">
          <a class="logo-area logo-link" aria-label="Empiria">
            <img alt="Empiria" src="data:image/svg+xml;charset=utf-8,${logoSvg}" class="logo-image logo-image--${theme}" />
          </a>
          <nav class="menu">
            <a class="menu-navlink">Dashboard</a>
            <a class="menu-navlink">Personal</a>
            <div class="menu-dropdown"><button type="button" class="menu-dropdown-trigger">Nómina <span class="qa-icon">⌄</span></button></div>
            <div class="menu-dropdown"><button type="button" class="menu-dropdown-trigger">Herramientas <span class="qa-icon">⌄</span></button></div>
            <div class="menu-dropdown"><button type="button" class="menu-dropdown-trigger">SST <span class="qa-icon">⌄</span></button></div>
            <a class="menu-navlink">Portal</a>
            <div class="menu-dropdown"><button type="button" class="menu-dropdown-trigger">Repositorio <span class="qa-icon">⌄</span></button></div>
            <a class="menu-navlink">Configuración</a>
          </nav>
          <div class="right-side">
            <label class="company-context-control" title="Empresa activa de prueba muy larga para validar truncado">
              <span class="qa-icon">▣</span>
              <select aria-label="Empresa activa"><option>Empresa activa de prueba muy larga para validar truncado</option></select>
              <span class="qa-icon">⌄</span>
            </label>
            <button type="button" class="notif-bell-button" aria-label="Abrir notificaciones"><span>🔔</span></button>
            <button type="button" class="theme-button" aria-label="Cambiar tema"><span>◐</span></button>
            <div class="account-area">
              <button type="button" class="account-trigger" aria-label="Abrir menu de cuenta">
                <span class="account-avatar">AU</span>
                <span class="account-copy"><strong>Usuario Administrador</strong><small>ADMINISTRADOR</small></span>
                <span class="qa-icon">⌄</span>
              </button>
            </div>
          </div>
        </header>
      </div>
    </body>
  </html>`;
}

function overlaps(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

const widths = [1920, 1600, 1366];
const themes = ["light", "dark"];
const browser = await chromium.launch({ headless: true, executablePath: EDGE_PATH });
const results = [];

try {
  for (const width of widths) {
    for (const theme of themes) {
      const page = await browser.newPage({ viewport: { width, height: 220 } });
      await page.setContent(html(theme), { waitUntil: "load" });
      const result = await page.evaluate(() => {
        const topbar = document.querySelector('.topbar');
        const logo = document.querySelector('.logo-area');
        const menu = document.querySelector('.menu');
        const right = document.querySelector('.right-side');
        const company = document.querySelector('.company-context-control');
        const bell = document.querySelector('.notif-bell-button');
        const themeButton = document.querySelector('.theme-button');
        const account = document.querySelector('.account-area');
        const menuItems = Array.from(document.querySelectorAll('.menu-navlink, .menu-dropdown-trigger'));
        const rect = (node) => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        const topbarRect = rect(topbar);
        const itemRects = menuItems.map((node) => ({ text: node.textContent.replace(/\s+/g, ' ').trim(), rect: rect(node) }));
        return {
          viewport: window.innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          topbarScrollWidth: topbar.scrollWidth,
          topbarClientWidth: topbar.clientWidth,
          topbar: topbarRect,
          logo: rect(logo),
          menu: rect(menu),
          right: rect(right),
          company: rect(company),
          bell: rect(bell),
          themeButton: rect(themeButton),
          account: rect(account),
          items: itemRects,
        };
      });
      const menuItemsVisible = result.items.every((item) => item.rect.left >= result.topbar.left - 1 && item.rect.right <= result.topbar.right + 1);
      const topbarGroupsOrdered = result.logo.right <= result.menu.left + 1 && result.menu.right <= result.right.left + 1;
      const topbarGroupsVisible = [result.logo, result.menu, result.right, result.company, result.bell, result.themeButton, result.account]
        .every((box) => box.left >= result.topbar.left - 1 && box.right <= result.topbar.right + 1);
      const noTopbarOverflow = result.docScrollWidth <= result.viewport + 1 && result.bodyScrollWidth <= result.viewport + 1 && result.topbarScrollWidth <= result.topbarClientWidth + 1;
      const noMenuOverlap = result.items.every((item, index, all) => index === 0 || all[index - 1].rect.right <= item.rect.left + 1);
      const noGroupOverlap = !overlaps(result.logo, result.menu) && !overlaps(result.menu, result.right) && !overlaps(result.company, result.bell) && !overlaps(result.bell, result.themeButton) && !overlaps(result.themeButton, result.account);
      results.push({ width, theme, pass: menuItemsVisible && topbarGroupsOrdered && topbarGroupsVisible && noTopbarOverflow && noMenuOverlap && noGroupOverlap, checks: { menuItemsVisible, topbarGroupsOrdered, topbarGroupsVisible, noTopbarOverflow, noMenuOverlap, noGroupOverlap }, metrics: result });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
