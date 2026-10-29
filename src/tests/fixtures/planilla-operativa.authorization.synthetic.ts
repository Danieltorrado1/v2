import { PGlite } from '@electric-sql/pglite';

export async function municipalAuthorizationDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE usuarios (id bigint, correo text, activo boolean);
    CREATE TABLE roles (id bigint, nombre_rol text, activo boolean);
    CREATE TABLE usuario_roles (usuario_id bigint, rol_id bigint, activo boolean);
    CREATE TABLE permisos (id bigint, modulo text, accion text, activo boolean);
    CREATE TABLE rol_permisos (rol_id bigint, permiso_id bigint, activo boolean);
    CREATE TABLE usuario_empresas (usuario_id bigint, empresa_id bigint, activo boolean);
    CREATE TABLE usuario_contratos (usuario_id bigint, contrato_id bigint, activo boolean);
    CREATE TABLE contratos (id bigint, empresa_id bigint, activo boolean);
    CREATE TABLE contrato_cargos (id bigint, nombre_cargo text);
    CREATE TABLE vinculaciones (id bigint, contrato_id bigint, empresa_id bigint, contrato_cargo_id bigint);
    CREATE TABLE nomina_empleados (id bigint, periodo_id bigint, vinculacion_id bigint, activo boolean);
    CREATE TABLE municipios (id bigint, nombre_municipio text);
    CREATE TABLE instituciones (id bigint, contrato_id bigint, municipio_id bigint, nombre_institucion text);
    CREATE TABLE sedes (id bigint, institucion_id bigint, municipio_id bigint, nombre_sede text);
    CREATE TABLE modalidades (id bigint, nombre_modalidad text);
    CREATE TABLE focalizacion_final (id bigint, contrato_id bigint, municipio_id bigint, institucion_id bigint, sede_id bigint, modalidad_id bigint, activo boolean);
    CREATE TABLE cobertura_asignaciones (id bigint, vinculacion_id bigint, focalizacion_final_id bigint, fecha_inicio date, fecha_fin date, activo boolean);
    CREATE TABLE gestor_municipio_asignaciones (usuario_id bigint, contrato_id bigint, municipio_id bigint, activo boolean, vigencia_desde date, vigencia_hasta date);
    CREATE TABLE gestor_institucion_asignaciones (usuario_id bigint, contrato_id bigint, municipio_id bigint, institucion_id bigint, activo boolean, vigencia_desde date, vigencia_hasta date);
    CREATE TABLE gestor_personal_asignaciones (usuario_id bigint, contrato_id bigint, vinculacion_id bigint, activo boolean, vigencia_desde date, vigencia_hasta date);
    CREATE TABLE nomina_responsabilidades_usuario (id bigint, usuario_id bigint, empresa_id bigint, contrato_id bigint, proceso text, activo boolean);
    CREATE TABLE nomina_responsabilidad_municipios (responsabilidad_id bigint, municipio_id bigint);
    INSERT INTO usuarios SELECT i, 'synthetic-' || i || '@example.invalid', TRUE FROM generate_series(1,12) i;
    INSERT INTO roles VALUES (1,'TALENTO_HUMANO',TRUE),(2,'GESTOR',TRUE),(3,'ADMINISTRADOR',TRUE),(4,'OTRO',TRUE),(5,'SIN_EXPORT',TRUE);
    INSERT INTO usuario_roles VALUES (1,1,TRUE),(2,2,TRUE),(3,3,TRUE),(4,1,TRUE),(5,1,TRUE),(6,1,TRUE),(7,2,TRUE),(8,2,TRUE),(9,3,TRUE),(10,5,TRUE),(11,4,TRUE),(12,1,TRUE),(12,2,TRUE);
    INSERT INTO permisos VALUES (1,'nomina','export',TRUE),(2,'nomina','operativa.read',TRUE),(3,'nomina','municipios.read_all',TRUE);
    INSERT INTO rol_permisos SELECT r.id,p.id,TRUE FROM roles r CROSS JOIN permisos p WHERE r.id<5 AND (p.id<3 OR r.id=3);
    INSERT INTO rol_permisos VALUES (5,2,TRUE);
    INSERT INTO contratos VALUES (51,41,TRUE),(52,42,TRUE);
    INSERT INTO usuario_contratos SELECT i,51,TRUE FROM generate_series(1,12) i WHERE i<>9;
    INSERT INTO contrato_cargos VALUES (1,'Manipuladora de alimentos');
    INSERT INTO vinculaciones VALUES (81,51,41,1),(82,51,41,1),(83,51,41,1),(84,52,42,1);
    INSERT INTO nomina_empleados VALUES (101,71,81,TRUE),(102,71,82,TRUE),(103,71,83,TRUE),(104,72,84,TRUE);
    INSERT INTO municipios VALUES (1,'Municipio Norte'),(2,'Municipio Sur'),(3,'MUNICIPIO AJENO');
    INSERT INTO instituciones VALUES (11,51,1,'Institucion Norte'),(12,51,2,'Institucion Sur'),(13,51,1,'Institucion Norte Dos'),(14,52,3,'INSTITUCION AJENA');
    INSERT INTO sedes VALUES (21,11,1,'Sede Norte'),(22,12,2,'Sede Sur'),(23,13,1,'Sede Norte Dos'),(24,14,3,'SEDE AJENA');
    INSERT INTO modalidades VALUES (1,'Modalidad sintetica');
    INSERT INTO focalizacion_final VALUES (1,51,1,11,21,1,TRUE),(2,51,2,12,22,1,TRUE),(3,51,1,13,23,1,TRUE),(4,52,3,14,24,1,TRUE);
    INSERT INTO cobertura_asignaciones VALUES (1,81,1,'2026-01-01',NULL,TRUE),(2,82,2,'2026-01-01',NULL,TRUE),(3,83,3,'2026-01-01',NULL,TRUE),(4,84,4,'2026-01-01',NULL,TRUE);
    INSERT INTO gestor_municipio_asignaciones VALUES (1,51,1,TRUE,CURRENT_DATE-10,NULL),(2,51,2,TRUE,CURRENT_DATE-10,NULL),
      (5,51,1,FALSE,CURRENT_DATE-10,NULL),(6,51,1,TRUE,CURRENT_DATE-10,CURRENT_DATE-1),(12,51,1,TRUE,CURRENT_DATE-10,NULL);
    INSERT INTO gestor_institucion_asignaciones VALUES (7,51,1,11,TRUE,CURRENT_DATE-10,NULL);
    INSERT INTO gestor_personal_asignaciones VALUES (8,51,82,TRUE,CURRENT_DATE-10,NULL);
    INSERT INTO nomina_responsabilidades_usuario VALUES (1,11,41,51,'COBERTURA',TRUE);
    INSERT INTO nomina_responsabilidad_municipios VALUES (1,2);
  `);
  await db.exec("ALTER TABLE vinculaciones ADD COLUMN fecha_inicio date DEFAULT '2026-01-01'; ALTER TABLE vinculaciones ADD COLUMN fecha_fin date");
  return db;
}

export const syntheticAuthEnvironment = {
  DATABASE_URL: 'postgres://test:test@127.0.0.1:1/forbidden', APP_NAME: 'planilla-municipal-test',
  API_PREFIX: '/api', NODE_ENV: 'test', PORT: '4000', JWT_SECRET: 'test-only', JWT_EXPIRES_IN: '1h',
  CORS_ORIGIN: 'http://localhost', TRUST_PROXY: 'false', RATE_LIMIT_WINDOW_MINUTES: '1', RATE_LIMIT_MAX_REQUESTS: '100',
  LOG_LEVEL: 'error', ENABLE_JOBS: 'false', SUPABASE_URL: 'https://example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only', SUPABASE_STORAGE_BUCKET: 'test-only',
  INTEGRACION_OUTBOX_ENABLED: 'false', INTEGRACION_SYNC_ENABLED: 'false', INTEGRACION_RECALC_ENABLED: 'false'
};
