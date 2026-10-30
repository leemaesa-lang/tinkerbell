import { boolean, date, foreignKey, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { CouponRegionTarget, CouponStoreRadiusTarget } from "../../packages/region-picker/src/coupon-target";

type StoredCouponTarget = string[] | (CouponRegionTarget & { targetMode: "region" }) | CouponStoreRadiusTarget;

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const consumerProfiles = mysqlTable("consumer_profiles", {
  userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  gender: mysqlEnum("gender", ["female", "male", "other", "prefer_not_to_say"]).notNull(),
  ageBand: mysqlEnum("ageBand", ["10s", "20s", "30s", "40s", "50plus"]).notNull(),
  regionCode: varchar("regionCode", { length: 10 }).notNull(),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  phoneCiphertext: text("phoneCiphertext"),
  phoneVerifiedAt: timestamp("phoneVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("consumer_profile_region_idx").on(table.regionCode)]);

// Multi-tenant business application tables are declared below.


/** Business accounts are separate from stores; every business API must scope through membership. */
export const businessAccounts = mysqlTable("business_accounts", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  businessName: varchar("businessName", { length: 160 }).notNull(),
  representativeNameCiphertext: text("representativeNameCiphertext"),
  businessRegistrationCiphertext: text("businessRegistrationCiphertext"),
  phoneCiphertext: text("phoneCiphertext"),
  verificationStatus: mysqlEnum("verificationStatus", ["unverified", "pending", "verified", "rejected"]).default("unverified").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("business_accounts_creator_idx").on(table.createdByUserId)]);
export type BusinessAccount = typeof businessAccounts.$inferSelect;

export const businessAccountMembers = mysqlTable("business_account_members", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["owner", "admin", "operator", "viewer"]).default("operator").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("business_account_member_unique").on(table.accountId, table.userId), index("business_account_member_user_idx").on(table.userId)]);
export type BusinessAccountMember = typeof businessAccountMembers.$inferSelect;

export const stores = mysqlTable("business_stores", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  businessType: varchar("businessType", { length: 120 }).notNull(),
  businessRegistrationCiphertext: text("businessRegistrationCiphertext"),
  certificateAssetId: int("certificateAssetId"),
  phoneCiphertext: text("phoneCiphertext"),
  province: varchar("province", { length: 80 }).notNull(),
  district: varchar("district", { length: 80 }).notNull(),
  dong: varchar("dong", { length: 100 }).notNull(),
  dongCode: varchar("dongCode", { length: 20 }).notNull(),
  roadAddress: varchar("roadAddress", { length: 300 }).notNull(),
  detailAddressCiphertext: text("detailAddressCiphertext"),
  postalCode: varchar("postalCode", { length: 12 }),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  naverMapUrl: varchar("naverMapUrl", { length: 1000 }),
  googleMapUrl: varchar("googleMapUrl", { length: 1000 }),
  searchRadiusKm: int("searchRadiusKm").default(5).notNull(),
  operatingStatus: mysqlEnum("operatingStatus", ["open", "break", "closed"]).default("open").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("business_stores_account_idx").on(table.accountId), index("business_stores_region_idx").on(table.province, table.district, table.dongCode), index("business_stores_active_idx").on(table.isActive)]);
export type Store = typeof stores.$inferSelect;

export const storeMembers = mysqlTable("business_store_members", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["manager", "operator", "viewer"]).default("operator").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("business_store_member_unique").on(table.storeId, table.userId), index("business_store_member_user_idx").on(table.userId)]);

export const storeAssets = mysqlTable("business_store_assets", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").references(() => stores.id, { onDelete: "cascade" }),
  assetType: mysqlEnum("assetType", ["business_certificate", "store_photo", "coupon_image", "coupon_video"]).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  byteSize: int("byteSize").notNull(),
  uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  displayOrder: int("displayOrder").default(0).notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("business_store_assets_scope_idx").on(table.accountId, table.storeId)]);

export const storePins = mysqlTable("business_store_pins", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().unique().references(() => stores.id, { onDelete: "cascade" }),
  pinHash: varchar("pinHash", { length: 255 }).notNull(),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const storePinAttempts = mysqlTable("business_store_pin_attempts", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  succeeded: boolean("succeeded").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("business_store_pin_attempt_actor_idx").on(table.storeId, table.actorUserId, table.succeeded, table.createdAt), index("business_store_pin_attempt_store_idx").on(table.storeId, table.createdAt)]);

export const storeMemberships = mysqlTable("business_store_memberships", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().unique().references(() => stores.id, { onDelete: "cascade" }),
  plan: mysqlEnum("plan", ["meetup_monthly_presence"]).default("meetup_monthly_presence").notNull(),
  status: mysqlEnum("status", ["inactive", "pending", "active", "cancelled", "expired"]).default("inactive").notNull(),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  activatedByUserId: int("activatedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("business_store_membership_status_idx").on(table.status, table.endsAt)]);

export const coupons = mysqlTable("business_coupons", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  couponType: mysqlEnum("couponType", ["special", "discount", "trial", "hq_free", "meetup"]).notNull(),
  discountMode: mysqlEnum("discountMode", ["rate", "amount", "service"]).notNull(),
  discountValue: int("discountValue").default(0).notNull(),
  originalPrice: int("originalPrice").default(0).notNull(),
  serviceGift: varchar("serviceGift", { length: 255 }).default("").notNull(),
  startsOn: date("startsOn").notNull(),
  endsOn: date("endsOn").notNull(),
  quantity: int("quantity").notNull(),
  distributionMultiplier: int("distributionMultiplier").default(3).notNull(),
  issuedCount: int("issuedCount").default(0).notNull(),
  remaining: int("remaining").notNull(),
  targetRegions: json("targetRegions").$type<StoredCouponTarget>().notNull(),
  targetGender: mysqlEnum("targetGender", ["all", "female", "male"]).default("all").notNull(),
  targetAges: json("targetAges").$type<string[]>().notNull(),
  minorRestricted: boolean("minorRestricted").default(false).notNull(),
  radiusKm: int("radiusKm").default(5).notNull(),
  mediaAssetPublicIds: json("mediaAssetPublicIds").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["draft", "active", "paused", "ended", "closed"]).default("draft").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("business_coupons_scope_idx").on(table.accountId, table.storeId, table.status), index("business_coupons_period_idx").on(table.startsOn, table.endsOn)]);
export type Coupon = typeof coupons.$inferSelect;

export const couponClaims = mysqlTable("business_coupon_claims", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  couponId: int("couponId").notNull().references(() => coupons.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  consumerUserId: int("consumerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  status: mysqlEnum("status", ["available", "redeemed", "expired", "closed"]).default("available").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("business_coupon_claim_monthly_unique").on(table.couponId, table.consumerUserId, table.monthKey), uniqueIndex("business_coupon_claim_idem_unique").on(table.consumerUserId, table.idempotencyKey), index("business_coupon_claim_store_idx").on(table.storeId, table.status)]);

export const couponRedemptions = mysqlTable("business_coupon_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  couponId: int("couponId").notNull().references(() => coupons.id),
  claimId: int("claimId").notNull().unique(),
  storeId: int("storeId").notNull().references(() => stores.id),
  redeemedByUserId: int("redeemedByUserId").notNull().references(() => users.id),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  benefitAmount: int("benefitAmount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [foreignKey({ name: "bcred_claim_fk", columns: [table.claimId], foreignColumns: [couponClaims.id] }), uniqueIndex("business_coupon_redemption_idem_unique").on(table.storeId, table.idempotencyKey), index("business_coupon_redemption_history_idx").on(table.storeId, table.createdAt)]);

export const bookings = mysqlTable("business_bookings", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  consumerUserId: int("consumerUserId").references(() => users.id, { onDelete: "set null" }),
  customerNameCiphertext: text("customerNameCiphertext").notNull(),
  phoneCiphertext: text("phoneCiphertext"),
  contactConsentAt: timestamp("contactConsentAt"),
  contactNoticeVersion: varchar("contactNoticeVersion", { length: 40 }),
  service: varchar("service", { length: 180 }).notNull(),
  visitDate: date("visitDate").notNull(),
  visitTime: varchar("visitTime", { length: 5 }).notNull(),
  endTime: varchar("endTime", { length: 5 }),
  people: int("people").default(1).notNull(),
  memoCiphertext: text("memoCiphertext"),
  status: mysqlEnum("status", ["pending", "approved", "visited", "no_show", "cancelled", "declined"]).default("pending").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  updatedByUserId: int("updatedByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("business_booking_idem_unique").on(table.storeId, table.idempotencyKey), index("business_booking_timeline_idx").on(table.storeId, table.visitDate, table.visitTime, table.status)]);

export const trialCampaigns = mysqlTable("business_trial_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  couponId: int("couponId").references(() => coupons.id, { onDelete: "set null" }),
  title: varchar("title", { length: 160 }).notNull(),
  recruitmentGoal: int("recruitmentGoal").notNull(),
  selectedCount: int("selectedCount").default(0).notNull(),
  requiredGender: mysqlEnum("requiredGender", ["all", "female", "male"]).default("all").notNull(),
  requiredAgeBands: json("requiredAgeBands").$type<string[]>().notNull(),
  minorRestricted: boolean("minorRestricted").default(false).notNull(),
  targetRegionCodes: json("targetRegionCodes").$type<string[]>().notNull(),
  reviewChannels: json("reviewChannels").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["draft", "open", "paused", "closed"]).default("draft").notNull(),
  applicationEndsOn: date("applicationEndsOn"),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("business_trial_campaign_scope_idx").on(table.accountId, table.storeId, table.status)]);

export const trialApplications = mysqlTable("business_trial_applications", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull(),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  campaignId: int("campaignId").notNull(),
  consumerUserId: int("consumerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  nickname: varchar("nickname", { length: 80 }).notNull(),
  phoneCiphertext: text("phoneCiphertext"),
  contactConsentAt: timestamp("contactConsentAt"),
  contactNoticeVersion: varchar("contactNoticeVersion", { length: 40 }),
  preferredDate: date("preferredDate"),
  preferredTime: varchar("preferredTime", { length: 5 }),
  preferredEndTime: varchar("preferredEndTime", { length: 5 }),
  reviewChannels: json("reviewChannels").$type<string[]>().notNull(),
  motivationCiphertext: text("motivationCiphertext"),
  status: mysqlEnum("status", ["pending", "selected", "rejected", "visited", "closed"]).default("pending").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [foreignKey({ name: "btrial_account_fk", columns: [table.accountId], foreignColumns: [businessAccounts.id] }).onDelete("cascade"), foreignKey({ name: "btrial_campaign_fk", columns: [table.campaignId], foreignColumns: [trialCampaigns.id] }).onDelete("cascade"), uniqueIndex("business_trial_application_unique").on(table.campaignId, table.consumerUserId), uniqueIndex("business_trial_application_idem_unique").on(table.consumerUserId, table.idempotencyKey), index("business_trial_application_store_idx").on(table.storeId, table.status, table.createdAt)]);

export const conversations = mysqlTable("business_conversations", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  bookingId: int("bookingId").references(() => bookings.id, { onDelete: "set null" }),
  trialApplicationId: int("trialApplicationId"),
  consumerUserId: int("consumerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [foreignKey({ name: "bconv_trial_app_fk", columns: [table.trialApplicationId], foreignColumns: [trialApplications.id] }).onDelete("set null"), uniqueIndex("business_conversation_booking_unique").on(table.bookingId), uniqueIndex("business_conversation_trial_unique").on(table.trialApplicationId), index("business_conversation_scope_idx").on(table.accountId, table.storeId)]);

export const conversationMessages = mysqlTable("business_conversation_messages", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  conversationId: int("conversationId").notNull(),
  senderUserId: int("senderUserId").notNull().references(() => users.id),
  senderKind: mysqlEnum("senderKind", ["business", "consumer"]).notNull(),
  bodyCiphertext: text("bodyCiphertext").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [foreignKey({ name: "bcmsg_conversation_fk", columns: [table.conversationId], foreignColumns: [conversations.id] }).onDelete("cascade"), uniqueIndex("business_message_idem_unique").on(table.conversationId, table.idempotencyKey), index("business_message_timeline_idx").on(table.conversationId, table.createdAt)]);

export const idempotencyKeys = mysqlTable("business_idempotency_keys", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 80 }).notNull(),
  key: varchar("key", { length: 128 }).notNull(),
  requestHash: varchar("requestHash", { length: 64 }).notNull(),
  resourceType: varchar("resourceType", { length: 80 }).notNull(),
  resourceId: varchar("resourceId", { length: 36 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("business_idempotency_actor_scope_key_unique").on(table.actorUserId, table.scope, table.key), index("business_idempotency_created_idx").on(table.createdAt)]);

export const businessAuditEvents = mysqlTable("business_audit_events", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").references(() => stores.id, { onDelete: "set null" }),
  actorUserId: int("actorUserId").notNull().references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 36 }).notNull(),
  metadata: json("metadata").$type<Record<string, string | number | boolean | null>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("business_audit_scope_idx").on(table.accountId, table.storeId, table.createdAt)]);

/** Persisted business inquiries; free-text subject/body are encrypted and scoped to their author/account. */
export const businessSupportTickets = mysqlTable("business_support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull(),
  storeId: int("storeId"),
  createdByUserId: int("createdByUserId").notNull(),
  category: mysqlEnum("category", ["deposit", "pin", "address", "coupon", "other"]).notNull(),
  subject: varchar("subject", { length: 160 }).notNull(),
  subjectCiphertext: text("subjectCiphertext").notNull(),
  bodyCiphertext: text("bodyCiphertext").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  foreignKey({ name: "bsup_account_fk", columns: [table.accountId], foreignColumns: [businessAccounts.id] }).onDelete("cascade"),
  foreignKey({ name: "bsup_store_fk", columns: [table.storeId], foreignColumns: [stores.id] }).onDelete("set null"),
  foreignKey({ name: "bsup_creator_fk", columns: [table.createdByUserId], foreignColumns: [users.id] }).onDelete("cascade"),
  index("business_support_account_time_idx").on(table.accountId, table.createdAt),
  index("business_support_author_time_idx").on(table.createdByUserId, table.createdAt),
]);

/** Provider billing keys and bank account details are encrypted before persistence. */
export const businessPaymentMethods = mysqlTable("business_payment_methods", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  methodKind: mysqlEnum("methodKind", ["card", "refund_bank", "partner_payout"]).notNull(),
  provider: mysqlEnum("provider", ["portone", "danal", "bank"]).notNull(),
  status: mysqlEnum("status", ["pending", "active", "replaced", "disabled"]).default("pending").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  displayLabel: varchar("displayLabel", { length: 120 }).notNull(),
  lastFour: varchar("lastFour", { length: 4 }),
  encryptedDetails: text("encryptedDetails").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("business_payment_method_store_idx").on(table.storeId, table.methodKind, table.status),
  index("business_payment_method_account_idx").on(table.accountId, table.createdAt),
]);

/** Only server-confirmed payments can increment this per-store wallet. */
export const businessWalletBalances = mysqlTable("business_wallet_balances", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  availableBalance: int("availableBalance").default(0).notNull(),
  lockedBalance: int("lockedBalance").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("business_wallet_store_unique").on(table.storeId)]);

/** Durable provider order/confirmation ledger; client callbacks are never fulfillment evidence. */
export const businessPaymentTransactions = mysqlTable("business_payment_transactions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  accountId: int("accountId").notNull().references(() => businessAccounts.id, { onDelete: "cascade" }),
  storeId: int("storeId").notNull().references(() => stores.id, { onDelete: "cascade" }),
  actorUserId: int("actorUserId").notNull().references(() => users.id),
  paymentMethodId: int("paymentMethodId").references(() => businessPaymentMethods.id, { onDelete: "set null" }),
  provider: mysqlEnum("provider", ["portone", "danal", "bank"]).notNull(),
  transactionType: mysqlEnum("transactionType", ["wallet_topup", "refund", "partner_payout"]).notNull(),
  orderId: varchar("orderId", { length: 64 }).notNull().unique(),
  idempotencyKey: varchar("idempotencyKey", { length: 36 }).notNull().unique(),
  providerTransactionId: varchar("providerTransactionId", { length: 128 }).unique(),
  amount: int("amount").notNull(),
  status: mysqlEnum("status", ["pending", "succeeded", "failed"]).default("pending").notNull(),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("business_payment_tx_store_time_idx").on(table.storeId, table.createdAt),
  index("business_payment_tx_status_idx").on(table.status, table.createdAt),
]);
