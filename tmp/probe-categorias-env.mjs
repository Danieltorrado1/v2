const API = 'http://localhost:4000/api';
const body = { email: 'admin@empiria.local', password: 'Admin123456*' };
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const loginJson = await login.json();
const token = loginJson.data.accessToken;
for (const path of ['/tenant/me', '/nomina/periodos?page=1&limit=20', '/nomina/periodos?page=1&limit=100&empresa_id=3']) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  console.log(`PATH ${path}`);
  console.log(text);
}
