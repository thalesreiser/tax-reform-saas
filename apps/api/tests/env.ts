/**
 * Environment for unit tests: the database is unreachable on purpose (the pool connects lazily), so
 * any test that touches it fails loudly instead of passing by accident. The secret is a placeholder.
 */
export const TEST_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://nobody@127.0.0.1:1/none",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const
