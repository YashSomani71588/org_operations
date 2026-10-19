import { z } from "zod";

export const organizationEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(255)
  .refine(
    (email) => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email),
    "Enter a valid email account with a complete domain"
  );

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: organizationEmailSchema,
  password: z.string().min(8).max(72)
});

export const loginSchema = z.object({
  email: organizationEmailSchema,
  password: z.string().min(1).max(72)
});
