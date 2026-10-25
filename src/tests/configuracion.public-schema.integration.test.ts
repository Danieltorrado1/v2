import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { PGlite } from '@electric-sql/pglite';
import baseline from './fixtures/configuracion-public-schema.baseline.json';

const catalogues = [
  ['tipos_vinculacion','listTiposVinculacion','tipos-vinculacion','nombre_vinculacion'],
  ['tipos_jornada','listTiposJornada','tipos-jornada','nombre'],
  ['departamentos','listDepartamentos','departamentos','nombre_departamento'],
  ['municipios','listMunicipios','municipios','nombre_municipio'],
  ['zonas','listZonas','zonas','nombre_zona'],
  ['eps','listEps','eps','nombre'], ['arl','listArl','arl','nombre'],
  ['fondos_pension','listFondosPension','fondos-pension','nombre'],
  ['cajas_compensacion','listCajasCompensacion','cajas-compensacion','nombre'],
  ['niveles_estudio','listNivelesEstudio','niveles-estudio','nombre_nivel'],
  ['estados_civiles','listEstadosCiviles','estados-civiles','nombre_estado_civil'],
  ['sexo','listSexos','sexos','nombre_sexo'],
  ['tipos_documentos','listTiposDocumento','tipos-documentos','nombre_documento']
] as const;

const normalizeSql = (sql: string) => sql.replace(/\b(FROM|JOIN)\s+public\./g,'$1 ');

test('Configuracion cambia solo seis referencias FROM/JOIN del SHA aprobado', () => {
  const source = readFileSync(baseline.file,'utf8').replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(normalizeSql(source)).digest('hex'),baseline.normalizedSourceHash);
  assert.equal((source.match(/\b(?:FROM|JOIN)\s+public\./g)||[]).length-baseline.existingPublicReferences,6);
});

test('Configuracion: SQL y HTTP equivalentes con search_path vacio', async t => {
  Object.assign(process.env, {
    APP_NAME:'configuration-schema-test',API_PREFIX:'/api',NODE_ENV:'production',PORT:'4000',
    DATABASE_URL:'postgres://synthetic:synthetic@127.0.0.1:1/forbidden',
    JWT_SECRET:'synthetic-config-test-secret',JWT_EXPIRES_IN:'1h',CORS_ORIGIN:'http://localhost',
    TRUST_PROXY:'false',RATE_LIMIT_WINDOW_MINUTES:'1',RATE_LIMIT_MAX_REQUESTS:'100',
    LOG_LEVEL:'error',ENABLE_JOBS:'false',SUPABASE_URL:'https://example.invalid',
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',SUPABASE_STORAGE_BUCKET:'synthetic-only'
  });
  const { dbPool } = await import('../config/db.js');
  const service = await import('../modules/configuracion/configuracion.admin.service.js');
  const schemas = await import('../modules/configuracion/configuracion.admin.schemas.js');
  const { configuracionRoutes } = await import('../modules/configuracion/configuracion.routes.js');
  const { errorHandler } = await import('../middlewares/errorHandler.js');
  const db = new PGlite();
  let server: Server | undefined;
  let originalMode = false;
  const calls: Array<{sql:string;params?:unknown[]}> = [];
  const allCalls: string[] = [];
  mock.method(dbPool,'query',async (text:string,params?:unknown[]) => {
    const sql = originalMode ? normalizeSql(text) : text;
    allCalls.push(sql);
    calls.push({sql,params});
    return db.query(sql,params) as never;
  });
  mock.method(dbPool,'connect',() => { throw new Error('Unexpected connection: read endpoints must use dbQuery'); });
  const errors: unknown[][] = [];
  mock.method(console,'error',(...args:unknown[]) => { errors.push(args); });
  const scope = (empresaIds:number[]=[],contratoIds:number[]=[],isGlobalAdmin=false) => ({empresaIds,contratoIds,isGlobalAdmin,roleNames:[]});
  const emptyPath = async () => db.exec(`SET search_path TO '';`);
  // Compare original effective SQL under public with patched SQL under an empty path.
  const compare = async <T>(operation:()=>Promise<T>):Promise<T> => {
    await db.exec('SET search_path TO public'); originalMode = true; calls.length = 0;
    const before = await operation();
    const originalCalls = calls.map(c=>({sql:c.sql,params:c.params ? [...c.params]:undefined}));
    await emptyPath(); originalMode = false; calls.length = 0;
    const after = await operation();
    assert.deepEqual(after,before);
    assert.deepEqual(calls.map(c=>({sql:normalizeSql(c.sql),params:c.params})),originalCalls);
    return after;
  };
  try {
    for (const [table,,,label] of catalogues) {
      await db.exec(`CREATE TABLE public.${table} (
        id bigint PRIMARY KEY, ${label} text, codigo text, codigo_dane text,
        departamento_id bigint, activo boolean, alcance text,
        requiere_fecha_expedicion boolean, requiere_fecha_vencimiento boolean,
        categoria_documento text, es_identificacion_personal boolean);
        INSERT INTO public.${table} VALUES
        (1,'Beta','B','02',1,true,'PERSONA',true,false,'SINTETICO',false),
        (2,'Alfa','A','01',2,false,'VINCULACION',false,true,'SINTETICO',true),
        (3,'Alfa','A','03',1,NULL,NULL,NULL,NULL,NULL,NULL);`);
    }
    await db.exec(`
      CREATE TABLE public.empresas (id bigint PRIMARY KEY,nombre_empresa text);
      INSERT INTO public.empresas VALUES (10,'Empresa A'),(20,'Empresa B');
      CREATE TABLE public.contratos (id bigint PRIMARY KEY,empresa_id bigint,
        numero_contrato text,numero_licitacion text,entidad_contratante text,
        fecha_inicio date,fecha_finalizacion date,fecha_final_estimada date,
        fecha_final_real date,estado_contractual text,contrato_padre_id bigint,
        objeto_contractual text,observaciones text,aplica_cobertura boolean,activo boolean);
      INSERT INTO public.contratos VALUES
        (101,10,'A-101',NULL,'Entidad A','2026-01-01','2026-12-31',NULL,NULL,'ACTIVO',NULL,'Objeto A',NULL,true,true),
        (102,10,'A-102','L-102','Entidad A','2026-02-01',NULL,'2026-11-30',NULL,'BORRADOR',101,NULL,NULL,false,false),
        (201,20,'B-201',NULL,'Entidad B','2026-03-01',NULL,NULL,NULL,'ACTIVO',NULL,'Objeto B',NULL,true,true),
        (202,20,'B-202',NULL,'Entidad B','2026-01-01',NULL,NULL,'2026-02-01','FINALIZADO',NULL,NULL,NULL,false,NULL);
      CREATE TABLE public.usuarios (id bigint PRIMARY KEY,correo text,activo boolean);
      INSERT INTO public.usuarios VALUES (1,'a@example.test',true),(2,'b@example.test',true),(3,'global@example.test',true),(4,'denied@example.test',true);
      CREATE TABLE public.roles (id bigint PRIMARY KEY,nombre_rol text,activo boolean);
      INSERT INTO public.roles VALUES (1,'TALENTO_HUMANO',true),(2,'ADMINISTRADOR',true);
      CREATE TABLE public.usuario_roles (usuario_id bigint,rol_id bigint,activo boolean);
      INSERT INTO public.usuario_roles VALUES (1,1,true),(2,1,true),(3,2,true);
      CREATE TABLE public.permisos (id bigint PRIMARY KEY,modulo text,accion text,activo boolean);
      INSERT INTO public.permisos VALUES (1,'configuracion','read',true),(2,'catalogos','read',true),(3,'contratos','read',true);
      CREATE TABLE public.rol_permisos (rol_id bigint,permiso_id bigint,activo boolean);
      INSERT INTO public.rol_permisos VALUES (1,1,true),(1,2,true),(1,3,true),(2,1,true),(2,2,true),(2,3,true);
      CREATE TABLE public.usuario_empresas (usuario_id bigint,empresa_id bigint,activo boolean);
      INSERT INTO public.usuario_empresas VALUES (1,10,true),(2,20,true),(4,10,true);
      CREATE TABLE public.usuario_contratos (usuario_id bigint,contrato_id bigint,activo boolean);
      INSERT INTO public.usuario_contratos VALUES (1,101,true);
    `);
    await emptyPath();
    await t.test('los dos conteos originales reproducen 42P01 en posicion 36', async () => {
      for (const sql of [baseline.originalDocumentCountSql,baseline.originalContractCountSql])
        await assert.rejects(db.query(sql),{code:'42P01',position:'36'});
    });
    for (const [table,fnName] of catalogues) await t.test(`catalogo ${table}: filtros, orden y paginacion equivalentes`,async () => {
      const fn = service[fnName] as unknown as (q:Record<string,unknown>)=>Promise<{items:Array<{id:number;label:string}>;pagination:{total:number}}>;
      const cases: Record<string,unknown>[] = [{},{limit:1,page:2},{limit:1,page:99},{search:'Alfa'},{search:"%' OR TRUE --"}];
      if (table!=='municipios') cases.push({activo:true},{activo:false});
      for (const input of cases) {
        const schema = table==='municipios' ? schemas.configuracionMunicipiosListQuerySchema : table==='tipos_documentos' ? schemas.configuracionTiposDocumentoListQuerySchema : schemas.configuracionCatalogListQuerySchema;
        const query = schema.parse(input);
        const result = await compare(()=>fn(query));
        assert.equal(calls.length,2);
        if (!Object.keys(input).length) {
          assert.equal(result.pagination.total,3);
          assert.deepEqual(result.items.map(x=>x.id),table==='niveles_estudio'?[1,2,3]:[2,3,1]);
        }
        if (input.page===99 || input.search==="%' OR TRUE --") assert.deepEqual(result.items,[]);
      }
    });
    await t.test('filtros combinados conservan placeholders y columnas documentales',async () => {
      const municipality = schemas.configuracionMunicipiosListQuerySchema.parse({departamento_id:1,search:'Alfa',limit:1});
      const towns = await compare(()=>service.listMunicipios(municipality));
      assert.deepEqual(towns.items.map(x=>x.id),[3]);
      assert.deepEqual(calls[0]!.params,['%Alfa%',1]);
      const docs = await compare(()=>service.listTiposDocumento(schemas.configuracionTiposDocumentoListQuerySchema.parse({search:'Alfa',es_identificacion_personal:true})));
      assert.deepEqual(docs.items,[{id:2,label:'Alfa',codigo:'A',alcance:'VINCULACION',requiere_fecha_expedicion:false,requiere_fecha_vencimiento:true,categoria_documento:'SINTETICO',es_identificacion_personal:true}]);
      assert.deepEqual(calls[0]!.params,['%Alfa%',true]);
    });
    await t.test('contratos conservan filtros, fechas, NULLs y paginacion',async () => {
      for (const input of [{},{activo:true},{activo:false},{empresa_id:10},{estado_contractual:'ACTIVO'},{search:'Entidad B'},{search:"%' OR TRUE --"},{page:2,limit:1},{page:99,limit:1},{activo:true,empresa_id:10,estado_contractual:'ACTIVO',search:'A-101'}]) {
        const q = schemas.configuracionContratosListQuerySchema.parse(input);
        await compare(()=>service.listContratos(q,scope([],[],true)));
        assert.equal(calls.length,2);
      }
      const all = await compare(()=>service.listContratos(schemas.configuracionContratosListQuerySchema.parse({}),scope([],[],true)));
      assert.deepEqual(all.items.map(x=>x.id),[201,102,202,101]);
      assert.equal(all.items.find(x=>x.id===102)!.fecha_finalizacion,'2026-11-30');
      assert.equal(all.items.find(x=>x.id===202)!.activo,true);
    });
    await t.test('tenant conserva prioridad de contrato, empresa y denegacion sin asignacion',async () => {
      const q = schemas.configuracionContratosListQuerySchema.parse({});
      for (const [tenant,expected] of [[scope([10]),[102,101]],[scope([20]),[201,202]],[scope([20],[101]),[101]],[scope(),[]]] as const) {
        const result = await compare(()=>service.listContratos(q,tenant));
        assert.deepEqual(result.items.map(x=>x.id),expected);
      }
      const cross = await compare(()=>service.listContratos(schemas.configuracionContratosListQuerySchema.parse({empresa_id:20}),scope([10])));
      assert.deepEqual(cross.items,[]);
    });
    const app = express();
    app.use('/api/configuracion',configuracionRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/configuracion`;
    const request = async (route:string,userId?:number) => {
      const token = userId ? jwt.sign({},process.env.JWT_SECRET!,{subject:String(userId),expiresIn:'1h'}):null;
      const res = await fetch(url+route,{headers:token?{Authorization:`Bearer ${token}`}:{}});
      return {status:res.status,body:await res.json() as any};
    };
    await t.test('HTTP: los 13 catalogos y contratos mantienen contrato, permisos y scope',async () => {
      for (const [,,route] of catalogues) {
        const response = await compare(()=>request('/catalogos/'+route+'?limit=1&page=2',1));
        assert.equal(response.status,200);
        assert.equal(response.body.success,true);
        assert.equal(response.body.data.pagination.total,3);
      }
      const a = await compare(()=>request('/contratos',1));
      assert.equal(a.status,200);
      assert.equal(a.body.message,'Contratos retrieved successfully');
      assert.deepEqual(a.body.data.items.map((x:{id:number})=>x.id),[101]);
      assert.deepEqual((await compare(()=>request('/contratos',2))).body.data.items.map((x:{id:number})=>x.id),[201,202]);
      assert.equal((await compare(()=>request('/contratos',3))).body.data.pagination.total,4);
      assert.equal((await compare(()=>request('/contratos?empresa_id=20',1))).body.data.pagination.total,0);
      for (const route of ['/contratos','/catalogos/tipos-documentos']) {
        assert.equal((await compare(()=>request(route,4))).status,403);
        assert.equal((await compare(()=>request(route))).status,401);
      }
    });
    await t.test('las lecturas no escriben datos ni establecen search_path desde el backend',async () => {
      assert.equal((await db.query<{p:string}>(`SELECT current_setting('search_path') p`)).rows[0]!.p,'""');
      assert.ok(allCalls.some(sql=>sql.includes('FROM public.tipos_documentos')));
      assert.ok(!allCalls.some(sql=>/\b(?:INSERT|UPDATE|DELETE|SET|BEGIN|COMMIT)\b/i.test(sql)));
      assert.deepEqual(errors,[]);
    });
  } finally {
    if (server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    mock.restoreAll();
    await db.close();
    await dbPool.end();
  }
});
