export type RequirementKind = 'OBLIGATORIO'|'OPCIONAL'|'ACREDITABLE'|'CONDICIONAL'|'HISTORICO'|'PROCESS_SUPPORT'|'SYSTEM_GENERATED';
export const mandatoryPersonalRequirements = [
  'HOJA_VIDA','IDENTIDAD','CERT_BANCARIA','AUT_DATOS','AUT_INHABILIDADES','CONTRATO',
  'EPS','ARL','CAJA','PENSION','EXAMEN_OCUPACIONAL','INDUCCION','DOTACION_HISTORICA',
  'ANT_CONTRALORIA','ANT_PROCURADURIA','ANT_JUDICIALES','ANT_MEDIDAS_CORRECTIVAS','ANT_REDAM','ANT_INHABILIDADES',
] as const;
export const isFoodHandler = (cargo?:string|null) => ['manipuladoradealimentos','manipuladordealimentos'].includes(
  (cargo??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,''));
export function resolvePersonalRequirement(code:string|null, catalogKind:string, configured:boolean|null, cotizaPension:boolean|null, cargo?:string|null, configuredMandatory?:boolean|null) {
  const result=(aplica:boolean,obligatorio:boolean,tipo_requisito:RequirementKind,motivo_aplicabilidad:string)=>({
    aplica,obligatorio:aplica&&obligatorio,tipo_requisito,cuenta_cumplimiento:aplica&&obligatorio,motivo_aplicabilidad,
  });
  if(code==='PENSION')return result(cotizaPension!==false,cotizaPension!==false,'OBLIGATORIO',cotizaPension===false?'NO_COTIZA_PENSION':'PENSION_POR_DEFECTO');
  if(code==='MANIPULACION')return result(isFoodHandler(cargo),isFoodHandler(cargo),'CONDICIONAL','CARGO_MANIPULACION');
  if(mandatoryPersonalRequirements.includes(code as typeof mandatoryPersonalRequirements[number])||code==='DOTACION')return result(true,true,'OBLIGATORIO','MATRIZ_PERSONAL');
  if(['RESIDENCIA','SISBEN'].includes(code??''))return result(true,false,'OPCIONAL','EXPEDIENTE_OPCIONAL');
  if(['FORMACION','CERT_LABORAL'].includes(code??''))return result(true,false,'ACREDITABLE','EXPEDIENTE_ACREDITABLE');
  if(code==='VACUNACION')return result(configured!==false,configured===true&&(configuredMandatory??true),configured===null?'OPCIONAL':'CONDICIONAL',configured===null?'VACUNACION_OPCIONAL':'REGLA_CONTEXTUAL');
  if(['TARJETA_PROFESIONAL','ANTECEDENTES_PROFESIONALES'].includes(code??'')) {
    // The contract/cargo configuration determines professional exigibility, never file presence.
    return result(configured!==false,configured===true&&(configuredMandatory??true),'CONDICIONAL',configured===null?'SIN_EXIGENCIA_PROFESIONAL_CONFIGURADA':'REGLA_PROFESIONAL_CONTEXTUAL');
  }
  if(['HISTORICO','PROCESS_SUPPORT','SYSTEM_GENERATED'].includes(catalogKind))return result(configured!==false,false,catalogKind as RequirementKind,'SOPORTE_DE_PROCESO');
  if(catalogKind==='OPCIONAL'||catalogKind==='ACREDITABLE')return result(configured!==false,false,catalogKind,'EXPEDIENTE_COMPLEMENTARIO');
  return result(configured!==false,configured===false?false:configuredMandatory??(catalogKind==='OBLIGATORIO'||configured===true),catalogKind==='OBLIGATORIO'?'OBLIGATORIO':'CONDICIONAL','REGLA_CONTEXTUAL');
}
