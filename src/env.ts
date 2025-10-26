import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  UPLOAD_DIR: z.string().default("./uploads"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export const env = EnvSchema.parse(process.env);