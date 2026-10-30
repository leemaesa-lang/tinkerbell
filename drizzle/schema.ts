import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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

export const membershipSubscriptions = mysqlTable("membership_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  paymentEnvironment: mysqlEnum("paymentEnvironment", ["test", "live"]).notNull(),
  status: mysqlEnum("status", ["PENDING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "CANCELED"]).notNull().default("PENDING"),
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  nextBillingAt: timestamp("nextBillingAt"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  billingKeyCiphertext: text("billingKeyCiphertext"),
  billingKeyIv: varchar("billingKeyIv", { length: 32 }),
  billingKeyTag: varchar("billingKeyTag", { length: 32 }),
  cardName: varchar("cardName", { length: 128 }),
  maskedCard: varchar("maskedCard", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userEnvironmentIdx: index("membership_sub_user_env_idx").on(table.userOpenId, table.paymentEnvironment),
  dueIdx: index("membership_sub_due_idx").on(table.paymentEnvironment, table.status, table.cancelAtPeriodEnd, table.nextBillingAt),
}));

export const membershipOrders = mysqlTable("membership_orders", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: int("subscriptionId").notNull(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  paymentEnvironment: mysqlEnum("paymentEnvironment", ["test", "live"]).notNull(),
  orderId: varchar("orderId", { length: 50 }).notNull(),
  cycleKey: varchar("cycleKey", { length: 40 }).notNull(),
  orderType: mysqlEnum("orderType", ["INITIAL", "RENEWAL"]).notNull(),
  status: mysqlEnum("status", ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "UNKNOWN"]).notNull().default("PENDING"),
  amount: int("amount").notNull(),
  transactionId: varchar("transactionId", { length: 64 }),
  returnOrigin: varchar("returnOrigin", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  orderIdUnique: uniqueIndex("membership_order_order_id_uq").on(table.orderId),
  subscriptionCycleUnique: uniqueIndex("membership_order_cycle_uq").on(table.subscriptionId, table.cycleKey),
  pendingLookupIdx: index("membership_order_pending_idx").on(table.paymentEnvironment, table.status, table.createdAt),
}));

export const membershipSchedules = mysqlTable("membership_schedules", {
  id: int("id").autoincrement().primaryKey(),
  paymentEnvironment: mysqlEnum("paymentEnvironment", ["test", "live"]).notNull(),
  taskUid: varchar("taskUid", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  environmentUnique: uniqueIndex("membership_schedule_environment_uq").on(table.paymentEnvironment),
  taskUidUnique: uniqueIndex("membership_schedule_task_uid_uq").on(table.taskUid),
}));


export const consumerIdentityChallenges = mysqlTable("consumer_identity_challenges", {
  identityVerificationId: varchar("identityVerificationId", { length: 128 }).primaryKey(),
  challengeTokenHash: varchar("challengeTokenHash", { length: 64 }).notNull(),
  consumerOrigin: varchar("consumerOrigin", { length: 512 }).notNull(),
  phoneNumberConsentPolicyVersion: varchar("phoneNumberConsentPolicyVersion", { length: 32 }),
  phoneNumberConsentAcceptedAt: timestamp("phoneNumberConsentAcceptedAt"),
  status: mysqlEnum("status", ["PENDING", "VERIFIED", "FAILED", "EXPIRED"]).notNull().default("PENDING"),
  completedOpenId: varchar("completedOpenId", { length: 64 }),
  failureCode: varchar("failureCode", { length: 64 }),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  challengeTokenUnique: uniqueIndex("consumer_identity_challenge_token_uq").on(table.challengeTokenHash),
  statusExpiryIdx: index("consumer_identity_challenge_status_exp_idx").on(table.status, table.expiresAt),
}));

export const consumerPhoneIdentities = mysqlTable("consumer_phone_identities", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  diHash: varchar("diHash", { length: 64 }).notNull(),
  phoneHash: varchar("phoneHash", { length: 64 }).notNull(),
  phoneCiphertext: text("phoneCiphertext").notNull(),
  phoneIv: varchar("phoneIv", { length: 32 }).notNull(),
  phoneTag: varchar("phoneTag", { length: 32 }).notNull(),
  providerVerificationId: varchar("providerVerificationId", { length: 128 }).notNull(),
  providerChannelId: varchar("providerChannelId", { length: 128 }).notNull(),
  gender: mysqlEnum("gender", ["MALE", "FEMALE", "OTHER"]).notNull(),
  ageBand: mysqlEnum("ageBand", ["UNDER_14", "14_18", "19_29", "30_39", "40_49", "50_59", "60_PLUS"]).notNull(),
  verifiedAt: timestamp("verifiedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userUnique: uniqueIndex("consumer_phone_user_uq").on(table.userOpenId),
  diUnique: uniqueIndex("consumer_phone_di_uq").on(table.diHash),
  verificationUnique: uniqueIndex("consumer_phone_verification_uq").on(table.providerVerificationId),
  phoneLookupIdx: index("consumer_phone_hash_idx").on(table.phoneHash),
}));

export const consumerProfiles = mysqlTable("consumer_profiles", {
  userOpenId: varchar("userOpenId", { length: 64 }).primaryKey(),
  nickname: varchar("nickname", { length: 40 }).notNull(),
  regionCode: varchar("regionCode", { length: 16 }).notNull(),
  regionName: varchar("regionName", { length: 128 }).notNull(),
  profileCompletedAt: timestamp("profileCompletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  nicknameIdx: index("consumer_profile_nickname_idx").on(table.nickname),
}));

export const consumerReferralCodes = mysqlTable("consumer_referral_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull(),
  partnerOpenId: varchar("partnerOpenId", { length: 64 }),
  partnerLabel: varchar("partnerLabel", { length: 96 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).notNull().default("ACTIVE"),
  expiresAt: timestamp("expiresAt"),
  createdByOpenId: varchar("createdByOpenId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  codeUnique: uniqueIndex("consumer_referral_code_uq").on(table.code),
  partnerIdx: index("consumer_referral_partner_idx").on(table.partnerOpenId, table.status),
}));

export const consumerReferralAttributions = mysqlTable("consumer_referral_attributions", {
  id: int("id").autoincrement().primaryKey(),
  consumerOpenId: varchar("consumerOpenId", { length: 64 }).notNull(),
  referralCodeId: int("referralCodeId").notNull(),
  referralCode: varchar("referralCode", { length: 32 }).notNull(),
  partnerOpenId: varchar("partnerOpenId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  consumerUnique: uniqueIndex("consumer_referral_consumer_uq").on(table.consumerOpenId),
  codeIdx: index("consumer_referral_attribution_code_idx").on(table.referralCodeId, table.createdAt),
}));

export const consumerMembershipConsents = mysqlTable("consumer_membership_consents", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  decision: mysqlEnum("decision", ["ACCEPTED", "DECLINED", "REVOKED"]).notNull(),
  policyVersion: varchar("policyVersion", { length: 32 }).notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  billingInterval: varchar("billingInterval", { length: 16 }).notNull().default("MONTHLY"),
  autoRenewal: boolean("autoRenewal").notNull().default(true),
  source: mysqlEnum("source", ["PROFILE_SETUP", "MEMBERSHIP_SETTINGS"]).notNull(),
  decidedAt: timestamp("decidedAt").defaultNow().notNull(),
}, table => ({
  userConsentIdx: index("consumer_membership_consent_user_idx").on(table.userOpenId, table.id),
}));
