import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import baseline from './phase48-pseudorecord-baseline.json';
type Token={text:string;kind:'word'|'quoted'|'literal'|'symbol';start:number};
const need=(ok:unknown,c:string)=>{if(!ok)throw Error(c);};
const hash=(s:string)=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
function body(s:string){const m=/\bAS\s+(\$[a-zA-Z_0-9]*\$)/i.exec(s);if(!m)return s;const start=m.index+m[0].length,end=s.lastIndexOf(m[1]!);need(end>=start,'PLPGSQL_BODY_UNCERTIFIED');return s.slice(start,end);}
export function plpgsqlTokens(source:string):Token[]{
 const s=body(source),tokens:Token[]=[];let i=0;
 while(i<s.length){
  if(/\s/.test(s[i]!)){i++;continue;}
  if(s.startsWith('--',i)){while(i<s.length&&s[i]!=='\n')i++;continue;}
  if(s.startsWith('/*',i)){let depth=1;i+=2;while(i<s.length&&depth){if(s.startsWith('/*',i)){depth++;i+=2;}else if(s.startsWith('*/',i)){depth--;i+=2;}else i++;}need(depth===0,'PLPGSQL_COMMENT_UNTERMINATED');continue;}
  const start=i,c=s[i]!;
  if(c==="'"||c==='"'){const quoted=c==='"';let text='';i++;let closed=false;while(i<s.length){if(s[i]===c){if(s[i+1]===c){text+=c;i+=2;continue;}i++;closed=true;break;}text+=s[i++];}need(closed,'PLPGSQL_STRING_UNTERMINATED');tokens.push({text,kind:quoted?'quoted':'literal',start});continue;}
  if(c==='$'){const match=/^\$[a-zA-Z_0-9]*\$/.exec(s.slice(i));if(match){const tag=match[0],end=s.indexOf(tag,i+tag.length);need(end>=0,'PLPGSQL_DOLLAR_UNTERMINATED');tokens.push({text:s.slice(i+tag.length,end),kind:'literal',start});i=end+tag.length;continue;}}
  const word=/^[a-zA-Z_][a-zA-Z_0-9$]*/.exec(s.slice(i));if(word){tokens.push({text:word[0].toLowerCase(),kind:'word',start});i+=word[0].length;continue;}
  tokens.push({text:c,kind:'symbol',start});i++;
 }return tokens;
}
export type TriggerBinding={schema:string;relation:string;type:number;enabled:string;columns:string[]};
export function validatePseudorecords(definition:string,returns:string,bindings:TriggerBinding[],certifiedTables:string[],ambiguities:string[]=[]){
 const tokens=plpgsqlTokens(definition),refs:{record:string;column:string}[]=[];
 need(!tokens.some(t=>t.kind==='word'&&['execute','format','quote_ident','quote_literal'].includes(t.text)),'PSEUDORECORD_DYNAMIC_UNCERTIFIED');
 const aliases=new Set<string>();
 // SQL aliases and CTE names are not PL/pgSQL records. They remain visible to
 // table extraction and are never eligible for the DISTINCT FROM exception.
 for(let i=0;i<tokens.length;i++){if(['from','join'].includes(tokens[i]!.text)){let j=i+2;if(tokens[i+2]?.text==='.')j=i+4;if(tokens[j]?.text==='as')j++;const a=tokens[j];if(a?.kind==='word'&&['old','new'].includes(a.text))aliases.add(a.text);}
  if(tokens[i]?.kind==='word'&&['old','new'].includes(tokens[i]!.text)&&tokens[i+1]?.text==='as'&&tokens[i+2]?.text==='(')aliases.add(tokens[i]!.text);
 }
 for(let i=0;i<tokens.length;i++){const t=tokens[i]!;
  if(t.kind==='word'&&/^tg_/.test(t.text))need(['tg_op','tg_name','tg_when','tg_level','tg_relid','tg_relname','tg_table_schema','tg_table_name','tg_nargs','tg_argv'].includes(t.text)&&returns==='trigger'&&bindings.length>0,'TRIGGER_VARIABLE_UNCERTIFIED');
  if(t.kind==='word'&&['old','new'].includes(t.text)&&tokens[i+1]?.text==='.'&&!aliases.has(t.text)){
   need(tokens[i+2]?.kind==='word','PSEUDORECORD_COLUMN_UNCERTIFIED');refs.push({record:t.text,column:tokens[i+2]!.text});
  }
 }
 if(refs.length){need(returns==='trigger'&&bindings.length>0,'PSEUDORECORD_BINDING_REQUIRED');need(ambiguities.length===0,'PSEUDORECORD_NAME_AMBIGUITY');
  need(!tokens.some(t=>t.text==='|'&&tokens[tokens.indexOf(t)+1]?.text==='|'),'PSEUDORECORD_CONCATENATION_UNCERTIFIED');
  for(const binding of bindings){need(binding.schema==='public'&&certifiedTables.includes(binding.relation)&&(binding.type&1)!==0&&binding.enabled==='O','PSEUDORECORD_TABLE_UNCERTIFIED');
   for(const ref of refs){need(binding.columns.includes(ref.column),'PSEUDORECORD_COLUMN_MISSING');need(ref.record==='old'?(binding.type&4)===0:(binding.type&8)===0,'PSEUDORECORD_EVENT_UNCERTIFIED');}
  }
 }return refs;
}
export type TableReference={schema?:string;name:string;quoted:boolean;cte:boolean};
export function sqlTableReferences(source:string,certifiedPseudoColumns:string[]=[]):TableReference[]{
 const tokens=plpgsqlTokens(source),refs:TableReference[]=[],ctes=new Set<string>();
 for(let i=0;i<tokens.length;i++)if(tokens[i+1]?.text==='as'&&tokens[i+2]?.text==='('&&['word','quoted'].includes(tokens[i]!.kind))ctes.add(tokens[i]!.text);
 for(let i=0;i<tokens.length;i++){const token=tokens[i]!;if(token.kind!=='word'||!['from','join','update','into','table'].includes(token.text))continue;
  if(token.text==='from'&&tokens[i-1]?.text==='distinct'&&(tokens[i-2]?.text==='is'||tokens[i-2]?.text==='not'&&tokens[i-3]?.text==='is')){
   const rhs=tokens[i+1];if(rhs?.kind==='word'&&['old','new'].includes(rhs.text))need(tokens[i+2]?.text==='.'&&certifiedPseudoColumns.includes(tokens[i+3]?.text??''),'PSEUDORECORD_CONTEXT_REQUIRED');continue;
  }
  const first=tokens[i+1];if(!first||!['word','quoted'].includes(first.kind))continue;if(first.text==='set')continue;
  const qualified=tokens[i+2]?.text==='.',second=qualified?tokens[i+3]:undefined;if(qualified)need(second&&['word','quoted'].includes(second.kind),'SQL_RELATION_UNCERTIFIED');
  refs.push({schema:second?first.text:undefined,name:second?.text??first.text,quoted:first.kind==='quoted'||second?.kind==='quoted',cte:!second&&ctes.has(first.text)});
 }return refs;
}
export async function certifiedPseudorecordContext(db:Pick<PoolClient,'query'>,tables:readonly string[]){
 const f=(await db.query("SELECT pg_get_functiondef(p.oid) definition,pg_get_function_result(p.oid) returns,l.lanname language,p.proowner::regrole::text owner,p.prosecdef security_definer,p.proconfig config,p.proacl::text acl FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='public.personas_prevent_identificador_interno_update()'::regprocedure")).rows[0];
 need(f&&hash(f.definition)===baseline.definition_sha256&&f.returns==='trigger'&&f.language==='plpgsql'&&!f.security_definer&&f.config===null,'PSEUDORECORD_FUNCTION_DRIFT');
 const triggers=(await db.query("SELECT t.tgname name,n.nspname schema,c.relname relation,t.tgenabled enabled,t.tgtype::int type,t.tgisinternal internal,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgfoid='public.personas_prevent_identificador_interno_update()'::regprocedure ORDER BY 1")).rows;
 need(JSON.stringify(triggers)===JSON.stringify(baseline.triggers),'PSEUDORECORD_TRIGGER_DRIFT');
 const columns=(await db.query("SELECT n.nspname schema,c.relname relation,a.attname name,a.atttypid::regtype::text type,a.attnotnull not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND a.attrelid IN(SELECT tgrelid FROM pg_trigger WHERE tgfoid='public.personas_prevent_identificador_interno_update()'::regprocedure) ORDER BY 1,2,a.attnum")).rows;
 const ambiguity=(await db.query("SELECT nspname name FROM pg_namespace WHERE lower(nspname) IN('old','new') UNION ALL SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE lower(c.relname) IN('old','new')")).rows;
 const refs=validatePseudorecords(f.definition,f.returns,triggers.map(t=>({...t,columns:columns.filter(c=>c.schema===t.schema&&c.relation===t.relation).map(c=>c.name)})),[...tables],ambiguity.map(r=>r.name));
 return [{identity:baseline.identity,definition_sha256:hash(f.definition),function_metadata:{language:f.language,owner:f.owner,security_definer:f.security_definer,config:f.config,acl:f.acl},triggers,columns,refs}];
}
