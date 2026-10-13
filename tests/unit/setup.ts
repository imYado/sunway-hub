import { vi } from "vitest";

// "server-only" throws when imported outside a React Server environment.
vi.mock("server-only", () => ({}));

process.env.ADMIN_EMAIL ??= "mohammedalqadhi745@gmail.com";
process.env.ALLOWED_EMAIL_DOMAINS ??= "imail.sunway.edu.my,sunway.edu.my";
process.env.SESSION_SECRET ??= "test-session-secret-test-session-secret-123";
process.env.OTP_PEPPER ??= "test-otp-pepper-test-otp-pepper";
process.env.STORAGE_DRIVER ??= "local";
process.env.EMAIL_TRANSPORT ??= "file";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
