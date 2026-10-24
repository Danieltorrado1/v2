import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import bcrypt from 'bcryptjs';
import baseline from './fixtures/auth-public-schema.production-baseline.json';

const normalize = (source: string) => source.replace(/\r\n/g, '\n')
  .replace(/\b(FROM|JOIN|INTO|UPDATE)(\s+)public\./gi, '$1$2');
const hash = (source: string) => createHash('sha256').update(source).digest('hex');

test('hotfix SQL: únicamente calificación de esquema respecto al SHA productivo', () => {
  for (const [file, expected] of Object.entries(baseline.normalizedSqlHashes)) {
    assert.equal(hash(normalize(readFileSync(file, 'utf8'))), expected, file);
  }
  for (const [file, expected] of Object.entries(baseline.preservedFileHashes)) {
    assert.equal(hash(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')), expected, file);
  }
});

const schema = `
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, encrypted_password text);
  CREATE TABLE public.usuarios (id bigint PRIMARY KEY, auth_user_id uuid,
    correo text, nombre_completo text, activo boolean, created_at timestamptz);
  CREATE TABLE public.roles (id bigint PRIMARY KEY, nombre_rol text, activo boolean);
  CREATE TABLE public.usuario_roles (usuario_id bigint, rol_id bigint, activo boolean);
  CREATE TABLE public.permisos (id bigint PRIMARY KEY, modulo text, accion text, activo boolean);
  CREATE TABLE public.rol_permisos (rol_id bigint, permiso_id bigint, activo boolean);
  CREATE TABLE public.usuario_empresas (usuario_id bigint, empresa_id bigint, activo boolean);
  CREATE TABLE public.usuario_contratos (usuario_id bigint, contrato_id bigint, activo boolean);
  CREATE TABLE public.organizaciones (id bigint PRIMARY KEY, codigo text, nombre text, estado text);
  CREATE TABLE public.empresas (id bigint PRIMARY KEY, organizacion_id bigint, nombre_empresa text, nit text, activo boolean);
  CREATE TABLE public.contratos (id bigint PRIMARY KEY, empresa_id bigint, numero_contrato text, entidad_contratante text);
  CREATE TABLE public.vinculaciones (id bigint PRIMARY KEY, persona_id bigint, contrato_id bigint, estado_vinculacion text);
  CREATE TABLE public.planes (id bigint PRIMARY KEY, codigo text, nombre text);
  CREATE TABLE public.modulos (id bigint PRIMARY KEY, codigo text, nombre text, activo boolean, orden int);
  CREATE TABLE public.plan_modulos (plan_id bigint, modulo_id bigint, habilitado boolean);
  CREATE TABLE public.empresa_suscripciones (id bigint PRIMARY KEY, empresa_id bigint,
    plan_id bigint, estado text, fecha_inicio date, fecha_fin date);
  CREATE TABLE public.empresa_modulo_overrides (id bigint PRIMARY KEY, empresa_id bigint,
    modulo_id bigint, habilitado boolean, motivo text, fecha_inicio date, fecha_fin date);
  CREATE TABLE public.auditoria_eventos (usuario_id bigint, empresa_id bigint, contrato_id bigint,
    modulo text, entidad text, entidad_id text, accion text, descripcion text,
    datos_anteriores jsonb, datos_nuevos jsonb, ip_address text, user_agent text, fecha_evento timestamptz);
  CREATE TABLE public.auditoria (usuario_id bigint, accion text, tabla_afectada text, registro_id bigint,
    descripcion text, datos_anteriores jsonb, datos_nuevos jsonb, ip text, user_agent text);
  CREATE TABLE public.historial_cambios (usuario_id bigint, tabla_afectada text, registro_id bigint,
    campo text, valor_anterior text, valor_nuevo text, motivo text);
  INSERT INTO public.roles VALUES (1,'TALENTO_HUMANO',true),(2,'ADMINISTRADOR',true),(3,'DESACTIVADO',false);
  INSERT INTO public.permisos VALUES (1,'dashboard','read',true),(2,'nomina','read',true),(3,'prohibido','read',false);
  INSERT INTO public.rol_permisos VALUES (1,1,true),(1,2,true),(1,3,true),(2,1,true);
  INSERT INTO public.usuario_roles VALUES (1,1,true),(1,3,true),(2,1,true),(3,2,true);
  INSERT INTO public.usuario_empresas VALUES (1,10,true),(1,20,false);
  INSERT INTO public.usuario_contratos VALUES (1,100,true);
  INSERT INTO public.organizaciones VALUES (1,'SYN','Sintetica','ACTIVA');
  INSERT INTO public.empresas VALUES (10,1,'Empresa A','SYN-A',true),(20,1,'Empresa B','SYN-B',true);
  INSERT INTO public.contratos VALUES (100,10,'A-100','Sintetica'),(200,20,'B-200','Sintetica');
  INSERT INTO public.planes VALUES (1,'BASE','Plan base');
  INSERT INTO public.modulos VALUES (1,'PERSONAL','Personal',true,1),(2,'NOMINA','Nomina',true,2),(3,'SST','SST',true,3);
  INSERT INTO public.plan_modulos VALUES (1,1,true),(1,2,false),(1,3,true);
  INSERT INTO public.empresa_suscripciones VALUES (1,10,1,'ACTIVA','2000-01-01',NULL),(2,20,1,'SUSPENDIDA','2000-01-01',NULL);
  INSERT INTO public.empresa_modulo_overrides VALUES (1,10,3,false,'Sintetico','2000-01-01',NULL);
`;

test('HTTP auth y bootstrap conservan comportamiento con search_path vacío', async t => {
  // Configure before loading the backend. No local .env or external DB is used.
  Object.assign(process.env, {
    APP_NAME:'auth-schema-test', API_PREFIX:'/api', NODE_ENV:'production', PORT:'4000',
    DATABASE_URL:'postgres://synthetic:synthetic@127.0.0.1:1/forbidden',
    JWT_SECRET:'synthetic-test-secret-only', JWT_EXPIRES_IN:'1h', CORS_ORIGIN:'http://localhost',
    TRUST_PROXY:'false', RATE_LIMIT_WINDOW_MINUTES:'1', RATE_LIMIT_MAX_REQUESTS:'100',
    LOG_LEVEL:'error', ENABLE_JOBS:'false', SUPABASE_URL:'https://example.invalid',
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-only', SUPABASE_STORAGE_BUCKET:'synthetic-only'
  });
  const { dbPool } = await import('../config/db.js');
  const { authRouter } = await import('../modules/auth/auth.routes.js');
  const { tenantRoutes } = await import('../modules/tenant/tenant.routes.js');
  const { saasRoutes } = await import('../modules/saas/saas.routes.js');
  const { errorHandler } = await import('../middlewares/errorHandler.js');
  const { AUTH_USER_LOOKUP_QUERY } = await import('../middlewares/authMiddleware.js');
  const { registerAuditEntry } = await import('../modules/auditoria/auditoria.helper.js');
  const db = new PGlite();
  let server: Server | undefined;
  let legacySql = false;
  const errors: unknown[][] = [];
  const executed: string[] = [];
  const adapter = {
    async query(sql: string, params?: unknown[]) {
      executed.push(sql);
      return db.query(legacySql ? normalize(sql) : sql, params);
    },
    release() {}
  };
  mock.method(dbPool, 'connect', async () => adapter as never);
  mock.method(dbPool, 'query', async (sql: string, params?: unknown[]) => adapter.query(sql, params) as never);
  mock.method(console, 'error', (...args: unknown[]) => { errors.push(args); });
  const context = async () => (await db.query<{ path: string; resolved: string | null; qualified: string }>(
    `SELECT current_setting('search_path') path, to_regclass('usuarios')::text resolved,
      to_regclass('public.usuarios')::text qualified`)).rows[0]!;
  try {
    await db.exec(schema);
    const passwordHash = await bcrypt.hash('Synthetic-password-42', 4);
    for (const [id, email, active] of [[1,'active@example.test',true],[2,'inactive@example.test',false],[3,'global@example.test',true]] as const) {
      const uuid = `00000000-0000-4000-8000-${String(id).padStart(12,'0')}`;
      await db.query('INSERT INTO auth.users VALUES ($1,$2)', [uuid,passwordHash]);
      await db.query(`INSERT INTO public.usuarios VALUES ($1,$2,$3,$4,$5,'2026-01-01T00:00:00Z')`, [id,uuid,email,`Synthetic ${id}`,active]);
    }
    await db.exec(`SET search_path TO '';`);
    assert.deepEqual(await context(), { path:'""', resolved:null, qualified:'public.usuarios' });
    await t.test('consulta productiva original reproduce 42P01 y auth.users queda intacta', async () => {
      await assert.rejects(db.query(baseline.originalMiddlewareSql,['1']), { code:'42P01' });
      const originalLoginSql = baseline.originalLoginSql;
      assert.equal(originalLoginSql.slice(1876,1884),'usuarios');
      await assert.rejects(db.query(originalLoginSql,['active@example.test']), {code:'42P01',position:'1877'});
      assert.equal((await db.query(AUTH_USER_LOOKUP_QUERY,['1'])).rows.length,1);
      assert.match(readFileSync('src/modules/users/users.service.ts','utf8'), /INNER JOIN auth\.users au/);
    });
    const app = express();
    app.use(express.json());
    app.use('/api/auth',authRouter);
    app.use('/api/tenant',tenantRoutes);
    app.use('/api/saas',saasRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0,'127.0.0.1',()=>resolve(listening));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const request = async (path: string, token?: string, body?: unknown) => {
      const response = await fetch(base+path, { method:body ? 'POST':'GET',
        headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`}:{})},
        body:body ? JSON.stringify(body):undefined });
      return {status:response.status,body:await response.json() as any};
    };
    const login = (email='active@example.test', password='Synthetic-password-42') => request('/auth/login',undefined,{email,password});
    let token = '';
    await t.test('login válido devuelve JWT, roles/permisos actuales y ambas auditorías', async () => {
      const response = await login();
      assert.equal(response.status,200);
      assert.equal(response.body.success,true);
      const session = response.body.data;
      token = session.accessToken;
      assert.equal(typeof token,'string');
      assert.equal(session.tokenType,'Bearer');
      assert.equal(session.expiresIn,'1h');
      assert.equal(session.user.id,'1');
      assert.deepEqual(session.user.roles,['TALENTO_HUMANO']);
      assert.deepEqual(session.user.permissions,['dashboard.read','nomina.read']);
      assert.equal(session.user.isGlobalAdmin,false);
      for (const table of ['auditoria','auditoria_eventos']) {
        assert.equal((await db.query<{ total:number }>(`SELECT COUNT(*)::int total FROM public.${table} WHERE accion='LOGIN'`)).rows[0]!.total,1);
      }
      assert.deepEqual(errors,[]);
    });
    await t.test('usuario inexistente y contraseña errónea siguen siendo 401', async () => {
      for (const response of [await login('missing@example.test'),await login('active@example.test','Wrong-password')]) {
        assert.equal(response.status,401);
        assert.equal(response.body.error.code,'INVALID_CREDENTIALS');
      }
    });
    await t.test('usuario inactivo sigue siendo 403 y no genera auditoría LOGIN', async () => {
      const response = await login('inactive@example.test');
      assert.equal(response.status,403);
      assert.equal(response.body.error.code,'USER_INACTIVE');
      assert.equal((await db.query<{ total:number }>(`SELECT COUNT(*)::int total FROM public.auditoria_eventos WHERE usuario_id=2`)).rows[0]!.total,0);
    });
    await t.test('restauración de sesión vuelve a consultar permisos y estado del usuario', async () => {
      const response = await request('/auth/me',token);
      assert.equal(response.status,200);
      assert.equal(response.body.data.id,'1');
      assert.deepEqual(response.body.data.permissions,['dashboard.read','nomina.read']);
      await db.query('UPDATE public.usuarios SET activo=false WHERE id=1');
      assert.equal((await request('/auth/me',token)).status,403);
      await db.query('UPDATE public.usuarios SET activo=true WHERE id=1');
      assert.equal((await request('/auth/me')).status,401);
      assert.equal((await request('/auth/me','invalid-synthetic-token')).status,401);
    });
    await t.test('tenant conserva empresa/contrato por defecto y capacidades aisladas', async () => {
      const response = await request('/tenant/me',token);
      assert.equal(response.status,200);
      assert.deepEqual(response.body.data.empresaIds,[10]);
      assert.deepEqual(response.body.data.contratoIds,[100]);
      assert.equal(response.body.data.empresa_default_id,10);
      assert.equal(response.body.data.contrato_default_id,100);
      const caps = await request('/saas/companies/10/capabilities',token);
      assert.equal(caps.status,200);
      assert.equal(caps.body.data.modulos.PERSONAL,true);
      assert.equal(caps.body.data.modulos.NOMINA,false);
      assert.equal(caps.body.data.modulos.SST,false);
      assert.equal((await request('/saas/companies/20/capabilities',token)).status,403);
      assert.equal((await request('/saas/modules',token)).status,403);
    });
    await t.test('administrador global mantiene catálogo y resumen inicial de empresas', async () => {
      const globalLogin = await login('global@example.test');
      assert.equal(globalLogin.status,200);
      assert.equal(globalLogin.body.data.user.isGlobalAdmin,true);
      const globalToken = globalLogin.body.data.accessToken;
      const companies = await request('/saas/companies-summary',globalToken);
      assert.equal(companies.status,200);
      assert.equal(companies.body.data.pagination.total,2);
      assert.equal((await request('/saas/modules',globalToken)).body.data.length,3);
      assert.equal((await request('/tenant/me',globalToken)).body.data.empresas.length,2);
    });
    await t.test('respuestas y permisos coinciden con SQL original bajo search_path public', async () => {
      const paths = ['/auth/me','/tenant/me','/saas/companies/10/capabilities','/saas/companies/20/capabilities','/saas/modules'];
      const patched = [];
      for (const path of paths) patched.push(await request(path,token));
      legacySql = true;
      await db.exec('SET search_path TO public');
      const previous = [];
      for (const path of paths) previous.push(await request(path,token));
      assert.deepEqual(patched,previous);
      const oldLogin = await login();
      legacySql = false;
      await db.exec(`SET search_path TO '';`);
      const newLogin = await login();
      assert.equal(oldLogin.status,newLogin.status);
      assert.deepEqual(oldLogin.body.data.user,newLogin.body.data.user);
      assert.equal(oldLogin.body.data.expiresIn,newLogin.body.data.expiresIn);
    });
    await t.test('auditoría con snapshot conserva historial y contexto de vinculación', async () => {
      await db.query(`INSERT INTO public.vinculaciones VALUES (1,1,100,'ACTIVA')`);
      await registerAuditEntry({usuario_id:'1',accion:'SYNTHETIC',tabla:'usuarios',registro_id:'1',descripcion:'Synthetic audit',before:{vinculacion_id:1,name:'before'},after:{vinculacion_id:1,name:'after'}});
      const audit = await db.query<{ empresa_id:string; contrato_id:string }>(`SELECT empresa_id::text,contrato_id::text FROM public.auditoria_eventos WHERE accion='SYNTHETIC'`);
      assert.deepEqual(audit.rows,[{empresa_id:'10',contrato_id:'100'}]);
      assert.ok((await db.query(`SELECT * FROM public.historial_cambios WHERE campo='name'`)).rows.length>0);
      assert.deepEqual(errors,[]);
    });
    await t.test('operaciones independientes funcionan sin inicializar sesiones ni cambiar pool', async () => {
      for (let i=0;i<3;i++) assert.equal((await request('/auth/me',token)).status,200);
      assert.deepEqual(await context(), {path:'""',resolved:null,qualified:'public.usuarios'});
      assert.ok(!executed.some(sql=>/\bSET\s+(?:LOCAL\s+)?search_path\b/i.test(sql)));
    });
  } finally {
    if (server) await new Promise<void>((resolve,reject)=>server!.close(error=>error ? reject(error):resolve()));
    mock.restoreAll();
    await db.close();
    await dbPool.end();
  }
});
