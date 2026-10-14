import {readFileSync} from 'node:fs';
import baseline from '../../modules/cobertura/phase48-managed-events-baseline.json';
import constantBaseline from '../../modules/cobertura/phase48-constant-sql-baseline.json';
import pseudoBaseline from '../../modules/cobertura/phase48-pseudorecord-baseline.json';
import {SCHEMA_SCOPE} from '../../modules/cobertura/phase48-readonly-schema-scope';
import {localClient} from '../../modules/cobertura/phase48-dynamic-local';
import {sq} from '../../modules/cobertura/phase48-scoped-repository';
export async function scopedFixture(n=733){
 if(!Number.isInteger(n)||n<730||n>750)throw Error('SYNTHETIC_POPULATION_REQUIRED');
 const db=localClient();await db.connect();
 try{
  await db.query("DROP EVENT TRIGGER IF EXISTS pgrst_ddl_watch;DROP EVENT TRIGGER IF EXISTS pgrst_drop_watch;DROP SCHEMA IF EXISTS extensions CASCADE;DROP SCHEMA public CASCADE;CREATE SCHEMA public");
  await db.query("DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN CREATE ROLE supabase_admin SUPERUSER;END IF;END$$;CREATE SCHEMA extensions AUTHORIZATION supabase_admin");
  for(const f of baseline.functions){await db.query(f.definition);await db.query('ALTER FUNCTION '+f.identity+' OWNER TO supabase_admin');}
  for(const e of baseline.events){await db.query('CREATE EVENT TRIGGER '+e.name+' ON '+e.event+' EXECUTE FUNCTION '+e.function_identity);await db.query('ALTER EVENT TRIGGER '+e.name+' OWNER TO supabase_admin');}
  const catalog=JSON.parse(readFileSync('reports/phase48-schema-production-catalogs.json','utf8').replace(/^\uFEFF/,'')).schema.inventory;
  for(const name of new Set([...SCHEMA_SCOPE.critical_relations,'nomina_novedad_turnos'])){const cols=catalog.columns.filter((r:any)=>r.relation===name);if(!cols.length)throw Error('FIXTURE_CATALOG_MISSING:'+name);
   await db.query('CREATE TABLE public.'+sq(name)+' ('+cols.map((r:any)=>sq(r.name)+' '+r.type).join(',')+')');
   if(cols.some((r:any)=>r.name==='id'))await db.query('ALTER TABLE public.'+sq(name)+' ADD PRIMARY KEY(id)');
  }
  for(const f of SCHEMA_SCOPE.critical_functions)await db.query(f===constantBaseline.identity?constantBaseline.definition:f===pseudoBaseline.identity?pseudoBaseline.definition:'CREATE FUNCTION public.'+f+' RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$');
  await db.query(pseudoBaseline.triggers[0]!.definition);
  await db.query(`CREATE SEQUENCE public.nomina_revision_operativa_id_seq;
   ALTER TABLE public.nomina_revision_operativa ALTER COLUMN id SET DEFAULT nextval('public.nomina_revision_operativa_id_seq');
   ALTER TABLE public.nomina_revision_operativa ALTER COLUMN version_revision SET DEFAULT 1;
   ALTER TABLE public.nomina_revision_operativa ADD UNIQUE(periodo_id,nomina_empleado_id)`);
  for(const table of ['nomina_asistencia_diaria','nomina_novedades','nomina_movimientos','nomina_novedad_turnos'])await db.query('CREATE TRIGGER '+table+'_invalidates AFTER INSERT OR UPDATE OR DELETE ON public.'+sq(table)+' FOR EACH ROW EXECUTE FUNCTION public.nomina_invalidar_revision_operativa()');
  for(const table of ['cobertura_asignaciones','auditoria','auditoria_eventos']){
   await db.query('CREATE SEQUENCE public.'+sq(table+'_id_seq')+' START '+(table==='cobertura_asignaciones'?'1276':table==='auditoria'?'100':'200')+' CACHE 1 OWNED BY public.'+sq(table)+'.id');
   await db.query('ALTER TABLE public.'+sq(table)+" ALTER COLUMN id SET DEFAULT nextval('public."+table+"_id_seq')");
  }
  await db.query(`ALTER TABLE cobertura_asignaciones ALTER COLUMN focalizacion_final_id SET NOT NULL;
   ALTER TABLE cobertura_asignaciones ADD FOREIGN KEY(contrato_id) REFERENCES contratos(id),ADD FOREIGN KEY(focalizacion_final_id) REFERENCES focalizacion_final(id),ADD FOREIGN KEY(vinculacion_id) REFERENCES vinculaciones(id),ADD FOREIGN KEY(municipio_id) REFERENCES municipios(id);
   ALTER TABLE focalizacion_final ADD FOREIGN KEY(contrato_id) REFERENCES contratos(id),ADD FOREIGN KEY(institucion_id) REFERENCES instituciones(id),ADD FOREIGN KEY(sede_id) REFERENCES sedes(id),ADD FOREIGN KEY(modalidad_id) REFERENCES modalidades(id);
   ALTER TABLE nomina_empleados ADD FOREIGN KEY(vinculacion_id) REFERENCES vinculaciones(id),ADD FOREIGN KEY(categoria_salarial_id) REFERENCES nomina_categorias_salariales(id);
   ALTER TABLE auditoria ADD FOREIGN KEY(usuario_id) REFERENCES usuarios(id);
   ALTER TABLE auditoria_eventos ADD FOREIGN KEY(usuario_id) REFERENCES usuarios(id);
   CREATE TABLE public.ajena(id bigint PRIMARY KEY,state text);INSERT INTO public.ajena VALUES(1,'INDEPENDENT');
   CREATE SEQUENCE public.ajena_seq START 1;
   CREATE FUNCTION public.ajena_fn() RETURNS integer LANGUAGE SQL AS $$SELECT 1$$;
   INSERT INTO contratos(id,empresa_id,fecha_inicio,fecha_final_estimada) VALUES(24,15,'2026-01-01','2026-12-31');
   INSERT INTO usuarios(id,activo) VALUES(12,TRUE);INSERT INTO roles(id,activo,nombre_rol) VALUES(1,TRUE,'ADMINISTRADOR');
   INSERT INTO usuario_roles(id,usuario_id,rol_id,activo) VALUES(1,12,1,TRUE);INSERT INTO usuario_empresas(id,usuario_id,empresa_id,activo) VALUES(1,12,15,TRUE);INSERT INTO usuario_contratos(id,usuario_id,contrato_id,activo) VALUES(1,12,24,TRUE);
   INSERT INTO municipios(id) VALUES(1),(4),(477);
   INSERT INTO instituciones(id,contrato_id,activo,nombre_institucion) VALUES(6,24,TRUE,'TECH_I6'),(44,24,TRUE,'TECH_I44'),(42,24,TRUE,'TECH_I42'),(39,24,TRUE,'TECH_I39');
   INSERT INTO sedes(id,institucion_id,municipio_id,activo,nombre_sede) VALUES(18,6,4,TRUE,'TECH_S18'),(196,44,477,TRUE,'TECH_S196'),(16,6,1,TRUE,'TECH_S16'),(167,42,1,TRUE,'TECH_S167'),(132,39,1,TRUE,'TECH_S132');
   INSERT INTO modalidades(id,codigo_original,codigo_base,nombre_modalidad,activo) VALUES(1,'CAA','CAA','CAA',TRUE),(3,'CAJM/JT-RI','CAJM/JT','CAJM/JT-RI',TRUE),(5,'CAA-JU','CAA-JU','CAA-JU',TRUE);
   INSERT INTO sede_modalidades(id,contrato_id,modalidad_id,activo) VALUES(1,24,1,TRUE),(2,24,3,TRUE),(3,24,5,TRUE);
   INSERT INTO focalizacion_final(id,contrato_id,institucion_id,sede_id,modalidad_id,municipio_id,activo) VALUES(180,24,6,18,5,4,TRUE),(181,24,44,196,1,477,TRUE),(183,24,6,16,3,1,TRUE),(356,24,42,167,1,1,TRUE),(319,24,39,132,3,1,TRUE);
   INSERT INTO nomina_categorias_salariales(id,contrato_id,modalidad,activo,vigente_desde,vigente_hasta,salario_base) VALUES(34,24,'CAA',TRUE,'2026-01-01','2026-12-31',1234567),(35,24,'CAJM/JT',TRUE,'2026-01-01','2026-12-31',1345678);
   INSERT INTO nomina_periodos(id,contrato_id,fecha_inicio,fecha_fin,estado) VALUES(4,24,'2026-07-01','2026-08-31','ANULADO'),(6,24,'2026-09-01','2026-09-30','ANULADO'),(5,24,'2026-09-26','2026-10-25','ABIERTO');
   INSERT INTO vinculaciones(id,empresa_id,contrato_id,fecha_inicio,estado_vinculacion) VALUES(249,15,24,'2026-07-29','ACTIVO'),(1555,15,24,'2026-08-18','ACTIVO');
   INSERT INTO vinculaciones(id,empresa_id,contrato_id,fecha_inicio,estado_vinculacion) SELECT 2000+x,15,24,'2026-09-01','ACTIVO' FROM generate_series(4,730)x;
   INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,focalizacion_final_id,municipio_id,fecha_inicio,fecha_fin,activo,institucion,sede,modalidad,observacion) VALUES
    (11,24,249,180,4,'2026-07-29','2026-07-31',FALSE,'TECH_I6','TECH_S18','CAA-JU','PRESERVED_DARY'),
    (1221,24,249,180,4,'2026-08-01',NULL,TRUE,'TECH_I6','TECH_S18','CAA-JU','PRESERVED_NEXT_DARY'),
    (1224,24,1555,181,477,'2026-09-09',NULL,TRUE,'TECH_I44','TECH_S196','CAA','PRESERVED_NEXT_ALBENY');
   INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,focalizacion_final_id,municipio_id,fecha_inicio,activo,institucion,sede,modalidad) SELECT x+100,24,2000+x,183,1,'2026-09-01',TRUE,'TECH_I6','TECH_S16','CAJM/JT-RI' FROM generate_series(4,730)x;
   INSERT INTO nomina_asistencia_diaria(id,vinculacion_id,fecha,periodo_id,activo) SELECT id,1555,'2026-08-18',4,TRUE FROM unnest(ARRAY[13195,13196,13197,13198,13199,13200,13201,13202,13203,13204,19830,19833,19834,19837,19838,19841])id;`);
  for(let x=731;x<=n;x++){
   const id=String(1276+x-730),v=String(1604+x-730),ff=x===732?'356':x===733?'319':'183',category=x===732?'34':'35';
   await db.query("INSERT INTO vinculaciones(id,empresa_id,contrato_id,fecha_inicio,estado_vinculacion) VALUES($1,15,24,'2026-09-01','ACTIVO')",[v]);
   await db.query("INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,focalizacion_final_id,municipio_id,fecha_inicio,activo,institucion,sede,modalidad) SELECT $1,24,$2,id,municipio_id,'2026-09-01',TRUE,'TECH_I'||institucion_id,'TECH_S'||sede_id,CASE modalidad_id WHEN 1 THEN 'CAA' ELSE 'CAJM/JT-RI' END FROM focalizacion_final WHERE id=$3",[id,v,ff]);
   await db.query("INSERT INTO nomina_empleados(id,periodo_id,vinculacion_id,categoria_salarial_id,salario_base,auxilio_transporte,neto_pagar,estado,activo) VALUES($1,5,$2,$3,1345678,222222,999999,'PENDIENTE',TRUE)",[String(2376+x-731),v,category]);
  }
  await db.query("ALTER SEQUENCE cobertura_asignaciones_id_seq RESTART WITH "+(n>730?String(1276+n-730):'1276'));
 }finally{await db.end();}
}
