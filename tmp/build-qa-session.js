require('dotenv').config({ path: '.env.qa' });
const jwt = require('jsonwebtoken');
const fs = require('node:fs');

const user = {
  id: '9',
  email: 'admin.qa@empiria.example',
  name: 'QA ADMIN EMPIRIA',
  active: true,
  roles: ['ADMINISTRADOR'],
  permissions: [
    'nomina.economico.read',
    'nomina.parametros.manage',
    'nomina.categorias.manage',
    'nomina.read',
    'nomina.operativa.read'
  ],
  createdAt: '2026-08-28T22:04:17.658Z',
  updatedAt: '2026-08-28T22:04:17.658Z'
};
const accessToken = jwt.sign(
  { email: user.email, permissions: user.permissions, roles: user.roles },
  process.env.JWT_SECRET,
  { subject: user.id, expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
);
fs.writeFileSync('tmp/qa-session.json', JSON.stringify({ accessToken, user }, null, 2));
console.log(JSON.stringify({ accessToken, user }, null, 2));
