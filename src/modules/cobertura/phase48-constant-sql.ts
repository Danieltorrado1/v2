import {sha256HexEqual} from './phase48-sha256';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import baseline from './phase48-constant-sql-baseline.json';
const need=(v:unknown,c:string)=>{if(!v)throw Error(c);};
export const constantSqlHash=(s:string)=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
// Closed template recognizer, not a general EXECUTE-literal permission. The
// complete function hash also fixes control flow, USING source and all static DML.
export function certifyConstantExecute(identity:string,definition:string){
 const normalized=definition.replaceAll('\r\n','\n');
 if(identity!==baseline.identity&&!/\bEXECUTE\b/i.test(normalized.replace(/--[^\n]*/g,'')))return null;
 need(identity===baseline.identity,'DYNAMIC_CRITICAL_DEFINITION_UNCERTIFIED');
 const matches=[...normalized.matchAll(/\bEXECUTE\s+'((?:[^']|'')*)'\s+INTO\s+(\w+)\s+USING\s+(\w+)\s*;/gi)];
 need(matches.length===1&&matches[0]![1]===baseline.sql&&matches[0]![2]==='v_family'&&matches[0]![3]==='v_record','CONSTANT_SQL_TEMPLATE_UNCERTIFIED');
 need((normalized.match(/\bEXECUTE\b/gi)??[]).length===1&&!/\b(?:format|quote_ident|quote_literal)\s*\(/i.test(normalized),'CONSTANT_SQL_STRUCTURE_UNCERTIFIED');
 need(sha256HexEqual(constantSqlHash(normalized),baseline.definition_sha256),'CONSTANT_SQL_FUNCTION_HASH_DRIFT');
 return {identity,definition_sha256:baseline.definition_sha256,classification:baseline.classification,sql:baseline.sql,using:baseline.using,relation:baseline.qualified_relation,column:baseline.column,predicate:baseline.predicate};
}
export async function certifyConstantSqlContext(db:Pick<PoolClient,'query'>){
 const r=(await db.query("SELECT current_setting('search_path') search_path,to_regclass('nomina_movimientos')=to_regclass('public.nomina_movimientos') resolved,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='nomina_movimientos' AND c.relkind='r') ordinary_table")).rows[0];
 // Omitting pg_catalog makes PostgreSQL search it implicitly first, while
 // explicit pg_temp remains last. It also keeps unqualified local fixture DDL in public.
 need(['pg_catalog,public,pg_temp','public,pg_temp'].includes(r.search_path.replaceAll(' ',''))&&r.resolved&&r.ordinary_table,'CONSTANT_SQL_SEARCH_PATH_UNSAFE');
 const columns=(await db.query("SELECT attname name,atttypid::regtype::text type FROM pg_attribute WHERE attrelid='public.nomina_movimientos'::regclass AND attname IN('id','familia_movimiento') AND NOT attisdropped ORDER BY attname")).rows;
 need(columns.length===2&&columns[0].name==='familia_movimiento'&&columns[0].type==='text'&&columns[1].name==='id'&&columns[1].type==='bigint','CONSTANT_SQL_COLUMN_TYPES_UNCERTIFIED');
 const f=(await db.query("SELECT l.lanname language,p.prosecdef security_definer,p.proconfig config FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='public.nomina_invalidar_revision_operativa()'::regprocedure")).rows[0];
 need(f?.language==='plpgsql'&&!f.security_definer&&f.config===null,'CONSTANT_SQL_FUNCTION_CONTEXT_UNCERTIFIED');
 return {search_path:'pg_catalog, public, pg_temp',qualified_relation:baseline.qualified_relation,columns,language:f.language,security_definer:false,function_config:null};
}
