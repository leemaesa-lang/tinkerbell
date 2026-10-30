import crypto from "node:crypto";
import { and, desc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { consumerCampaignApplications, consumerCoupons, consumerOrders, consumerReservations, consumerUserCoupons, users } from "../drizzle/schema";
import type { ConsumerCouponDto, OrderDto, ReservationDto, UsageType, UserCouponDto } from "@shared/integration-contract";
import { formatAdminRegionShortLabel } from "@tinkerbell/region-picker/regions";
import { RepositoryError } from "./consumer-repository";
import { couponTargetMatchesConsumerBrowseSelection, couponTargetMatchesConsumerDong, projectConsumerCouponTarget, readConsumerCouponTarget, selectedConsumerDongCode } from "./coupon-region-target";
import { consumerOfferKey, kstMonthBounds } from "../shared/consumer-coupon-policy";
import { isAvailableVisitTime } from "../shared/consumer-schedule";
import { seed } from "./consumer-repository";
import { isWithinConsumerNearbySearchRadius, type Wgs84Point } from "../shared/current-location-search";

type ConsumerRepository = {
  listCoupons: (filters: { regionCodes?: string[]; category?: string; usageType?: UsageType; memberOnly?: boolean; isVerifiedAdult?: boolean; userId: string }) => Promise<ConsumerCouponDto[]>;
  listNearbyCoupons: (filters: { point: Wgs84Point; isVerifiedAdult?: boolean }) => Promise<ConsumerCouponDto[]>;
  claimCoupon: (userId: string, couponId: string, options: { visitDate?: string; pickupTime?: string; partySize?: number; isPremium?: boolean; isVerifiedAdult?: boolean; idempotencyKey?: string; regionCodes?: string[] }) => Promise<UserCouponDto>;
  returnCoupon: (userId: string, userCouponId: string) => Promise<UserCouponDto>;
  useCoupon: (userId: string, userCouponId: string, pin: string | undefined, qrToken: string | undefined, usageType: UsageType, verificationMethod?: "MERCHANT_PIN" | "QR") => Promise<UserCouponDto>;
  createOrder: (userId: string, userCouponId: string, usageType: UsageType) => Promise<OrderDto>;
  createReservation: (userId: string, input: { userCouponId: string; visitDate: string; visitTime: string; partySize: number; usageType: UsageType }) => Promise<ReservationDto>;
  listUserCoupons: (userId: string) => Promise<UserCouponDto[]>;
  listCampaigns: (userId: string) => Promise<unknown[]>;
};

const couponMatchesSelectedDong = (targetValue: unknown, regionCodes?: string[]) => {
  const target = readConsumerCouponTarget(targetValue);
  return couponTargetMatchesConsumerDong(
    target,
    target?.targetMode === "store_radius" ? target.couponType : undefined,
    target?.targetMode === "store_radius" ? target.storeDongCode : undefined,
    selectedConsumerDongCode(regionCodes),
  );
};
const projectStoredTarget = (targetValue: unknown) => {
  const target = readConsumerCouponTarget(targetValue);
  if (target) return projectConsumerCouponTarget(target);
  return { targetMode: null, targetScope: null, targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], targetRegionCodes: [], storeDongCode: null };
};
const readConsumerCouponRegionTarget = (explicitTarget: unknown, legacyCodes?: unknown) => readConsumerCouponTarget(explicitTarget ?? legacyCodes);
const couponTargetMatchesConsumerLocation = (target: unknown, regionCodes?: string[]) => {
  const decoded = target as ReturnType<typeof readConsumerCouponTarget>;
  return couponTargetMatchesConsumerDong(
    decoded,
    decoded?.targetMode === "store_radius" ? decoded.couponType : undefined,
    decoded?.targetMode === "store_radius" ? decoded.storeDongCode : undefined,
    selectedConsumerDongCode(regionCodes),
  );
};
const couponTargetMatchesConsumerBrowseLocation = (target: unknown, regionCodes?: string[]) => {
  const decoded = target as ReturnType<typeof readConsumerCouponTarget>;
  return couponTargetMatchesConsumerBrowseSelection(
    decoded,
    decoded?.targetMode === "store_radius" ? decoded.couponType : undefined,
    decoded?.targetMode === "store_radius" ? decoded.storeDongCode : undefined,
    regionCodes,
  );
};

const dtoFromRow = (row: typeof consumerUserCoupons.$inferSelect, coupon: typeof consumerCoupons.$inferSelect): UserCouponDto => ({
  id: row.id,
  couponId: row.couponId,
  userId: row.userId,
  status: row.status as UserCouponDto["status"],
  visitDate: row.visitDate ?? undefined,
  pickupTime: row.pickupTime ?? undefined,
  partySize: row.partySize ?? undefined,
  createdAt: row.createdAt.toISOString(),
  coupon: {
    couponId: coupon.couponId, storePublicId: coupon.merchantId, merchantId: coupon.merchantId, merchantName: coupon.merchantName, branchName: coupon.branchName,
    address: formatAdminRegionShortLabel(coupon.storeRegionCode ?? ""), storeAddress: coupon.address, storeRegionCode: coupon.storeRegionCode ?? undefined, storeRegionLabel: formatAdminRegionShortLabel(coupon.storeRegionCode ?? ""), phone: coupon.phone, businessHours: coupon.businessHours as ConsumerCouponDto["businessHours"], closedDay: coupon.closedDay,
    title: coupon.title, productId: coupon.productId ?? undefined, originalPrice: coupon.originalPrice, discountPrice: coupon.discountPrice, discountRate: coupon.discountRate,
    usageType: coupon.usageType as UsageType, targetRadiusKm: coupon.targetRadiusKm, ...projectStoredTarget(coupon.targetDongs), remainingQuantity: coupon.remainingQuantity,
    status: coupon.status as ConsumerCouponDto["status"], minorRestricted: Boolean(coupon.minorRestricted), image: coupon.image ?? undefined, imageUrl: coupon.imageUrl ?? undefined, images: coupon.images ?? undefined, mediaUrl: coupon.mediaUrl ?? undefined, storeImageUrl: coupon.storeImageUrl ?? undefined, foodImageUrl: coupon.foodImageUrl ?? undefined, videoUrl: coupon.videoUrl ?? undefined, mediaType: coupon.mediaType ?? undefined, mediaItems: coupon.mediaItems ?? undefined, latitude: coupon.latitude ?? undefined, longitude: coupon.longitude ?? undefined,
  },
});

export function createConsumerDbRepository(): ConsumerRepository {
  async function dbOrThrow() { const db = await getDb(); if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다."); return db; }
  async function downloadCountsFor(db: Awaited<ReturnType<typeof dbOrThrow>>, couponIds: string[]) {
    if (!couponIds.length) return new Map<string, number>();
    const rows = await db.select({ couponId: consumerUserCoupons.couponId, downloadCount: sql<number>`count(*)` })
      .from(consumerUserCoupons)
      .where(inArray(consumerUserCoupons.couponId, couponIds))
      .groupBy(consumerUserCoupons.couponId);
    return new Map(rows.map((row) => [row.couponId, Number(row.downloadCount)]));
  }
  async function ensureSeeded() {
    const db = await dbOrThrow();
    const existing = await db.select({ couponId: consumerCoupons.couponId }).from(consumerCoupons).limit(1);
    if (existing.length) return;
    await db.insert(consumerCoupons).values(seed.map((coupon) => ({
      couponId: coupon.couponId, merchantId: coupon.merchantId, merchantName: coupon.merchantName, branchName: coupon.branchName, address: coupon.address, storeRegionCode: coupon.storeRegionCode, phone: coupon.phone,
      businessHours: coupon.businessHours, closedDay: coupon.closedDay, title: coupon.title, productId: coupon.productId ?? coupon.title, originalPrice: coupon.originalPrice, discountPrice: coupon.discountPrice,
      discountRate: coupon.discountRate, usageType: coupon.usageType, targetRadiusKm: coupon.targetRadiusKm, targetDongs: coupon.targetRegionCodes, remainingQuantity: coupon.remainingQuantity,
      status: coupon.status, memberOnly: coupon.memberOnly, minorRestricted: coupon.minorRestricted ?? false, pin: coupon.pin, image: coupon.image, imageUrl: coupon.imageUrl, images: coupon.images, mediaUrl: coupon.mediaUrl, storeImageUrl: coupon.storeImageUrl, foodImageUrl: coupon.foodImageUrl, videoUrl: coupon.videoUrl, mediaType: coupon.mediaType, mediaItems: coupon.mediaItems, latitude: coupon.latitude, longitude: coupon.longitude,
    })));
  }
  async function findOwned(userId: string, id: string) {
    const db = await dbOrThrow();
    const rows = await db.select({ row: consumerUserCoupons, coupon: consumerCoupons }).from(consumerUserCoupons).innerJoin(consumerCoupons, eq(consumerUserCoupons.couponId, consumerCoupons.couponId)).where(and(eq(consumerUserCoupons.id, id), eq(consumerUserCoupons.userId, userId))).limit(1);
    return rows[0];
  }
  return {
    async listCoupons(filters) {
      await ensureSeeded(); const db = await dbOrThrow();
      const rows = await db.select().from(consumerCoupons).where(and(eq(consumerCoupons.status, "ACTIVE"), gt(consumerCoupons.remainingQuantity, 0)));
      const downloadCounts = await downloadCountsFor(db, rows.map((coupon) => coupon.couponId));
      return rows.filter((coupon) => couponTargetMatchesConsumerBrowseLocation(readConsumerCouponRegionTarget(undefined, coupon.targetDongs), filters.regionCodes) && (!filters.category || coupon.merchantName.includes(filters.category) || coupon.title.includes(filters.category)) && (!filters.usageType || coupon.usageType === filters.usageType) && (!filters.memberOnly || coupon.memberOnly) && (!coupon.minorRestricted || filters.isVerifiedAdult === true)).map((coupon) => ({
        couponId: coupon.couponId, storePublicId: coupon.merchantId, merchantId: coupon.merchantId, merchantName: coupon.merchantName, branchName: coupon.branchName, address: formatAdminRegionShortLabel(coupon.storeRegionCode ?? ""), storeAddress: coupon.address, storeRegionCode: coupon.storeRegionCode ?? undefined, storeRegionLabel: formatAdminRegionShortLabel(coupon.storeRegionCode ?? ""), phone: coupon.phone,
        businessHours: coupon.businessHours as ConsumerCouponDto["businessHours"], closedDay: coupon.closedDay, title: coupon.title, productId: coupon.productId ?? undefined, originalPrice: coupon.originalPrice, discountPrice: coupon.discountPrice, discountRate: coupon.discountRate,
        usageType: coupon.usageType as UsageType, targetRadiusKm: coupon.targetRadiusKm, ...projectConsumerCouponTarget(readConsumerCouponRegionTarget(undefined, coupon.targetDongs)!), remainingQuantity: coupon.remainingQuantity, downloadCount: downloadCounts.get(coupon.couponId) ?? 0, status: coupon.status as ConsumerCouponDto["status"], minorRestricted: Boolean(coupon.minorRestricted),
        image: coupon.image ?? undefined, imageUrl: coupon.imageUrl ?? undefined, images: coupon.images ?? undefined, mediaUrl: coupon.mediaUrl ?? undefined, storeImageUrl: coupon.storeImageUrl ?? undefined, foodImageUrl: coupon.foodImageUrl ?? undefined, videoUrl: coupon.videoUrl ?? undefined, mediaType: coupon.mediaType ?? undefined, mediaItems: coupon.mediaItems ?? undefined, latitude: coupon.latitude ?? undefined, longitude: coupon.longitude ?? undefined,
      }));
    },
    async listNearbyCoupons(filters) {
      const db = await dbOrThrow();
      const rows = await db.select().from(consumerCoupons).where(and(eq(consumerCoupons.status, "ACTIVE"), gt(consumerCoupons.remainingQuantity, 0)));
      const downloadCounts = await downloadCountsFor(db, rows.map((coupon) => coupon.couponId));
      return rows.filter((coupon) => (!coupon.minorRestricted || filters.isVerifiedAdult === true) && isWithinConsumerNearbySearchRadius(filters.point, { latitude: coupon.latitude ?? Number.NaN, longitude: coupon.longitude ?? Number.NaN })).map((coupon) => ({
        couponId: coupon.couponId, storePublicId: coupon.merchantId, merchantId: coupon.merchantId, merchantName: coupon.merchantName, branchName: coupon.branchName, address: formatAdminRegionShortLabel(coupon.storeRegionCode ?? ""), storeAddress: coupon.address, storeRegionCode: coupon.storeRegionCode ?? undefined, storeRegionLabel: formatAdminRegionShortLabel(coupon.storeRegionCode ?? ""), phone: coupon.phone,
        businessHours: coupon.businessHours as ConsumerCouponDto["businessHours"], closedDay: coupon.closedDay, title: coupon.title, productId: coupon.productId ?? undefined, originalPrice: coupon.originalPrice, discountPrice: coupon.discountPrice, discountRate: coupon.discountRate,
        usageType: coupon.usageType as UsageType, targetRadiusKm: coupon.targetRadiusKm, ...projectConsumerCouponTarget(readConsumerCouponRegionTarget(undefined, coupon.targetDongs)!), remainingQuantity: coupon.remainingQuantity, downloadCount: downloadCounts.get(coupon.couponId) ?? 0, status: coupon.status as ConsumerCouponDto["status"], minorRestricted: Boolean(coupon.minorRestricted),
        image: coupon.image ?? undefined, imageUrl: coupon.imageUrl ?? undefined, images: coupon.images ?? undefined, mediaUrl: coupon.mediaUrl ?? undefined, storeImageUrl: coupon.storeImageUrl ?? undefined, foodImageUrl: coupon.foodImageUrl ?? undefined, videoUrl: coupon.videoUrl ?? undefined, mediaType: coupon.mediaType ?? undefined, mediaItems: coupon.mediaItems ?? undefined, latitude: coupon.latitude ?? undefined, longitude: coupon.longitude ?? undefined,
      }));
    },
    async claimCoupon(userId, couponId, options) {
      await ensureSeeded();
      const db = await dbOrThrow();
      const id = options.idempotencyKey ? `claim-${userId}-${options.idempotencyKey}`.slice(0, 128) : crypto.randomUUID();
      const { start, end } = kstMonthBounds(new Date());
      let idempotent: { row: typeof consumerUserCoupons.$inferSelect; coupon: typeof consumerCoupons.$inferSelect } | undefined;

      await db.transaction(async (tx) => {
        const lockedUsers = await tx.select({ id: users.id }).from(users).where(eq(users.openId, userId)).limit(1).for("update");
        if (!lockedUsers.length) throw new RepositoryError("AUTH_REQUIRED", "로그인 후 이용해 주세요.");

        const duplicate = await tx.select({ row: consumerUserCoupons, coupon: consumerCoupons })
          .from(consumerUserCoupons)
          .innerJoin(consumerCoupons, eq(consumerUserCoupons.couponId, consumerCoupons.couponId))
          .where(eq(consumerUserCoupons.id, id))
          .limit(1);
          if (duplicate[0]) {
          if (!couponTargetMatchesConsumerLocation(readConsumerCouponRegionTarget(undefined, duplicate[0].coupon.targetDongs), options.regionCodes)) throw new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
          if (duplicate[0].coupon.minorRestricted && options.isVerifiedAdult !== true) throw new RepositoryError("AGE_RESTRICTED", "다날 성인 본인인증이 확인된 계정만 받을 수 있는 쿠폰입니다.");
          idempotent = duplicate[0]; return;
        }

        const lockedCoupons = await tx.select().from(consumerCoupons).where(eq(consumerCoupons.couponId, couponId)).limit(1).for("update");
        const coupon = lockedCoupons[0];
        if (!coupon) throw new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
        if (!couponTargetMatchesConsumerLocation(readConsumerCouponRegionTarget(undefined, coupon.targetDongs), options.regionCodes)) throw new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
        if (coupon.minorRestricted && options.isVerifiedAdult !== true) throw new RepositoryError("AGE_RESTRICTED", "다날 성인 본인인증이 확인된 계정만 받을 수 있는 쿠폰입니다.");
        if (coupon.memberOnly && !options.isPremium) throw new RepositoryError("MEMBER_ONLY", "정회원 전용 쿠폰입니다.");
        const offerKey = consumerOfferKey({ merchantId: coupon.merchantId, productName: coupon.productId ?? coupon.title, originalPrice: coupon.originalPrice });
        if (!offerKey) throw new RepositoryError("VALIDATION_ERROR", "쿠폰의 매장·상품·정상가격을 확인할 수 없습니다.");

        const recentClaims = await tx.select({ merchantId: consumerCoupons.merchantId, productId: consumerCoupons.productId, title: consumerCoupons.title, originalPrice: consumerCoupons.originalPrice })
          .from(consumerUserCoupons)
          .innerJoin(consumerCoupons, eq(consumerUserCoupons.couponId, consumerCoupons.couponId))
          .where(and(eq(consumerUserCoupons.userId, userId), gte(consumerUserCoupons.createdAt, start), lt(consumerUserCoupons.createdAt, end)));
        const hasDuplicateOffer = recentClaims.some((claim) => consumerOfferKey({ merchantId: claim.merchantId, productName: claim.productId ?? claim.title, originalPrice: claim.originalPrice }) === offerKey);
        if (hasDuplicateOffer) throw new RepositoryError("MONTHLY_CLAIM_LIMIT", "같은 매장·상품·정상가격 쿠폰은 한국시간 기준 한 달에 한 번만 받을 수 있습니다.");
        if (coupon.remainingQuantity <= 0) throw new RepositoryError("SOLD_OUT", "쿠폰이 모두 소진되었습니다.");

        await tx.update(consumerCoupons).set({ remainingQuantity: coupon.remainingQuantity - 1 }).where(eq(consumerCoupons.couponId, couponId));
        await tx.insert(consumerUserCoupons).values({ id, userId, couponId, merchantId: coupon.merchantId, status: "ACTIVE", visitDate: options.visitDate, pickupTime: options.pickupTime, partySize: options.partySize, pin: coupon.pin });
      });

      if (idempotent) return dtoFromRow(idempotent.row, idempotent.coupon);
      const created = await findOwned(userId, id);
      if (!created) throw new Error("쿠폰 발급 결과를 확인할 수 없습니다.");
      return dtoFromRow(created.row, created.coupon);
    },
    async returnCoupon(userId, id) {
      const db = await dbOrThrow();
      let returned: UserCouponDto | undefined;
      await db.transaction(async (tx) => {
        const rows = await tx.select({ row: consumerUserCoupons, coupon: consumerCoupons })
          .from(consumerUserCoupons)
          .innerJoin(consumerCoupons, eq(consumerUserCoupons.couponId, consumerCoupons.couponId))
          .where(and(eq(consumerUserCoupons.id, id), eq(consumerUserCoupons.userId, userId)))
          .limit(1).for("update");
        const owned = rows[0];
        if (!owned) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
        if (owned.row.status !== "ACTIVE") throw new RepositoryError("INVALID_STATUS", "이미 사용했거나 취소할 수 없는 쿠폰입니다.");
        await tx.update(consumerUserCoupons).set({ status: "RETURNED" }).where(and(eq(consumerUserCoupons.id, id), eq(consumerUserCoupons.status, "ACTIVE")));
        await tx.update(consumerCoupons).set({ remainingQuantity: sql`${consumerCoupons.remainingQuantity} + 1` }).where(eq(consumerCoupons.couponId, owned.row.couponId));
        returned = dtoFromRow({ ...owned.row, status: "RETURNED" }, owned.coupon);
      });
      if (!returned) throw new Error("쿠폰 회수 결과를 확인할 수 없습니다.");
      return returned;
    },
    async useCoupon(userId, id, pin, qrToken, usageType, verificationMethod) {
      const db = await dbOrThrow();
      let used: UserCouponDto | undefined;
      await db.transaction(async (tx) => {
        const rows = await tx.select({ row: consumerUserCoupons, coupon: consumerCoupons })
          .from(consumerUserCoupons)
          .innerJoin(consumerCoupons, eq(consumerUserCoupons.couponId, consumerCoupons.couponId))
          .where(and(eq(consumerUserCoupons.id, id), eq(consumerUserCoupons.userId, userId)))
          .limit(1).for("update");
        const owned = rows[0];
        if (!owned) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
        if (owned.row.status !== "ACTIVE" || owned.coupon.usageType !== usageType) throw new RepositoryError("INVALID_STATUS", "이미 사용했거나 사용할 수 없는 쿠폰입니다.");
        if ((verificationMethod === "MERCHANT_PIN" && pin !== owned.row.pin) || (verificationMethod === "QR" && qrToken !== `DG-${owned.row.couponId}`) || !verificationMethod) throw new RepositoryError("INVALID_PIN", "인증 정보가 올바르지 않습니다.");
        await tx.update(consumerUserCoupons).set({ status: "USED" }).where(and(eq(consumerUserCoupons.id, id), eq(consumerUserCoupons.status, "ACTIVE")));
        used = dtoFromRow({ ...owned.row, status: "USED" }, owned.coupon);
      });
      if (!used) throw new Error("쿠폰 사용 결과를 확인할 수 없습니다.");
      return used;
    },
    async createOrder(userId, userCouponId, usageType) { const owned = await findOwned(userId, userCouponId); if (!owned) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다."); const order: OrderDto = { id: crypto.randomUUID(), userCouponId, usageType, status: "PENDING", requestedAt: new Date().toISOString() }; const db = await dbOrThrow(); await db.insert(consumerOrders).values({ ...order, userId, requestedAt: new Date(order.requestedAt) }); return order; },
    async createReservation(userId, input) {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select({ row: consumerUserCoupons, coupon: consumerCoupons })
          .from(consumerUserCoupons)
          .innerJoin(consumerCoupons, eq(consumerUserCoupons.couponId, consumerCoupons.couponId))
          .where(and(eq(consumerUserCoupons.id, input.userCouponId), eq(consumerUserCoupons.userId, userId)))
          .limit(1).for("update");
        const owned = rows[0];
        if (!owned) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
        if (owned.row.status !== "ACTIVE" || owned.coupon.usageType !== "RESERVATION" || input.usageType !== "RESERVATION" || !Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 99 || !isAvailableVisitTime(input.visitDate, input.visitTime, owned.coupon.businessHours as ConsumerCouponDto["businessHours"], owned.coupon.closedDay)) {
          throw new RepositoryError("VALIDATION_ERROR", "선택한 날짜·시간, 예약 쿠폰 유형 또는 인원 수가 올바르지 않습니다.");
        }
        const existingRows = await tx.select().from(consumerReservations)
          .where(eq(consumerReservations.userCouponId, input.userCouponId)).limit(1).for("update");
        const existing = existingRows[0];
        if (existing && existing.status !== "PENDING") throw new RepositoryError("INVALID_STATUS", "확정되었거나 종료된 예약은 변경할 수 없습니다.");
        const reservationId = existing?.id ?? crypto.randomUUID();
        const requestedAt = existing?.requestedAt ?? new Date();
        if (existing) {
          await tx.update(consumerReservations).set({ visitDate: input.visitDate, visitTime: input.visitTime, partySize: input.partySize })
            .where(eq(consumerReservations.id, existing.id));
        } else {
          await tx.insert(consumerReservations).values({ id: reservationId, userId, userCouponId: input.userCouponId, usageType: "RESERVATION", status: "PENDING", requestedAt, visitDate: input.visitDate, visitTime: input.visitTime, partySize: input.partySize });
        }
        await tx.update(consumerUserCoupons).set({ visitDate: input.visitDate, pickupTime: input.visitTime, partySize: input.partySize })
          .where(and(eq(consumerUserCoupons.id, input.userCouponId), eq(consumerUserCoupons.userId, userId)));
        return {
          id: reservationId,
          userCouponId: input.userCouponId,
          usageType: "RESERVATION" as const,
          status: existing?.status ?? "PENDING" as const,
          requestedAt: requestedAt.toISOString(),
          visitDate: input.visitDate,
          visitTime: input.visitTime,
          partySize: input.partySize,
        };
      });
    },
    async listUserCoupons(userId) { const db = await dbOrThrow(); const rows = await db.select({ row: consumerUserCoupons, coupon: consumerCoupons }).from(consumerUserCoupons).innerJoin(consumerCoupons, eq(consumerUserCoupons.couponId, consumerCoupons.couponId)).where(eq(consumerUserCoupons.userId, userId)).orderBy(desc(consumerUserCoupons.createdAt)); return rows.map(({ row, coupon }) => dtoFromRow(row, coupon)); },
    async listCampaigns(userId) { const db = await dbOrThrow(); return db.select().from(consumerCampaignApplications).where(eq(consumerCampaignApplications.userId, userId)).orderBy(desc(consumerCampaignApplications.createdAt)); },
  };
}
