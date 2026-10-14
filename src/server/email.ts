import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

/**
 * The ONE place that sends email. Swap the provider by changing this file only.
 * Current provider: Gmail SMTP via nodemailer (dedicated account + app password).
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
    await smtp().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: msg.to,
      subject: msg.subject,
      text: `${msg.text}\n\n--\nSJ Study is an unofficial, student-run, non-commercial site. It is not affiliated with or endorsed by Sunway University.`,
    });
    return true;
  } catch (err) {
    console.error("sendEmail failed:", err instanceof Error ? err.name : "unknown error");
    return false;
  }
}
