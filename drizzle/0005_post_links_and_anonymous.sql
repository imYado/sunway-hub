ALTER TABLE "posts" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "anonymous" boolean DEFAULT false NOT NULL;