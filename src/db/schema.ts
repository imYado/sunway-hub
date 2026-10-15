import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** Which approved events a member sees on their schedule. An event shows if it matches any source. */
export interface CalendarPrefs {
  /** Club events: none, clubs the member follows (the default), all clubs, or the chosen ones. */
  clubs?: "none" | "following" | "all" | "chosen";
  clubIds?: string[];
  /** Events posted by these members. */
  authorIds?: string[];
  /** Events posted by members with these roles. */
  roles?: ("teacher" | "student" | "other")[];
}

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const pronounsEnum = pgEnum("pronouns", ["he", "she", "unspecified"]);
export const roleLabelEnum = pgEnum("role_label", ["student", "teacher", "other"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "banned", "deleted"]);
export const otpPurposeEnum = pgEnum("otp_purpose", ["login", "admin_setup", "admin_reset", "delete_account"]);
export const sessionStageEnum = pgEnum("session_stage", ["active", "needs_password", "needs_totp"]);
export const postTypeEnum = pgEnum("post_type", ["study", "event", "club", "discussion", "market"]);
export const marketKindEnum = pgEnum("market_kind", ["sell", "buy", "swap", "borrow"]);
export const postStatusEnum = pgEnum("post_status", ["pending", "approved", "rejected", "changes_requested"]);
export const fileKindEnum = pgEnum("file_kind", ["image", "pdf", "docx", "pptx", "video"]);
export const storedFilePurposeEnum = pgEnum("stored_file_purpose", ["attachment", "avatar", "club_logo", "comment_attachment", "dm_image"]);
export const imageReviewStatusEnum = pgEnum("image_review_status", ["pending", "approved", "rejected"]);
export const reportTargetEnum = pgEnum("report_target", ["post", "user", "club", "study_group", "comment", "message"]);
export const dmStatusEnum = pgEnum("dm_status", ["pending", "accepted", "declined", "blocked"]);
export const reportReasonEnum = pgEnum("report_reason", [
  "copyright",
  "inappropriate",
  "harassment",
  "exam_material",
  "spam",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status", ["open", "dismissed", "actioned"]);
export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected"]);
export const rsvpStatusEnum = pgEnum("rsvp_status", ["going", "interested"]);
export const legalDocTypeEnum = pgEnum("legal_doc_type", ["terms", "privacy"]);
export const clubCategoryEnum = pgEnum("club_category", [
  "Accounting & Finance",
  "Art & Music",
  "Business",
  "Cultural",
  "General Interest",
  "Martial Art",
  "Nature",
  "Religious",
  "Sports",
  "Uniform/Affiliate",
  "Academic/Professional",
  "Student Leadership Body",
]);
export const planKindEnum = pgEnum("plan_kind", ["study", "outing", "other"]);
export const messageKindEnum = pgEnum("message_kind", ["contact", "takedown"]);

// ---------------------------------------------------------------------------
// Users, auth and sessions
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Always stored normalised (trimmed, lowercase). Never changes after creation.
    email: text("email").notNull().unique(),
    username: text("username").unique(),
    displayName: text("display_name"),
    bio: text("bio"),
    pronouns: pronounsEnum("pronouns").notNull().default("unspecified"),
    roleLabel: roleLabelEnum("role_label").notNull().default("student"),
    teacherVerified: boolean("teacher_verified").notNull().default(false),
    emailPublic: boolean("email_public").notNull().default(false),
    status: userStatusEnum("status").notNull().default("active"),
    suspendedUntil: ts("suspended_until"),
    warningCount: integer("warning_count").notNull().default(0),
    hiddenByReports: boolean("hidden_by_reports").notNull().default(false),
    onboardedAt: ts("onboarded_at"),
    usernameChangedAt: ts("username_changed_at"),
    // The change before the latest one: members may change their username twice a week.
    usernamePrevChangedAt: ts("username_prev_changed_at"),
    // Opt-in: the member chose to appear on the contributor leaderboard.
    showOnLeaderboard: boolean("show_on_leaderboard").notNull().default(false),
    // Which events appear on the member's schedule (see CalendarPrefs).
    calendarPrefs: jsonb("calendar_prefs").$type<CalendarPrefs>().notNull().default({}),
    lastSeenAt: ts("last_seen_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("users_username_trgm").using("gin", sql`${t.username} gin_trgm_ops`)],
);

// Only ever one row: the account whose email equals ADMIN_EMAIL.
export const adminCredentials = pgTable("admin_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("otp_codes_email_purpose").on(t.email, t.purpose)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stage: sessionStageEnum("stage").notNull().default("active"),
    // For password-reset flows: what to do after the password step.
    createdAt: ts("created_at").notNull().defaultNow(),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    reauthAt: ts("reauth_at"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: legalDocTypeEnum("type").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    publishedAt: ts("published_at").notNull().defaultNow(),
    publishedBy: uuid("published_by"),
  },
  (t) => [uniqueIndex("legal_documents_type_version").on(t.type, t.version)],
);

export const userConsents = pgTable(
  "user_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    docType: legalDocTypeEnum("doc_type").notNull(),
    version: integer("version").notNull(),
    acceptedAt: ts("accepted_at").notNull().defaultNow(),
  },
  (t) => [index("user_consents_user").on(t.userId, t.docType)],
);

// ---------------------------------------------------------------------------
// Files (Vercel Blob, private store). Metadata lives here; bytes live in Blob.
// ---------------------------------------------------------------------------
export const storedFiles = pgTable(
  "stored_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    purpose: storedFilePurposeEnum("purpose").notNull(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => directMessages.id, { onDelete: "cascade" }),
    clubId: uuid("club_id"),
    storagePath: text("storage_path").notNull().unique(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    kind: fileKindEnum("kind").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    position: integer("position").notNull().default(0),
    // DM images are stored AES-256-GCM encrypted and decrypted only when a participant views them.
    encrypted: boolean("encrypted").notNull().default(false),
    // For avatars and club logos: review state. Attachments follow their post's status.
    reviewStatus: imageReviewStatusEnum("review_status"),
    reviewReason: text("review_reason"),
    reviewedAt: ts("reviewed_at"),
    reviewedBy: uuid("reviewed_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("stored_files_post").on(t.postId),
    index("stored_files_comment").on(t.commentId),
    index("stored_files_message").on(t.messageId),
    index("stored_files_sha").on(t.sha256),
    index("stored_files_owner").on(t.ownerId, t.purpose),
  ],
);

// Pointers from a user to their approved / pending avatar files.
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  approvedFileId: uuid("approved_file_id").references(() => storedFiles.id, { onDelete: "set null" }),
  pendingFileId: uuid("pending_file_id").references(() => storedFiles.id, { onDelete: "set null" }),
  lastRejectionReason: text("last_rejection_reason"),
});

export const uploadQuotas = pgTable(
  "upload_quotas",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    uploads: integer("uploads").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

// ---------------------------------------------------------------------------
// Subjects, clubs, posts, events
// ---------------------------------------------------------------------------
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("subjects_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`)],
);

export const subjectFollows = pgTable(
  "subject_follows",
  {
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.subjectId, t.userId] })],
);

export const clubs = pgTable(
  "clubs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: clubCategoryEnum("category").notNull(),
    description: text("description").notNull().default(""),
    socials: jsonb("socials").$type<Record<string, string>>().notNull().default({}),
    logoFileId: uuid("logo_file_id"),
    pendingLogoFileId: uuid("pending_logo_file_id"),
    seeded: boolean("seeded").notNull().default(false),
    hiddenByReports: boolean("hidden_by_reports").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
    deleteReason: text("delete_reason"),
  },
  (t) => [index("clubs_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`)],
);

export const clubFollows = pgTable(
  "club_follows",
  {
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clubId, t.userId] })],
);

export const clubManagers = pgTable(
  "club_managers",
  {
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
    assignedBy: uuid("assigned_by"),
  },
  (t) => [primaryKey({ columns: [t.clubId, t.userId] })],
);

export const clubManagerRequests = pgTable(
  "club_manager_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    proof: text("proof").notNull(),
    status: requestStatusEnum("status").notNull().default("pending"),
    decisionReason: text("decision_reason"),
    decidedAt: ts("decided_at"),
    decidedBy: uuid("decided_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("club_manager_requests_status").on(t.status)],
);

export interface PostLink {
  url: string;
  label: string;
}

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: postTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    subjectText: text("subject_text").notNull().default(""),
    semester: text("semester"),
    clubId: uuid("club_id").references(() => clubs.id, { onDelete: "set null" }),
    // External links shared in the post, shown under the description.
    links: jsonb("links").$type<PostLink[]>().notNull().default([]),
    // Market posts only: what the poster wants to do.
    marketKind: marketKindEnum("market_kind"),
    // Shown as "Anonymous" to everyone except the poster and the admin.
    anonymous: boolean("anonymous").notNull().default(false),
    status: postStatusEnum("status").notNull().default("pending"),
    decisionReason: text("decision_reason"),
    decidedAt: ts("decided_at"),
    decidedBy: uuid("decided_by"),
    titleEdited: boolean("title_edited").notNull().default(false),
    hiddenByReports: boolean("hidden_by_reports").notNull().default(false),
    // Upvotes minus downvotes, kept in step with post_votes.
    score: integer("score").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    // Set when the poster edits anything after submitting.
    editedAt: ts("edited_at"),
    ownWorkConfirmedAt: ts("own_work_confirmed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
    deletedBy: uuid("deleted_by"),
    deleteReason: text("delete_reason"),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(subject_text, '')), 'B') || setweight(to_tsvector('english', coalesce(description, '')), 'C')`,
    ),
  },
  (t) => [
    index("posts_status_created").on(t.status, t.createdAt),
    index("posts_author").on(t.authorId),
    index("posts_club").on(t.clubId),
    index("posts_search").using("gin", t.search),
    index("posts_title_trgm").using("gin", sql`${t.title} gin_trgm_ops`),
  ],
);

export const postSubjects = pgTable(
  "post_subjects",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.subjectId] }), index("post_subjects_subject").on(t.subjectId)],
);

export const postTitleHistory = pgTable(
  "post_title_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    oldTitle: text("old_title").notNull(),
    newTitle: text("new_title").notNull(),
    editedBy: uuid("edited_by"),
    editedAt: ts("edited_at").notNull().defaultNow(),
    revertedAt: ts("reverted_at"),
  },
  (t) => [index("post_title_history_post").on(t.postId)],
);

export const events = pgTable(
  "events",
  {
    postId: uuid("post_id")
      .primaryKey()
      .references(() => posts.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    location: text("location").notNull(),
    capacity: integer("capacity"),
  },
  (t) => [index("events_starts").on(t.startsAt)],
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpStatusEnum("status").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

// One vote per member per post: +1 (up) or -1 (down).
export const postVotes = pgTable(
  "post_votes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

// Threaded comments. They appear straight away (no approval), and can be reported like posts.
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    body: text("body").notNull(),
    score: integer("score").notNull().default(0),
    hiddenByReports: boolean("hidden_by_reports").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    editedAt: ts("edited_at"),
    deletedAt: ts("deleted_at"),
    deletedBy: uuid("deleted_by"),
    deleteReason: text("delete_reason"),
  },
  (t) => [index("comments_post").on(t.postId, t.createdAt), index("comments_author").on(t.authorId), index("comments_parent").on(t.parentId)],
);

export const commentVotes = pgTable(
  "comment_votes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    targetType: reportTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: reportReasonEnum("reason").notNull(),
    note: text("note"),
    status: reportStatusEnum("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("reports_target").on(t.targetType, t.targetId, t.status),
    uniqueIndex("reports_one_open_per_reporter")
      .on(t.reporterId, t.targetType, t.targetId)
      .where(sql`status = 'open'`),
  ],
);

export const blockedWords = pgTable("blocked_words", {
  id: uuid("id").primaryKey().defaultRandom(),
  word: text("word").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  addedBy: uuid("added_by"),
});

export const allowedWords = pgTable("allowed_words", {
  id: uuid("id").primaryKey().defaultRandom(),
  word: text("word").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  addedBy: uuid("added_by"),
});

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// Append-only. A database trigger (see migrations) rejects UPDATE and DELETE.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_log_at").on(t.at)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    // Used to make cron-created notifications idempotent (e.g. one reminder per event).
    dedupeKey: text("dedupe_key"),
    emailPending: boolean("email_pending").notNull().default(false),
    emailedAt: ts("emailed_at"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user").on(t.userId, t.createdAt),
    index("notifications_email_pending").on(t.emailPending),
    uniqueIndex("notifications_dedupe").on(t.userId, t.dedupeKey),
  ],
);

export const notificationSettings = pgTable("notification_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailDigest: boolean("email_digest").notNull().default(true),
  emailDecisions: boolean("email_decisions").notNull().default(true),
  emailEventReminders: boolean("email_event_reminders").notNull().default(true),
  inAppFollowed: boolean("in_app_followed").notNull().default(true),
});

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: messageKindEnum("kind").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  contentUrl: text("content_url"),
  hiddenPostId: uuid("hidden_post_id"),
  handledAt: ts("handled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Timetables, study groups and group plans
// ---------------------------------------------------------------------------

// One weekly class or busy slot. Only the owner sees the labels; group members only see
// that the time is taken.
export const timetableEntries = pgTable(
  "timetable_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: smallint("day").notNull(), // Monday = 0 ... Sunday = 6
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    label: text("label").notNull(),
    location: text("location").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("timetable_entries_user").on(t.userId, t.day)],
);

// Private groups: only members (and the admin, for reports) can see them. People join with
// the invite link.
export const studyGroups = pgTable(
  "study_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    inviteCode: text("invite_code").notNull().unique(),
    hiddenByReports: boolean("hidden_by_reports").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
    deletedBy: uuid("deleted_by"),
    deleteReason: text("delete_reason"),
  },
  (t) => [index("study_groups_owner").on(t.ownerId)],
);

export const studyGroupMembers = pgTable(
  "study_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => studyGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("study_group_members_user").on(t.userId)],
);

export const groupPlans = pgTable(
  "group_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => studyGroups.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: planKindEnum("kind").notNull().default("study"),
    title: text("title").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startMin: smallint("start_min"),
    endMin: smallint("end_min"),
    location: text("location").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("group_plans_group_date").on(t.groupId, t.date)],
);

export const groupPlanAttendees = pgTable(
  "group_plan_attendees",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => groupPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Private messages
// ---------------------------------------------------------------------------

// A conversation starts as a request that the recipient must accept. The starter is never
// anonymous. When someone messages the poster of an anonymous post, the recipient stays
// hidden from the starter until the recipient chooses to show their name.
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    starterId: uuid("starter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The post the conversation is about, if it was started from one.
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    postTitle: text("post_title"),
    recipientAnonymous: boolean("recipient_anonymous").notNull().default(false),
    recipientRevealed: boolean("recipient_revealed").notNull().default(false),
    status: dmStatusEnum("status").notNull().default("pending"),
    blockedBy: uuid("blocked_by"),
    respondedAt: ts("responded_at"),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    lastSenderId: uuid("last_sender_id"),
    starterReadAt: ts("starter_read_at"),
    recipientReadAt: ts("recipient_read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("conversations_starter").on(t.starterId, t.lastMessageAt),
    index("conversations_recipient").on(t.recipientId, t.lastMessageAt),
    // One named conversation per pair of people, and one anonymous one per person per post.
    uniqueIndex("conversations_named_pair")
      .on(sql`least(${t.starterId}, ${t.recipientId})`, sql`greatest(${t.starterId}, ${t.recipientId})`)
      .where(sql`recipient_anonymous = false`),
    uniqueIndex("conversations_anonymous_post").on(t.starterId, t.recipientId, t.postId).where(sql`recipient_anonymous = true`),
  ],
);

// Message text is AES-256-GCM encrypted at rest. Only the two participants can read it,
// and the admin only once someone in the conversation has reported a message.
export const directMessages = pgTable(
  "direct_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bodyEnc: text("body_enc").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("direct_messages_conversation").on(t.conversationId, t.createdAt)],
);

// Kept when an account is deleted, so the admin can still identify who was behind reported
// content. Only the admin can read it. Described in the Privacy Policy.
export const deletedAccounts = pgTable("deleted_accounts", {
  userId: uuid("user_id").primaryKey(),
  email: text("email").notNull(),
  username: text("username"),
  displayName: text("display_name"),
  roleLabel: roleLabelEnum("role_label"),
  joinedAt: ts("joined_at"),
  deletedAt: ts("deleted_at").notNull().defaultNow(),
  deletedBy: uuid("deleted_by"),
  reason: text("reason"),
});
