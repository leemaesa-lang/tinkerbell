import { randomUUID } from "node:crypto";
import { districtRegionTargetCode, formatAdminRegionShortLabel } from "@tinkerbell/region-picker/regions";
import type { ConsumerCouponDto, OrderDto, ReservationDto, UsageType, UserCouponDto, UserCouponStatus } from "@shared/integration-contract";
import { couponTargetMatchesConsumerBrowseSelection, couponTargetMatchesConsumerDong, projectConsumerCouponTarget, readConsumerCouponRegionTarget, readConsumerCouponTarget, selectedConsumerDongCode } from "./coupon-region-target";
import { consumerOfferKey, isWithinKstMonth } from "../shared/consumer-coupon-policy";
import { isAvailableVisitTime } from "../shared/consumer-schedule";
import { isWithinConsumerNearbySearchRadius, type Wgs84Point } from "../shared/current-location-search";

export type RepositoryErrorCode = "NOT_FOUND" | "SOLD_OUT" | "MEMBER_ONLY" | "MONTHLY_CLAIM_LIMIT" | "INVALID_PIN" | "INVALID_STATUS" | "AUTH_REQUIRED" | "AGE_RESTRICTED" | "VALIDATION_ERROR";
export class RepositoryError extends Error { constructor(public code: RepositoryErrorCode, message: string) { super(message); } }

type InternalCoupon = ConsumerCouponDto & { memberOnly: boolean; merchantDeposit: number; pin: string };
type InternalUserCoupon = UserCouponDto & { pin: string; merchantId: string };

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

export const seed: InternalCoupon[] = [
  ["1", "m1", "그레이스 커피 로스터스", "본점", "서울 강남구 테헤란로 118, 1층", "02-555-1001", "아메리카노 1잔 무료", 4800, 0, 100, "PICKUP", 3, ["1168064000"], 7, "ACTIVE", false, "coffee"],
  ["2", "m2", "오후의 식탁", "역삼점", "서울 강남구 논현로 521, 2층", "02-555-1002", "런치 15% 할인", 12000, 10200, 15, "VISIT", 5, ["1168064000"], 18, "ACTIVE", false, "lunch"],
  ["3", "m3", "스튜디오 레이어", "강남점", "서울 강남구 봉은사로 226, 3층", "02-555-1003", "첫 방문 20,000원 할인", 80000, 60000, 25, "RESERVATION", 5, ["1168064000"], 4, "ACTIVE", true, "beauty"],
  ["4", "m4", "모브 필라테스", "역삼점", "서울 강남구 역삼로 158, B1", "02-555-1004", "체험 수업 50% 할인", 18000, 9000, 50, "RESERVATION", 5, ["1168064000"], 11, "ACTIVE", false, "fitness"],
  ["5", "m5", "오브제 클래스", "선릉점", "서울 강남구 선릉로 41, 2층", "02-555-1005", "원데이 클래스 10% 할인", 10000, 9000, 10, "RESERVATION", 7, ["1168064000"], 23, "ACTIVE", false, "class"],
  ["6", "m6", "프레임 안경원", "강남점", "서울 강남구 강남대로 410", "02-555-1006", "안경테 30,000원 할인", 150000, 120000, 20, "VISIT", 5, ["1168064000"], 6, "ACTIVE", true, "glasses"],
  ["7", "m7", "바른미소 치과", "역삼점", "서울 강남구 삼성로 88", "02-555-1007", "스케일링 20% 할인", 70000, 56000, 20, "RESERVATION", 5, ["1168064000"], 9, "ACTIVE", false, "dental"],
  ["8", "m8", "룸앤룸 파티라운지", "청담점", "서울 강남구 도산대로 123", "02-555-1008", "공간 대여 25% 할인", 100000, 75000, 25, "RESERVATION", 5, ["1168064000"], 3, "ACTIVE", true, "party"],
  ["9", "m9", "오늘의 반찬", "역삼점", "서울 강남구 논현로 508, 1층", "02-555-1009", "제철 반찬 4종 랜덤팩", 12000, 4500, 62, "PICKUP", 5, ["1168064000"], 8, "ACTIVE", false, "side-dish"],
].map(([id, merchantId, merchantName, branchName, address, phone, title, originalPrice, discountPrice, discountRate, usageType, targetRadiusKm, targetRegionCodes, remainingQuantity, status, memberOnly]) => {
  const regionTarget = readConsumerCouponRegionTarget(undefined, targetRegionCodes as string[])!;
  return ({
  couponId: id as string, storePublicId: merchantId as string, merchantId: merchantId as string, merchantName: merchantName as string, branchName: branchName as string, phone: phone as string,
  businessHours: { open: "11:30", close: "21:30", lastOrder: "21:00", breakStart: "15:00", breakEnd: "17:00" }, closedDay: "매주 일요일",
  title: title as string, originalPrice: originalPrice as number, discountPrice: discountPrice as number, discountRate: discountRate as number, usageType: usageType as UsageType,
  targetRadiusKm: targetRadiusKm as number, ...projectConsumerCouponTarget(regionTarget), storeRegionCode: districtRegionTargetCode("서울특별시", "강남구"), storeRegionLabel: formatAdminRegionShortLabel(districtRegionTargetCode("서울특별시", "강남구")), storeAddress: address as string, address: formatAdminRegionShortLabel(districtRegionTargetCode("서울특별시", "강남구")), remainingQuantity: remainingQuantity as number, status: status as "ACTIVE", memberOnly: memberOnly as boolean, minorRestricted: false, merchantDeposit: 100000, pin: "1234",
  });
});

const userCoupons: InternalUserCoupon[] = [];
const claimIdempotency = new Map<string, UserCouponDto>();
const orders: OrderDto[] = [];
const reservations: ReservationDto[] = [];
const couponMatchesSelectedDong = (coupon: ConsumerCouponDto, regionCodes?: string[]) => {
  const target = readConsumerCouponTarget(coupon, coupon.targetRegionCodes, coupon.couponType, coupon.storeDongCode);
  return couponTargetMatchesConsumerDong(target, coupon.couponType, coupon.storeDongCode, selectedConsumerDongCode(regionCodes));
};
const couponMatchesBrowseSelection = (coupon: ConsumerCouponDto, regionCodes?: string[]) => {
  const target = readConsumerCouponTarget(coupon, coupon.targetRegionCodes, coupon.couponType, coupon.storeDongCode);
  return couponTargetMatchesConsumerBrowseSelection(target, coupon.couponType, coupon.storeDongCode, regionCodes);
};
export function createDevelopmentRepository(): ConsumerRepository {
  return {
    async listCoupons(filters) {
      return seed.filter((coupon) => coupon.status === "ACTIVE" && coupon.remainingQuantity > 0 && (!coupon.minorRestricted || filters.isVerifiedAdult === true) && couponMatchesBrowseSelection(coupon, filters.regionCodes) && (!filters.category || coupon.merchantName.toLowerCase().includes(filters.category.toLowerCase()) || coupon.title.toLowerCase().includes(filters.category.toLowerCase())) && (!filters.usageType || coupon.usageType === filters.usageType) && (!filters.memberOnly || coupon.memberOnly)).map(({ memberOnly: _memberOnly, merchantDeposit: _deposit, pin: _pin, ...coupon }) => ({ ...coupon, downloadCount: userCoupons.filter((item) => item.couponId === coupon.couponId).length, ...projectConsumerCouponTarget(readConsumerCouponTarget(coupon, coupon.targetRegionCodes)!) }));
    },
    async listNearbyCoupons(filters) {
      return seed.filter((coupon) => coupon.status === "ACTIVE" && coupon.remainingQuantity > 0 && String(coupon.couponType).toLowerCase() !== "special" && (!coupon.minorRestricted || filters.isVerifiedAdult === true) && isWithinConsumerNearbySearchRadius(filters.point, { latitude: coupon.latitude ?? Number.NaN, longitude: coupon.longitude ?? Number.NaN })).map(({ memberOnly: _memberOnly, merchantDeposit: _deposit, pin: _pin, ...coupon }) => ({ ...coupon, downloadCount: userCoupons.filter((item) => item.couponId === coupon.couponId).length, ...projectConsumerCouponTarget(readConsumerCouponTarget(coupon, coupon.targetRegionCodes)!) }));
    },
    async claimCoupon(userId, couponId, options) {
      const coupon = seed.find((item) => item.couponId === couponId);
      if (!coupon) throw new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
      if (!couponMatchesSelectedDong(coupon, options.regionCodes)) throw new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
      if (coupon.minorRestricted && options.isVerifiedAdult !== true) throw new RepositoryError("AGE_RESTRICTED", "다날 성인 본인인증이 확인된 계정만 받을 수 있는 쿠폰입니다.");
      const requestKey = options.idempotencyKey ? `${userId}:${couponId}:${options.idempotencyKey}` : "";
      const repeated = requestKey ? claimIdempotency.get(requestKey) : undefined;
      if (repeated) return repeated;
      if (coupon.memberOnly && !options.isPremium) throw new RepositoryError("MEMBER_ONLY", "정회원 전용 쿠폰입니다.");
      if (coupon.remainingQuantity <= 0) throw new RepositoryError("SOLD_OUT", "쿠폰이 모두 소진되었습니다.");
      const offerKey = consumerOfferKey({ merchantId: coupon.merchantId, productName: coupon.productId ?? coupon.title, originalPrice: coupon.originalPrice });
      if (!offerKey) throw new RepositoryError("VALIDATION_ERROR", "쿠폰의 매장·상품·정상가격을 확인할 수 없습니다.");
      const now = new Date();
      const alreadyClaimed = userCoupons.some((item) => item.userId === userId && isWithinKstMonth(item.createdAt, now) && consumerOfferKey({ merchantId: item.merchantId, productName: item.coupon.productId ?? item.coupon.title, originalPrice: item.coupon.originalPrice }) === offerKey);
      if (alreadyClaimed) throw new RepositoryError("MONTHLY_CLAIM_LIMIT", "같은 매장·상품·정상가격 쿠폰은 한국시간 기준 한 달에 한 번만 받을 수 있습니다.");
      coupon.remainingQuantity -= 1;
      const createdAt = new Date().toISOString();
      const claimed: InternalUserCoupon = { id: randomUUID(), couponId, userId, status: "ACTIVE", visitDate: options.visitDate, pickupTime: options.pickupTime, partySize: options.partySize, coupon: ({ ...coupon, memberOnly: undefined } as unknown) as ConsumerCouponDto, createdAt, pin: coupon.pin, merchantId: coupon.merchantId };
      userCoupons.unshift(claimed);
      const { pin: _pin, merchantId: _merchantId, ...dto } = claimed;
      if (requestKey) claimIdempotency.set(requestKey, dto);
      return dto;
    },
    async returnCoupon(userId, userCouponId) {
      const item = userCoupons.find((record) => record.id === userCouponId && record.userId === userId);
      if (!item) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
      if (item.status !== "ACTIVE") throw new RepositoryError("INVALID_STATUS", "이미 사용했거나 취소할 수 없는 쿠폰입니다.");
      item.status = "RETURNED";
      const coupon = seed.find((record) => record.couponId === item.couponId);
      if (coupon) coupon.remainingQuantity += 1;
      const { pin: _pin, merchantId: _merchantId, ...dto } = item;
      return dto;
    },
    async useCoupon(userId: string, userCouponId: string, pin: string | undefined, qrToken: string | undefined, usageType: UsageType, verificationMethod?: "MERCHANT_PIN" | "QR") {
      const item = userCoupons.find((record) => record.id === userCouponId && record.userId === userId);
      if (!item) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
      if (item.status !== "ACTIVE") throw new RepositoryError("INVALID_STATUS", "이미 사용했거나 사용할 수 없는 쿠폰입니다.");
      if (usageType !== item.coupon.usageType) throw new RepositoryError("INVALID_STATUS", "쿠폰 사용 방식이 일치하지 않습니다.");
      if (verificationMethod === "MERCHANT_PIN" && pin !== item.pin || verificationMethod === "QR" && qrToken !== `DG-${item.couponId}` || !verificationMethod) throw new RepositoryError("INVALID_PIN", "인증 정보가 올바르지 않습니다.");
      item.status = "USED";
      item.coupon = { ...item.coupon };
      const merchant = seed.find((coupon) => coupon.merchantId === item.merchantId);
      if (merchant) merchant.merchantDeposit -= 1000;
      const { pin: _pin, merchantId: _merchantId, ...dto } = item;
      return dto;
    },
    async createOrder(userId, userCouponId, usageType) {
      const item = userCoupons.find((record) => record.id === userCouponId && record.userId === userId);
      if (!item) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
      const order: OrderDto = { id: randomUUID(), userCouponId, usageType, status: "PENDING", requestedAt: new Date().toISOString() };
      orders.unshift(order); return order;
    },
    async createReservation(userId, input) {
      const item = userCoupons.find((record) => record.id === input.userCouponId && record.userId === userId);
      if (!item) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
      if (item.status !== "ACTIVE" || item.coupon.usageType !== "RESERVATION" || input.usageType !== "RESERVATION" || !Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 99 || !isAvailableVisitTime(input.visitDate, input.visitTime, item.coupon.businessHours, item.coupon.closedDay)) {
        throw new RepositoryError("VALIDATION_ERROR", "선택한 날짜·시간, 예약 쿠폰 유형 또는 인원 수가 올바르지 않습니다.");
      }
      const existing = reservations.find((reservation) => reservation.userCouponId === input.userCouponId);
      if (existing) {
        if (existing.status !== "PENDING") throw new RepositoryError("INVALID_STATUS", "확정되었거나 종료된 예약은 변경할 수 없습니다.");
        existing.visitDate = input.visitDate;
        existing.visitTime = input.visitTime;
        existing.partySize = input.partySize;
        item.visitDate = input.visitDate;
        item.pickupTime = input.visitTime;
        item.partySize = input.partySize;
        return { ...existing };
      }
      const reservation: ReservationDto = { id: randomUUID(), userCouponId: input.userCouponId, usageType: input.usageType, status: "PENDING", requestedAt: new Date().toISOString(), visitDate: input.visitDate, visitTime: input.visitTime, partySize: input.partySize };
      item.visitDate = input.visitDate;
      item.pickupTime = input.visitTime;
      item.partySize = input.partySize;
      reservations.unshift(reservation);
      return reservation;
    },
    async listUserCoupons(userId) {
      return userCoupons.filter((item) => item.userId === userId).map(({ pin: _pin, merchantId: _merchantId, ...dto }) => dto);
    },
    async listCampaigns(_userId) { return []; },
  };
}
