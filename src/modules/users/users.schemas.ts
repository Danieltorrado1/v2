import { z } from 'zod';

const normalizedEmailSchema = z.email().trim().toLowerCase();

const roleIdsSchema = z.array(z.string().trim().min(1)).max(50).default([]);

export const userIdParamSchema = z.object({
  id: z.string().trim().min(1, 'User id is required')
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
