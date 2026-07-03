import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url(),

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 chars (openssl rand -base64 32)"),
  NEXTAUTH_URL: z.string().url().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  ANALYZE: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // --- NAS artifact storage (spec 2026-07-02) ---
  // All optional: the app boots without NAS configured; upload/download are simply disabled until
  // these are set (isNasUploadConfigured() gates the actions). Secrets are server-only; the two
  // NEXT_PUBLIC_* agent URLs are non-secret and mirrored to the browser for the LAN-vs-Tunnel race.
  NAS_TOKEN_SIGNING_KEY: z.string().optional(), // Ed25519 PKCS8 PEM (private) — SIGNS tokens
  NAS_TOKEN_KID: z.string().optional(), // key id for rotation
  NAS_TOKEN_ISSUER: z.string().default("work-os"),
  NAS_FINALIZE_SECRET: z.string().optional(), // HMAC secret for agent -> cloud finalize
  SHARE_TOKEN_PEPPER: z.string().optional(), // pepper for share token HMAC
  NAS_UNC_PREFIX: z.string().optional(), // e.g. \\NAS\WorkOS (Windows) — display only
  NAS_SMB_HOST: z.string().optional(), // host for smb:// / UNC local links
  NAS_SMB_SHARE: z.string().optional(), // share name for local links
  NAS_SHARE_BASE_URL: z.string().url().optional(), // public base for /api/artifacts/share
  NAS_AGENT_URL_LAN: z.string().url().optional(), // server-side LAN agent base
  NAS_AGENT_URL_TUNNEL: z.string().url().optional(), // server-side tunnel agent base (download only)
  NEXT_PUBLIC_NAS_AGENT_URL_LAN: z.string().url().optional(),
  NEXT_PUBLIC_NAS_AGENT_URL_TUNNEL: z.string().url().optional(),
  CRON_SECRET: z.string().optional(), // Bearer secret for Vercel cron routes
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment variables:\n${formatted}\n\nCheck .env.example for required vars.`
  );
}

export const env = parsed.data;
