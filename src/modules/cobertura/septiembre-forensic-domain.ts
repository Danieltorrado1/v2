import {normalizeFocalizacionText as norm} from './cobertura.focalizacion.domain';

/** Recommendation only: neither the source nor a catalog is rewritten. */
export function recommendMunicipality(sourceName:unknown,institutionId:string|null,siteId:string|null,municipalities:Array<{id:string;nombre_municipio:string}>){
 const catalog=municipalities.find(m=>m.id===institutionId);
 if(!catalog||institutionId!==siteId||norm(catalog.nombre_municipio)!==norm(String(sourceName??'')))return {classification:'NO_DETERMINABLE',proposed:null};
 const homonyms=municipalities.filter(m=>norm(m.nombre_municipio)===norm(String(sourceName??'')));
 return {classification:homonyms.length>1?'NOMBRE_AMBIGUO':'NO_DETERMINABLE',proposed:homonyms.length>1?catalog.id:null};
}

export function classifyAncillary(row:Record<string,unknown>){
 if(norm(String(row.institucion??''))==='TOTAL COBERTURA DEPARTAMENTO'&&norm(String(row.sede??''))==='TOTAL COBERTURA DEPARTAMENTO'&&typeof row.techo_total==='number')return 'FILA_RESUMEN_NO_APLICABLE';
 if(row.sede==='SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS'&&row.modalidad==null&&row.techo_total==null)return 'FILA_RESUMEN_NO_APLICABLE';
 if(['consecutivo','municipio','sede','modalidad'].every(k=>row[k]==null)&&row.techo_total==null&&row.focalizacion_total==null)return 'FILA_INVÁLIDA';
 return 'NO_DETERMINABLE';
}
