import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

/**
 * The ONE place that sends email. Swap the provider by changing this file only.
 * Providers: Resend (when RESEND_API_KEY is set, sent from your own domain, which
 * university mail servers trust far more), otherwise Gmail SMTP via nodemailer.
 * If Resend fails and Gmail is configured, Gmail is tried as a fallback.
 * In development/tests, EMAIL_TRANSPORT=file writes messages to .data/outbox.
 * Never log recipients, codes or bodies.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

let transporter: nodemailer.Transporter | null = null;

function smtp(): nodemailer.Transporter {
  if (!transporter) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_APP_PASSWORD;
    if (!user || !pass) throw new Error("SMTP is not configured");
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return transporter;
}

const FOOTER = "\n\n--\nSJ Study is an unofficial, student-run, non-commercial site. It is not affiliated with or endorsed by Sunway University.";

async function sendWithResend(msg: EmailMessage, apiKey: string): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM;
  if (!from) throw new Error("EMAIL_FROM is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: `${msg.text}${FOOTER}` }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  try {
    if (env.emailTransport === "file") {
      if (env.isProduction && process.env.ALLOW_FILE_EMAIL_IN_PRODUCTION !== "1") {
        throw new Error("File email transport is for development only");
      }
      const dir = path.join(process.cwd(), ".data", "outbox");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${Date.now()}-${randomToken(6)}.json`), JSON.stringify({ ...msg, at: new Date().toISOString() }));
      return true;
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        await sendWithResend(msg, resendKey);
        return true;
      } catch (err) {
        console.error("Resend failed:", err instanceof Error ? err.message.slice(0, 100) : "unknown error");
        if (!process.env.SMTP_USER) return false;
      }
    }
    await smtp().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: msg.to,
      subject: msg.subject,
      text: `${msg.text}${FOOTER}`,
    });
    return true;
  } catch (err) {
    console.error("sendEmail failed:", err instanceof Error ? err.name : "unknown error");
    return false;
  }
}
