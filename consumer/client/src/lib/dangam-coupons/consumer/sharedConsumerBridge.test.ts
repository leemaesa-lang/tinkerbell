import { describe, expect, it } from "vitest";
import type { AnyCouponFeedItem } from "../shared/consumer";
import type { DangamApi } from "../shared/api";
import { consumerCouponTargetMatchesRegion } from "../../region-codes";
import { createSharedConsumerBridge, toConsumerDto, walletSnapshotToConsumerDto } from "./sharedConsumerBridge";

describe("consumer region target codes", () => {
  it("preserves official dong, district-wide and nationwide target codes", () => {
    const row = {
      id: "region-coupon",
      store_id: "test-store",
      store_name: "테스트 매장",
      merchant_name: "테스트 매장",
      title: "지역 타깃 테스트",
      description: "",
      coupon_type: "discount",
      original_price: 10000,
      discounted_price: 8000,
      remaining_quantity: 3,
      metadata: { districts: ["1168064000", "__district__:서울특별시:강남구", "__nationwide__"] },
    } as unknown as AnyCouponFeedItem;

    expect(toConsumerDto(row).storePublicId).toBe("test-store");
    expect(toConsumerDto(row).targetRegionCodes).toEqual([
      "1168064000",
      "__district__:서울특별시:강남구",
      "__nationwide__",
    ]);
  });

  it("does not let malformed explicit target fields fall back to a valid nationwide legacy code", () => {
    const row = {
      id: "malformed-region-coupon",
      store_id: "test-store",
      store_name: "테스트 매장",
      merchant_name: "테스트 매장",
      title: "잘못된 지역 타깃",
      description: "",
      coupon_type: "discount",
      original_price: 10000,
      discounted_price: 8000,
      remaining_quantity: 3,
      metadata: {
        targetScope: "district",
        targetAreaLevel: "sigungu",
        targetDistrictCode: "not-a-canonical-code",
        targetDongCodes: [],
        targetRegionCodes: ["__nationwide__"],
      },
    } as unknown as AnyCouponFeedItem;
    const dto = toConsumerDto(row);

    expect(dto.targetRegionCodes).toEqual(["__nationwide__"]);
    expect(consumerCouponTargetMatchesRegion(dto, dto.targetRegionCodes, [])).toBe(false);
  });

  it("maps the REST ends_at field to the consumer usage end date", () => {
    const row = {
      id: "end-date-coupon",
      store_id: "test-store",
      store_name: "테스트 매장",
      merchant_name: "테스트 매장",
      title: "종료일 전달 테스트",
      description: "",
      coupon_type: "discount",
      original_price: 10000,
      discounted_price: 8000,
      remaining_quantity: 3,
      starts_at: "2026-10-21T08:00:00.000Z",
      ends_at: "2026-10-28T08:00:00.000Z",
      metadata: {},
    } as unknown as AnyCouponFeedItem;

    expect(toConsumerDto(row).usageEndDate).toBe("2026-10-28");
  });

  it("maps selected store facility snapshots from CentralStore feed metadata", () => {
    const row = {
      id: "facility-snapshot-coupon",
      store_id: "facility-store",
      store_name: "편의시설 매장",
      merchant_name: "편의시설 매장",
      title: "편의시설 쿠폰",
      description: "",
      coupon_type: "discount",
      original_price: 10000,
      discounted_price: 7000,
      remaining_quantity: 3,
      store_metadata: { facilityTags: ["매장 정보값"] },
      metadata: { facilityTags: ["주차 가능", "아기의자"] },
    } as unknown as AnyCouponFeedItem;

    expect(toConsumerDto(row).facilityTags).toEqual(["주차 가능", "아기의자"]);
  });

  it("preserves explicit issue-end time and cumulative download count for sorting", () => {
    const row = {
      id: "sort-contract-coupon",
      store_id: "sort-store",
      store_name: "정렬 매장",
      merchant_name: "정렬 매장",
      title: "인기·마감 정렬 계약",
      description: "",
      coupon_type: "discount",
      original_price: 20_000,
      discounted_price: 12_000,
      remaining_quantity: 3,
      download_count: 42,
      issue_ends_at: "2026-10-28T14:59:59.999Z",
      metadata: {},
    } as unknown as AnyCouponFeedItem;

    const dto = toConsumerDto(row);
    expect(dto.downloadCount).toBe(42);
    expect(dto.issueEndsAt).toBe("2026-10-28T14:59:59.999Z");
  });

  it("prefers canonical storePublicId to legacy store_id when both are present", () => {
    const row = {
      id: "canonical-store-coupon",
      storePublicId: "store_public_1",
      store_id: "old-store-1",
      store_name: "정본 매장",
      merchant_name: "정본 매장",
      title: "정본 키 확인",
      description: "",
      coupon_type: "discount",
      original_price: 10000,
      discounted_price: 8000,
      remaining_quantity: 3,
      metadata: {},
    } as unknown as AnyCouponFeedItem;

    const dto = toConsumerDto(row);
    expect(dto.storePublicId).toBe("store_public_1");
    expect(dto.merchantId).toBe("store_public_1");
  });

  it("preserves coupon, store and food image sources separately", () => {
    const row = {
      id: "media-coupon",
      store_id: "media-store",
      store_name: "이미지 매장",
      merchant_name: "이미지 매장",
      title: "대표 이미지 전달",
      description: "",
      coupon_type: "discount",
      imageUrl: "https://cdn.example/coupon.jpg",
      mediaUrl: "https://cdn.example/media.jpg",
      store_metadata: { storeImageUrl: "https://cdn.example/store.jpg", category: "뷰티/미용" },
      metadata: { foodImageUrl: "https://cdn.example/food.jpg" },
    } as unknown as AnyCouponFeedItem;

    const dto = toConsumerDto(row);
    expect(dto.imageUrl).toBe("https://cdn.example/coupon.jpg");
    expect(dto.mediaUrl).toBe("https://cdn.example/media.jpg");
    expect(dto.storeImageUrl).toBe("https://cdn.example/store.jpg");
    expect(dto.storeCategory).toBe("뷰티/미용");
    expect(dto.foodImageUrl).toBe("https://cdn.example/food.jpg");
  });

  it("preserves uploaded image arrays, video metadata, coordinates and full store hours", () => {
    const row = {
      id: "media-list-coupon",
      store_id: "media-store",
      store_name: "미디어 매장",
      merchant_name: "미디어 매장",
      title: "업로드 미디어 보존",
      description: "",
      coupon_type: "discount",
      image: "https://cdn.example/cover.jpg",
      images: ["https://cdn.example/one.jpg", "https://cdn.example/two.jpg"],
      videoUrl: "https://cdn.example/promo.mp4",
      media_items: [{ id: "video-1", kind: "video", url: "https://cdn.example/promo.mp4", posterUrl: "https://cdn.example/poster.jpg" }],
      original_price: 10000,
      discounted_price: 8000,
      remaining_quantity: 3,
      store_metadata: {
        address: "서울특별시 강남구 테헤란로 100",
        phone: "02-555-1234",
        latitude: 37.5,
        longitude: 127.03,
        businessHours: { open: "09:00", close: "21:00", breakStart: "12:00", breakEnd: "13:00", lastOrder: "20:30" },
        regularClosedDay: "매주 일요일",
      },
      metadata: { usageType: "RESERVATION" },
    } as unknown as AnyCouponFeedItem;

    const dto = toConsumerDto(row);
    expect(dto.imageUrl).toBe("https://cdn.example/cover.jpg");
    expect(dto.images).toEqual(["https://cdn.example/one.jpg", "https://cdn.example/two.jpg"]);
    expect(dto.videoUrl).toBe("https://cdn.example/promo.mp4");
    expect(dto.mediaItems?.[0]?.posterUrl).toBe("https://cdn.example/poster.jpg");
    expect(dto.storeAddress).toBe("서울특별시 강남구 테헤란로 100");
    expect(dto.businessHours).toEqual({ open: "09:00", close: "21:00", breakStart: "12:00", breakEnd: "13:00", lastOrder: "20:30" });
    expect(dto.usageType).toBe("RESERVATION");
    expect(dto.latitude).toBe(37.5);
    expect(dto.longitude).toBe(127.03);
  });

  it("restores a wallet snapshot's snake-case date, store, image and video fields", () => {
    const dto = walletSnapshotToConsumerDto({
      id: "wallet-coupon",
      store_id: "wallet-store",
      store_name: "지점 매장",
      merchant_name: "사업자 매장",
      title: "보유 쿠폰 상품",
      description: "상세 설명",
      coupon_type: "discount",
      discount_type: "fixed",
      discount_value: 2000,
      original_price: 8000,
      discounted_price: 6000,
      quantity: 10,
      issued_count: 1,
      remaining_quantity: 9,
      starts_at: "2026-10-21T00:00:00.000Z",
      ends_at: "2026-10-31T14:59:59.000Z",
      images: ["https://cdn.example/wallet-1.jpg", "https://cdn.example/wallet-2.jpg"],
      video_url: "https://cdn.example/wallet.mp4",
      media_items: [{ id: "wallet-video", kind: "video", url: "https://cdn.example/wallet.mp4", posterUrl: "https://cdn.example/wallet-poster.jpg" }],
      store_metadata: {
        address: "서울특별시 강남구 테헤란로 200",
        phone: "02-555-2000",
        businessHours: { open: "09:00", close: "21:00", breakStart: "12:00", breakEnd: "13:00", lastOrder: "20:30" },
        regularClosedDay: "매주 일요일",
        latitude: 37.5,
        longitude: 127.03,
      },
      metadata: { usageType: "RESERVATION", targetRegionCodes: ["1168064000"], facilityTags: ["주차 가능", "아기의자"] },
    }, "wallet-coupon");

    expect(dto.couponId).toMatch(/^\d+$/);
    expect(dto.storePublicId).toBe("wallet-store");
    expect(dto.storeAddress).toBe("서울특별시 강남구 테헤란로 200");
    expect(dto.usageEndDate).toBe("2026-10-31");
    expect(dto.images).toEqual(["https://cdn.example/wallet-1.jpg", "https://cdn.example/wallet-2.jpg"]);
    expect(dto.videoUrl).toBe("https://cdn.example/wallet.mp4");
    expect(dto.mediaItems?.[0]?.posterUrl).toBe("https://cdn.example/wallet-poster.jpg");
      expect(dto.usageType).toBe("RESERVATION");
      expect(dto.facilityTags).toEqual(["주차 가능", "아기의자"]);
      expect(dto.discountType).toBe("fixed");
    expect(dto.discountValue).toBe(2_000);
    expect(dto.discountRate).toBe(25);
  });

  it("preserves the exact 30% discount and prices from an issued wallet snapshot", () => {
    const dto = walletSnapshotToConsumerDto({
      id: "wallet-30-percent",
      store_id: "store-30-percent",
      store_name: "할인 확인 매장",
      merchant_name: "할인 확인 매장",
      title: "30% 할인 쿠폰",
      discount_type: "percent",
      discount_value: 30,
      original_price: 10_000,
      discounted_price: 7_000,
      metadata: { discountRate: 30 },
    }, "wallet-30-percent");

    expect(dto.discountType).toBe("percent");
    expect(dto.discountValue).toBe(30);
    expect(dto.discountRate).toBe(30);
    expect(dto.originalPrice).toBe(10_000);
    expect(dto.discountPrice).toBe(7_000);
  });

  it("resolves the stable numeric UI coupon id to the CentralStore UUID for review listing", async () => {
    const publicCouponId = "fd53e305-599a-42ff-a073-4f4855f21a6d";
    const row = {
      id: publicCouponId,
      store_id: "review-store",
      store_name: "리뷰 매장",
      merchant_name: "리뷰 매장",
      title: "리뷰 ID 연결 확인",
      description: "",
      coupon_type: "discount",
      original_price: 10_000,
      discounted_price: 8_000,
      remaining_quantity: 3,
      metadata: {},
    } as unknown as AnyCouponFeedItem;
    const requestPaths: string[] = [];
    const api = {
      request: async <T,>(path: string) => {
        requestPaths.push(path);
        return (path.endsWith("/reviews") ? [] : [row]) as T;
      },
    } as unknown as DangamApi;
    const bridge = createSharedConsumerBridge(api);
    const [coupon] = await bridge.listCoupons();

    expect(coupon.couponId).toMatch(/^\d+$/);
    await bridge.couponReviews(coupon.couponId);

    expect(requestPaths).toContain(`/v1/coupons/${publicCouponId}/reviews`);
    expect(requestPaths).not.toContain(`/v1/coupons/${coupon.couponId}/reviews`);
  });
});
