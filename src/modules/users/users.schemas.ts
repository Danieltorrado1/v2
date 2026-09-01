import { z } from 'zod';

const normalizedEmailSchema = z.email().trim().toLowerCase();
const numericIdSchema = z.coerce.number().int().positive();
const roleIdsSchema = z.array(numericIdSchema).max(50).default([]);
const requiredRoleIdsSchema = z.array(numericIdSchema).min(1, 'At least one role is required').max(50);
const tenantIdsSchema = z.array(z.coerce.number().int().positive()).max(500).default([]);
const territorialScopeSchema = z.object({ contrato_id: numericIdSchema, departamento_id: numericIdSchema, municipio_ids: z.array(numericIdSchema).max(500) });


export const userIdParamSchema = z.object({
  id: numericIdSchema
});

export const createUserSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  active: z.boolean().optional().default(true),
  roleIds: roleIdsSchema
});

export const updateUserSchema = z
  .object({
    email: normalizedEmailSchema.optional(),
    password: z.string().min(8, 'Password must be at least 8 characters long').optional(),
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    active: z.boolean().optional(),
    roleIds: roleIdsSchema.optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserIdParams = z.infer<typeof userIdParamSchema>;

export const createAdminUserSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  active: z.boolean().optional().default(true),
  roleIds: requiredRoleIdsSchema,
  empresaIds: tenantIdsSchema,
  contratoIds: tenantIdsSchema,
  territorialScopes: z.array(territorialScopeSchema).max(500).default([])
});

export const updateAdminUserSchema = z
  .object({
    email: normalizedEmailSchema.optional(),
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    active: z.boolean().optional(),
    roleIds: requiredRoleIdsSchema.optional(),
    empresaIds: tenantIdsSchema.optional(),
    contratoIds: tenantIdsSchema.optional(),
    territorialScopes: z.array(territorialScopeSchema).max(500).optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

export const updateAdminUserPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters long')
});

export const updateAdminUserStateSchema = z.object({
  active: z.boolean()
});

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;
export type UpdateAdminUserPasswordInput = z.infer<typeof updateAdminUserPasswordSchema>;
export type UpdateAdminUserStateInput = z.infer<typeof updateAdminUserStateSchema>;
