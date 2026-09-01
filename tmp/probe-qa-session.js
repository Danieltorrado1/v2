require('dotenv').config({ path: '.env.qa' });
const jwt = require('jsonwebtoken');

const API = 'http://localhost:4000/api';
const userId = process.argv[2] || '9';

const token = jwt.sign(
  {
    email: 'admin.qa@empiria.example',
    permissions: [],
    roles: ['ADMINISTRADOR'],
  },
  process.env.JWT_SECRET,
  {
    subject: userId,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  }
);

async function api(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function main() {
  const [me, tenant] = await Promise.all([
    api('/auth/me'),
    api('/tenant/me'),
  ]);

  console.log(JSON.stringify({ token, me, tenant }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
