/**
 * An environment that the configuration accepts, for the tests beside the code.
 * The values are placeholders, not secrets. This file is not imported by the app.
 */
export const usableEnvironment: Readonly<Record<string, string>> = {
  APP_ENV: "test",
  DATABASE_URL: "postgresql://user:db-password-0001@127.0.0.1:1/example_integration",
  REDIS_URL: "redis://127.0.0.1:1",
  S3_ENDPOINT_URL: "http://127.0.0.1:1",
  S3_REGION: "us-east-1",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY_ID: "key-id-0001",
  S3_SECRET_ACCESS_KEY: "key-secret-0001",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_USER: "mail-user",
  SMTP_PASSWORD: "mail-password-0001",
  MAIL_FROM: "portal@example.invalid",
  PUBLIC_BASE_URL: "http://localhost:3000",
  EIFU_LEGAL_NOTICE_VERSION: "draft-1",
  ENTRA_TENANT_ID: "tenant-1",
  ENTRA_ISSUER: "https://issuer.example.invalid/tenant-1/v2.0",
  ENTRA_JWKS_URI: "http://127.0.0.1:1/keys",
  ENTRA_JWKS_MAX_AGE_SECONDS: "3600",
  ENTRA_AUDIENCE: "api://bioeksen-portal",
  ENTRA_CLIENT_ID: "client-1",
  ENTRA_CLIENT_SECRET: "client-secret-0001",
  ENTRA_OPERATOR_SCOPE: "operator.access",
};
