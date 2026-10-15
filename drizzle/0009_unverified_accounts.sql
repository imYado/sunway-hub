ALTER TYPE "public"."otp_purpose" ADD VALUE 'login_other';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sunway_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "claimed_sunway_email" text;