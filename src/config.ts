import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const isValidEthAddress = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(s);

const BASE_SEPOLIA_NETWORK = 'eip155:84532';
const BASE_MAINNET_NETWORK = 'eip155:8453';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  PAYMENTS_ENABLED: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),
  X402_NETWORK: z.string().default(BASE_SEPOLIA_NETWORK),
  X402_PAY_TO: z.string().default(''),
  X402_PROFILE_PRICE: z.coerce.number().positive().default(0.001),
  X402_BATCH_PRICE: z.coerce.number().positive().default(0.005),
  X402_FACILITATOR_URL: z.string().url().default('https://x402.org/facilitator'),

  BUYER_PRIVATE_KEY: z.string().default(''),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  ENABLE_DEMO_BUYER: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
});

function loadConfig() {
  const raw = {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    PAYMENTS_ENABLED: process.env.PAYMENTS_ENABLED,
    X402_NETWORK: process.env.X402_NETWORK,
    X402_PAY_TO: process.env.X402_PAY_TO,
    X402_PROFILE_PRICE: process.env.X402_PROFILE_PRICE,
    X402_BATCH_PRICE: process.env.X402_BATCH_PRICE,
    X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL,
    BUYER_PRIVATE_KEY: process.env.BUYER_PRIVATE_KEY,
    API_BASE_URL: process.env.API_BASE_URL,
    ENABLE_DEMO_BUYER: process.env.ENABLE_DEMO_BUYER,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
  };

  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[TablePulse] Invalid environment configuration:', parsed.error.flatten());
    process.exit(1);
  }

  const env = parsed.data;

  // Reject mainnet
  if (env.X402_NETWORK === BASE_MAINNET_NETWORK) {
    console.error('[TablePulse] FATAL: Base mainnet (eip155:8453) is NOT allowed. Use eip155:84532 (Base Sepolia) only.');
    process.exit(1);
  }

  // Reject unsupported networks
  if (env.X402_NETWORK !== BASE_SEPOLIA_NETWORK) {
    console.error(`[TablePulse] FATAL: Unsupported network "${env.X402_NETWORK}". Only eip155:84532 (Base Sepolia) is supported.`);
    process.exit(1);
  }

  // Validate payment config when enabled
  if (env.PAYMENTS_ENABLED) {
    if (!env.X402_PAY_TO || !isValidEthAddress(env.X402_PAY_TO)) {
      console.error('[TablePulse] FATAL: PAYMENTS_ENABLED=true requires a valid X402_PAY_TO Ethereum address.');
      process.exit(1);
    }
  }

  // Validate demo buyer prerequisites
  if (env.ENABLE_DEMO_BUYER) {
    if (!env.PAYMENTS_ENABLED) {
      console.error('[TablePulse] FATAL: ENABLE_DEMO_BUYER=true requires PAYMENTS_ENABLED=true.');
      process.exit(1);
    }
    if (!env.BUYER_PRIVATE_KEY) {
      console.error('[TablePulse] FATAL: ENABLE_DEMO_BUYER=true requires BUYER_PRIVATE_KEY to be set.');
      process.exit(1);
    }
    // Check buyer wallet != receiving wallet
    // We'll do a lightweight check after viem import in payments module
  }

  return env;
}

export const config = loadConfig();

// Resource limits (centrally configurable)
export const LIMITS = {
  MAX_REQUEST_BODY_BYTES: 2 * 1024 * 1024,      // 2 MiB
  MAX_DATASET_CONTENT_BYTES: 1 * 1024 * 1024,    // 1 MiB per single dataset
  MAX_BATCH_CONTENT_BYTES: 2 * 1024 * 1024,      // 2 MiB total for batch
  MAX_ROWS: 10_000,
  MAX_COLUMNS: 100,
  MAX_BATCH_SIZE: 10,
  MAX_DATASET_NAME_LENGTH: 100,
} as const;

export const ENGINE_VERSION = '1.0.0';
export const REPORT_VERSION = 'tablepulse.report.v1';
export const PRODUCT_NAME = 'TablePulse';
export const PRODUCT_VERSION = '1.0.0';
