// Vitest setup for API + DB tests
process.env.NODE_ENV = process.env.NODE_ENV || "test";

// Optional: allow separate DB for tests
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// Keep JWT TTLs short in tests if desired
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || "5m";
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || "1d";
