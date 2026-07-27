import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { dbPool } from '../config/db';
import {
  getNominaTipoNovedadById,
  listNominaTiposNovedad
} from '../modules/nomina/nomina.service';
import {
  listNominaTiposNovedadQuerySchema,
  nominaTipoNovedadIdParamSchema
} from '../modules/nomina/nomina.schemas';

const NO_MATCH_TOKEN = '__NO_MATCH_TIPOS_NOVEDAD__';

const normalizeText = (value: string | null | undefined): string => {
  return (value ?? '').trim().toLowerCase();
};

const run = async (): Promise<void> => {
  assert.throws(
    () =>
      listNominaTiposNovedadQuerySchema.parse({
        page: 1,
        limit: 10,
        desconocido: 'x'
      }),
    /unrecognized/i,
    'list schema must reject unknown query params'
  );

  assert.throws(
    () => nominaTipoNovedadIdParamSchema.parse({ id: 1, extra: 'x' }),
    /unrecognized/i,
    'id schema must reject unknown params'
  );

  const routeSource = readFileSync(
    path.resolve(process.cwd(), 'src', 'modules', 'nomina', 'nomina.routes.ts'),
    'utf8'
  );

  assert.match(
    routeSource,
    /nominaRoutes\.get\('\/tipos-novedad',\s*requirePermissions\('nomina\.read'\),\s*getNominaTiposNovedadHandler\)/,
    'list route must require nomina.read'
  );
  assert.match(
    routeSource,
    /nominaRoutes\.get\('\/tipos-novedad\/:id',\s*requirePermissions\('nomina\.read'\),\s*getNominaTipoNovedadHandler\)/,
    'detail route must require nomina.read'
  );

  const base = await listNominaTiposNovedad(
    listNominaTiposNovedadQuerySchema.parse({ page: 1, limit: 5 })
  );

  assert.ok(Array.isArray(base.items), 'list must return items array');
  assert.equal(base.pagination.page, 1, 'pagination.page must be preserved');
  assert.equal(base.pagination.limit, 5, 'pagination.limit must be preserved');

  const empty = await listNominaTiposNovedad(
    listNominaTiposNovedadQuerySchema.parse({ page: 1, limit: 10, busqueda: NO_MATCH_TOKEN })
  );

  assert.equal(empty.items.length, 0, 'non matching search must return empty items');
  assert.equal(empty.pagination.total, 0, 'non matching search must report total 0');
  assert.equal(empty.pagination.total_pages, 0, 'non matching search must report total_pages 0');

  const activeOnly = await listNominaTiposNovedad(
    listNominaTiposNovedadQuerySchema.parse({ page: 1, limit: 100, activo: true })
  );
  assert.ok(activeOnly.items.every((item) => item.activo), 'activo=true must only return active items');

  const inactiveOnly = await listNominaTiposNovedad(
    listNominaTiposNovedadQuerySchema.parse({ page: 1, limit: 100, activo: false })
  );
  assert.ok(
    inactiveOnly.items.every((item) => item.activo === false),
    'activo=false must only return inactive items'
  );

  if (base.items.length > 0) {
    const first = base.items[0];
    assert.ok(first, 'first item must exist when base.items is not empty');

    if (first.categoria) {
      const byCategoria = await listNominaTiposNovedad(
        listNominaTiposNovedadQuerySchema.parse({
          page: 1,
          limit: 100,
          categoria: first.categoria
        })
      );

      assert.ok(byCategoria.items.length > 0, 'categoria filter must return results for existing categoria');
      assert.ok(
        byCategoria.items.every(
          (item) => normalizeText(item.categoria) === normalizeText(first.categoria)
        ),
        'categoria filter must only return the requested categoria'
      );
    }

    const probeSource = first.nombre ?? first.categoria ?? '';
    const probe = probeSource.trim().slice(0, Math.min(probeSource.trim().length, 6));

    if (probe.length > 0) {
      const searched = await listNominaTiposNovedad(
        listNominaTiposNovedadQuerySchema.parse({ page: 1, limit: 100, busqueda: probe })
      );

      assert.ok(searched.items.length > 0, 'busqueda must return results for an existing term');
      assert.ok(
        searched.items.every((item) => {
          const haystack = `${item.nombre ?? ''} ${item.categoria ?? ''}`.toLowerCase();
          return haystack.includes(probe.toLowerCase());
        }),
        'busqueda results must match nombre or categoria'
      );
    }

    const detail = await getNominaTipoNovedadById(first.id);
    assert.equal(detail.id, first.id, 'detail endpoint service must return requested id');
  }

  await assert.rejects(
    () => getNominaTipoNovedadById('999999999999999'),
    (error: unknown) => {
      return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'NOMINA_TIPO_NOVEDAD_NOT_FOUND'
      );
    },
    'missing detail must reject with NOMINA_TIPO_NOVEDAD_NOT_FOUND'
  );

  console.log('Nomina tipos de novedad checks passed.');
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbPool.end().catch((error: unknown) => {
      console.error('Failed to close database pool:', error);
    });
  });
