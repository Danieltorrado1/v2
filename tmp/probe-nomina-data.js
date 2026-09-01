require('dotenv').config({ path: '.env.qa' });
const jwt = require('jsonwebtoken');

const API = 'http://localhost:4000/api';
const userId = '9';
const empresaId = '3';

const token = jwt.sign(
  { email: 'admin.qa@empiria.example', permissions: [], roles: ['ADMINISTRADOR'] },
  process.env.JWT_SECRET,
  { subject: userId, expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
);

async function api(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const periodos = await api(`/nomina/periodos?page=1&limit=20&empresa_id=${empresaId}`);
  const categorias = await api(`/company-settings/${empresaId}/salary-categories`);
  const openPeriodo = periodos?.data?.items?.find((item) => item.estado === 'ABIERTO') ?? periodos?.data?.items?.[0] ?? null;
  const empleados = openPeriodo
    ? await api(`/nomina/periodos/${openPeriodo.id}/empleados?page=1&limit=10`)
    : null;

  console.log(JSON.stringify({
    openPeriodo,
    periodos: periodos?.data?.items ?? [],
    categorias: categorias?.data ?? [],
    empleados: empleados?.data?.items ?? []
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
