require('dotenv').config({ path: '.env.qa' });
const jwt = require('jsonwebtoken');

const API = 'http://localhost:4000/api';
const token = jwt.sign(
  {
    email: 'admin.qa@empiria.example',
    permissions: ['nomina.economico.read', 'nomina.parametros.manage', 'nomina.categorias.manage', 'nomina.read', 'nomina.operativa.read'],
    roles: ['ADMINISTRADOR'],
  },
  process.env.JWT_SECRET,
  { subject: '9', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
);

async function api(path) {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const res = await api('/nomina/periodos/2/empleados?page=1&limit=100');
  const selected = (res?.data?.items ?? [])
    .filter((item) => ['2', '4'].includes(String(item.id)))
    .map((item) => ({
      persona_id: item.persona?.id ?? null,
      vinculacion_id: item.vinculacion?.id ?? null,
      nomina_empleado_id: item.id,
      nombre: item.persona?.nombre_completo ?? null,
      documento: item.persona?.numero_documento ?? null,
      cargo: item.cargo?.nombre_cargo ?? null,
      modalidad: item.modalidad ?? item.contexto_operativo?.modalidad_codigo ?? null,
      municipio: item.municipio ?? item.contexto_operativo?.municipio ?? null,
      institucion: item.institucion ?? item.contexto_operativo?.institucion ?? null,
      sede: item.sede?.nombre_sede ?? item.contexto_operativo?.sede ?? null,
      categoria_salarial_id_actual: item.categoria_salarial?.id ?? null,
      categoria_actual_codigo: item.categoria_salarial?.codigo_categoria ?? null,
      salario_actual: item.salario_base ?? null,
      auxilio_transporte_actual: item.auxilio_transporte ?? null,
      recargo_mensual_actual: item.categoria_salarial?.otros_recargos ?? null,
      metodo_pago: item.vinculacion?.metodo_pago ?? null,
      estado_vinculacion: item.vinculacion?.estado_vinculacion ?? null,
      periodo_id: item.periodo_id,
      neto_pagar: item.neto_pagar ?? null,
      total_devengado: item.total_adiciones ?? null,
      total_deducciones: item.total_deducciones ?? null,
    }));
  console.log(JSON.stringify(selected, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
