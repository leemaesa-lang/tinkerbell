import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { CentralConsumerReportStatus, CouponLifecycle, CouponTargetAudience, ReservationLifecycle, StoreLifecycle } from "@shared/bridge-contracts";
import { adminOrPreviewProcedure, publicProcedure, router } from "../_core/trpc";
import { centralStore, DEMO_STORE_ID } from "./central-store";
import { assertMerchantStoreAuthorized } from "./merchant-tenant-auth";
import { isAdminRegionTargetCode } from "../../packages/region-picker/src/regions";
import { isCouponRegionTarget } from "../../packages/region-picker/src/coupon-target";
import { isSuperAdminPhoneViewer } from "./admin-phone-access";

const publicId = z.string().min(1).max(256);
function assertStoreAccess(request: Parameters<typeof assertMerchantStoreAuthorized>[0], storePublicId: string | undefined) {
  if (!storePublicId && process.env.NODE_ENV === "production") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "가맹점 권한을 확인할 수 없습니다." });
  }
  assertMerchantStoreAuthorized(request, storePublicId);
}
const regionTargetCode = z.string().trim().min(1).max(32).refine(isAdminRegionTargetCode, "대상 지역 코드는 공통 행정구역 데이터에 있어야 합니다.");
const couponTargetAudienceInput = z.object({
  regionCodes: z.array(regionTargetCode).max(100),
  ageBands: z.array(z.enum(["18_29", "30_39", "40_49", "50_plus"])).max(4),
  includeMinors: z.boolean(),
  verifiedIdentityOnly: z.boolean(),
  membership: z.enum(["all", "member", "non_member"]),
});
const couponMediaInput = z.object({
  id: z.string().trim().min(1).max(128),
  kind: z.enum(["image", "video"]),
  name: z.string().trim().max(255),
  dataUrl: z.string().min(1).max(40_000_000),
  posterDataUrl: z.string().max(5_000_000).optional(),
  durationSeconds: z.number().finite().min(0).max(600).optional(),
});
const couponTargetFields = {
  targetMode: z.enum(["region", "store_radius"]),
  targetScope: z.enum(["nationwide", "district", "dong", "none"]).nullable(),
  targetAreaLevel: z.enum(["sido", "sigungu"]).nullable(),
  targetDistrictCode: z.string().nullable(),
  targetDongCodes: z.array(z.string()).max(3_628),
};

const popupAdDraftShape = {
  title: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  audiences: z.array(z.enum(["consumer", "merchant"])).min(1).max(2).refine(items => new Set(items).size === items.length),
  media: z.array(z.object({
    id: z.string().trim().min(1).max(128),
    kind: z.enum(["image", "video"]),
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(80),
    dataUrl: z.string().min(1).max(6_200_000),
    exposureSeconds: z.literal(20),
  }).strict()).min(1).max(5),
};
const popupAdDraftInput = z.object(popupAdDraftShape).strict().superRefine((input, context) => {
  const validationError = validatePopupAdMediaList(input.media);
  if (validationError) context.addIssue({ code: z.ZodIssueCode.custom, path: ["media"], message: validationError });
});
const popupAdUpdateInput = z.object({ publicId, ...popupAdDraftShape }).strict().superRefine((input, context) => {
  const validationError = validatePopupAdMediaList(input.media);
  if (validationError) context.addIssue({ code: z.ZodIssueCode.custom, path: ["media"], message: validationError });
});

const createCouponInput = z.object({
  storePublicId: publicId,
  idempotencyKey: z.string().trim().min(8).max(128),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  storeName: z.string().trim().min(1).max(160).optional(),
  storeRegionLabel: z.string().trim().min(1).max(64).optional(),
  specialCutoffTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  specialValidityDays: z.union([z.literal(1), z.literal(2)]).optional(),
  couponType: z.enum(["special", "discount", "trial", "hq_free", "meetup"]).default("discount"),
  discountMode: z.enum(["rate", "amount", "service"]).default("rate"),
  discountValue: z.number().int().min(0).max(10_000_000).default(0),
  originalPrice: z.number().int().min(0).max(100_000_000).default(0),
  serviceGift: z.string().trim().max(255).default(""),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(1_000_000),
  distributionMultiplier: z.union([z.literal(3), z.literal(4), z.literal(5)]).default(3),
  ...couponTargetFields,
  targetGender: z.enum(["all", "female", "male"]).default("all"),
  targetAges: z.array(z.string().trim().min(1).max(16)).max(20).default([]),
  isAdultOnly: z.boolean().default(false),
  minorRestricted: z.boolean().default(false),
  radiusKm: z.number().int().min(1).max(50).optional(),
  mediaAssetPublicIds: z.array(publicId).max(20).default([]),
  mediaItems: z.array(couponMediaInput).max(10).default([]),
  trialBenefit: z.string().trim().max(255).optional(),
  trialMission: z.string().trim().max(1000).optional(),
  trialRecruitmentGoal: z.number().int().min(1).max(1000).optional(),
  trialRequiredGender: z.enum(["all", "female", "male"]).optional(),
  trialRequiredAgeBands: z.array(z.string().trim().min(1).max(16)).max(10).optional(),
  trialReviewChannels: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
}).superRefine((input, context) => {
  if (input.targetMode === "store_radius") {
    if (input.couponType !== "special" || input.targetScope !== null || input.targetAreaLevel !== null
      || input.targetDistrictCode !== null || input.targetDongCodes.length !== 0 || input.radiusKm !== 5) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetMode"], message: "당일 특가 반경 타깃은 special, 반경 5km, null 지역 필드와 빈 동 코드만 허용됩니다." });
    }
  } else {
    if (input.couponType === "special") context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetMode"], message: "당일 특가는 store_radius 타깃으로 발행해야 합니다." });
    if (!isCouponRegionTarget(input, { allowNone: false })) context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetScope"], message: "사업자 쿠폰 대상 지역 스코프와 코드 조합을 확인해 주세요." });
  }
  if (input.couponType === "special" && input.specialValidityDays !== 1 && input.specialValidityDays !== 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ["specialValidityDays"], message: "당일 특가는 오늘 또는 내일만 선택할 수 있습니다." });
  if (input.couponType === "special" && !input.specialCutoffTime) context.addIssue({ code: z.ZodIssueCode.custom, path: ["specialCutoffTime"], message: "당일 특가 마감 시각을 선택해 주세요." });
  if (input.discountMode === "rate" && input.discountValue > 100) context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "퍼센트 할인은 100%를 초과할 수 없습니다." });
  if (input.couponType === "hq_free" && !(input.discountMode === "rate" && input.discountValue === 100 && input.originalPrice > 0)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "관리자 검토용 100% 무료 쿠폰은 정상 가격과 정확한 100% 할인 조건이 필요합니다." });
  if (input.discountMode === "rate" && input.discountValue === 100 && input.originalPrice < 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ["originalPrice"], message: "100% 무료 쿠폰은 정상 가격을 입력해야 합니다." });
  const encodedMediaBytes = input.mediaItems.reduce((total, item) => total + item.dataUrl.length + (item.posterDataUrl?.length ?? 0), 0);
  if (encodedMediaBytes > 42_000_000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaItems"], message: "쿠폰 사진·영상 합계는 42MB 이하로 선택해 주세요." });
});

const createTrialCampaignInput = z.object({
  storePublicId: publicId,
  idempotencyKey: z.string().trim().min(8).max(128),
  couponPublicId: publicId.optional(),
  title: z.string().trim().min(1).max(160),
  benefit: z.string().trim().max(500).optional(),
  mission: z.string().trim().max(2000).optional(),
  recruitmentGoal: z.number().int().min(1).max(1000),
  requiredGender: z.enum(["all", "female", "male"]).default("all"),
  requiredAgeBands: z.array(z.string().trim().min(1).max(16)).max(10).default(["all"]),
  targetRegionCodes: z.array(regionTargetCode).max(100).default([]),
  reviewChannels: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
  applicationEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minorRestricted: z.boolean().default(false),
});

const businessDashboard = router({
  summary: publicProcedure.input(z.object({ storePublicId: publicId })).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.businessSummary(input.storePublicId);
  }),
});

const businessCoupons = router({
  list: publicProcedure.input(z.object({ storePublicId: publicId }).optional()).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input?.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.listCoupons(input?.storePublicId);
  }),
  create: publicProcedure.input(createCouponInput).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    const { coupon, replayed } = centralStore.createCoupon(input);
    return { publicId: coupon.publicId, replayed, status: coupon.status, adminOnlyDistribution: coupon.adminOnlyDistribution };
  }),
  setStatus: publicProcedure.input(z.object({ storePublicId: publicId, couponPublicId: publicId, status: z.enum(["active", "paused", "ended", "closed"]) })).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    const coupon = centralStore.getCoupon(input.couponPublicId);
    if (!coupon || coupon.storePublicId !== input.storePublicId) throw new Error("쿠폰을 찾을 수 없습니다.");
    const updated = centralStore.setCouponStatus(input.couponPublicId, input.status as CouponLifecycle);
    return { ok: true, status: updated.status };
  }),
  redemptionHistory: publicProcedure.input(z.object({ storePublicId: publicId })).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.listRedemptions(input.storePublicId).map(item => ({ publicId: item.publicId, couponPublicId: item.couponPublicId, couponTitle: item.couponTitle, benefitAmount: item.benefitAmount, redeemedAt: item.redeemedAt }));
  }),
  claimsForStore: publicProcedure.input(z.object({ storePublicId: publicId, status: z.enum(["available", "redeemed", "expired", "closed"]).default("available"), limit: z.number().int().min(1).max(200).default(100) })).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.listClaims(input.storePublicId, input.status === "closed" ? "expired" : input.status, input.limit).map(claim => {
      const coupon = centralStore.getCoupon(claim.couponPublicId);
      return { publicId: claim.publicId, couponPublicId: claim.couponPublicId, couponTitle: coupon?.title ?? "쿠폰", couponStatus: coupon?.status ?? "closed", status: claim.status, claimedAt: claim.claimedAt, startsOn: coupon?.startsOn ?? new Date(), endsOn: coupon?.endsOn ?? new Date() };
    });
  }),
  pinStatus: publicProcedure.input(z.object({ storePublicId: publicId })).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.pinStatus(input.storePublicId);
  }),
  setPin: publicProcedure.input(z.object({ storePublicId: publicId, pin: z.string().regex(/^\d{4,6}$/) })).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.setStorePin(input.storePublicId, input.pin);
  }),
  redeem: publicProcedure.input(z.object({ storePublicId: publicId, claimPublicId: publicId, pin: z.string().regex(/^\d{4,6}$/), idempotencyKey: z.string().trim().min(8).max(128) })).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    const result = centralStore.redeemCoupon(input.storePublicId, input.claimPublicId, input.idempotencyKey, input.pin);
    return { publicId: result.redemption.publicId, replayed: result.replayed };
  }),
});

const businessBookings = router({
  listForStore: publicProcedure.input(z.object({ storePublicId: publicId })).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.listReservations(input.storePublicId).map(item => ({
      publicId: item.publicId,
      customerName: item.customerName,
      phone: item.phoneMasked,
      contactAvailable: false,
      contactPurpose: null,
      service: item.service,
      visitDate: item.visitDate,
      visitTime: item.visitTime,
      endTime: item.endTime,
      people: item.people,
      memo: item.memo,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }),
  setStatus: publicProcedure.input(z.object({ storePublicId: publicId, bookingPublicId: publicId, status: z.enum(["approved", "visited", "no_show", "cancelled", "declined"]) })).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    const reservation = centralStore.getReservation(input.bookingPublicId);
    if (!reservation || reservation.storePublicId !== input.storePublicId) throw new Error("예약을 찾을 수 없습니다.");
    const updated = centralStore.setReservationStatus(input.bookingPublicId, input.status as ReservationLifecycle);
    return { ok: true, status: updated.status };
  }),
});

function assertAdminMembersMockOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({ code: "NOT_FOUND", message: "요청한 화면을 찾을 수 없습니다." });
  }
}
function assertAdminSupportMockOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({ code: "NOT_FOUND", message: "요청한 화면을 찾을 수 없습니다." });
  }
}
function assertAdminPopupAdsMockOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({ code: "NOT_FOUND", message: "요청한 화면을 찾을 수 없습니다." });
  }
}
function assertAdminCommunityMockOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({ code: "NOT_FOUND", message: "요청한 화면을 찾을 수 없습니다." });
  }
}
function assertAdminBenefitsMockOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new TRPCError({ code: "NOT_FOUND", message: "요청한 화면을 찾을 수 없습니다." });
  }
}
const updateSupportTicketInput = z.object({
  ticketId: publicId,
  status: z.enum(["pending", "in_progress", "answered"]),
  adminReply: z.string().trim().max(2000).optional(),
}).strict().superRefine((input, context) => {
  if (input.status === "answered" && !input.adminReply?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["adminReply"], message: "답변 완료 처리 전 관리자 답변을 입력해 주세요." });
  }
});

export const operationsRouter = router({
  overview: adminOrPreviewProcedure.query(() => centralStore.getSummary()),
  popupAds: adminOrPreviewProcedure.query(() => {
    assertAdminPopupAdsMockOnly();
    return centralStore.listAdminPopupAds();
  }),
  createPopupAd: adminOrPreviewProcedure.input(popupAdDraftInput).mutation(({ input }) => {
    assertAdminPopupAdsMockOnly();
    return centralStore.createAdminPopupAd(input);
  }),
  updatePopupAd: adminOrPreviewProcedure.input(popupAdUpdateInput).mutation(({ input }) => {
    assertAdminPopupAdsMockOnly();
    const { publicId: adPublicId, ...draft } = input;
    const updated = centralStore.updateAdminPopupAd(adPublicId, draft);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "팝업 광고를 찾을 수 없습니다." });
    return updated;
  }),
  setPopupAdEnabled: adminOrPreviewProcedure.input(z.object({ publicId, enabled: z.boolean() }).strict()).mutation(({ input }) => {
    assertAdminPopupAdsMockOnly();
    const updated = centralStore.setAdminPopupAdEnabled(input.publicId, input.enabled);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "팝업 광고를 찾을 수 없습니다." });
    return updated;
  }),
  deletePopupAd: adminOrPreviewProcedure.input(z.object({ publicId }).strict()).mutation(({ input }) => {
    assertAdminPopupAdsMockOnly();
    if (!centralStore.deleteAdminPopupAd(input.publicId)) throw new TRPCError({ code: "NOT_FOUND", message: "팝업 광고를 찾을 수 없습니다." });
    return { ok: true as const };
  }),
  adminChargeHistory: adminOrPreviewProcedure.query(() => centralStore.listAdminChargeHistory()),
  adminRefunds: adminOrPreviewProcedure.query(() => centralStore.listAdminRefunds()),
  controlTower: adminOrPreviewProcedure.query(() => centralStore.listAdminControlTower()),
  startControlTowerRefundReview: adminOrPreviewProcedure.input(z.object({ publicId }).strict()).mutation(({ input }) => centralStore.startControlTowerRefundReview(input.publicId)),
  resolveControlTowerRefund: adminOrPreviewProcedure.input(z.object({
    publicId,
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(300).optional(),
  })).mutation(({ input }) => centralStore.resolveControlTowerRefund(input.publicId, input.decision, input.reason ?? "")),
  markControlTowerRefundPaid: adminOrPreviewProcedure.input(z.object({ publicId }).strict()).mutation(({ input }) => centralStore.markControlTowerRefundPaid(input.publicId)),
  resolveControlTowerAdvertising: adminOrPreviewProcedure.input(z.object({
    publicId,
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(300).optional(),
  })).mutation(({ input }) => centralStore.resolveControlTowerAdvertising(input.publicId, input.decision, input.reason ?? "")),
  resolveControlTowerStoreEntry: adminOrPreviewProcedure.input(z.object({
    publicId,
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(300).optional(),
  })).mutation(({ input }) => centralStore.resolveControlTowerStoreEntry(input.publicId, input.decision, input.reason ?? "")),
  stores: adminOrPreviewProcedure.query(() => centralStore.listAdminBusinessStoreViews()),
  coupons: adminOrPreviewProcedure.input(z.object({ storePublicId: publicId.optional() }).optional()).query(({ input }) => centralStore.listCoupons(input?.storePublicId)),
  adultCouponReviews: adminOrPreviewProcedure.query(() => centralStore.listAdminAdultCouponReviews()),
  approveAdultOnlyCoupon: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId })).mutation(({ input }) => centralStore.approveAdultOnlyCoupon(input.couponPublicId)),
  rejectAdultOnlyCoupon: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId, reason: z.string().trim().min(1).max(300) })).mutation(({ input }) => centralStore.rejectAdultOnlyCoupon(input.couponPublicId, input.reason)),
  createCoupon: adminOrPreviewProcedure.input(createCouponInput).mutation(({ input }) => {
    const { coupon, replayed } = centralStore.createCoupon(input, "dashboard");
    return { publicId: coupon.publicId, replayed, status: coupon.status, adminOnlyDistribution: coupon.adminOnlyDistribution };
  }),
  reservations: adminOrPreviewProcedure.input(z.object({ storePublicId: publicId.optional() }).optional()).query(({ input }) => centralStore.listReservations(input?.storePublicId)),
  redemptions: adminOrPreviewProcedure.query(() => centralStore.listRedemptions()),
  partnerManagement: adminOrPreviewProcedure.query(() => centralStore.listPartnerManagementRecords()),
  studentRewardCouponOptions: adminOrPreviewProcedure.query(() => centralStore.listStudentRewardCouponOptions("annual_500k")),
  studentPartnerRewards: adminOrPreviewProcedure.query(() => centralStore.listStudentPartnerRewardViews()),
  issueStudentPartnerReward: adminOrPreviewProcedure.input(z.object({
    studentPartnerPublicId: publicId,
    milestone: z.enum(["invite_3", "invite_5", "invite_10", "annual_500k"]),
    couponPublicId: publicId,
  })).mutation(({ input }) => centralStore.issueStudentPartnerReward(input.studentPartnerPublicId, input.milestone, input.couponPublicId)),
  revokeStudentPartnerReward: adminOrPreviewProcedure.input(z.object({
    studentPartnerPublicId: publicId,
    milestone: z.enum(["invite_3", "invite_5", "invite_10", "annual_500k"]),
  })).mutation(({ input }) => centralStore.revokeStudentPartnerReward(input.studentPartnerPublicId, input.milestone)),
  consumerActivity: adminOrPreviewProcedure.query(() => centralStore.getConsumerActivityAdminView()),
  communityModerationHistory: adminOrPreviewProcedure.query(() => {
    assertAdminCommunityMockOnly();
    return centralStore.listCommunityModerationHistory();
  }),
  communityAccountSanctions: adminOrPreviewProcedure.query(() => {
    assertAdminCommunityMockOnly();
    return centralStore.listCommunityAccountSanctions();
  }),
  setCommunityMarketplaceVisibility: adminOrPreviewProcedure.input(z.object({
    publicId, hidden: z.boolean(), reason: z.string().trim().min(5).max(300),
  }).strict()).mutation(({ input, ctx }) => {
    assertAdminCommunityMockOnly();
    try { return centralStore.setCommunityMarketplaceVisibility(input.publicId, input.hidden, input.reason, ctx.user?.name ?? "관리자 Preview"); }
    catch (error) { throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "매물 상태를 변경하지 못했습니다." }); }
  }),
  setCommunityMeetupModeration: adminOrPreviewProcedure.input(z.object({
    publicId, status: z.enum(["normal", "warning", "closed"]), reason: z.string().trim().min(5).max(300),
  }).strict()).mutation(({ input, ctx }) => {
    assertAdminCommunityMockOnly();
    try { return centralStore.setCommunityMeetupModeration(input.publicId, input.status, input.reason, ctx.user?.name ?? "관리자 Preview"); }
    catch (error) { throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "모임 상태를 변경하지 못했습니다." }); }
  }),
  setCommunityReportWorkflow: adminOrPreviewProcedure.input(z.object({
    reportPublicId: publicId, status: z.enum(["reviewing", "resolved", "rejected"]),
    reason: z.string().trim().min(5).max(300), sanction: z.enum(["none", "warning", "restricted", "locked"]).optional(),
    sanctionDays: z.number().int().min(1).max(30).optional(),
  }).strict()).mutation(({ input, ctx }) => {
    assertAdminCommunityMockOnly();
    try { return centralStore.setCommunityReportWorkflow(input, ctx.user?.name ?? "관리자 Preview"); }
    catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "신고 처리를 완료하지 못했습니다." }); }
  }),
  clearCommunityAccountSanction: adminOrPreviewProcedure.input(z.object({ publicId, reason: z.string().trim().min(5).max(300) }).strict()).mutation(({ input, ctx }) => {
    assertAdminCommunityMockOnly();
    try { return centralStore.clearCommunityAccountSanction(input.publicId, input.reason, ctx.user?.name ?? "관리자 Preview"); }
    catch (error) { throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "계정 제재를 복구하지 못했습니다." }); }
  }),
  revealCommunityPhone: adminOrPreviewProcedure.input(z.object({
    recordType: z.enum(["marketplace", "community", "report"]), publicId,
    side: z.enum(["owner", "reporter", "target"]).optional(),
  }).strict()).mutation(({ input, ctx }) => {
    assertAdminCommunityMockOnly();
    if (!isSuperAdminPhoneViewer(ctx.user, process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "최고관리자 연락처 보기 권한이 없습니다." });
    }
    try { return centralStore.revealCommunityContact(input, ctx.user?.name ?? "최고관리자"); }
    catch (error) { throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "연락처를 확인하지 못했습니다." }); }
  }),
  communityPhoneAccess: adminOrPreviewProcedure.query(({ ctx }) => ({
    canReveal: isSuperAdminPhoneViewer(ctx.user, process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS),
  })),
  adminMembers: adminOrPreviewProcedure.query(() => {
    assertAdminMembersMockOnly();
    return centralStore.listAdminMemberManagement();
  }),
  setAdminMemberAccountStatus: adminOrPreviewProcedure.input(z.object({
    memberId: publicId,
    accountStatus: z.enum(["active", "restricted"]),
  })).mutation(({ input }) => {
    assertAdminMembersMockOnly();
    try {
      return centralStore.setAdminMemberAccountStatus(input.memberId, input.accountStatus);
    } catch {
      throw new TRPCError({ code: "NOT_FOUND", message: "합성 소비자 회원을 찾을 수 없습니다." });
    }
  }),
  revealAdminMemberPhone: adminOrPreviewProcedure.input(z.object({ memberId: publicId })).mutation(({ input, ctx }) => {
    assertAdminMembersMockOnly();
    if (!isSuperAdminPhoneViewer(ctx.user, process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "최고관리자 연락처 보기 권한이 없습니다." });
    }
    const record = centralStore.getAdminMemberPhoneRecord(input.memberId);
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "선택한 합성 회원 연락처를 찾을 수 없습니다." });
    return record;
  }),
  adminPhoneAccess: adminOrPreviewProcedure.query(({ ctx }) => ({ canReveal: isSuperAdminPhoneViewer(ctx.user, process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS) })),
  revealControlTowerPhone: adminOrPreviewProcedure.input(z.object({
    ownerApp: z.enum(["consumer", "merchant"]),
    entityKey: z.string().trim().min(1).max(300),
  })).mutation(({ input, ctx }) => {
    if (!isSuperAdminPhoneViewer(ctx.user, process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "최고관리자 연락처 보기 권한이 없습니다." });
    }
    const record = centralStore.getControlTowerPhoneRecord(input.ownerApp, input.entityKey);
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "선택한 Preview Mock 연락처를 찾을 수 없습니다." });
    return record;
  }),
  revealPreviewPhoneRecords: adminOrPreviewProcedure.mutation(({ ctx }) => {
    if (!isSuperAdminPhoneViewer(ctx.user, process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "최고관리자 연락처 보기 권한이 없습니다." });
    }
    return centralStore.listPreviewAdminPhoneRecords();
  }),
  supportTickets: adminOrPreviewProcedure.input(z.object({ ownerApp: z.enum(["consumer", "merchant"]) })).query(({ input }) => {
    assertAdminSupportMockOnly();
    return centralStore.listAdminSupportTickets(input.ownerApp);
  }),
  updateSupportTicket: adminOrPreviewProcedure.input(updateSupportTicketInput).mutation(({ input }) => {
    assertAdminSupportMockOnly();
    try {
      return centralStore.updateAdminSupportTicket(input.ticketId, input.status, input.adminReply);
    } catch (error) {
      if (error instanceof Error && error.message.includes("찾을 수 없습니다")) {
        throw new TRPCError({ code: "NOT_FOUND", message: error.message });
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "문의 처리를 완료하지 못했습니다." });
    }
  }),
  revealSupportTicketPhone: adminOrPreviewProcedure.input(z.object({ ticketId: publicId })).mutation(({ input, ctx }) => {
    assertAdminSupportMockOnly();
    if (!isSuperAdminPhoneViewer(ctx.user, process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "최고관리자 연락처 보기 권한이 없습니다." });
    }
    const record = centralStore.getAdminSupportTicketPhoneRecord(input.ticketId);
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "선택한 고객지원 문의 연락처를 찾을 수 없습니다." });
    return record;
  }),
  adminTrialCampaigns: adminOrPreviewProcedure.query(() => centralStore.listAdminTrialCampaigns()),
  adminTrialApplications: adminOrPreviewProcedure.query(() => centralStore.listAdminTrialApplications()),
  setAdminTrialCampaignStatus: adminOrPreviewProcedure.input(z.object({
    campaignPublicId: publicId,
    status: z.enum(["draft", "open", "paused", "closed"]),
  })).mutation(({ input }) => centralStore.setTrialCampaignStatus(input.campaignPublicId, input.status, "dashboard")),
  reviewAdminTrialApplication: adminOrPreviewProcedure.input(z.object({
    storePublicId: publicId,
    applicationPublicId: publicId,
    status: z.enum(["selected", "rejected"]),
  })).mutation(({ input }) => centralStore.reviewTrialApplication(input.storePublicId, input.applicationPublicId, input.status, "dashboard")),
  notificationRules: adminOrPreviewProcedure.query(() => centralStore.listNotificationRules()),
  notificationHistory: adminOrPreviewProcedure.input(z.object({ limit: z.number().int().min(1).max(500).default(200) }).optional()).query(({ input }) => centralStore.listNotificationHistory(input?.limit ?? 200)),
  updateNotificationRule: adminOrPreviewProcedure.input(z.object({
    type: z.enum(["payment_succeeded", "payment_failed", "subscription_reminder", "subscription_expired", "coupon_ending_soon", "partner_application_submitted", "partner_application_approved", "favorite_coupon", "targeted_coupon_offer"]),
    titleTemplate: z.string().trim().min(2).max(100),
    bodyTemplate: z.string().trim().min(2).max(400),
    enabled: z.boolean().optional(),
  })).mutation(({ input }) => centralStore.updateNotificationRule(input.type, input)),
  processDueSubscriptionNotifications: adminOrPreviewProcedure.mutation(() => centralStore.processDueSubscriptionNotifications()),
  approvePreviewPartnerApplication: adminOrPreviewProcedure.input(z.object({ applicationPublicId: publicId })).mutation(({ input }) => centralStore.approvePreviewPartnerApplication(input.applicationPublicId)),
  rejectPreviewPartnerApplication: adminOrPreviewProcedure.input(z.object({ applicationPublicId: publicId, reason: z.string().trim().min(1).max(300) })).mutation(({ input }) => centralStore.rejectPreviewPartnerApplication(input.applicationPublicId, input.reason)),
  markPreviewPartnerSettlementPaid: adminOrPreviewProcedure.input(z.object({ partnerPublicId: publicId, period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })).mutation(({ input }) => centralStore.markPreviewPartnerSettlementPaid(input.partnerPublicId, input.period)),
  events: adminOrPreviewProcedure.input(z.object({ limit: z.number().int().min(1).max(500).default(100), status: z.enum(["queued", "processed", "failed"]).optional() })).query(({ input }) => centralStore.listEvents(input.limit, input.status)),
  acknowledgeEvent: adminOrPreviewProcedure.input(z.object({ eventId: publicId })).mutation(({ input }) => {
    const event = centralStore.acknowledgeEvent(input.eventId);
    if (!event) throw new Error("이벤트를 찾을 수 없습니다.");
    return event;
  }),
  setStoreStatus: adminOrPreviewProcedure.input(z.object({ storePublicId: publicId, status: z.enum(["active", "paused"]) })).mutation(({ input }) => centralStore.updateStoreStatus(input.storePublicId, input.status as StoreLifecycle)),
  setCouponStatus: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId, status: z.enum(["active", "paused", "ended", "closed"]) })).mutation(({ input }) => centralStore.setCouponStatus(input.couponPublicId, input.status as CouponLifecycle, "dashboard")),
  setCouponAdultOnly: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId, isAdultOnly: z.boolean() })).mutation(({ input }) => centralStore.setCouponAdultOnly(input.couponPublicId, input.isAdultOnly)),
  setCouponIssueQuantityLimit: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId, issueQuantityLimit: z.number().int().min(0).max(1_000_000) })).mutation(({ input }) => centralStore.setCouponIssueQuantityLimit(input.couponPublicId, input.issueQuantityLimit)),
  approveCouponForDistribution: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId, audience: couponTargetAudienceInput, homePromotionAllowed: z.boolean().default(false) })).mutation(({ input }) => centralStore.approveCouponForDistribution(input.couponPublicId, input.audience as CouponTargetAudience, input.homePromotionAllowed)),
  rejectCouponDistribution: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId, reason: z.string().trim().max(300).optional() })).mutation(({ input }) => centralStore.rejectCouponDistribution(input.couponPublicId, input.reason)),
  sendCouponNotifications: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId })).mutation(({ input }) => centralStore.sendCouponNotifications(input.couponPublicId)),
  setCouponHomePromotion: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId, allowed: z.boolean() })).mutation(({ input }) => centralStore.setCouponHomePromotion(input.couponPublicId, input.allowed)),
  markFreeDistributionSent: adminOrPreviewProcedure.input(z.object({ couponPublicId: publicId })).mutation(({ input }) => centralStore.markFreeDistributionSent(input.couponPublicId)),
  benefitRecipients: adminOrPreviewProcedure.query(() => {
    assertAdminBenefitsMockOnly();
    return centralStore.listAdminBenefitRecipients();
  }),
  benefitGrants: adminOrPreviewProcedure.query(() => {
    assertAdminBenefitsMockOnly();
    return centralStore.listAdminBenefitGrants();
  }),
  issueMemberBenefit: adminOrPreviewProcedure.input(z.object({
    recipientKey: z.string().trim().min(3).max(300),
    idempotencyKey: z.string().trim().min(8).max(128),
    kind: z.enum(["free_subscription", "credit"]),
    months: z.number().int().min(1).max(24).nullable(),
    amountKrw: z.number().int().min(1).max(2_000_000).nullable(),
  }).strict()).mutation(({ ctx, input }) => {
    assertAdminBenefitsMockOnly();
    const authenticatedName = ctx.user?.name?.trim();
    const processor = ctx.user
      ? `관리자 · ${(authenticatedName || ctx.user.openId.slice(-6)).slice(0, 48)}`
      : "미리보기 관리자";
    return centralStore.createAdminBenefitGrant({ ...input, processedBy: processor });
  }),
  benefitSignupCampaigns: adminOrPreviewProcedure.query(() => {
    assertAdminBenefitsMockOnly();
    return centralStore.listAdminSignupBenefitCampaigns();
  }),
  createSignupBenefitCampaign: adminOrPreviewProcedure.input(z.object({
    idempotencyKey: z.string().trim().min(8).max(128),
    name: z.string().trim().min(1).max(120),
    ownerApp: z.enum(["consumer", "merchant", "both"]),
    kind: z.enum(["free_subscription", "credit"]),
    months: z.number().int().min(1).max(24).nullable(),
    amountKrw: z.number().int().min(1).max(2_000_000).nullable(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["active", "paused"]).optional(),
  }).strict()).mutation(({ input }) => {
    assertAdminBenefitsMockOnly();
    return centralStore.createAdminSignupBenefitCampaign(input);
  }),
  setSignupBenefitCampaignStatus: adminOrPreviewProcedure.input(z.object({
    campaignPublicId: publicId,
    status: z.enum(["active", "paused"]),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  }).strict()).mutation(({ input }) => {
    assertAdminBenefitsMockOnly();
    return centralStore.setAdminSignupBenefitCampaignStatus(input.campaignPublicId, input.status);
  }),
  hqPromotionEligibleCoupons: adminOrPreviewProcedure.query(() => {
    assertAdminBenefitsMockOnly();
    return centralStore.listHqPromotionEligibleCoupons();
  }),
  hqPromotionCampaigns: adminOrPreviewProcedure.query(() => {
    assertAdminBenefitsMockOnly();
    return centralStore.listHqPromotionCampaigns();
  }),
  createHqPromotionCampaign: adminOrPreviewProcedure.input(z.object({
    couponPublicId: publicId,
    startsOn: z.string().min(10).max(40),
    endsOn: z.string().min(10).max(40),
    homePromotionAllowed: z.boolean().optional(),
  }).strict()).mutation(({ input }) => {
    assertAdminBenefitsMockOnly();
    return centralStore.createHqPromotionCampaign(input);
  }),
  sendHqPromotionCampaign: adminOrPreviewProcedure.input(z.object({ campaignPublicId: publicId }).strict()).mutation(({ input }) => {
    assertAdminBenefitsMockOnly();
    return centralStore.dispatchHqPromotionCampaign(input.campaignPublicId);
  }),
  setHqPromotionCampaignStatus: adminOrPreviewProcedure.input(z.object({
    campaignPublicId: publicId,
    status: z.enum(["active", "paused"]),
  }).strict()).mutation(({ input }) => {
    assertAdminBenefitsMockOnly();
    return centralStore.setHqPromotionCampaignStatus(input.campaignPublicId, input.status);
  }),
  setReservationStatus: adminOrPreviewProcedure.input(z.object({ reservationPublicId: publicId, status: z.enum(["approved", "visited", "no_show", "cancelled", "declined"]) })).mutation(({ input }) => centralStore.setReservationStatus(input.reservationPublicId, input.status as ReservationLifecycle)),
  setConsumerReportStatus: adminOrPreviewProcedure.input(z.object({ reportPublicId: publicId, status: z.enum(["reviewing", "resolved", "rejected"]) })).mutation(({ input }) => centralStore.setPreviewConsumerReportStatus(input.reportPublicId, input.status as CentralConsumerReportStatus)),
  resetDemo: adminOrPreviewProcedure.mutation(() => {
    centralStore.resetDemoData();
    return centralStore.getSummary();
  }),
});

const businessTrials = router({
  listCampaigns: publicProcedure.input(z.object({ storePublicId: publicId })).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.listTrialCampaigns(input.storePublicId);
  }),
  createCampaign: publicProcedure.input(createTrialCampaignInput).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    return centralStore.createTrialCampaign(input);
  }),
  setCampaignStatus: publicProcedure.input(z.object({ storePublicId: publicId, campaignPublicId: publicId, status: z.enum(["open", "paused", "closed"]) })).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    const campaign = centralStore.listTrialCampaigns(input.storePublicId).find(item => item.publicId === input.campaignPublicId);
    if (!campaign) throw new Error("체험단 모집을 찾을 수 없습니다.");
    return centralStore.setTrialCampaignStatus(input.campaignPublicId, input.status);
  }),
  listApplications: publicProcedure.input(z.object({ storePublicId: publicId })).query(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    centralStore.getStore(input.storePublicId);
    return [] as Array<never>;
  }),
  reviewApplication: publicProcedure.input(z.object({ storePublicId: publicId, applicationPublicId: publicId, status: z.enum(["selected", "rejected", "visited", "closed"]) })).mutation(({ input, ctx }) => {
    assertStoreAccess(ctx.req, input.storePublicId);
    centralStore.markProtocol("business-trpc");
    centralStore.getStore(input.storePublicId);
    return { ok: false, mockOnly: true, message: "지원자 연동은 아직 저장되지 않는 Mock입니다." };
  }),
});

export const businessBridgeRouter = router({ dashboard: businessDashboard, coupons: businessCoupons, bookings: businessBookings, trials: businessTrials });
export const demoStorePublicId = DEMO_STORE_ID;
import { validatePopupAdMediaList } from "../../shared/popup-ad-policy";
