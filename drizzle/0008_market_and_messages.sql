CREATE TYPE "public"."dm_status" AS ENUM('pending', 'accepted', 'declined', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."market_kind" AS ENUM('sell', 'buy', 'swap', 'borrow');--> statement-breakpoint
ALTER TYPE "public"."post_type" ADD VALUE 'market';--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'message';--> statement-breakpoint
ALTER TYPE "public"."stored_file_purpose" ADD VALUE 'dm_image';--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starter_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"post_id" uuid,
	"post_title" text,
	"recipient_anonymous" boolean DEFAULT false NOT NULL,
	"recipient_revealed" boolean DEFAULT false NOT NULL,
	"status" "dm_status" DEFAULT 'pending' NOT NULL,
	"blocked_by" uuid,
	"responded_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sender_id" uuid,
	"starter_read_at" timestamp with time zone,
	"recipient_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deleted_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"display_name" text,
	"role_label" "role_label",
	"joined_at" timestamp with time zone,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_by" uuid,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "market_kind" "market_kind";--> statement-breakpoint
ALTER TABLE "stored_files" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "stored_files" ADD COLUMN "encrypted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_starter_id_users_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_starter" ON "conversations" USING btree ("starter_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_recipient" ON "conversations" USING btree ("recipient_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_named_pair" ON "conversations" USING btree (least("starter_id", "recipient_id"),greatest("starter_id", "recipient_id")) WHERE recipient_anonymous = false;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_anonymous_post" ON "conversations" USING btree ("starter_id","recipient_id","post_id") WHERE recipient_anonymous = true;--> statement-breakpoint
CREATE INDEX "direct_messages_conversation" ON "direct_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_message_id_direct_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stored_files_message" ON "stored_files" USING btree ("message_id");