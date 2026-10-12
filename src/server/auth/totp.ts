import "server-only";
import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1, step: 30, digits: 6 };

export function newTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export function totpCode(secret: string): string {
  return authenticator.generate(secret);
}

export async function totpQrDataUrl(secret: string, account: string): Promise<string> {
  const uri = authenticator.keyuri(account, "Sunway Hub", secret);
  return QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#111111", light: "#FFFFFF" } });
}
