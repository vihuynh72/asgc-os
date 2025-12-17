import { z } from "zod";

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = ServerEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Missing server env. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only).",
    );
  }

  return parsed.data;
}

const EmailEnvSchema = z.object({
  EMAIL_PROVIDER: z.enum(["resend"]),
  EMAIL_FROM: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
});

export type EmailEnv = z.infer<typeof EmailEnvSchema>;

export function getEmailEnv(): EmailEnv {
  const parsed = EmailEnvSchema.safeParse({
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Missing email env. Set EMAIL_PROVIDER=resend, EMAIL_FROM, and RESEND_API_KEY in .env.local (server-only).",
    );
  }

  return parsed.data;
}

const CronEnvSchema = z.object({
  CRON_SECRET: z.string().min(16),
});

export type CronEnv = z.infer<typeof CronEnvSchema>;

export function getCronEnv(): CronEnv {
  const parsed = CronEnvSchema.safeParse({
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    throw new Error("Missing cron env. Set CRON_SECRET in .env.local (server-only). ");
  }

  return parsed.data;
}
