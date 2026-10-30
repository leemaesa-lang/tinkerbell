import { bigint, boolean, double, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// Read-only Consumer views of the canonical central onboarding and membership tables.
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

export const mediaFiles = mysqlTable("mediaFiles", {
  id: int("id").autoincrement().primaryKey(), ownerId: int("ownerId").notNull(), fileKey: varchar("fileKey", { length: 512 }).notNull().unique(), url: varchar("url", { length: 768 }).notNull(), originalName: varchar("originalName", { length: 255 }).notNull(), mimeType: varchar("mimeType", { length: 128 }).notNull(), sizeBytes: int("sizeBytes").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerCreatedIdx: index("mediaFiles_owner_created_idx").on(table.ownerId, table.createdAt) }));
export const dashboardEvents = mysqlTable("dashboardEvents", { id: int("id").autoincrement().primaryKey(), eventId: varchar("eventId", { length: 64 }).notNull().unique(), eventType: varchar("eventType", { length: 96 }).notNull(), clientUserId: varchar("clientUserId", { length: 128 }), actorUserId: int("actorUserId"), payload: json("payload").notNull(), status: mysqlEnum("status", ["PENDING", "SENT", "FAILED", "ACKNOWLEDGED"]).default("PENDING").notNull(), failureReason: text("failureReason"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() }, (table) => ({ typeStatusIdx: index("dashboard_events_type_status_idx").on(table.eventType, table.status), createdIdx: index("dashboard_events_created_idx").on(table.createdAt) }));
export const membershipPayments = mysqlTable("membershipPayments", { id: int("id").autoincrement().primaryKey(), eventId: varchar("eventId", { length: 64 }).notNull().unique(), clientUserId: varchar("clientUserId", { length: 128 }).notNull(), displayName: varchar("displayName", { length: 120 }), amount: int("amount").notNull(), method: varchar("method", { length: 32 }).notNull(), status: mysqlEnum("status", ["PENDING", "CONFIRMED", "REJECTED"]).default("PENDING").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, (table) => ({ statusIdx: index("membership_payments_status_idx").on(table.status) }));
export const partnerApplications = mysqlTable("partnerApplications", { id: int("id").autoincrement().primaryKey(), eventId: varchar("eventId", { length: 64 }).notNull().unique(), clientUserId: varchar("clientUserId", { length: 128 }).notNull(), applicantName: varchar("applicantName", { length: 120 }).notNull(), phone: varchar("phone", { length: 40 }).notNull(), bank: varchar("bank", { length: 80 }).notNull(), accountNumber: varchar("accountNumber", { length: 40 }).notNull(), accountHolder: varchar("accountHolder", { length: 120 }).notNull(), isRecurringSubscription: boolean("isRecurringSubscription").default(true).notNull(), isPartnerApplication: boolean("isPartnerApplication").default(true).notNull(), bankbookFileUrl: varchar("bankbookFileUrl", { length: 768 }), status: mysqlEnum("status", ["PENDING", "APPROVED", "REJECTED"]).default("PENDING").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, (table) => ({ statusIdx: index("partner_applications_status_idx").on(table.status) }));
export const partnerSettlements = mysqlTable("partnerSettlements", { id: int("id").autoincrement().primaryKey(), clientUserId: varchar("clientUserId", { length: 128 }).notNull(), month: varchar("month", { length: 7 }).notNull(), retainedSubscribers: int("retainedSubscribers").default(0).notNull(), cancelledSubscribers: int("cancelledSubscribers").default(0).notNull(), amount: int("amount").default(0).notNull(), status: mysqlEnum("status", ["PENDING", "PAID", "EXCLUDED"]).default("PENDING").notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() }, (table) => ({ userMonthIdx: index("partner_settlements_user_month_idx").on(table.clientUserId, table.month) }));

export const communicationRooms = mysqlTable("communicationRooms", { id: int("id").autoincrement().primaryKey(), meetingId: bigint("meetingId", { mode: "number" }).notNull(), meetingTitle: varchar("meetingTitle", { length: 200 }).notNull(), roomType: varchar("roomType", { length: 16 }).default("meet").notNull(), thumbnailUrl: varchar("thumbnailUrl", { length: 768 }), category: varchar("category", { length: 80 }), lastMessage: text("lastMessage"), lastMessageAt: timestamp("lastMessageAt"), createdAt: timestamp("createdAt").defaultNow().notNull() }, (table) => ({ meetingIdx: index("communication_rooms_meeting_idx").on(table.meetingId) }));
export const communicationMembers = mysqlTable("communicationMembers", { id: int("id").autoincrement().primaryKey(), roomId: int("roomId").notNull(), clientUserId: varchar("clientUserId", { length: 128 }).notNull(), displayName: varchar("displayName", { length: 120 }).notNull(), joinedAt: timestamp("joinedAt").defaultNow().notNull(), leftAt: timestamp("leftAt"), lastReadMessageId: int("lastReadMessageId") }, (table) => ({ memberRoomIdx: index("communication_members_room_user_idx").on(table.roomId, table.clientUserId) }));
export const communicationMessages = mysqlTable("communicationMessages", { id: int("id").autoincrement().primaryKey(), roomId: int("roomId").notNull(), clientMessageId: varchar("clientMessageId", { length: 96 }).notNull().unique(), senderId: varchar("senderId", { length: 128 }).notNull(), senderName: varchar("senderName", { length: 120 }).notNull(), text: text("text"), attachmentUrl: varchar("attachmentUrl", { length: 768 }), attachmentType: varchar("attachmentType", { length: 80 }), createdAt: timestamp("createdAt").defaultNow().notNull() }, (table) => ({ roomCreatedIdx: index("communication_messages_room_created_idx").on(table.roomId, table.createdAt) }));
export const communicationPushSubscriptions = mysqlTable("communicationPushSubscriptions", { id: int("id").autoincrement().primaryKey(), clientUserId: varchar("clientUserId", { length: 128 }).notNull(), endpoint: varchar("endpoint", { length: 1024 }).notNull().unique(), subscription: json("subscription").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() });

export const marketplaceListings = mysqlTable("marketplaceListings", {
  listingId: varchar("listingId", { length: 96 }).primaryKey(),
  sellerId: varchar("sellerId", { length: 128 }).notNull(),
  sellerName: varchar("sellerName", { length: 120 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  price: int("price"),
  description: text("description").notNull(),
  regionCode: varchar("regionCode", { length: 32 }).notNull(),
  regionLabel: varchar("regionLabel", { length: 160 }).notNull(),
  photoUrls: json("photoUrls").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["판매중", "예약중", "거래완료"]).default("판매중").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ regionStatusIdx: index("marketplace_listings_region_status_idx").on(table.regionCode, table.status), sellerIdx: index("marketplace_listings_seller_idx").on(table.sellerId) }));

export const marketplaceChatRooms = mysqlTable("marketplaceChatRooms", {
  roomKey: varchar("roomKey", { length: 96 }).primaryKey(),
  listingId: varchar("listingId", { length: 96 }).notNull(),
  buyerId: varchar("buyerId", { length: 128 }).notNull(),
  buyerName: varchar("buyerName", { length: 120 }).notNull(),
  sellerId: varchar("sellerId", { length: 128 }).notNull(),
  sellerName: varchar("sellerName", { length: 120 }).notNull(),
  lastMessage: text("lastMessage"),
  lastMessageAt: timestamp("lastMessageAt"),
  lastMessageId: int("lastMessageId"),
  buyerLastReadMessageId: int("buyerLastReadMessageId").default(0).notNull(),
  sellerLastReadMessageId: int("sellerLastReadMessageId").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ listingBuyerUnique: uniqueIndex("marketplace_chat_listing_buyer_unique").on(table.listingId, table.buyerId), buyerIdx: index("marketplace_chat_buyer_idx").on(table.buyerId, table.lastMessageAt), sellerIdx: index("marketplace_chat_seller_idx").on(table.sellerId, table.lastMessageAt) }));

export const marketplaceChatMessages = mysqlTable("marketplaceChatMessages", {
  id: int("id").autoincrement().primaryKey(),
  roomKey: varchar("roomKey", { length: 96 }).notNull(),
  clientMessageId: varchar("clientMessageId", { length: 96 }).notNull(),
  senderId: varchar("senderId", { length: 128 }).notNull(),
  senderName: varchar("senderName", { length: 120 }).notNull(),
  senderRole: mysqlEnum("senderRole", ["buyer", "seller"]).notNull(),
  text: text("text"),
  attachmentUrl: varchar("attachmentUrl", { length: 768 }),
  attachmentType: varchar("attachmentType", { length: 80 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ roomClientMessageUnique: uniqueIndex("marketplace_chat_room_message_unique").on(table.roomKey, table.clientMessageId), roomCreatedIdx: index("marketplace_chat_messages_room_created_idx").on(table.roomKey, table.createdAt) }));

export const marketplaceUserBlocks = mysqlTable("marketplaceUserBlocks", {
  id: int("id").autoincrement().primaryKey(),
  blockerId: varchar("blockerId", { length: 128 }).notNull(),
  blockedId: varchar("blockedId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ blockerTargetUnique: uniqueIndex("marketplace_user_block_unique").on(table.blockerId, table.blockedId), blockedIdx: index("marketplace_user_blocks_target_idx").on(table.blockedId) }));

export const marketplaceChatReports = mysqlTable("marketplaceChatReports", {
  id: int("id").autoincrement().primaryKey(),
  roomKey: varchar("roomKey", { length: 96 }).notNull(),
  reporterId: varchar("reporterId", { length: 128 }).notNull(),
  reportedUserId: varchar("reportedUserId", { length: 128 }).notNull(),
  reason: varchar("reason", { length: 80 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ roomIdx: index("marketplace_chat_reports_room_idx").on(table.roomKey), reporterIdx: index("marketplace_chat_reports_reporter_idx").on(table.reporterId, table.createdAt) }));

export const consumerCoupons = mysqlTable("consumerCoupons", { couponId: varchar("couponId", { length: 96 }).primaryKey(), merchantId: varchar("merchantId", { length: 96 }).notNull(), merchantName: varchar("merchantName", { length: 160 }).notNull(), branchName: varchar("branchName", { length: 160 }).notNull(), address: varchar("address", { length: 320 }).notNull(), storeRegionCode: varchar("storeRegionCode", { length: 128 }), phone: varchar("phone", { length: 40 }).notNull(), businessHours: json("businessHours").notNull(), closedDay: varchar("closedDay", { length: 120 }).notNull(), title: varchar("title", { length: 240 }).notNull(), productId: varchar("productId", { length: 128 }), originalPrice: int("originalPrice").notNull(), discountPrice: int("discountPrice").notNull(), discountRate: int("discountRate").notNull(), usageType: mysqlEnum("usageType", ["VISIT", "PICKUP", "RESERVATION"]).notNull(), targetRadiusKm: int("targetRadiusKm").notNull(), targetDongs: json("targetDongs").notNull(), remainingQuantity: int("remainingQuantity").notNull(), status: mysqlEnum("status", ["ACTIVE", "PAUSED", "SOLD_OUT", "EXPIRED"]).default("ACTIVE").notNull(), memberOnly: boolean("memberOnly").default(false).notNull(), minorRestricted: boolean("minorRestricted").default(false).notNull(), pin: varchar("pin", { length: 32 }).notNull(), image: varchar("image", { length: 768 }), imageUrl: varchar("imageUrl", { length: 768 }), images: json("images").$type<string[]>(), mediaUrl: varchar("mediaUrl", { length: 768 }), storeImageUrl: varchar("storeImageUrl", { length: 768 }), foodImageUrl: varchar("foodImageUrl", { length: 768 }), videoUrl: varchar("videoUrl", { length: 768 }), mediaType: varchar("mediaType", { length: 80 }), mediaItems: json("mediaItems").$type<Array<{ id: string; kind: "image" | "video"; name: string; url: string; posterUrl?: string; durationSeconds?: number }>>(), latitude: double("latitude"), longitude: double("longitude"), createdAt: timestamp("createdAt").defaultNow().notNull() }, (table) => ({ statusIdx: index("consumer_coupons_status_idx").on(table.status), merchantIdx: index("consumer_coupons_merchant_idx").on(table.merchantId) }));
export const consumerUserCoupons = mysqlTable("consumerUserCoupons", { id: varchar("id", { length: 128 }).primaryKey(), userId: varchar("userId", { length: 128 }).notNull(), couponId: varchar("couponId", { length: 96 }).notNull(), merchantId: varchar("merchantId", { length: 96 }).notNull(), status: mysqlEnum("status", ["ACTIVE", "USED", "EXPIRED", "RETURNED"]).default("ACTIVE").notNull(), visitDate: varchar("visitDate", { length: 32 }), pickupTime: varchar("pickupTime", { length: 32 }), partySize: int("partySize"), pin: varchar("pin", { length: 32 }).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, (table) => ({ userStatusIdx: index("consumer_user_coupons_user_status_idx").on(table.userId, table.status), couponIdx: index("consumer_user_coupons_coupon_idx").on(table.couponId) }));
export const consumerOrders = mysqlTable("consumerOrders", { id: varchar("id", { length: 128 }).primaryKey(), userId: varchar("userId", { length: 128 }).notNull(), userCouponId: varchar("userCouponId", { length: 128 }).notNull(), usageType: mysqlEnum("usageType", ["VISIT", "PICKUP", "RESERVATION"]).notNull(), status: mysqlEnum("status", ["PENDING", "CONFIRMED", "REJECTED", "COMPLETED"]).default("PENDING").notNull(), requestedAt: timestamp("requestedAt").notNull() }, (table) => ({ userIdx: index("consumer_orders_user_idx").on(table.userId, table.requestedAt) }));
export const consumerReservations = mysqlTable("consumerReservations", { id: varchar("id", { length: 128 }).primaryKey(), userId: varchar("userId", { length: 128 }).notNull(), userCouponId: varchar("userCouponId", { length: 128 }).notNull(), usageType: mysqlEnum("usageType", ["RESERVATION"]).notNull(), status: mysqlEnum("status", ["PENDING", "CONFIRMED", "REJECTED", "COMPLETED"]).default("PENDING").notNull(), requestedAt: timestamp("requestedAt").notNull(), visitDate: varchar("visitDate", { length: 32 }).notNull(), visitTime: varchar("visitTime", { length: 32 }).notNull(), partySize: int("partySize").notNull() }, (table) => ({ userIdx: index("consumer_reservations_user_idx").on(table.userId, table.requestedAt) }));
export const consumerSubscriptions = mysqlTable("consumerSubscriptions", { userId: varchar("userId", { length: 128 }).primaryKey(), plan: varchar("plan", { length: 64 }).notNull().default("MONTHLY_10000"), status: mysqlEnum("status", ["PENDING", "ACTIVE", "CANCELED", "EXPIRED"]).default("PENDING").notNull(), method: varchar("method", { length: 32 }).notNull(), currentPeriodEnd: timestamp("currentPeriodEnd"), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() });

export const consumerCampaignApplications = mysqlTable("consumerCampaignApplications", { id: varchar("id", { length: 128 }).primaryKey(), userId: varchar("userId", { length: 128 }).notNull(), campaignId: varchar("campaignId", { length: 96 }).notNull(), merchantName: varchar("merchantName", { length: 160 }).notNull(), status: mysqlEnum("status", ["PENDING", "SELECTED", "REJECTED", "COMPLETED"]).default("PENDING").notNull(), visitDate: varchar("visitDate", { length: 32 }), visitTime: varchar("visitTime", { length: 32 }), channels: json("channels").notNull(), promise: text("promise"), createdAt: timestamp("createdAt").defaultNow().notNull() }, (table) => ({ userIdx: index("consumer_campaign_apps_user_idx").on(table.userId, table.createdAt) }));

export const identityVerifications = mysqlTable("identityVerifications", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull(),
  provider: mysqlEnum("provider", ["DANAL"]).default("DANAL").notNull(),
  status: mysqlEnum("status", ["PENDING", "VERIFIED", "FAILED", "EXPIRED"]).default("PENDING").notNull(),
  providerVerificationId: varchar("providerVerificationId", { length: 200 }).unique(),
  name: varchar("name", { length: 120 }),
  phone: varchar("phone", { length: 40 }),
  gender: mysqlEnum("gender", ["MALE", "FEMALE", "UNKNOWN"]),
  birthDate: varchar("birthDate", { length: 10 }),
  ageBracket: varchar("ageBracket", { length: 32 }),
  isMinor: boolean("isMinor"),
  ciHash: varchar("ciHash", { length: 128 }),
  diHash: varchar("diHash", { length: 128 }),
  verifiedAt: timestamp("verifiedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ userStatusIdx: index("identity_verifications_user_status_idx").on(table.userId, table.status), ciIdx: index("identity_verifications_ci_idx").on(table.ciHash) }));

export const identityConsents = mysqlTable("identityConsents", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("userId", { length: 128 }).notNull(),
  verificationId: varchar("verificationId", { length: 128 }).notNull(),
  consentType: varchar("consentType", { length: 64 }).notNull(),
  policyVersion: varchar("policyVersion", { length: 32 }).notNull(),
  acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
  ipHash: varchar("ipHash", { length: 128 }),
  userAgent: varchar("userAgent", { length: 512 }),
}, (table) => ({ verificationIdx: index("identity_consents_verification_idx").on(table.verificationId), userTypeIdx: index("identity_consents_user_type_idx").on(table.userId, table.consentType) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type InsertMediaFile = typeof mediaFiles.$inferInsert;
