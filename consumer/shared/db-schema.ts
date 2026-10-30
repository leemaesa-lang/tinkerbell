import { boolean, integer, jsonb, pgEnum, pgTable, numeric, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const couponStatusEnum = pgEnum("coupon_status", ["ACTIVE", "PAUSED", "SOLD_OUT", "EXPIRED"]);
export const usageTypeEnum = pgEnum("usage_type", ["VISIT", "PICKUP", "RESERVATION"]);
export const userCouponStatusEnum = pgEnum("user_coupon_status", ["ACTIVE", "USED", "EXPIRED", "RETURNED"]);
export const orderStatusEnum = pgEnum("order_status", ["PENDING", "CONFIRMED", "REJECTED", "COMPLETED"]);
export const ledgerTypeEnum = pgEnum("deposit_ledger_type", ["COUPON_USE_DEBIT", "COUPON_ISSUE_LOCK", "COUPON_REFUND"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  dong: text("dong").notNull(),
  memberOnly: boolean("member_only").default(false).notNull(),
  ...timestamps,
}, (table: any) => [uniqueIndex("users_phone_unique").on(table.phone), index("users_dong_idx").on(table.dong)]);

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  branchName: text("branch_name").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  businessHours: jsonb("business_hours").$type<{ open: string; close: string; breakStart?: string; breakEnd?: string; lastOrder?: string }>().notNull(),
  closedDay: text("closed_day").notNull(),
  depositBalance: integer("deposit_balance").default(0).notNull(),
  lockedBalance: integer("locked_balance").default(0).notNull(),
  ...timestamps,
});

export const coupons = pgTable("coupons", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").references(() => merchants.id).notNull(),
  title: text("title").notNull(),
  originalPrice: integer("original_price").notNull(),
  discountPrice: integer("discount_price").notNull(),
  discountRate: numeric("discount_rate", { precision: 5, scale: 2 }).notNull(),
  usageType: usageTypeEnum("usage_type").notNull(),
  targetRadiusKm: numeric("target_radius_km", { precision: 4, scale: 2 }).notNull(),
  targetDongs: jsonb("target_dongs").$type<string[]>().notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  status: couponStatusEnum("status").default("ACTIVE").notNull(),
  memberOnly: boolean("member_only").default(false).notNull(),
  ...timestamps,
}, (table: any) => [index("coupons_active_target_idx").on(table.status, table.merchantId), index("coupons_usage_type_idx").on(table.usageType)]);

export const userCoupons = pgTable("user_coupons", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  couponId: text("coupon_id").references(() => coupons.id).notNull(),
  status: userCouponStatusEnum("status").default("ACTIVE").notNull(),
  visitDate: text("visit_date"),
  pickupTime: text("pickup_time"),
  partySize: integer("party_size"),
  verificationPinHash: text("verification_pin_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps,
}, (table: any) => [index("user_coupons_user_status_idx").on(table.userId, table.status), uniqueIndex("user_coupons_monthly_claim_idx").on(table.userId, table.couponId, table.createdAt)]);

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  userCouponId: text("user_coupon_id").references(() => userCoupons.id).notNull(),
  usageType: usageTypeEnum("usage_type").notNull(),
  status: orderStatusEnum("status").default("PENDING").notNull(),
  ...timestamps,
}, (table: any) => [index("orders_status_idx").on(table.status)]);

export const reservations = pgTable("reservations", {
  id: text("id").primaryKey(),
  userCouponId: text("user_coupon_id").references(() => userCoupons.id).notNull(),
  usageType: usageTypeEnum("usage_type").default("RESERVATION").notNull(),
  visitDate: text("visit_date").notNull(),
  visitTime: text("visit_time").notNull(),
  partySize: integer("party_size").notNull(),
  status: orderStatusEnum("status").default("PENDING").notNull(),
  ...timestamps,
});

export const depositLedgers = pgTable("deposit_ledgers", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").references(() => merchants.id).notNull(),
  userCouponId: text("user_coupon_id").references(() => userCoupons.id),
  type: ledgerTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  ...timestamps,
}, (table: any) => [index("deposit_ledgers_merchant_created_idx").on(table.merchantId, table.createdAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  ...timestamps,
}, (table: any) => [index("audit_logs_entity_idx").on(table.entityType, table.entityId)]);
