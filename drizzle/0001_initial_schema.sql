CREATE TYPE "public"."club_category" AS ENUM('Accounting & Finance', 'Art & Music', 'Business', 'Cultural', 'General Interest', 'Martial Art', 'Nature', 'Religious', 'Sports', 'Uniform/Affiliate', 'Academic/Professional', 'Student Leadership Body');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('image', 'pdf', 'docx', 'pptx', 'video');--> statement-breakpoint
CREATE TYPE "public"."image_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."legal_doc_type" AS ENUM('terms', 'privacy');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('contact', 'takedown');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'admin_setup', 'admin_reset', 'delete_account');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('pending', 'approved', 'rejected', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('study', 'event', 'club');--> statement-breakpoint
CREATE TYPE "public"."pronouns" AS ENUM('he', 'she', 'unspecified');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('copyright', 'inappropriate', 'harassment', 'exam_material', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('post', 'user', 'club');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role_label" AS ENUM('student', 'teacher', 'other');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'interested');--> statement-breakpoint
CREATE TYPE "public"."session_stage" AS ENUM('active', 'needs_password', 'needs_totp');--> statement-breakpoint
CREATE TYPE "public"."stored_file_purpose" AS ENUM('attachment', 'avatar', 'club_logo');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'banned', 'deleted');--> statement-breakpoint
CREATE TABLE "admin_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allowed_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid,
	CONSTRAINT "allowed_words_word_unique" UNIQUE("word")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"reason" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "blocked_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid,
	CONSTRAINT "blocked_words_word_unique" UNIQUE("word")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_follows" (
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_follows_club_id_user_id_pk" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_manager_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"proof" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_managers" (
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	CONSTRAINT "club_managers_club_id_user_id_pk" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "club_category" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logo_file_id" uuid,
	"pending_logo_file_id" uuid,
	"seeded" boolean DEFAULT false NOT NULL,
	"hidden_by_reports" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" text,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "message_kind" NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"content_url" text,
	"hidden_post_id" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "rsvp_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvps_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text NOT NULL,
	"capacity" integer
);
--> statement-breakpoint
CREATE TABLE "helpful_votes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helpful_votes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "legal_doc_type" NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_digest" boolean DEFAULT true NOT NULL,
	"email_decisions" boolean DEFAULT true NOT NULL,
	"email_event_reminders" boolean DEFAULT true NOT NULL,
	"in_app_followed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text,
	"email_pending" boolean DEFAULT false NOT NULL,
	"emailed_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_subjects" (
	"post_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "post_subjects_post_id_subject_id_pk" PRIMARY KEY("post_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "post_title_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"old_title" text NOT NULL,
	"new_title" text NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"type" "post_type" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"subject_text" text DEFAULT '' NOT NULL,
	"semester" text,
	"club_id" uuid,
	"status" "post_status" DEFAULT 'pending' NOT NULL,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"title_edited" boolean DEFAULT false NOT NULL,
	"hidden_by_reports" boolean DEFAULT false NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"own_work_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(subject_text, '')), 'B') || setweight(to_tsvector('english', coalesce(description, '')), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"stage" "session_stage" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reauth_at" timestamp with time zone,
	"user_agent" text,
	"ip_hash" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"purpose" "stored_file_purpose" NOT NULL,
	"post_id" uuid,
	"club_id" uuid,
	"storage_path" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"kind" "file_kind" NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"review_status" "image_review_status",
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "stored_files_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
CREATE TABLE "subject_follows" (
	"subject_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_follows_subject_id_user_id_pk" PRIMARY KEY("subject_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "upload_quotas" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"uploads" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "upload_quotas_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "user_avatars" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"approved_file_id" uuid,
	"pending_file_id" uuid,
	"last_rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"doc_type" "legal_doc_type" NOT NULL,
	"version" integer NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"display_name" text,
	"bio" text,
	"pronouns" "pronouns" DEFAULT 'unspecified' NOT NULL,
	"role_label" "role_label" DEFAULT 'student' NOT NULL,
	"teacher_verified" boolean DEFAULT false NOT NULL,
	"email_public" boolean DEFAULT false NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"suspended_until" timestamp with time zone,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"hidden_by_reports" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"username_changed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "admin_credentials" ADD CONSTRAINT "admin_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_follows" ADD CONSTRAINT "club_follows_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_follows" ADD CONSTRAINT "club_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_manager_requests" ADD CONSTRAINT "club_manager_requests_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_manager_requests" ADD CONSTRAINT "club_manager_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_managers" ADD CONSTRAINT "club_managers_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_managers" ADD CONSTRAINT "club_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpful_votes" ADD CONSTRAINT "helpful_votes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helpful_votes" ADD CONSTRAINT "helpful_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_subjects" ADD CONSTRAINT "post_subjects_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_subjects" ADD CONSTRAINT "post_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_title_history" ADD CONSTRAINT "post_title_history_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_follows" ADD CONSTRAINT "subject_follows_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_follows" ADD CONSTRAINT "subject_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_quotas" ADD CONSTRAINT "upload_quotas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_approved_file_id_stored_files_id_fk" FOREIGN KEY ("approved_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_pending_file_id_stored_files_id_fk" FOREIGN KEY ("pending_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "club_manager_requests_status" ON "club_manager_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clubs_name_trgm" ON "clubs" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_starts" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_type_version" ON "legal_documents" USING btree ("type","version");--> statement-breakpoint
CREATE INDEX "notifications_user" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_email_pending" ON "notifications" USING btree ("email_pending");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "otp_codes_email_purpose" ON "otp_codes" USING btree ("email","purpose");--> statement-breakpoint
CREATE INDEX "post_subjects_subject" ON "post_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "post_title_history_post" ON "post_title_history" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_status_created" ON "posts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "posts_author" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "posts_club" ON "posts" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "posts_search" ON "posts" USING gin ("search");--> statement-breakpoint
CREATE INDEX "posts_title_trgm" ON "posts" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "reports_target" ON "reports" USING btree ("target_type","target_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_reporter" ON "reports" USING btree ("reporter_id","target_type","target_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stored_files_post" ON "stored_files" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "stored_files_sha" ON "stored_files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "stored_files_owner" ON "stored_files" USING btree ("owner_id","purpose");--> statement-breakpoint
CREATE INDEX "subjects_name_trgm" ON "subjects" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_consents_user" ON "user_consents" USING btree ("user_id","doc_type");--> statement-breakpoint
CREATE INDEX "users_username_trgm" ON "users" USING gin ("username" gin_trgm_ops);