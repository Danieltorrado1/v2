import type { PoolClient, QueryResultRow } from 'pg';

import { BOOTSTRAP_CONTRACT_ID, type BootstrapApplyPlan, type BootstrapApplyResult, type BootstrapApplyStore, type InstitutionSpec, type RelationSpec, type SedeSpec } from './cobertura.bootstrap.apply';
import { normalizeFocalizacionText } from './cobertura.focalizacion.domain';

interface IdRow extends QueryResultRow { id: string }

export class PgBootstrapApplyStore implements BootstrapApplyStore {
  public constructor(private readonly client: PoolClient, private readonly actorUserId: string | null) {}

  public async resolveInstitution(spec: InstitutionSpec) {
    const historical = await this.client.query<IdRow>(`SELECT DISTINCT i.id::text FROM instituciones i JOIN instituciones_identidad_historial h ON h.institucion_id=i.id WHERE i.contrato_id=$1::bigint AND i.municipio_id=$2::bigint AND (h.nombre_normalizado=$3 OR ($4::text IS NOT NULL AND h.codigo_dane=$4)) LIMIT 2`, [BOOTSTRAP_CONTRACT_ID, spec.municipioId, spec.nombreNormalizado, spec.codigoDane]);
    if (historical.rows.length > 1) throw new Error(`INSTITUCION_HISTORICA_AMBIGUA_${spec.key}`);
    if (historical.rows[0]) return { id: historical.rows[0].id, created: false };
    const candidates = await this.client.query<IdRow & { codigo_dane: string | null; nombre_institucion: string }>(`SELECT id::text,codigo_dane,nombre_institucion FROM instituciones WHERE contrato_id=$1::bigint AND municipio_id=$2::bigint AND COALESCE(activo,TRUE)=TRUE`, [BOOTSTRAP_CONTRACT_ID, spec.municipioId]);
    const matches = candidates.rows.filter((row) => (!!spec.codigoDane && row.codigo_dane === spec.codigoDane) || normalizeFocalizacionText(row.nombre_institucion) === spec.nombreNormalizado);
    if (matches.length > 1) throw new Error(`INSTITUCION_AMBIGUA_${spec.key}`);
    if (matches[0]) return { id: matches[0].id, created: false };
    const inserted = await this.client.query<IdRow>(`INSERT INTO instituciones (contrato_id,municipio_id,codigo_dane,nombre_institucion,activo,created_at) VALUES ($1::bigint,$2::bigint,$3,$4,TRUE,NOW()) RETURNING id::text`, [BOOTSTRAP_CONTRACT_ID, spec.municipioId, spec.codigoDane, spec.nombreVisible]);
    if (!inserted.rows[0]) throw new Error('INSTITUCION_INSERT_SIN_ID');
    return { id: inserted.rows[0].id, created: true };
  }

  public async ensureInstitutionHistory(id: string, spec: InstitutionSpec): Promise<void> {
    await this.client.query(`INSERT INTO instituciones_identidad_historial (institucion_id,nombre_original_fuente,nombre_normalizado,nombre_visible,codigo_dane,vigente_desde,origen,archivo_origen_id,usuario_id,created_at) SELECT $1::bigint,$2,$3,$4,$5,CURRENT_DATE,'BOOTSTRAP',NULL,$6::bigint,NOW() WHERE NOT EXISTS (SELECT 1 FROM instituciones_identidad_historial WHERE institucion_id=$1::bigint AND nombre_normalizado=$3 AND COALESCE(codigo_dane,'')=COALESCE($5,''))`, [id, spec.nombreOriginal, spec.nombreNormalizado, spec.nombreVisible, spec.codigoDane, this.actorUserId]);
  }

  public async resolveSede(spec: SedeSpec, institutionId: string) {
    const existing = await this.client.query<IdRow>(`SELECT id::text FROM sedes WHERE institucion_id=$1::bigint AND (codigo_dane=$2 OR consecutivo_sede=$3 OR consecutivo_dane=$3) LIMIT 2`, [institutionId, spec.codigoDane, spec.consecutivo]);
    if (existing.rows.length > 1) throw new Error(`SEDE_AMBIGUA_${spec.codigoDane}`);
    if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
    const inserted = await this.client.query<IdRow>(`INSERT INTO sedes (institucion_id,municipio_id,codigo_dane,consecutivo_sede,consecutivo_dane,nombre_sede,activo,created_at) VALUES ($1::bigint,$2::bigint,$3,$4,$4,$5,TRUE,NOW()) RETURNING id::text`, [institutionId, spec.municipioId, spec.codigoDane, spec.consecutivo, spec.nombreVisible]);
    if (!inserted.rows[0]) throw new Error('SEDE_INSERT_SIN_ID');
    return { id: inserted.rows[0].id, created: true };
  }

  public async ensureSedeHistory(id: string, spec: SedeSpec): Promise<void> {
    await this.client.query(`INSERT INTO sedes_identidad_historial (sede_id,nombre_original_fuente,nombre_normalizado,nombre_visible,codigo_dane,consecutivo_sede,vigente_desde,origen,archivo_origen_id,usuario_id,created_at) SELECT $1::bigint,$2,$3,$4,$5,$6,CURRENT_DATE,'BOOTSTRAP',NULL,$7::bigint,NOW() WHERE NOT EXISTS (SELECT 1 FROM sedes_identidad_historial WHERE sede_id=$1::bigint AND nombre_normalizado=$3 AND COALESCE(codigo_dane,'')=COALESCE($5,'') AND COALESCE(consecutivo_sede,'')=COALESCE($6,''))`, [id, spec.nombreOriginal, spec.nombreNormalizado, spec.nombreVisible, spec.codigoDane, spec.consecutivo, this.actorUserId]);
  }

  public async ensureSedeInstitutionHistory(sedeId: string, institutionId: string): Promise<void> {
    await this.client.query(`INSERT INTO sede_institucion_historial (sede_id,institucion_id,vigente_desde,origen,archivo_origen_id,created_at) SELECT $1::bigint,$2::bigint,CURRENT_DATE,'BOOTSTRAP',NULL,NOW() WHERE NOT EXISTS (SELECT 1 FROM sede_institucion_historial WHERE sede_id=$1::bigint AND institucion_id=$2::bigint AND vigente_hasta IS NULL)`, [sedeId, institutionId]);
  }

  public async resolveRelation(spec: RelationSpec, sedeId: string) {
    const existing = await this.client.query<IdRow>(`SELECT id::text FROM sede_modalidades WHERE sede_id=$1::bigint AND modalidad_id=$2::bigint AND contrato_id=$3::bigint LIMIT 1`, [sedeId, spec.modalidadId, BOOTSTRAP_CONTRACT_ID]);
    if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
    const key = `${sedeId}-${spec.modalidadId}-${BOOTSTRAP_CONTRACT_ID}`;
    const inserted = await this.client.query<IdRow>(`INSERT INTO sede_modalidades (sede_id,modalidad_id,contrato_id,clave_sede_modalidad,activo,created_at) VALUES ($1::bigint,$2::bigint,$3::bigint,$4,TRUE,NOW()) RETURNING id::text`, [sedeId, spec.modalidadId, BOOTSTRAP_CONTRACT_ID, key]);
    if (!inserted.rows[0]) throw new Error('SEDE_MODALIDAD_INSERT_SIN_ID');
    return { id: inserted.rows[0].id, created: true };
  }

  public async validate(plan: BootstrapApplyPlan, institutionIds: Map<string, string>, sedeIds: Map<string, string>): Promise<void> {
    const institutionArray = [...institutionIds.values()];
    const sedeArray = [...sedeIds.values()];
    const result = await this.client.query<{ institutions: number; sedes: number; relations: number; orphan_sedes: number; orphan_relations: number; wrong_contract: number; duplicate_institutions: number; duplicate_sedes: number; duplicate_relations: number }>(`
      SELECT
        (SELECT COUNT(*)::int FROM instituciones WHERE id=ANY($1::bigint[])) institutions,
        (SELECT COUNT(*)::int FROM sedes WHERE id=ANY($2::bigint[])) sedes,
        (SELECT COUNT(*)::int FROM sede_modalidades WHERE sede_id=ANY($2::bigint[]) AND contrato_id=$3::bigint) relations,
        (SELECT COUNT(*)::int FROM sedes s LEFT JOIN instituciones i ON i.id=s.institucion_id WHERE s.id=ANY($2::bigint[]) AND i.id IS NULL) orphan_sedes,
        (SELECT COUNT(*)::int FROM sede_modalidades sm LEFT JOIN sedes s ON s.id=sm.sede_id LEFT JOIN modalidades m ON m.id=sm.modalidad_id WHERE sm.sede_id=ANY($2::bigint[]) AND (s.id IS NULL OR m.id IS NULL)) orphan_relations,
        (SELECT COUNT(*)::int FROM sede_modalidades WHERE sede_id=ANY($2::bigint[]) AND contrato_id<>$3::bigint) wrong_contract,
        0::int duplicate_institutions,
        (SELECT COUNT(*)::int FROM (SELECT institucion_id,codigo_dane,consecutivo_sede FROM sedes WHERE id=ANY($2::bigint[]) GROUP BY institucion_id,codigo_dane,consecutivo_sede HAVING COUNT(*)>1) d) duplicate_sedes,
        (SELECT COUNT(*)::int FROM (SELECT sede_id,modalidad_id,contrato_id FROM sede_modalidades WHERE sede_id=ANY($2::bigint[]) GROUP BY sede_id,modalidad_id,contrato_id HAVING COUNT(*)>1) d) duplicate_relations
    `, [institutionArray, sedeArray, BOOTSTRAP_CONTRACT_ID]);
    const row = result.rows[0];
    if (!row || row.institutions !== plan.institutions.length || row.sedes !== plan.sedes.length || row.relations !== plan.relations.length || row.orphan_sedes || row.orphan_relations || row.wrong_contract || row.duplicate_institutions || row.duplicate_sedes || row.duplicate_relations) throw new Error(`APPLY_PRECOMMIT_INVALIDO:${JSON.stringify(row ?? {})}`);
  }

  public async audit(result: BootstrapApplyResult, plan: BootstrapApplyPlan): Promise<void> {
    const contract = await this.client.query<{ empresa_id: string }>(`SELECT empresa_id::text FROM contratos WHERE id=$1::bigint`, [BOOTSTRAP_CONTRACT_ID]);
    if (!contract.rows[0]) throw new Error('AUDITORIA_CONTRATO_NO_ENCONTRADO');
    await this.client.query(`INSERT INTO auditoria_eventos (usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos,ip_address,user_agent,fecha_evento) VALUES ($1::bigint,$2::bigint,$3::bigint,'COBERTURA','bootstrap_maestros',$4,'BOOTSTRAP_MAESTROS_APPLY','Bootstrap transaccional de maestros desde focalización',NULL,$5::jsonb,NULL,'BOOTSTRAP_CLI',NOW())`, [this.actorUserId, contract.rows[0].empresa_id, BOOTSTRAP_CONTRACT_ID, plan.sourceHash, JSON.stringify({ actor_tecnico: 'BOOTSTRAP_CLI', archivo_sha256: plan.sourceHash, filas: plan.sourceRows, resultado: result })]);
  }
}
