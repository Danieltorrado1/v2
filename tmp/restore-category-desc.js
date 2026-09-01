require('dotenv').config({ path: '.env.qa' });
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { email: 'admin.qa@empiria.example', permissions: [], roles: ['ADMINISTRADOR'] },
  process.env.JWT_SECRET,
  { subject: '9', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
);

async function main() {
  const body = {
    nombre_categoria: 'QA CATEGORIA CAA1',
    modalidad: 'CAA',
    descripcion: 'Categoría salarial ficticia QA',
    vigente_desde: '2099-08-01',
    vigente_hasta: '2099-08-31',
    salario_base: 1800000,
    auxilio_transporte: 249000,
    otros_recargos: 120000,
    activo: true,
  };
  const response = await fetch('http://localhost:4000/api/company-settings/3/salary-categories/3', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  console.log(response.status);
  console.log(await response.text());
}

main().catch((error) => { console.error(error); process.exit(1); });
