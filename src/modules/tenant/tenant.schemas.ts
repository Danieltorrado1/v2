import { z } from 'zod';

const numericIdSchema = z.coerce.number().int().positive();

export const tenantUserIdParamSchema = z.object({
  userId: numericIdSchema
});

export const tenantEmpresaAccessSchema = z.object({
  empresa_id: numericIdSchema
});

export const tenantContratoAccessSchema = z.object({
  contrato_id: numericIdSchema
});

export const tenantEmpresaAccessParamSchema = z.object({
  empresaId: numericIdSchema
});

export const tenantContratoAccessParamSchema = z.object({
  contratoId: numericIdSchema
});

export type TenantUserIdParams = z.infer<typeof tenantUserIdParamSchema>;
export type TenantEmpresaAccessInput = z.infer<typeof tenantEmpresaAccessSchema>;
export type TenantContratoAccessInput = z.infer<typeof tenantContratoAccessSchema>;
export type TenantEmpresaAccessParams = z.infer<typeof tenantEmpresaAccessParamSchema>;
export type TenantContratoAccessParams = z.infer<typeof tenantContratoAccessParamSchema>;
