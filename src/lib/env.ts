// Central place to read environment variables. Server-side only values must
// never be imported into client components.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get adminEmail(): string {
    return (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  },
  get allowedEmailDomains(): string[] {
    return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  },
  get sessionSecret(): string {
    return required("SESSION_SECRET");
  },
  get otpPepper(): string {
    return required("OTP_PEPPER");
  },
  get appUrl(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get cronSecret(): string | undefined {
    return process.env.CRON_SECRET || undefined;
  },
  get storageCapBytes(): number {
    const gb = Number(process.env.STORAGE_CAP_GB ?? "1");
    return Math.max(0.1, Number.isFinite(gb) ? gb : 1) * 1024 ** 3;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  get storageDriver(): "vercel" | "local" {
    return process.env.STORAGE_DRIVER === "local" ? "local" : "vercel";
  },
  get microsoftClientId(): string | undefined {
    return process.env.MICROSOFT_CLIENT_ID?.trim() || undefined;
  },
  get microsoftClientSecret(): string | undefined {
    return process.env.MICROSOFT_CLIENT_SECRET || undefined;
  },
  get emailTransport(): "smtp" | "file" {
    return process.env.EMAIL_TRANSPORT === "file" ? "file" : "smtp";
  },
};
