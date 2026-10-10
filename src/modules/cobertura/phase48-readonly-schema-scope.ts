// Derived from verified dump/production catalog equality; no row data or SQL bodies.
export const SCHEMA_SCOPE = {
  "direct_relations": [
    "auditoria",
    "auditoria_eventos",
    "calculadora_personal_config",
    "cobertura_asignaciones",
    "focalizacion_final",
    "nomina_asistencia_diaria",
    "nomina_categorias_salariales",
    "nomina_periodos",
    "sede_modalidades"
  ],
  "context_roots": [
    "nomina_contextos_operativos_base",
    "nomina_empleado_detalle",
    "nomina_empleados",
    "permisos",
    "rol_permisos",
    "roles",
    "usuario_contratos",
    "usuario_empresas",
    "usuario_roles",
    "usuarios",
    "vinculacion_condiciones_economicas"
  ],
  "critical_relations": [
    "auditoria",
    "auditoria_eventos",
    "calculadora_personal_config",
    "cargos_operativos",
    "cobertura_asignaciones",
    "cobertura_externos",
    "contrato_cargos",
    "contratos",
    "departamentos",
    "documentos_persona",
    "empresas",
    "estados_civiles",
    "focalizacion_cargas",
    "focalizacion_final",
    "focalizacion_preliminar",
    "focalizacion_vigencias",
    "instituciones",
    "modalidades",
    "municipios",
    "nomina_asistencia_diaria",
    "nomina_categorias_salariales",
    "nomina_contextos_operativos_base",
    "nomina_empleado_detalle",
    "nomina_empleados",
    "nomina_movimiento_tarifas",
    "nomina_movimientos",
    "nomina_novedades",
    "nomina_periodos",
    "nomina_revision_operativa",
    "nomina_tipos_novedad",
    "organizaciones",
    "permisos",
    "personas",
    "rol_permisos",
    "roles",
    "sede_modalidades",
    "sedes",
    "sexo",
    "sst_eventos",
    "tipos_documentos",
    "tipos_identificacion",
    "tipos_jornada",
    "tipos_sangre",
    "tipos_vinculacion",
    "usuario_contratos",
    "usuario_empresas",
    "usuario_roles",
    "usuarios",
    "vinculacion_condiciones_economicas",
    "vinculaciones",
    "zonas"
  ],
  "critical_functions": [
    "fn_actualizar_periodo_pago_por_ingreso_retiro()",
    "fn_crear_evento_sst_desde_nomina()",
    "nomina_invalidar_revision_condicion_economica()",
    "nomina_invalidar_revision_operativa()",
    "personas_prevent_identificador_interno_update()",
    "validar_contrato_aplica_cobertura()",
    "validate_nomina_periodo_anulacion()"
  ],
  "cast_equivalences": {
    "constraints:public.calculadora_personal_config.calculadora_personal_config_estado_check:definition": [
      "c208c4aef75c0133938c5d95a65a5b55bb4e7eadbd2167b872ce889e2c2f473a",
      "3d943090bee0bb3619e5d12e3af3e55acd694d3626f8d9531e1a74cec577a907"
    ],
    "constraints:public.calculadora_personal_config.calculadora_personal_config_metodo_check:definition": [
      "d03a282dd194110477a3523e92bf0277a27703bd769a2ca78ee8b9685c37e6e0",
      "1aee86c5098553dd084f54c85cbd842fb86e399a083e3a755c14a8320add1a5c"
    ],
    "constraints:public.calculadora_personal_config.calculadora_personal_config_regla_redondeo_check:definition": [
      "941c908f467ec3c0febe22d0998dfc8c199f15d05d50afd34f797275e59298e0",
      "8aca0e29c2e76473405202baa8765bc13db43e313d61438cca323d61f5f1055c"
    ],
    "constraints:public.calculadora_personal_rangos.calculadora_personal_rangos_estado_check:definition": [
      "c208c4aef75c0133938c5d95a65a5b55bb4e7eadbd2167b872ce889e2c2f473a",
      "3d943090bee0bb3619e5d12e3af3e55acd694d3626f8d9531e1a74cec577a907"
    ],
    "constraints:public.empresa_modulo_configuracion.ck_empresa_modulo_config_estado:definition": [
      "019361a1d907bcfd903346f36e17b6b3573d370e22e4b302c89ad654ddd9c2fe",
      "b7c9dac865bda45f93cc2aa08647bad82a777c8b4f76a53cbb7f7f95829bf6f3"
    ],
    "constraints:public.empresa_suscripciones.chk_empresa_suscripcion_estado:definition": [
      "293a1ae16c9162ce8184fd5a06739a26799e7a7b777f871ddcf2374736ff2bdc",
      "12e60b4112c0bb6ddfba5cdde59dcad06f27beee929ec09814a5d7d06fc58f67"
    ],
    "constraints:public.nomina_novedad_documentos.nomina_novedad_documentos_estado_revision_check:definition": [
      "fb465487da7a6913a69c56bd17fbe3ebf9e50bf60dddab6c8e88f224c406cc21",
      "53dcda855b01f22d44c4d8f06606ffa1df572e15fd93050afdf307b5e2655986"
    ],
    "constraints:public.nomina_novedad_documentos.nomina_novedad_documentos_tipo_relacion_check:definition": [
      "7114c5f6221705060e238d33194aa3a8b13a0925d0f499896416a4a8a15224be",
      "88f4a156872c757ab9fb56f88f26648bf08d66e7b05b60d4edab370fcca170c3"
    ],
    "constraints:public.nomina_parametros_economicos.ck_nomina_parametros_redondeo:definition": [
      "04c03ce7e977430ad5f8e7c4b438958ab39c383645528a255241a2625147fc34",
      "9f8babc89686f9ee47a5a6535adfe74789e0e1c757a86a396aa2c3074fde48f3"
    ],
    "constraints:public.planes.chk_planes_periodicidad:definition": [
      "f2802b944e1e1dfcab3909e9e7cab02285c90be0a99ac6c60171e181f57fc9d0",
      "c04a0b14c12583bdfb506d49f96031ddf9f1e6b64365c54c8f99c1ffc2b88a1e"
    ],
    "constraints:public.sst_matriz_riesgos.chk_sst_matriz_riesgos_clasificacion:definition": [
      "7f24375c5998437bee3068172fac825ab6969d9cd0eadb8ef9930a53cba5baec",
      "7df9335f4caf1bd447cc9ec5a13eb657cfecef3be69645ce75f10dd219d93504"
    ],
    "indexes:public.empresa_suscripciones.uq_empresa_suscripcion_abierta:definition": [
      "54846f51fac61fd46be1b0bbc8c7c0f9aaf6dae67c59eb3e6814699c312702bf",
      "17adb805c770bce68a6551b91effd7b295a81fc62b95db1edbbcc81bb096ee4e"
    ]
  }
} as const;
