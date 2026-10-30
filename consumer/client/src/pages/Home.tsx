import { createPortal } from "react-dom";
import { MembershipCheckoutSheet } from "@/components/MembershipCheckoutSheet";
import { PreviewMemberBenefitsCard } from "@/components/PreviewMemberBenefitsCard";
import { ConsumerProfileEditor } from "@/components/ConsumerProfileEditor";
import { RegionSelectionSheet as LocationSheet } from "@/components/RegionSelectionSheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { consumerApi, ConsumerApiError, subscribePreviewConsumerNotifications, type ConsumerAppNotificationDto, type ConsumerSupportInquiryType } from "@/lib/consumer-api";
import { normalizePreviewCount, normalizePreviewDate, previewActivitySourceKey, submitPreviewReportSnapshot, syncPreviewActivitySnapshot } from "@/lib/consumer-activity-preview-sync";
import { getClientUserId, scopedStorageKey } from "@/lib/session-identity";
import { isConcreteMeetingSchedule } from "@/lib/meeting-schedule-confirmation";
import { compressMeetingImage, MEETING_COVER_COMPRESSION, MEETING_DETAIL_COMPRESSION } from "@/lib/meeting-media-compression";
import { persistMeetingStorageSafely } from "@/lib/meeting-storage";
import { formatStudentPhone, getStudentInviteCount, getStudentInviteRemaining, getStudentPartnerReferralLink, getStudentRewardTier, STUDENT_PARTNER_CODE } from "@/lib/student-partner";
import { findBulkVisitCandidates, meetingBulkVisitKey, type MeetingBulkVisitAuth } from "@/lib/meeting-bulk-visit";
import { trpc } from "@/lib/trpc";
import { useConsumerPreviewDemo } from "@/contexts/ConsumerPreviewDemoContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { isConsumerPreviewDemo } from "@/lib/preview-demo";
import { startLogin } from "@/const";
import type { ConsumerCouponDto } from "@shared/integration-contract";
import { sortHomeCoupons, type CouponSortTab } from "@/lib/home-coupon-sorting";
import { canReviewCompletedCoupon } from "@/lib/coupon-review-eligibility";
import { formatCouponReviewCreatedAt, sortCouponReviewsNewestFirst } from "@/lib/coupon-review-feed";
import { availableVisitTimes, scheduleBusinessHours } from "@shared/consumer-schedule";
import { addDateKeyDays, currentKstDateKey, differenceInDateKeys, weekdayForDateKey } from "@shared/kst-date";
import { CouponMediaImage } from "@/components/CouponMediaImage";
import { couponPriceDisplay } from "@/lib/coupon-price-display";
import { StoreReviewForm, type StoreReviewSubmission } from "@/components/StoreReviewForm";
import { formatCompactNeighborhoodLabel } from "@/lib/compact-neighborhood-label";
import { CouponRecommendationRail } from "@/components/CouponRecommendationRail";
import { StoreFacilityBadges } from "@/components/StoreFacilityBadges";
import { TargetedCouponHomeSlot, TargetedCouponInbox } from "@/components/TargetedCouponOffers";
import { ConsumerAppNotificationCenter } from "@/components/notifications/ConsumerAppNotificationCenter";
import { useConsumerNotificationCount } from "@/lib/use-consumer-notification-count";
import type { DangamApi } from "@/lib/dangam-coupons/shared/api";
import { ChatRoomLayout } from "@/components/chat/ChatRoomLayout";
import { couponImageSourceCandidates, mergeCouponMediaItems } from "@/lib/coupon-media";
import { getCouponRecommendations } from "@/lib/coupon-recommendations";
import { formatCouponDday, formatCouponEndDate, formatPartnerRegionLabel, formatSpecialCouponCutoff, isSpecialCouponExpired } from "@/lib/partner-coupon-display";
import { createDangamApi } from "@/lib/dangam-coupons/shared/createDangamApi";
import { resolveCentralPreviewApiBaseUrl } from "@/lib/central-preview-url";
import { homeCouponFeedEmptyState, selectHomeCouponFeed } from "@/lib/home-coupon-feed";
import { useSharedConsumerFeed } from "@/lib/dangam-coupons/consumer/useSharedConsumerFeed";
import { reconcileCouponWalletRecords } from "@/lib/dangam-coupons/consumer/wallet-projection";
import { CouponCatalogCategoryFilter } from "@/components/CouponCatalogCategoryFilter";
import { filterCouponCatalog, isAdultRestrictedStoreCategory, safeCouponCatalogCategory, type CouponCatalogCategory } from "@/lib/consumer-catalog-category";
import { normalizeStoreCategory, STORE_CATEGORY_SUBCATEGORIES, type StoreCategory } from "../../../../shared/store-category";
import { walletSnapshotToConsumerDto } from "@/lib/dangam-coupons/consumer/sharedConsumerBridge";
import type { ConsumerCouponReview, MyCoupon } from "@/lib/dangam-coupons/shared/consumer";
import { parseCurrentLocationPoint, type Wgs84Point } from "../../../shared/current-location-search";
import { findAdminRegionByCode, findAdminRegionCode, adminRegionMatchesTarget, adminRegionTargetLabel, normalizeAdminRegionTargetCodes, canonicalConsumerBrowseRegionCodes, formatConsumerBrowseRegionLabel } from "@tinkerbell/region-picker";
import { CommunitySection, type CommunityLocationActions, type MarketplaceListing } from "../components/community/CommunityMarketplace";
import { filterCommunityRecordsByLocation } from "@/lib/community-location";
import { experienceCampaignCategory, experienceCampaignSubcategory, experienceSubcategories, isExperienceCampaignVisible } from "@/lib/experience-taxonomy";
import { PartnerStorePicker, formatPartnerStoreAddress, type PartnerStore } from "../components/community/PartnerStorePicker";
import { MarketplaceChatPanel, type CommunityChatSubtab } from "../components/community/MarketplaceChatPanel";
import { COMMUNITY_REGION_CODES, filterByRegionCodes } from "@/lib/community-region";
import { toggleMeetingScheduleAttendee, removeMeetingScheduleAttendee } from "@/lib/community-schedule-attendance";
import { readStoredRegionCodes } from "@/lib/region-storage";
import { canonicalManualRegionCodes, canonicalRegionCodes, consumerCouponBrowseTargetMatchesRegion, consumerCouponTargetMatchesRegion } from "@/lib/region-codes";
import { chooseInitialCouponBrowseRegionCodes, consumerBrowseRegionCodes } from "@/lib/consumer-region-selection";
import { ArrowLeft, ArrowRight, Bell, BellOff, CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, ClipboardList, Copy, Crown, Flag, Gift, Globe2, GraduationCap, Heart, Home as HomeIcon, Images, KeyRound, LogOut, MapPin, Menu, MessageCircle, Navigation, Pencil, Phone, Plus, RotateCcw, Search, Send, Settings, Share2, ShieldBan, Briefcase, Sparkles, Trash2, Star, Ticket, TrendingUp, UserRound, Users, X, Zap } from "lucide-react";
import { chatRoomDataScope, type ChatRoomType } from "@/lib/chat-room-scope";
import { readArchivedCommunityChats, upsertArchivedCommunityChat, removeArchivedCommunityChat, removeArchivedCommunityChatData, type ArchivedCommunityChat } from "@/lib/completed-chat-archive";

type Language = "KR" | "EN" | "VN" | "JP" | "CN";
type Category = StoreCategory;
type FeedTab = "전체" | "할인율 높은 순" | "가까운 순" | "정회원 전용관";
type NavTab = "home" | "coupons" | "meetings" | "experience" | "my";
type UsageType = "매장 방문" | "예약 필수";

type CategoryItem = { id: Category; label: string; icon: string; tint: string; sub: string };
type SearchSuggestion = { label: string; query: string; icon: string; type: "매장·쿠폰" | "카테고리" | "모임" };
function formatSelectedNeighborhoods(dongs: string[]) {
  const uniqueDongs = Array.from(new Set(dongs.filter(Boolean)));
  if (uniqueDongs.length <= 1) return uniqueDongs[0] ?? "동네 선택";
  return `${uniqueDongs[0]} 외 ${uniqueDongs.length - 1}곳`;
}
function readSavedCouponBrowseRegionCodes() {
  try {
    const saved = window.localStorage.getItem("dangam_coupon_browse_region_codes");
    if (saved !== null) return canonicalConsumerBrowseRegionCodes(JSON.parse(saved) as unknown) ?? [];
  } catch { /* invalid or unavailable storage falls back to the legacy single-region reader */ }
  return readStoredRegionCodes("dangam_coupon_browse_region_codes", "dangam_coupon_browse_dongs", "dangam_coupon_browse_label");
}
const SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  { label: "카페", query: "카페", icon: "☕", type: "카테고리" },
  { label: "그레이스 커피 (신메뉴 체험단/쿠폰)", query: "그레이스 커피", icon: "☕", type: "매장·쿠폰" },
  { label: "디저트 카페", query: "디저트", icon: "☕", type: "카테고리" },
  { label: "솥뚜껑 파전", query: "파전", icon: "🥘", type: "매장·쿠폰" },
  { label: "파전 모임/번개", query: "파전", icon: "🥘", type: "모임" },
  { label: "스크린 골프", query: "골프", icon: "⛳", type: "카테고리" },
  { label: "골프 번개 모임", query: "골프", icon: "⛳", type: "모임" },
];
const POPULAR_SEARCHES = ["카페", "파전", "스크린골프", "러닝", "반려동물"];
type BusinessSchedule = { businessDays: number[]; holidayExceptions: string[]; operatingHours: { open: string; close: string }; breakTime?: { start: string; end: string }; lastOrder: string };
const DEFAULT_SEARCH_RADIUS_KM = 5;
const DEFAULT_SEARCH_RADIUS_METERS = DEFAULT_SEARCH_RADIUS_KM * 1000;
const BANK_LIST = [
  "카카오뱅크", "토스뱅크", "케이뱅크",
  "KB국민은행", "신한은행", "우리은행", "하나은행", "NH농협은행", "IBK기업은행", "SC제일은행", "한국씨티은행", "Sh수협은행",
  "BNK부산은행", "BNK경남은행", "iM뱅크(대구은행)", "광주은행", "전북은행", "제주은행",
  "우체국", "새마을금고", "신협", "상호저축은행", "산림조합",
] as const;
const homeSubcategoriesByCategory: Record<string, string[]> = Object.fromEntries(
  Object.entries(STORE_CATEGORY_SUBCATEGORIES).map(([key, values]) => [key, [...values]]),
);
const homeSubcategoryMatchers: Record<string, RegExp> = {
  "한식": /한식|국밥|냉면|찌개|백반/,
  "고기": /고기|삼겹|갈비|족발|보쌈/,
  "주점": /주점|호프|펍|술집|포차/,
  "치킨": /치킨|닭강정/,
  "분식": /분식|떡볶이|김밥|튀김/,
  "반찬": /반찬|밀키트|즉석식품|밑반찬/,
  "카페": /카페|커피|로스터리/,
  "디저트": /디저트|케이크|아이스크림|마카롱/,
  "베이커리": /베이커리|빵|제과/,
  "음료": /음료|주스|티/,
  "스크린골프": /스크린골프/,
  "골프연습장": /골프연습|연습장/,
  "골프레슨": /골프레슨|레슨/,
  "헬스": /헬스|피트니스|웨이트|짐|트레이닝/,
  "필라테스": /필라테스/,
  "요가": /요가/,
  "1:1 수업": /1:1|개인수업|개인레슨|프라이빗|일대일/,
  "헤어": /헤어|미용실|살롱/,
  "네일": /네일/,
  "피부관리": /피부|에스테틱/,
  "마사지": /마사지|테라피/,
  "안경": /안경|렌즈/,
  "학원": /학원|클래스|공방|수업/,
  "병원": /병원|의원|클리닉/,
  "청소": /청소|입주청소|이사청소|정리수납|가사/,
  "반려동물": /반려동물|애견|애묘|강아지|고양이|펫|동물병원|펫미용|펫호텔/,
  "세탁소": /세탁소|세탁|세탁방|런드리|드라이클리닝|드라이|수선/,
  "내과": /내과|내부?과/,
  "정형외과": /정형외과|재활의학과|관절|척추/,
  "피부과": /피부과|피부|클리닉|에스테틱/,
  "성형외과": /성형외과|성형|쁘띠|보톡스|필러/,
  "치과": /치과|치의원|스케일링|임플란트/,
  "안과": /안과|안경|렌즈|시력/,
  "이비인후과": /이비인후과|비염|축농증|귀|목/,
  "한의원": /한의원|한방|침|한약|추나/,
  "산부인과": /산부인과|여성의원|妇科/,
  "소아과": /소아과|소아청소년과|어린이병원|아동/,
};
type CouponReview = { id: string; authorId: string; authorName: string; text: string; createdAt?: string; kind?: "review" | "comment"; rating?: number; tags?: string[] };
type Coupon = {
  id: number; bridgeCouponId?: string; storePublicId?: string; targetRegionCodes?: string[]; regionTarget?: Pick<ConsumerCouponDto, "targetScope" | "targetAreaLevel" | "targetDistrictCode" | "targetDongCodes">; couponType?: ConsumerCouponDto["couponType"];
  isVipOnly?: boolean; usage_type: UsageType; usageApiType?: ConsumerCouponDto["usageType"];
  store: string; title: string; description: string; category: Category; storeCategory?: string | null; discount: string; discountType?: ConsumerCouponDto["discountType"]; discountValue: number;
  remaining: number; total: number; distanceM: number; sortDistanceM?: number; expiry: string; price: number; discountAmount?: number; downloadCount?: number; issueEndsAt?: string;
  color: string; accent: string; address: string; storeAddress?: string; phone?: string;
  businessHours?: ConsumerCouponDto["businessHours"]; closedDay?: string; rating: number; reviews: number;
  usage: string; thumb: string; originalPrice?: number; latitude?: number; longitude?: number;
  image?: string; images?: string[]; mediaUrl?: string; storeImageUrl?: string; foodImageUrl?: string;
  videoUrl?: string; mediaType?: string; mediaItems?: ConsumerCouponDto["mediaItems"];
  specialCutoffTime?: string; schedule?: BusinessSchedule; publishedAt?: string; usageStartDate?: string;
  usageEndDate?: string; reviewItems?: CouponReview[]; facilityTags?: string[];
};
function discountAmountFor(coupon: Coupon) { const amount = Number(coupon.discount.replace(/[^0-9]/g, "")); return coupon.discount.includes("원") && Number.isFinite(amount) ? amount : 0; }
const isVipOnlyCoupon = (coupon: Coupon) => Boolean(coupon.isVipOnly) || discountAmountFor(coupon) >= 10000 || coupon.price >= 10000;
const couponRequiresMembership = (coupon: Coupon, isPremium: boolean, isMinor: boolean) => isVipOnlyCoupon(coupon) && !isPremium && !isMinor;
function phoneHref(phone: string) { return `tel:${phone.replace(/\D/g, "")}`; }
function consumerPhoneForReservation() {
  if (isConsumerPreviewDemo()) return "";
  try {
    const profile = JSON.parse(window.localStorage.getItem("dangam_user_profile") ?? "{}") as { phone?: string; phoneNumber?: string };
    const saved = profile.phone ?? profile.phoneNumber ?? window.localStorage.getItem("dangam_user_phone") ?? "";
    return saved || "010-1234-5678";
  } catch {
    return window.localStorage.getItem("dangam_user_phone") ?? "010-1234-5678";
  }
}
function normalizePartySize(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(99, Math.floor(parsed)) : 1;
}
function merchantPhoneFor(coupon: Coupon) { const phone = typeof coupon.phone === "string" ? coupon.phone.trim() : ""; return phone.replace(/\D/g, "").length >= 8 ? phone : ""; }
type GeoPoint = { latitude: number; longitude: number };
function haversineDistanceMeters(from: GeoPoint, to: GeoPoint) { const earthRadius = 6371000; const toRadians = (value: number) => value * Math.PI / 180; const dLat = toRadians(to.latitude - from.latitude); const dLon = toRadians(to.longitude - from.longitude); const lat1 = toRadians(from.latitude); const lat2 = toRadians(to.latitude); const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2; return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); }
function registeredPointForCoupon(coupon: Coupon): GeoPoint | undefined {
  if (typeof coupon.latitude !== "number" || typeof coupon.longitude !== "number") return undefined;
  if (!Number.isFinite(coupon.latitude) || !Number.isFinite(coupon.longitude) || Math.abs(coupon.latitude) > 90 || Math.abs(coupon.longitude) > 180) return undefined;
  return { latitude: coupon.latitude, longitude: coupon.longitude };
}
function distanceForCoupon(coupon: Coupon, userPosition: GeoPoint | null) {
  const storePoint = registeredPointForCoupon(coupon);
  return userPosition && storePoint ? Math.max(1, haversineDistanceMeters(userPosition, storePoint)) : Number.POSITIVE_INFINITY;
}
function distanceForMeeting(meeting: { place: string; address: string; latitude?: number; longitude?: number }, userPosition: GeoPoint | null) {
  const point = typeof meeting.latitude === "number" && typeof meeting.longitude === "number" ? { latitude: meeting.latitude, longitude: meeting.longitude } : undefined;
  return userPosition && point ? Math.max(1, haversineDistanceMeters(userPosition, point)) : Number.POSITIVE_INFINITY;
}

const couponMediaImages = {
  glasses: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=700&q=85",
  dental: "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=700&q=85",
  party: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=700&q=85",
  sideDish: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=85",
  coffee: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=700&q=85",
  food: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=700&q=85",
  beauty: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=700&q=85",
  fitness: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=700&q=85",
  education: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=700&q=85",
  fallback: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=85",
} as const;
const communityStoryMocks = [
  { id: "mock-sanbon-running", regionCode: COMMUNITY_REGION_CODES.sanbon1Dong, title: "산본 저녁 러닝", image: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=150&auto=format&fit=crop&q=80", hasUnread: false },
  { id: "mock-sanbon-golf", regionCode: COMMUNITY_REGION_CODES.sanbon1Dong, title: "산본 주말 스크린골프", image: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=150&auto=format&fit=crop&q=80", hasUnread: false },
  { id: "mock-sanbon-dog", regionCode: COMMUNITY_REGION_CODES.sanbon1Dong, title: "산본 반려견 산책", image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150&auto=format&fit=crop&q=80", hasUnread: false },
  { id: "mock-yeoksam-coffee", regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong, title: "역삼 디저트 탐방", image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=150&auto=format&fit=crop&q=80", hasUnread: false },
  { id: "mock-yeoksam-friends", regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong, title: "역삼 직장인 모임", image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=150&auto=format&fit=crop&q=80", hasUnread: false },
  { id: "mock-yeoksam-night", regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong, title: "역삼 퇴근 후 모임", image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80", hasUnread: false },
  { id: "mock-yeoksam-photo", regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong, title: "역삼 사진 산책", image: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=150&auto=format&fit=crop&q=80", hasUnread: false },
] as const;
function couponMediaImageFor(store: string, category?: string) { if (store.includes("프레임 안경원") || store.includes("안경")) return couponMediaImages.glasses; if (store.includes("바른미소 치과") || store.includes("치과")) return couponMediaImages.dental; if (store.includes("룸앤룸 파티라운지") || store.includes("파티")) return couponMediaImages.party; if (store.includes("오늘의 반찬") || store.includes("반찬") || store.includes("밀키트")) return couponMediaImages.sideDish; if (store.includes("커피") || category === "카페·디저트") return couponMediaImages.coffee; if (category === "뷰티·미용") return couponMediaImages.beauty; if (category === "운동·헬스") return couponMediaImages.fitness; if (category === "생활·편의") return couponMediaImages.education; if (category === "식당·맛집") return couponMediaImages.food; return couponMediaImages.fallback; }
function couponImageSources(coupon: Coupon) { return [...couponImageSourceCandidates(coupon), couponMediaImageFor(coupon.store, coupon.category)]; }
function stableNumericId(value: string): number { const parsed = Number(value); if (Number.isSafeInteger(parsed) && parsed > 0) return parsed; let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return 1_000_000_000 + ((hash >>> 0) % 1_000_000_000); }
function scheduleFromCouponHours(hours: ConsumerCouponDto["businessHours"], closedDay?: string): BusinessSchedule {
  const closedLabels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const closedWeekdays = /매주|휴무|휴일|정기휴무/.test(closedDay ?? "")
    ? closedLabels.flatMap((label, index) => (closedDay ?? "").includes(label) ? [index] : [])
    : [];
  return {
    businessDays: Array.from({ length: 7 }, (_, day) => day).filter((day) => !closedWeekdays.includes(day)),
    holidayExceptions: [], operatingHours: { open: hours.open, close: hours.close },
    breakTime: hours.breakStart && hours.breakEnd ? { start: hours.breakStart, end: hours.breakEnd } : undefined,
    lastOrder: hours.lastOrder ?? hours.close,
  };
}
function mapApiCoupon(dto: ConsumerCouponDto): Coupon {
  const category: Category = normalizeStoreCategory(dto.storeCategory);
  const usage_type: UsageType = dto.usageType === "RESERVATION" ? "예약 필수" : "매장 방문";
  const regionLabel = formatPartnerRegionLabel(dto.branchName, dto.storeRegionLabel ?? dto.address);
  const image = couponImageSourceCandidates(dto)[0];
  const expiry = dto.couponType === "special" ? formatSpecialCouponCutoff(dto.usageEndDate, dto.specialCutoffTime) : formatCouponEndDate(dto.usageEndDate);
  const discountType = dto.discountType ?? "percent";
  const discountValue = dto.discountValue ?? dto.discountRate;
  const discount = discountType === "fixed" ? `${discountValue.toLocaleString("ko-KR")}원` : discountType === "free" ? "무료" : `${discountValue}%`;
  return {
    id: stableNumericId(dto.couponId), bridgeCouponId: dto.couponId, storePublicId: dto.storePublicId, targetRegionCodes: dto.targetRegionCodes ?? [], regionTarget: { targetScope: dto.targetScope, targetAreaLevel: dto.targetAreaLevel, targetDistrictCode: dto.targetDistrictCode, targetDongCodes: dto.targetDongCodes }, couponType: dto.couponType ?? "discount",
    isVipOnly: (dto.originalPrice ?? dto.discountPrice) - dto.discountPrice >= 10000 || dto.discountPrice >= 10000,
    usage_type, usageApiType: dto.usageType, store: [dto.merchantName, regionLabel].filter(Boolean).join(" "), title: dto.title,
    description: dto.description ?? "", category, storeCategory: category, discount, discountType, discountValue,
    originalPrice: dto.originalPrice, latitude: dto.latitude, longitude: dto.longitude, remaining: dto.remainingQuantity,
    total: Math.max(dto.remainingQuantity, 20), distanceM: Number.POSITIVE_INFINITY, expiry, price: dto.discountPrice, discountAmount: Math.max(0, (dto.originalPrice ?? dto.discountPrice) - dto.discountPrice), downloadCount: dto.downloadCount ?? 0, issueEndsAt: dto.issueEndsAt, color: "#f0c8a9", accent: "#71472f",
    address: dto.storeAddress ?? dto.address ?? regionLabel, storeAddress: dto.storeAddress, phone: dto.phone,
    businessHours: dto.businessHours, closedDay: dto.closedDay, schedule: scheduleFromCouponHours(dto.businessHours, dto.closedDay), facilityTags: dto.facilityTags?.map(tag => tag.trim()).filter(Boolean),
    rating: 4.8, reviews: 0, usage: "단골 만족도 95%", thumb: "", image, images: dto.images,
    mediaUrl: dto.mediaUrl, storeImageUrl: dto.storeImageUrl, foodImageUrl: dto.foodImageUrl, videoUrl: dto.videoUrl,
    mediaType: dto.mediaType, mediaItems: dto.mediaItems, specialCutoffTime: dto.specialCutoffTime,
    publishedAt: dto.publishedAt, usageStartDate: dto.usageStartDate, usageEndDate: dto.usageEndDate,
  };
}
type FoodSubcategory = { id: string; label: string; icon: string; tint: string };
type ExpiryDeal = { id: number; sourceCoupon?: Coupon; store: string; title: string; category: string; originalPrice: number; salePrice: number; discount: string; remaining: number; deadline: string; distance: string; walkingMinutes: number; phone: string; icon: string; color: string; address: string; pickupTip: string };
const expiryChips = ["전체", "당일 특가", "편의점", "베이커리", "샐러드", "유제품", "반찬"];
const expiryDeals: ExpiryDeal[] = [
  { id: 1, store: "GS25 역삼역점", title: "통닭다리구이 도시락", category: "편의점", originalPrice: 5500, salePrice: 1900, discount: "65%", remaining: 2, deadline: "2시간 15분", distance: "240m", walkingMinutes: 4, phone: "02-555-1122", icon: "🍗", color: "#ffe0c7", address: "서울특별시 강남구 역삼로 112 팅커벨프라자 1층", pickupTip: "역삼역 3번 출구에서 직진, 올리브영 맞은편 건물 1층입니다." },
  { id: 2, store: "CU 강남대로점", title: "참치마요 & 스팸 삼각김밥 2종", category: "편의점", originalPrice: 2800, salePrice: 1000, discount: "64%", remaining: 4, deadline: "1시간 40분", distance: "430m", walkingMinutes: 6, phone: "02-555-2034", icon: "🍙", color: "#dcebdc", address: "서울특별시 강남구 강남대로 328 1층", pickupTip: "강남대로 버스정류장 앞, 초록색 CU 간판을 찾아주세요." },
  { id: 3, store: "파리바게뜨 역삼중앙점", title: "당일 구운 깜빠뉴 & 단팥빵 묶음", category: "베이커리", originalPrice: 8200, salePrice: 3000, discount: "63%", remaining: 1, deadline: "3시간 05분", distance: "610m", walkingMinutes: 8, phone: "02-555-3188", icon: "🥖", color: "#f3e0bd", address: "서울특별시 강남구 테헤란로 146 1층", pickupTip: "테헤란로 사거리 코너, 베이커리 출입구에서 픽업해 주세요." },
  { id: 4, store: "세븐일레븐 테헤란점", title: "리코타치즈 샐러드", category: "샐러드", originalPrice: 4900, salePrice: 1500, discount: "69%", remaining: 3, deadline: "58분", distance: "780m", walkingMinutes: 10, phone: "02-555-4277", icon: "🥗", color: "#d8e8f2", address: "서울특별시 강남구 테헤란로 211 1층", pickupTip: "테헤란로 대로변, 건물 우측 편의점 입구로 들어오세요." },
  { id: 5, store: "오늘의 반찬 역삼점", title: "제철 반찬 4종 랜덤팩", category: "반찬", originalPrice: 12000, salePrice: 4500, discount: "62%", remaining: 2, deadline: "2시간 35분", distance: "920m", walkingMinutes: 12, phone: "02-555-5099", icon: "🍱", color: "#f0d8d0", address: "서울특별시 강남구 논현로 508 1층", pickupTip: "논현로 골목 입구의 주황색 간판 매장입니다." },
];

const foodSubcategories: FoodSubcategory[] = [
  { id: "한식·분식", label: "한식·분식", icon: "🍚", tint: "#ffe0c7" },
  { id: "고기·구이", label: "고기·구이", icon: "🥩", tint: "#ffd8d5" },
  { id: "돈까스·일식", label: "돈까스·일식", icon: "🍱", tint: "#dcecf7" },
  { id: "중식", label: "중식", icon: "🥟", tint: "#ffe6bf" },
  { id: "피자·양식", label: "피자·양식", icon: "🍕", tint: "#f9d7e4" },
  { id: "치킨", label: "치킨", icon: "🍗", tint: "#ffe0a8" },
  { id: "분식", label: "분식", icon: "🍢", tint: "#ffdaca" },
  { id: "족발·보쌈", label: "족발·보쌈", icon: "🍖", tint: "#e9dfd4" },
  { id: "아시안", label: "아시안", icon: "🍜", tint: "#d9eee6" },
  { id: "버거·패스트푸드", label: "버거", icon: "🍔", tint: "#f5e3bf" },
  { id: "찜·탕", label: "찜·탕", icon: "🍲", tint: "#e1e0f4" },
  { id: "반찬가게", label: "반찬가게", icon: "🍱", tint: "#dcebdc" },
];
const foodSubcategoryByCouponId: Record<number, string> = { 1: "카페·디저트", 2: "한식·분식" };
type FoodChipMap = Record<string, string[]>;
const golfCategoryChips = ["전체", "스크린골프", "실내·야외 연습장", "1:1 프로 레슨", "골프용품·피팅"];
const golfTagByStore: Record<string, string> = { "버디 골프존 파크": "스크린골프", "GDR 아카데미 역삼점": "실내·야외 연습장", "잭니클라우스 골프랩": "1:1 프로 레슨", "탑골프 피팅스튜디오": "골프용품·피팅" };

type GeneralCategory = Exclude<Category, "식당·맛집" | "카페·디저트" | "골프">;

const generalCategoryChips: Record<GeneralCategory, string[]> = {
  "뷰티·미용": ["전체", "미용실", "네일", "피부관리실", "마사지", "속눈썹", "왁싱", "바버샵"],
  "운동·헬스": ["전체", "헬스/PT", "필라테스", "요가", "테니스", "수영", "크로스핏·복싱", "개인 레슨"],
  "생활·편의": ["전체", "세탁소", "빨래방", "옷수선", "청소", "반려동물", "안경", "학원", "세차", "카센터·정비"],
  "병원·약국": ["전체", "피부과", "성형외과", "치과", "안과", "정형외과", "내과", "한의원", "동네 약국", "동물병원"],
  "기타": ["전체", "공간대여", "노래방", "사진관", "키즈·체험"],
  "주류/유흥": ["전체", "호프/맥주펍", "이자카야", "요리주점/포차", "바(Bar)/와인", "감성주점/유흥"],
  "숙박": ["전체", "호텔/리조트", "모텔", "펜션/풀빌라", "게스트하우스", "캠핑/글램핑"],
};
type GeneralStoreSeed = { category: GeneralCategory; store: string; title: string; description: string; tag: string; discount: string; discountValue: number; usage_type: UsageType; distanceM: number; color: string; accent: string; thumb: string };
const generalStoreSeeds: GeneralStoreSeed[] = [
  { category: "뷰티·미용", store: "살롱 오브 역삼", title: "첫 방문 커트 5,000원 할인", description: "얼굴형에 맞춘 디자이너 커트 상담", tag: "미용실/헤어", discount: "5,000원", discountValue: 5000, usage_type: "예약 필수", distanceM: 430, color: "#f5d5dc", accent: "#8d4a5c", thumb: "✂" },
  { category: "뷰티·미용", store: "네일드살롱", title: "젤네일 기본 케어 20% 할인", description: "손끝에 기분 좋은 컬러를 더해요", tag: "네일·패디", discount: "20%", discountValue: 20, usage_type: "예약 필수", distanceM: 720, color: "#f0d8e8", accent: "#874e79", thumb: "💅" },
  { category: "뷰티·미용", store: "라이트 스킨랩", title: "첫 관리 30% 할인", description: "피부 컨디션에 맞춘 맞춤 에스테틱", tag: "피부·에스테틱", discount: "30%", discountValue: 30, usage_type: "예약 필수", distanceM: 980, color: "#f4e2c9", accent: "#9b6744", thumb: "✦" },
  { category: "뷰티·미용", store: "브로우앤왁스", title: "속눈썹 펌 10,000원 할인", description: "또렷한 인상을 만드는 섬세한 케어", tag: "속눈썹·왁싱", discount: "10,000원", discountValue: 10000, usage_type: "예약 필수", distanceM: 1150, color: "#e6d9ed", accent: "#684e7b", thumb: "◒" },
  { category: "뷰티·미용", store: "바버룸 테헤란", title: "남성 커트·쉐이브 15% 할인", description: "클래식 바버 스타일과 정교한 쉐이브", tag: "바버샵", discount: "15%", discountValue: 15, usage_type: "예약 필수", distanceM: 520, color: "#dce2e7", accent: "#405565", thumb: "✧" },
  { category: "운동·헬스", store: "바디메이트 PT", title: "1:1 PT 1회 무료 체험권", description: "내 몸에 맞는 운동 루틴을 찾아보세요", tag: "헬스/PT", discount: "1회 무료", discountValue: 1, usage_type: "예약 필수", distanceM: 610, color: "#d9eadf", accent: "#35644c", thumb: "🏋" },
  { category: "운동·헬스", store: "필라테스 온", title: "필라테스 3회 등록 시 10% 추가할인", description: "호흡과 코어를 함께 잡는 소그룹 수업", tag: "필라테스/요가", discount: "10%", discountValue: 10, usage_type: "예약 필수", distanceM: 840, color: "#d9e9ed", accent: "#376c73", thumb: "♧" },
  { category: "운동·헬스", store: "테니스 코트 101", title: "코트 대관 2시간 5,000원 할인", description: "초보부터 동호회까지 함께 쓰는 코트", tag: "테니스", discount: "5,000원", discountValue: 5000, usage_type: "예약 필수", distanceM: 1400, color: "#e9e8c8", accent: "#6f7134", thumb: "🎾" },
  { category: "운동·헬스", store: "블루웨이브 수영장", title: "자유수영 첫 이용 30% 할인", description: "도심 속 쾌적한 레인에서 시작해요", tag: "수영", discount: "30%", discountValue: 30, usage_type: "매장 방문", distanceM: 1900, color: "#d8e9f5", accent: "#3d7295", thumb: "◌" },
  { category: "운동·헬스", store: "링크 크로스핏", title: "그룹 클래스 1회 체험권", description: "함께라서 더 오래가는 고강도 트레이닝", tag: "크로스핏/복싱", discount: "1회 체험", discountValue: 1, usage_type: "예약 필수", distanceM: 760, color: "#ead8d2", accent: "#804c3e", thumb: "◈" },
  { category: "생활·편의", store: "탑클래스 보습관", title: "첫 달 교재비 100% 무료 지원", description: "학년별 맞춤 학습 상담과 관리", tag: "보습/입시", discount: "교재비 무료", discountValue: 100, usage_type: "예약 필수", distanceM: 880, color: "#dce5f1", accent: "#48627f", thumb: "📚" },
  { category: "생활·편의", store: "브릿지 잉글리시", title: "영어회화 레벨테스트 무료", description: "실전 회화로 자신감을 키워요", tag: "어학/영어", discount: "무료", discountValue: 100, usage_type: "예약 필수", distanceM: 520, color: "#e1e7d4", accent: "#5b7042", thumb: "A" },
  { category: "생활·편의", store: "뮤직포레 피아노", title: "체험 레슨 1회 무료", description: "아이부터 성인까지 맞춤 음악 수업", tag: "음악/피아노", discount: "1회 무료", discountValue: 1, usage_type: "예약 필수", distanceM: 1100, color: "#eee0ef", accent: "#76517b", thumb: "♪" },
  { category: "생활·편의", store: "아틀리에 37", title: "원데이 드로잉 클래스 20% 할인", description: "처음이어도 즐거운 취미 미술", tag: "미술/예능", discount: "20%", discountValue: 20, usage_type: "예약 필수", distanceM: 1360, color: "#f1ddcf", accent: "#935a43", thumb: "✎" },
  { category: "병원·약국", store: "바른미소 치과", title: "스케일링 예약 시 칫솔세트 증정", description: "꼼꼼한 검진과 편안한 진료", tag: "치과", discount: "칫솔세트 증정", discountValue: 1, usage_type: "예약 필수", distanceM: 680, color: "#d5e8e4", accent: "#35645b", thumb: "✚" },
  { category: "병원·약국", store: "온담 한의원", title: "첫 내원 추나요법 20% 할인", description: "생활 습관까지 살피는 한방 진료", tag: "한의원 / 한방병원", discount: "20%", discountValue: 20, usage_type: "예약 필수", distanceM: 930, color: "#e2ead6", accent: "#60764c", thumb: "♨" },
  { category: "병원·약국", store: "서울아이안과", title: "드림렌즈 상담비 무료", description: "정밀 검사로 맞춤 시력을 관리해요", tag: "안과", discount: "상담비 무료", discountValue: 100, usage_type: "예약 필수", distanceM: 1200, color: "#d7e7f0", accent: "#3c6b83", thumb: "◉" },
  { category: "병원·약국", store: "더맑은 피부과", title: "첫 레이저 상담 30% 혜택", description: "피부 고민에 맞춘 정직한 상담", tag: "피부과", discount: "30%", discountValue: 30, usage_type: "예약 필수", distanceM: 1500, color: "#f0dce1", accent: "#8b5361", thumb: "✦" },
  { category: "병원·약국", store: "라온성형외과", title: "비수술 상담 예약 시 이벤트 혜택", description: "충분한 상담과 안전을 우선하는 맞춤 성형 클리닉", tag: "성형외과", discount: "상담 혜택", discountValue: 1, usage_type: "예약 필수", distanceM: 1120, color: "#f2dce5", accent: "#96556f", thumb: "✧" },
  { category: "병원·약국", store: "서울비뇨의학과", title: "남성 건강검진 상담비 무료", description: "편안하고 꼼꼼한 비뇨의학과 맞춤 상담", tag: "비뇨의학과 (비뇨기과)", discount: "상담비 무료", discountValue: 100, usage_type: "예약 필수", distanceM: 860, color: "#d9e6f1", accent: "#476f8e", thumb: "＋" },
  { category: "병원·약국", store: "역삼내과", title: "건강검진 예약 시 영양제 증정", description: "가까운 동네에서 챙기는 기본 건강", tag: "내과 / 이비인후과 / 소아과", discount: "영양제 증정", discountValue: 1, usage_type: "예약 필수", distanceM: 480, color: "#e0e9df", accent: "#4c6f55", thumb: "＋" },
  { category: "병원·약국", store: "꼬리살랑 동물병원", title: "반려견 기본 건강검진 15% 혜택", description: "우리 아이를 위한 따뜻한 진료", tag: "동물병원", discount: "15%", discountValue: 15, usage_type: "예약 필수", distanceM: 760, color: "#f2e1cb", accent: "#8b6243", thumb: "🐾" },
  { category: "생활·편의", store: "워시데이 디테일링", title: "프리미엄 손세차 1만원 할인권", description: "차량 안팎을 새 차처럼 꼼꼼하게", tag: "세차/디테일링", discount: "10,000원", discountValue: 10000, usage_type: "예약 필수", distanceM: 1300, color: "#d9e5ed", accent: "#456879", thumb: "🚗" },
  { category: "생활·편의", store: "역삼 카케어", title: "엔진오일 교환 시 워셔액 무료", description: "믿고 맡기는 동네 정비 파트너", tag: "카센터/정비", discount: "워셔액 무료", discountValue: 1, usage_type: "예약 필수", distanceM: 1700, color: "#e5e0d3", accent: "#6d644d", thumb: "⚙" },
  { category: "생활·편의", store: "런드리살롱", title: "수선·드라이 20% 할인", description: "옷의 수명을 길게 만드는 섬세한 손길", tag: "세탁/수선", discount: "20%", discountValue: 20, usage_type: "매장 방문", distanceM: 360, color: "#e3e8dc", accent: "#587052", thumb: "◫" },
  { category: "생활·편의", store: "키홈 열쇠공방", title: "도어락 설치 출장비 5,000원 할인", description: "집에 필요한 작은 수리를 빠르게", tag: "인테리어/열쇠", discount: "5,000원", discountValue: 5000, usage_type: "예약 필수", distanceM: 920, color: "#eee0c9", accent: "#80633f", thumb: "⌘" },
  { category: "생활·편의", store: "펫플레이 그루밍", title: "반려동물 목욕 15% 할인", description: "반려가족을 위한 편안한 그루밍 케어", tag: "반려동물", discount: "15%", discountValue: 15, usage_type: "예약 필수", distanceM: 740, color: "#f2ded2", accent: "#8c5b4c", thumb: "🐶" },
];
const generalCategoryCoupons: Coupon[] = generalStoreSeeds.map((seed, index) => ({ id: 300 + index, usage_type: seed.usage_type, store: seed.store, title: seed.title, description: seed.description, category: seed.category, storeCategory: seed.category, discount: seed.discount, discountValue: seed.discountValue, remaining: 4 + (index % 17), total: 25, distanceM: seed.distanceM, expiry: "오늘부터 14일", price: seed.discountValue >= 10000 ? 15000 : 9000, color: seed.color, accent: seed.accent, address: `서울 강남구 ${seed.store} 주변`, rating: 4.5 + (index % 5) / 10, reviews: 36 + index * 5, usage: seed.tag, thumb: seed.thumb }));
const generalTagByStore: Record<string, string> = Object.fromEntries(generalStoreSeeds.map((seed) => [seed.store, seed.tag]));
const foodCategoryChips: FoodChipMap = {
  "한식·분식": ["전체", "백반·정식", "국·찌개", "국밥·탕", "비빔밥·죽", "칼국수·면", "볶음·조림", "전·부침개", "냉면"],
  "카페·디저트": ["전체", "일반 카페 / 커피전문점", "베이커리 / 빵집", "스터디카페 / 북카페", "디저트 / 마카롱·와플 / 떡집", "아이스크림 / 빙수"],
  "돈까스·일식": ["전체", "돈까스·카츠", "초밥·스시", "라멘·소바", "덮밥·돈부리", "우동·나베", "사시미·회"],
  "고기·구이": ["전체", "삼겹살·목살", "소고기·갈비", "돼지갈비", "곱창·막창·대창", "닭갈비·구이"],
  "피자·양식": ["전체", "화덕·팬피자", "파스타·스파게티", "스테이크·립", "필라프·리조또", "샐러드·브런치"],
  "중식": ["전체", "짜장·짬뽕", "탕수육·꿔바로우", "마라탕·마라샹궈", "볶음밥·잡채밥", "만두·딤섬"],
  "치킨": ["전체", "후라이드·양념", "간장·마늘·시즈닝", "순살·텐더", "오븐·바베큐", "닭강정·윙봉"],
  "분식": ["전체", "떡볶이", "튀김·순대", "김밥·주먹밥", "라면·어묵", "만두·분식세트"],
  "반찬가게": ["전체", "반찬·즉석", "밀키트·간편식", "국·찌개·밑반찬"],
  "족발·보쌈": ["전체", "온족발·냉채족발", "직화·불족발", "보쌈·수육", "족보세트", "쟁반막국수"],
  "버거·패스트푸드": ["전체", "수제버거", "치킨버거", "비프버거", "샌드위치·토스트", "감자튀김·사이드"],
  "아시안": ["전체", "베트남쌀국수", "팟타이·태국식", "인도·아시안커리", "나시고랭·볶음밥"],
  "찜·탕": ["전체", "해물찜·아구찜", "닭볶음탕·찜닭", "감자탕·뼈찜", "알탕·동태탕", "김치찜·갈비찜"],
};

type FoodStoreSeed = { group: string; store: string; title: string; description: string; tag: string; discount: string; discountValue: number; usage_type: UsageType; distanceM: number; color: string; accent: string };
const foodStoreSeeds: FoodStoreSeed[] = [
  { group: "한식·분식", store: "오후의 식탁", title: "런치 15% 할인", description: "제철 식재료로 만든 오늘의 작은 정찬", tag: "백반·정식", discount: "15%", discountValue: 15, usage_type: "매장 방문", distanceM: 640, color: "#f7d5b8", accent: "#a8472d" },
  { group: "한식·분식", store: "서울집 밥상", title: "집밥 정식 2,000원 할인", description: "매일 달라지는 따뜻한 국과 반찬", tag: "국·찌개", discount: "2,000원", discountValue: 2000, usage_type: "매장 방문", distanceM: 420, color: "#f1e0bd", accent: "#7e5c2f" },
  { group: "카페·디저트", store: "그레이스 커피 로스터스", title: "아메리카노 1잔 무료", description: "매일 아침 로스터가 직접 볶은 시그니처", tag: "일반 카페 / 커피전문점", discount: "100%", discountValue: 100, usage_type: "매장 방문", distanceM: 280, color: "#cce9dc", accent: "#2f7664" },
  { group: "카페·디저트", store: "버터룸 베이크샵", title: "구움과자 세트 20% 할인", description: "오늘 구운 버터 향 가득한 디저트", tag: "베이커리 / 빵집", discount: "20%", discountValue: 20, usage_type: "매장 방문", distanceM: 510, color: "#f2dfbd", accent: "#8f5d28" },
  { group: "카페·디저트", store: "토스트앤티", title: "와플 토스트 콤보 15% 할인", description: "갓 구운 와플과 따뜻한 토스트 한 접시", tag: "디저트 / 마카롱·와플 / 떡집", discount: "15%", discountValue: 15, usage_type: "매장 방문", distanceM: 680, color: "#f1dcc6", accent: "#95613b" },
  { group: "카페·디저트", store: "포커스 스터디라운지", title: "스터디카페 4주권 1만원 할인", description: "집중을 위한 조용한 개인 좌석과 북카페 라운지", tag: "스터디카페 / 북카페", discount: "10,000원", discountValue: 10000, usage_type: "매장 방문", distanceM: 340, color: "#e3e4e0", accent: "#59645c" },
  { group: "돈까스·일식", store: "카츠온", title: "등심 카츠 3,000원 할인", description: "바삭한 생빵가루와 육즙 가득한 카츠", tag: "돈까스·카츠", discount: "3,000원", discountValue: 3000, usage_type: "매장 방문", distanceM: 760, color: "#e7d2c7", accent: "#8b4d39" },
  { group: "돈까스·일식", store: "소라스시", title: "초밥 10피스 15% 할인", description: "매일 아침 들여오는 신선한 제철 네타", tag: "초밥·스시", discount: "15%", discountValue: 15, usage_type: "예약 필수", distanceM: 920, color: "#d7e8ef", accent: "#39718a" },
  { group: "고기·구이", store: "마포연탄집", title: "삼겹살 1인분 서비스", description: "직화 향이 살아있는 동네 고기집", tag: "삼겹살·목살", discount: "1인분", discountValue: 100, usage_type: "매장 방문", distanceM: 380, color: "#f2c9bb", accent: "#9e4935" },
  { group: "고기·구이", store: "갈비공방", title: "한우 갈비 20,000원 할인", description: "숙성의 깊이를 담은 프리미엄 갈비", tag: "소고기·갈비", discount: "20,000원", discountValue: 20000, usage_type: "예약 필수", distanceM: 1100, color: "#ead3cb", accent: "#7e4132" },
  { group: "피자·양식", store: "오븐앤테이블", title: "화덕 피자 15% 할인", description: "400도 화덕에서 바로 구워낸 도우", tag: "화덕·팬피자", discount: "15%", discountValue: 15, usage_type: "매장 방문", distanceM: 830, color: "#f6d9af", accent: "#a45f28" },
  { group: "피자·양식", store: "라구하우스", title: "파스타 2인 세트 할인", description: "천천히 끓인 라구와 생면 파스타", tag: "파스타·스파게티", discount: "10%", discountValue: 10, usage_type: "예약 필수", distanceM: 1250, color: "#efd7df", accent: "#984c67" },
  { group: "중식", store: "홍콩반점 골목점", title: "짜장·짬뽕 세트 2,000원 할인", description: "불맛 가득한 웍 요리와 바삭한 탕수육", tag: "짜장·짬뽕", discount: "2,000원", discountValue: 2000, usage_type: "매장 방문", distanceM: 560, color: "#f3d2b4", accent: "#a5522a" },
  { group: "중식", store: "마라연", title: "마라탕 첫 주문 20% 할인", description: "취향대로 골라 담는 얼얼한 한 그릇", tag: "마라탕·마라샹궈", discount: "20%", discountValue: 20, usage_type: "매장 방문", distanceM: 740, color: "#f4c3b8", accent: "#a53b2c" },
  { group: "치킨", store: "오늘통닭 역삼", title: "후라이드 반마리 무료", description: "바삭한 튀김옷과 촉촉한 속살", tag: "후라이드·양념", discount: "반마리", discountValue: 100, usage_type: "매장 방문", distanceM: 350, color: "#f4dfad", accent: "#9a6923" },
  { group: "치킨", store: "윙스테이션", title: "윙봉 세트 15% 할인", description: "간장과 마늘 향이 살아있는 바삭한 윙", tag: "닭강정·윙봉", discount: "15%", discountValue: 15, usage_type: "매장 방문", distanceM: 890, color: "#f0d0b4", accent: "#93512f" },
  { group: "분식", store: "신당동 떡볶이", title: "떡볶이+튀김 세트 할인", description: "학교 앞 감성을 담은 매콤달콤 분식", tag: "떡볶이", discount: "3,000원", discountValue: 3000, usage_type: "매장 방문", distanceM: 460, color: "#f5c3c0", accent: "#9f3c42" },
  { group: "분식", store: "김밥공방", title: "김밥 2줄 1,000원 할인", description: "아침마다 말아내는 든든한 한 줄", tag: "김밥·주먹밥", discount: "1,000원", discountValue: 1000, usage_type: "매장 방문", distanceM: 610, color: "#e1edc8", accent: "#53713b" },
  { group: "족발·보쌈", store: "족발의 온도", title: "족보세트 10% 할인", description: "매일 삶아내는 쫀득한 온족발과 보쌈", tag: "족보세트", discount: "10%", discountValue: 10, usage_type: "예약 필수", distanceM: 980, color: "#e6c9c3", accent: "#83484a" },
  { group: "족발·보쌈", store: "불꽃보쌈", title: "직화 불족발 5,000원 할인", description: "불향을 입혀 매콤하게 완성한 족발", tag: "직화·불족발", discount: "5,000원", discountValue: 5000, usage_type: "매장 방문", distanceM: 1380, color: "#efc5ad", accent: "#a04c2b" },
  { group: "버거·패스트푸드", store: "버거마일", title: "수제버거 세트 20% 할인", description: "매일 굽는 브리오슈와 육즙 패티", tag: "수제버거", discount: "20%", discountValue: 20, usage_type: "매장 방문", distanceM: 700, color: "#ecd19b", accent: "#8a6226" },
  { group: "버거·패스트푸드", store: "토스트랩", title: "샌드위치 2개 세트 할인", description: "바쁜 아침을 채우는 따뜻한 토스트", tag: "샌드위치·토스트", discount: "15%", discountValue: 15, usage_type: "매장 방문", distanceM: 520, color: "#e0e8c7", accent: "#557443" },
  { group: "아시안", store: "포메인 골목점", title: "쌀국수 2,000원 할인", description: "진하게 우린 육수와 향긋한 허브", tag: "베트남쌀국수", discount: "2,000원", discountValue: 2000, usage_type: "매장 방문", distanceM: 640, color: "#d0e9dc", accent: "#39735b" },
  { group: "아시안", store: "방콕키친", title: "팟타이 15% 할인", description: "새콤달콤한 태국의 길거리 한 접시", tag: "팟타이·태국식", discount: "15%", discountValue: 15, usage_type: "예약 필수", distanceM: 1040, color: "#f3d6ad", accent: "#95622e" },
  { group: "찜·탕", store: "아구찜 골목", title: "해물찜 중자 10% 할인", description: "매콤한 양념과 통통한 해산물 한 상", tag: "해물찜·아구찜", discount: "10%", discountValue: 10, usage_type: "예약 필수", distanceM: 1150, color: "#d6e5ee", accent: "#3d6d82" },
  { group: "찜·탕", store: "엄마손 감자탕", title: "감자탕 2인 세트 할인", description: "푹 고아낸 진한 국물과 부드러운 뼈찜", tag: "감자탕·뼈찜", discount: "3,000원", discountValue: 3000, usage_type: "매장 방문", distanceM: 770, color: "#e8d8bb", accent: "#7c5d32" },
];
const golfCoupons: Coupon[] = [
  { id: 200, usage_type: "예약 필수", store: "버디 골프존 파크", title: "주간 타임 18홀 5,000원 할인권", description: "퇴근 후에도 여유롭게 즐기는 18홀 라운드", category: "골프", storeCategory: "골프", discount: "5,000원", discountValue: 5000, remaining: 18, total: 30, distanceM: 620, expiry: "오늘부터 7일", price: 15000, color: "#dcebdc", accent: "#2e6848", address: "서울 강남구 테헤란로 208, 5층", rating: 4.8, reviews: 64, usage: "직장인 추천 96%", thumb: "⛳" },
  { id: 201, usage_type: "예약 필수", store: "GDR 아카데미 역삼점", title: "타석 60분 이용 시 30분 무료", description: "정밀 센서로 만드는 나만의 스윙 루틴", category: "골프", storeCategory: "골프", discount: "30분 무료", discountValue: 30, remaining: 12, total: 24, distanceM: 880, expiry: "오늘부터 10일", price: 9000, color: "#d8e8f2", accent: "#2d5d7a", address: "서울 강남구 역삼로 156, 3층", rating: 4.7, reviews: 52, usage: "시설이 좋아요 94%", thumb: "🏌️" },
  { id: 202, usage_type: "예약 필수", store: "잭니클라우스 골프랩", title: "프로 1:1 원포인트 레슨 30% 할인", description: "현직 프로와 함께 교정하는 스윙 한 포인트", category: "골프", storeCategory: "골프", discount: "30%", discountValue: 30, remaining: 7, total: 15, distanceM: 1.2 * 1000, expiry: "오늘부터 14일", price: 20000, color: "#eee0c6", accent: "#806333", address: "서울 강남구 언주로 412, B1", rating: 4.9, reviews: 37, usage: "레슨 만족 98%", thumb: "🏌️‍♂️" },
  { id: 203, usage_type: "매장 방문", store: "탑골프 피팅스튜디오", title: "그립 4개 교체 시 1개 무료 장착", description: "클럽 컨디션을 바꾸는 정교한 골프 피팅", category: "골프", storeCategory: "골프", discount: "1개 무료", discountValue: 1, remaining: 9, total: 20, distanceM: 1450, expiry: "오늘부터 21일", price: 12000, color: "#f0d8d0", accent: "#8b4c3f", address: "서울 강남구 학동로 91, 2층", rating: 4.6, reviews: 29, usage: "다시 방문할래요 91%", thumb: "🏌" },
];
const foodCatalogCoupons: Coupon[] = foodStoreSeeds.map((seed, index) => ({ id: 100 + index, usage_type: seed.usage_type, store: seed.store, title: seed.title, description: seed.description, category: "식당·맛집", storeCategory: "식당·맛집", discount: seed.discount, discountValue: seed.discountValue, remaining: 5 + (index % 18), total: 30, distanceM: seed.distanceM, expiry: "오늘부터 7일", price: seed.discountValue > 1000 ? 15000 : 9000, color: seed.color, accent: seed.accent, address: `서울 강남구 역삼동 ${index + 10}길`, rating: 4.5 + (index % 4) / 10, reviews: 40 + index * 7, usage: seed.tag, thumb: seed.store.slice(0, 1) }));

const languages: { code: Language; label: string }[] = [
  { code: "KR", label: "한국어" }, { code: "EN", label: "English" }, { code: "VN", label: "Tiếng Việt" }, { code: "JP", label: "日本語" }, { code: "CN", label: "中文" },
];
const categories: CategoryItem[] = [
  { id: "식당·맛집", label: "식당·맛집", icon: "🍚", tint: "#ffe0c7", sub: "한식 · 고기 · 분식" },
  { id: "카페·디저트", label: "카페·디저트", icon: "☕", tint: "#e4d4f3", sub: "카페 · 베이커리 · 떡집" },
  { id: "골프", label: "골프", icon: "⛳", tint: "#dcebdc", sub: "스크린 · 연습장 · 부킹" },
  { id: "운동·헬스", label: "운동·헬스", icon: "♧", tint: "#d4eadb", sub: "헬스 · 필라테스 · 테니스" },
  { id: "뷰티·미용", label: "뷰티·미용", icon: "✂", tint: "#ffd6dd", sub: "미용실 · 네일 · 관리" },
  { id: "생활·편의", label: "생활·편의", icon: "⌂", tint: "#f3e5bb", sub: "세탁 · 수선 · 학원" },
  { id: "병원·약국", label: "병원·약국", icon: "✚", tint: "#d8e9f7", sub: "피부과 · 성형외과 · 약국" },
];
import { administrativeRegions, roadNamesForRegion } from "@/data/regions";
const defaultBusinessSchedule: BusinessSchedule = { businessDays: [1, 2, 3, 4, 5, 6], holidayExceptions: [], operatingHours: { open: "10:00", close: "20:00" }, breakTime: { start: "15:00", end: "17:00" }, lastOrder: "19:30" };
const scheduleForStore = (store: string): BusinessSchedule => store.includes("그레이스") ? { businessDays: [1, 2, 3, 4, 5, 6], holidayExceptions: ["2026-10-09"], operatingHours: { open: "11:30", close: "21:30" }, breakTime: { start: "15:00", end: "17:00" }, lastOrder: "21:00" } : { ...defaultBusinessSchedule, businessDays: [1, 2, 3, 4, 5, 6] };
const parseScheduleMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
const formatScheduleTime = (totalMinutes: number) => totalMinutes === 24 * 60 ? "24:00" : `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
const isScheduleDateOpen = (dateKey: string, schedule: BusinessSchedule) => { const date = new Date(`${dateKey}T00:00:00`); return schedule.businessDays.includes(date.getDay()) && !schedule.holidayExceptions.includes(dateKey); };
const coupons: Coupon[] = [
  { id: 1, usage_type: "매장 방문", store: "그레이스 커피 로스터스", title: "아메리카노 1잔 무료", description: "매일 아침 로스터가 직접 볶은 시그니처", category: "카페·디저트", storeCategory: "카페·디저트", discount: "100%", discountValue: 100, remaining: 7, total: 20, distanceM: 280, expiry: "오늘 자정까지", price: 4800, color: "#c3dfd2", accent: "#27564a", address: "서울 강남구 테헤란로 118, 1층", rating: 4.9, reviews: 218, usage: "재방문 의사 97%", thumb: "☕" },
  { id: 2, usage_type: "매장 방문", store: "오후의 식탁", title: "런치 15% 할인", description: "제철 식재료로 만든 오늘의 작은 정찬", category: "식당·맛집", storeCategory: "식당·맛집", discount: "15%", discountValue: 15, remaining: 18, total: 40, distanceM: 640, expiry: "3일 남음", price: 7500, color: "#f0c8a9", accent: "#71472f", address: "서울 강남구 논현로 521, 2층", rating: 4.8, reviews: 126, usage: "재방문 의사 92%", thumb: "🍽" },
  { id: 3, usage_type: "예약 필수", store: "스튜디오 레이어", title: "첫 방문 20,000원 할인", description: "당신의 취향에 맞춘 퍼스널 케어", category: "뷰티·미용", storeCategory: "뷰티·미용", discount: "50%", discountType: "percent", discountValue: 50, remaining: 3, total: 8, distanceM: 1200, expiry: "7일 남음", price: 20000, color: "#dccbed", accent: "#50396d", address: "서울 강남구 봉은사로 226, 3층", rating: 4.7, reviews: 84, usage: "만족도 89%", thumb: "✦" },
  { id: 4, usage_type: "예약 필수", store: "모브 필라테스", title: "체험 수업 50% 할인", description: "가볍게 시작하는 내 몸의 리듬 찾기", category: "운동·헬스", storeCategory: "운동·헬스", discount: "50%", discountValue: 50, remaining: 11, total: 25, distanceM: 850, expiry: "5일 남음", price: 9000, color: "#d4eadb", accent: "#2d624c", address: "서울 강남구 역삼로 158, B1", rating: 4.6, reviews: 71, usage: "추천해요 94%", thumb: "♧" },
  { id: 5, usage_type: "예약 필수", store: "오브제 클래스", title: "원데이 클래스 10% 할인", description: "손으로 만드는 가장 다정한 주말", category: "생활·편의", storeCategory: "생활·편의", discount: "10%", discountValue: 10, remaining: 23, total: 50, distanceM: 1800, expiry: "14일 남음", price: 9000, color: "#cfe4f5", accent: "#3c6181", address: "서울 강남구 선릉로 412, 4층", rating: 4.6, reviews: 52, usage: "즐거웠어요 91%", thumb: "✎" },
  { id: 6, usage_type: "매장 방문", store: "프레임 안경원", title: "안경테 30,000원 할인", description: "얼굴에 가장 잘 어울리는 하나를 찾아요", category: "생활·편의", storeCategory: "생활·편의", discount: "30,000원", discountValue: 30, remaining: 6, total: 12, distanceM: 430, expiry: "10일 남음", price: 30000, color: "#f1e0ad", accent: "#756028", address: "서울 강남구 강남대로 376, 1층", rating: 4.8, reviews: 39, usage: "친절해요 98%", thumb: "⌂" },
  { id: 7, usage_type: "예약 필수", store: "바른미소 치과", title: "스케일링 20% 할인", description: "정기 검진부터 작은 불편까지 편안하게", category: "병원·약국", storeCategory: "병원·약국", discount: "20%", discountValue: 20, remaining: 9, total: 15, distanceM: 2100, expiry: "20일 남음", price: 10000, color: "#d5e8e4", accent: "#35645b", address: "서울 강남구 삼성로 548, 5층", rating: 4.9, reviews: 106, usage: "다시 갈래요 95%", thumb: "✚" },
  { id: 8, usage_type: "예약 필수", store: "룸앤룸 파티라운지", title: "공간 대여 25% 할인", description: "친구들과의 순간을 더 특별하게", category: "기타", storeCategory: "기타", discount: "25%", discountValue: 25, remaining: 3, total: 10, distanceM: 1500, expiry: "이번 달까지", price: 15000, color: "#f0d3c5", accent: "#774c3a", address: "서울 강남구 도산대로 201, 2층", rating: 4.5, reviews: 28, usage: "또 이용할래요 88%", thumb: "♫" },
  { id: 9, usage_type: "예약 필수", store: "버디 골프존 파크", title: "스크린골프 첫 방문 30% 할인", description: "가까운 연습장에서 즐기는 라운드", category: "골프", storeCategory: "골프", discount: "30%", discountValue: 30, remaining: 5, total: 10, distanceM: 900, expiry: "10일 남음", price: 18000, color: "#d8e6d5", accent: "#44624a", address: "서울 강남구 역삼동 701", rating: 4.7, reviews: 43, usage: "첫 방문 혜택", thumb: "🏌" },
];

// 산본동 미리보기용 테스트 쿠폰: 지역 API가 비어도 화면에서 바로 확인합니다.
const previewCoupons: Coupon[] = [...coupons, ...generalCategoryCoupons].map((coupon, index) => {
  const storeCategory = normalizeStoreCategory(coupon.storeCategory);
  return { ...coupon, category: storeCategory, storeCategory, targetRegionCodes: [COMMUNITY_REGION_CODES.sanbon1Dong], regionTarget: { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [COMMUNITY_REGION_CODES.sanbon1Dong] }, isVipOnly: isVipOnlyCoupon(coupon), store: `산본 ${coupon.store}`, address: `경기 군포시 산본동 ${101 + index}번지`, distanceM: 120 + index * 180 };
});
function PersimmonLogo() { return <div className="persimmon-logo"><span>●</span><i /></div>; }
function LanguageToggle({ value, onChange }: { value: Language; onChange: (value: Language) => void }) { return <div className="language-toggle"><Globe2 size={13} />{languages.map((item) => <button key={item.code} className={value === item.code ? "active" : ""} onClick={() => onChange(item.code)} title={item.label}>{item.code}</button>)}</div>; }
function formatDistance(meters: number) { if (!Number.isFinite(meters) || meters < 0) return "거리 정보 없음"; return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`; }

function CouponMembershipGateSheet({ onClose, onStart }: { onClose: () => void; onStart: () => void }) { return <div className="overlay coupon-gate-overlay" onClick={onClose}><section className="coupon-gate-sheet" role="dialog" aria-modal="true" aria-labelledby="coupon-gate-title" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose} aria-label="정회원 전용 쿠폰 안내 닫기"><X size={17} /></button><div className="coupon-gate-icon" aria-hidden="true">👑</div><h2 id="coupon-gate-title">팅커벨 정회원 가입이 필요해요</h2><p>이 쿠폰은 정회원 전용 혜택입니다.<br />월 10,000원으로 고액 할인 쿠폰을 이용해 보세요.</p><div className="coupon-gate-benefits"><span>✓ 1만 원 이상 할인 쿠폰 이용</span><span>✓ 체험단 우선 신청</span></div><button className="coupon-gate-register" onClick={onStart}>정회원 가입하기</button><button className="coupon-gate-dismiss" onClick={onClose}>닫기</button></section></div>; }
function MembershipSheet({ onClose, onStart }: { onClose: () => void; onStart: () => void }) { return <div className="overlay" onClick={onClose}><section className="membership-sheet" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose}><X size={17} /></button><div className="membership-icon"><Sparkles size={22} /></div><p className="eyebrow">DANGAM MEMBERSHIP</p><h2>단골의 감동을<br /><em>매일 더 크게</em> 받아보세요</h2><p className="membership-copy">월 10,000원으로 1만원 초과 쿠폰과<br />정회원 전용 골목 혜택을 즉시 사용할 수 있어요.</p><div className="membership-points"><span><Check size={14} /> 정회원 전용 쿠폰 무제한 열람</span><span><Check size={14} /> 매월 단골 추천 혜택</span><span><Check size={14} /> 사용 수수료 0원</span></div><button className="wide-orange" onClick={onStart}>월 10,000원으로 시작하기 <ArrowRight size={15} /></button></section></div>; }
function CampaignMembershipSheet({ onClose, onStart }: { onClose: () => void; onStart: () => void }) { return <div className="overlay campaign-overlay" onClick={onClose}><section className="campaign-membership-sheet" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose} aria-label="정회원 안내 닫기"><X size={17} /></button><div className="campaign-vip-icon">👑</div><span className="campaign-vip-badge">PREMIUM · VIP 팅커벨 멤버십</span><h2>체험단 지원은<br /><em>팅커벨 정회원 전용 혜택</em>입니다</h2><div className="campaign-benefit-list"><strong>🎁 월 10,000원으로 즐기는 무제한 혜택</strong><span>✔️ 매월 엄선된 맛집·카페·뷰티 무료 체험단 무제한 지원</span><span>✔️ 정회원 전용 시크릿 할인 쿠폰 상시 제공</span><span>✔️ 마감특가 우선 픽업 및 예약 우선권</span></div><button className="wide-orange" onClick={onStart}>월 10,000원으로 멤버십 시작하기 <ArrowRight size={15} /></button><button className="campaign-membership-dismiss" onClick={onClose}>다음에 할게요</button></section></div>; }
function ReviewBars({ coupon }: { coupon: Coupon }) { return <div className="review-bars"><label><span>다시 갈래요</span><i><b style={{ width: `${coupon.rating / 5 * 100}%` }} /></i><em>{coupon.usage}</em></label><label><span>친절해요</span><i><b style={{ width: "88%" }} /></i><em>88%</em></label><label><span>만족해요</span><i><b style={{ width: "94%" }} /></i><em>94%</em></label></div>; }
function CouponReviewList({ coupon, items }: { coupon: Coupon; items?: CouponReview[] }) {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(() => readBlockedUsers());
  useEffect(() => {
    const syncBlockedUsers = () => setBlockedUsers(readBlockedUsers());
    window.addEventListener("dangam:blocked-users-changed", syncBlockedUsers);
    window.addEventListener("storage", syncBlockedUsers);
    return () => {
      window.removeEventListener("dangam:blocked-users-changed", syncBlockedUsers);
      window.removeEventListener("storage", syncBlockedUsers);
    };
  }, []);
  const blockedIds = new Set(blockedUsers.map((user) => user.id));
  const allItems = items ?? coupon.reviewItems ?? [];
  const visibleItems = sortCouponReviewsNewestFirst(allItems.filter((item) => !blockedIds.has(item.authorId)));
  if (!allItems.length) return <div className="coupon-review-list" aria-label="매장 리뷰 피드"><p className="coupon-review-empty">아직 등록된 리뷰가 없습니다.</p></div>;
  return (
    <div className="coupon-review-list" aria-label="매장 리뷰 피드">
      {visibleItems.map((item) => (
        <article key={item.id} className="coupon-review-item">
          <div><strong>{item.authorName}</strong><small>{item.kind === "comment" ? "댓글" : "리뷰"}{item.rating ? ` · ${item.rating}점` : ""}{item.createdAt ? ` · ${formatCouponReviewCreatedAt(item.createdAt)}` : ""}</small>{item.tags?.length ? <small className="coupon-review-tags">{item.tags.join(" · ")}</small> : null}</div>
          <p>{item.text}</p>
        </article>
      ))}
      {visibleItems.length === 0 && <p className="coupon-review-empty">차단한 사용자의 리뷰와 댓글은 숨겨졌습니다.</p>}
    </div>
  );
}
function OrderSheet({ coupon, onClose, onComplete, onSave }: { coupon: Coupon; onClose: () => void; onComplete?: () => void; onSave?: (day: string, time: string, people: string) => void }) { const [pickup, setPickup] = useState("15분 후"); const [day, setDay] = useState("오늘"); const [time, setTime] = useState("14:00"); const [people, setPeople] = useState("1인"); const isPickup = coupon.usage_type === "매장 방문"; const orderActionDisabled = !day || !time || !people; return <div className="overlay order-overlay" onClick={onClose}><section className="order-sheet" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose}><X size={17} /></button><p className="eyebrow">{isPickup ? "TAKEOUT / PICKUP" : "VISIT RESERVATION"}</p><h2>{isPickup ? "픽업 예정 시간을 골라주세요" : "방문 날짜와 시간을 예약하세요"}</h2><p className="order-store"><MapPin size={12} /> {coupon.store} · {coupon.title}</p>{isPickup ? <><div className="choice-grid">{["15분 후", "30분 후", "1시간 후"].map((value) => <button key={value} className={pickup === value ? "selected" : ""} onClick={() => setPickup(value)}><Clock3 size={14} />{value}</button>)}</div><button className="wide-orange" onClick={() => { onComplete?.(); window.alert("가맹점에 포장 주문이 접수되었습니다! 사장님 확인 대기 중"); onClose(); }}><Send size={15} /> 주문 접수하기</button></> : <><label className="order-label">방문 날짜</label><div className="choice-grid three">{["오늘", "내일", "모레"].map((value) => <button key={value} className={day === value ? "selected" : ""} onClick={() => setDay(value)}>{value}</button>)}</div><label className="order-label">시간대</label><div className="choice-grid four">{["11:00", "14:00", "16:30", "19:00"].map((value) => <button key={value} className={time === value ? "selected" : ""} onClick={() => setTime(value)}>{value}</button>)}</div><label className="order-label">인원 수</label><div className="choice-grid two">{["1인", "2인"].map((value) => <button key={value} className={people === value ? "selected" : ""} onClick={() => setPeople(value)}>{value}</button>)}</div><div className="order-selection-summary"><span>선택 일정 · {people}</span><b>{day} {time}</b></div><div className="reservation-action-grid order-action-grid"><button className="coupon-save-btn" disabled={orderActionDisabled} onClick={() => { onSave?.(day, time, people); onClose(); }}>쿠폰함 저장</button><button className="wide-orange reservation-submit-btn" disabled={orderActionDisabled} onClick={() => { onComplete?.(); window.alert("예약 신청 완료! 사장님 확정 후 쿠폰함에 확정 알림이 표시됩니다"); onClose(); }}>예약 신청하기 <ArrowRight size={16} /></button></div></>}</section></div>; }


function CouponLocation({ coupon, compact = false, wallet = false, addressOnly = false, onOpenMap }: { coupon: Coupon; compact?: boolean; wallet?: boolean; addressOnly?: boolean; onOpenMap?: (item: StoreMapItem) => void }) { const [copied, setCopied] = useState(false); const phone = merchantPhoneFor(coupon); const storeAddress = coupon.storeAddress ?? coupon.address; const mapQuery = encodeURIComponent(storeAddress); const copyAddress = async () => { try { await navigator.clipboard?.writeText(storeAddress); } catch { /* clipboard may be unavailable in preview */ } setCopied(true); window.setTimeout(() => setCopied(false), 1800); }; if (addressOnly) return <div className="coupon-detail-address-row"><span><MapPin size={13} aria-hidden="true" />{storeAddress}</span><button type="button" onClick={copyAddress}><Copy size={13} aria-hidden="true" />{copied ? "복사됨" : "주소 복사"}</button></div>; return <section className={`coupon-location ${compact ? "compact" : ""} ${wallet ? "wallet" : ""}`}><div className="coupon-location-head"><div>{wallet && <p className="eyebrow"><MapPin size={13} aria-hidden="true" /> 매장 위치</p>}<strong>{coupon.store}</strong></div>{!wallet && <button type="button" className="coupon-location-gift" onClick={() => window.alert("원소유자 쿠폰은 선물 후 비활성화됩니다. 카카오톡으로 보낼 준비가 되었어요.")}><Gift size={13} /><span>카톡 선물하기</span></button>}</div><div className="coupon-address-row"><span>{storeAddress}</span><button onClick={copyAddress}><Copy size={13} /> {copied ? "복사됨" : "주소 복사"}</button></div>{wallet ? <div className="coupon-wallet-location-actions"><button onClick={() => window.alert(`${coupon.store} 위치 정보를 확인합니다.`)}><MapPin size={13} /> 매장 위치 보기</button><a href={`https://map.naver.com/p/search/${mapQuery}`} target="_blank" rel="noreferrer"><Navigation size={13} /> 빠른 길안내</a></div> : <><div className="coupon-location-contact"><span>전화번호</span>{phone ? <><a href={phoneHref(phone)}>{phone}</a><a className="coupon-call-btn" href={phoneHref(phone)}><Phone size={13} /> 전화 걸기</a></> : <span>등록된 전화번호 없음</span>}</div><button type="button" className="coupon-mini-map" onClick={() => onOpenMap?.({ store: coupon.store, address: storeAddress, distance: Number.isFinite(coupon.sortDistanceM) ? formatDistance(coupon.sortDistanceM!) : "거리 정보 없음", latitude: coupon.latitude, longitude: coupon.longitude })}><div className="map-grid-lines" /><MapPin size={28} className="coupon-location-pin" /><span>매장 위치</span></button><div className="coupon-location-actions"><a href={`https://map.naver.com/p/search/${mapQuery}`} target="_blank" rel="noreferrer"><Navigation size={14} /> 네이버 길찾기</a><a href={`https://map.kakao.com/?q=${mapQuery}`} target="_blank" rel="noreferrer"><MapPin size={14} /> 지도 앱 열기</a></div></>}</section>; }

function DetailSheet({ coupon, source = "home", isIssued = false, isFavorite = false, recommendations = [], onSelectRecommendation, onToggleFavorite, onClose, onIssue, onRedeem, onReserve, onOrderComplete, onSave, onOpenMap, reviewClaimKey, initialFocusReview = false, reviewEligible = false, loadCouponReviews, onSubmitCouponReview }: { coupon: Coupon; source?: "home" | "wallet"; isIssued?: boolean; isFavorite?: boolean; recommendations?: Coupon[]; onSelectRecommendation?: (coupon: Coupon) => void; onToggleFavorite?: () => void; onClose: () => void; onIssue?: () => void; onRedeem: () => void; onReserve?: () => void; onOrderComplete?: () => void; onSave?: (day: string, time: string, people: string) => void; onOpenMap?: (item: StoreMapItem) => void; reviewClaimKey?: string | null; initialFocusReview?: boolean; reviewEligible?: boolean; loadCouponReviews?: (couponId: string) => Promise<ConsumerCouponReview[]>; onSubmitCouponReview?: (claimId: string, input: StoreReviewSubmission) => Promise<ConsumerCouponReview> }) { const [liked, setLiked] = useState(isFavorite); useEffect(() => setLiked(isFavorite), [isFavorite]); const detailSheetRef = useRef<HTMLElement | null>(null); const reviewFormRef = useRef<HTMLFormElement | null>(null); useEffect(() => { detailSheetRef.current?.scrollTo({ top: 0, behavior: "auto" }); }, [coupon.id]); useEffect(() => { if (!initialFocusReview || !reviewClaimKey) return; const timer = window.setTimeout(() => reviewFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100); return () => window.clearTimeout(timer); }, [coupon.id, initialFocusReview, reviewClaimKey]); const [reviewItems, setReviewItems] = useState<CouponReview[]>(coupon.reviewItems ?? []); const [reviewLoadError, setReviewLoadError] = useState(""); useEffect(() => { let active = true; setReviewItems(coupon.reviewItems ?? []); setReviewLoadError(""); const couponId = coupon.bridgeCouponId; if (!couponId || !loadCouponReviews) return () => { active = false; }; void loadCouponReviews(couponId).then((rows) => { if (!active) return; const mapped = rows.map((item) => ({ id: item.id, authorId: item.authorId, authorName: item.authorName, text: item.text, createdAt: item.createdAt, kind: "review" as const, rating: item.rating, tags: item.tags })); setReviewItems(sortCouponReviewsNewestFirst([...mapped, ...(coupon.reviewItems ?? [])])); }).catch(() => { if (active) setReviewLoadError("Mock 리뷰를 불러오지 못했습니다."); }); return () => { active = false; }; }, [coupon.bridgeCouponId, coupon.reviewItems, loadCouponReviews]); const submitReview = async (input: StoreReviewSubmission) => { if (!reviewEligible || !reviewClaimKey || !onSubmitCouponReview) throw new Error("매장에서 쿠폰 사용 완료 후 작성하실 수 있습니다"); const saved = await onSubmitCouponReview(reviewClaimKey, input); const item: CouponReview = { id: saved.id, authorId: saved.authorId, authorName: saved.authorName, text: saved.text, createdAt: saved.createdAt, kind: "review", rating: saved.rating, tags: saved.tags }; setReviewItems((current) => sortCouponReviewsNewestFirst([item, ...current.filter((existing) => existing.id !== item.id)])); }; const [orderOpen, setOrderOpen] = useState(false); const mapQuery = encodeURIComponent(coupon.storeAddress ?? coupon.address); const phone = merchantPhoneFor(coupon); return <div className="overlay" onClick={onClose}><section ref={detailSheetRef} className="detail-sheet" onClick={(event) => event.stopPropagation()}><div className="detail-visual"><CouponMediaImage sources={couponImageSources(coupon)} alt={`${coupon.store} 대표 사진`} /><button className="close-btn light" onClick={onClose} aria-label="쿠폰 상세 닫기"><X size={17} /></button></div><div className="detail-content"><div className="detail-head"><div><h2>{coupon.title}</h2><p className="detail-store"><MapPin size={13} /> {coupon.store}</p></div><button className={liked ? "like-btn liked" : "like-btn"} onClick={() => { const next = !liked; setLiked(next); onToggleFavorite?.(); }} aria-label={liked ? "찜한 매장 해제" : "매장 찜하기"}><Star className={`favorite-star-icon ${liked ? "active" : ""}`} size={30} fill="currentColor" aria-hidden="true" /></button></div><div className="coupon-detail-contact-actions">{phone ? <a href={phoneHref(phone)} className="coupon-detail-call"><Phone size={14} aria-hidden="true" /> 매장 전화문의</a> : <button type="button" className="coupon-detail-call" aria-label="등록된 매장 전화번호가 없습니다" disabled><Phone size={14} aria-hidden="true" /> 전화번호 없음</button>}<a href={`https://map.naver.com/p/search/${mapQuery}`} target="_blank" rel="noreferrer" className="coupon-detail-map"><MapPin size={14} aria-hidden="true" /> 매장 찾기</a><button type="button" className="coupon-detail-gift" onClick={() => window.alert("원소유자 쿠폰은 선물 후 비활성화됩니다. 카카오톡으로 보낼 준비가 되었어요.")}><Gift size={14} aria-hidden="true" /> 카톡 선물하기</button></div><CouponLocation coupon={coupon} addressOnly onOpenMap={onOpenMap} /><StoreFacilityBadges tags={coupon.facilityTags} /><div className="review-panel"><div className="review-title"><b>우리 동네 단골들의 평가</b><span><Star size={12} fill="currentColor" /> {coupon.rating} <small>({coupon.reviews})</small></span></div><ReviewBars coupon={coupon} /><section className="coupon-review-content"><h3 className="coupon-review-section-title">리뷰 작성 및 피드</h3><StoreReviewForm formRef={reviewFormRef} canReview={reviewEligible && Boolean(reviewClaimKey)} onSubmit={submitReview} /><CouponReviewList coupon={coupon} items={reviewItems} />{reviewLoadError && <p className="coupon-review-empty" role="status">{reviewLoadError}</p>}</section></div>{source === "home" && <button className="wide-orange coupon-detail-download" onClick={() => onIssue?.()}>{isIssued ? "쿠폰 받기 완료 · 쿠폰함 가기" : <><Ticket size={16} /> 쿠폰 받기</>}</button>}{source === "home" && <CouponRecommendationRail coupons={recommendations} getImageSources={couponImageSources} onSelect={(nextCoupon) => onSelectRecommendation?.(nextCoupon)} />}</div>{orderOpen && <OrderSheet coupon={coupon} onClose={() => setOrderOpen(false)} onComplete={onOrderComplete} onSave={onSave} />}</section></div>; }

function CouponAlreadyUsedSheet({ record, onClose }: { record: IssuedCouponRecord; onClose: () => void }) {
  return <div className="overlay coupon-timer-overlay" onClick={onClose}>
    <section className="coupon-timer-sheet coupon-already-used-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="coupon-already-used-title">
      <header className="coupon-timer-header"><h2 id="coupon-already-used-title">쿠폰 사용 안내</h2><button className="close-btn" onClick={onClose} aria-label="쿠폰 사용 안내 닫기"><X size={17} /></button></header>
      <div className="coupon-already-used-content"><div className="merchant-success-icon" aria-hidden="true"><Check size={30} /></div><h3>이미 사용하였습니다</h3><p>{record.coupon.store}의 쿠폰은 이번 달에 이미 사용 처리되었습니다.</p><button className="coupon-timer-close" onClick={onClose}>확인</button></div>
    </section>
  </div>;
}
function CouponUsagePinSheet({ record, onClose, onComplete, onSuccess }: { record: IssuedCouponRecord; onClose: () => void; onComplete: (storePin: string) => Promise<void>; onSuccess?: () => void }) {
  const [completed, setCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [storePin, setStorePin] = useState("");
  const [error, setError] = useState("");
  const completionRef = useRef(false);
  const completeUsage = async () => {
    if (completionRef.current || completed || !/^\d{4}$/.test(storePin)) return;
    completionRef.current = true;
    setCompleting(true);
    setError("");
    try {
      await onComplete(storePin);
      setCompleted(true);
      onSuccess?.();
    } catch (verificationError) {
      completionRef.current = false;
      setError(verificationError instanceof Error ? verificationError.message : "매장 확인에 실패했습니다.");
    } finally {
      setCompleting(false);
    }
  };
  const validStorePin = /^\d{4}$/.test(storePin);
  return <div className="overlay coupon-pin-overlay" onClick={onClose}>
    <section className="coupon-pin-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="coupon-pin-title">
      <header className="coupon-pin-header"><h2 id="coupon-pin-title">쿠폰 사용 확인</h2><button className="close-btn" onClick={onClose} aria-label="쿠폰 사용 확인 닫기"><X size={17} /></button></header>
      {completed ? <div className="coupon-pin-complete"><div className="merchant-success-icon" aria-hidden="true"><Check size={30} /></div><h3>쿠폰 사용이 완료되었습니다</h3><p>{record.coupon.store}에서 사용 처리되었습니다.</p><button className="coupon-pin-close" onClick={onClose}>확인</button></div> : <>
        <div className="coupon-pin-summary"><p>{record.coupon.store}</p><h3>{record.coupon.title}</h3></div>
        <div className="coupon-pin-intro"><strong>매장 직원에게 이 화면을 보여주세요</strong><p>직원이 매장 고유 PIN 4자리를 입력하면 쿠폰 사용이 완료됩니다.</p></div>
        <label className="coupon-store-pin-field"><span>매장 고유 PIN 4자리</span><input inputMode="numeric" type="password" autoComplete="off" maxLength={4} value={storePin} onChange={(event) => setStorePin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="직원 입력" aria-label="매장 고유 PIN 4자리" /></label>
        {error && <p className="coupon-pin-error" role="alert">{error}</p>}
        <button className="coupon-pin-confirm" disabled={!validStorePin || completing} onClick={() => void completeUsage()}>{completing ? "확인 중" : "매장 확인 완료"}</button>
        <p className="coupon-pin-note">고객이 임의로 사용 완료할 수 없으며, 매장 PIN 인증 후에만 처리됩니다.</p>
      </>}
    </section>
  </div>;
}
function RedeemSheet({ coupon, userCouponId, onClose, onComplete }: { coupon: Coupon; userCouponId?: string; onClose: () => void; onComplete: (record: IssuedCouponRecord, storePin?: string) => Promise<void> }) {
  const record: IssuedCouponRecord = { coupon, userCouponId, visitDate: "오늘", dateKey: simulatedToday, pickupTime: "방문 시", partySize: "1", status: "ACTIVE" };
  return <CouponUsagePinSheet record={record} onClose={onClose} onComplete={(storePin) => onComplete(record, storePin)} />;
}
type CouponStatus = "ACTIVE" | "USED" | "EXPIRED" | "RETURNED";
type IssuedCouponRecord = { userCouponId?: string; coupon: Coupon; visitDate: string; dateKey: string; pickupTime: string; partySize: string; status: CouponStatus; issuedAt?: number; usedAt?: string; returnedAt?: number; returnReason?: "CANCELLED" | "EXPIRED"; apiSource?: "consumer" | "shared"; bulkVisitVerified?: boolean };
const simulatedToday = currentKstDateKey();
function couponDdayLabel(coupon: Coupon) {
  const raw = coupon.usageEndDate ?? coupon.expiry ?? "";
  const isoDate = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(raw)?.[1];
  const explicit = raw.match(/(20\d{2})[.\-/년 ]+(\d{1,2})[.\-/월 ]+(\d{1,2})/);
  const dateKey = isoDate ?? (explicit ? `${explicit[1]}-${String(Number(explicit[2])).padStart(2, "0")}-${String(Number(explicit[3])).padStart(2, "0")}` : undefined);
  return formatCouponDday(dateKey);
}
function visitDday(dateKey: string) { const diff = differenceInDateKeys(dateKey, simulatedToday); if (diff === undefined) return ""; return diff < 0 ? "회수됨" : diff === 0 ? "오늘 마감" : `D-${diff}`; }
const koreanHolidayLabels: Record<string, string> = {
  "2026-01-01": "신정", "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴", "2026-03-01": "삼일절", "2026-03-02": "삼일절 대체공휴일", "2026-05-05": "어린이날", "2026-05-24": "석가탄신일", "2026-05-25": "석가탄신일 대체공휴일", "2026-06-06": "현충일", "2026-08-15": "광복절", "2026-08-17": "광복절 대체공휴일", "2026-10-03": "개천절", "2026-10-05": "개천절 대체공휴일", "2026-10-09": "한글날", "2026-12-25": "성탄절",
  "2027-01-01": "신정", "2027-02-06": "설날 연휴", "2027-02-07": "설날", "2027-02-08": "설날 연휴", "2027-03-01": "삼일절", "2027-05-05": "어린이날", "2027-05-13": "석가탄신일", "2027-06-06": "현충일", "2027-08-15": "광복절", "2027-10-03": "개천절", "2027-10-09": "한글날", "2027-12-25": "성탄절",
};
function dateKeyFromParts(year: number, month: number, day: number) { return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function expiryEndDateKey(coupon: Coupon) {
  if (coupon.usageEndDate) return coupon.usageEndDate;
  const explicit = coupon.expiry.match(/(20\d{2})[.\-/년 ]+(\d{1,2})[.\-/월 ]+(\d{1,2})/);
  if (explicit) return dateKeyFromParts(Number(explicit[1]), Number(explicit[2]), Number(explicit[3]));
  const days = Number(coupon.expiry.match(/(\d+)일/)?.[1] ?? (coupon.expiry.includes("오늘") ? 0 : 30));
  return addDateKeyDays(simulatedToday, days);
}
function koreanHolidayFor(dateKey: string) { const weekend = weekdayForDateKey(dateKey); return koreanHolidayLabels[dateKey] ?? (weekend === 0 ? "일요일" : ""); }
function isDateInCouponPeriod(coupon: Coupon, dateKey: string) { const start = coupon.usageStartDate ?? simulatedToday; return dateKey >= start && dateKey <= expiryEndDateKey(coupon); }

function VisitDateSheet({ coupon, schedule, onClose, onConfirm, onSave }: { coupon: Coupon; schedule: BusinessSchedule; onClose: () => void; onConfirm: (visitDate: string, dateKey: string, pickupTime: string, partySize: string, phoneShareAgreed: boolean) => void; onSave: (visitDate: string, dateKey: string, pickupTime: string, partySize: string) => void }) {
  const [monthCursor, setMonthCursor] = useState(() => new Date(`${simulatedToday}T00:00:00Z`));
  const [selectedDate, setSelectedDate] = useState(() => simulatedToday);
  const [pickupTime, setPickupTime] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [phoneShareAgreed, setPhoneShareAgreed] = useState(false);
  const year = monthCursor.getUTCFullYear(); const month = monthCursor.getUTCMonth() + 1;
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const timeEntries = availableVisitTimes(selectedDate, coupon.businessHours ?? scheduleBusinessHours(schedule), coupon.closedDay).map((label) => { const [hour, minute] = label.split(":").map(Number); const minutes = hour * 60 + minute; return { minutes, label, displayLabel: label }; });
  const timeOptions = timeEntries.map((entry) => entry.label);
  const dateIsOpen = (dateKey: string) => isDateInCouponPeriod(coupon, dateKey) && isScheduleDateOpen(dateKey, schedule) && !koreanHolidayFor(dateKey).includes("일요일");
  const selectedDateObject = new Date(`${selectedDate}T00:00:00Z`); const weekday = ["일", "월", "화", "수", "목", "금", "토"][selectedDateObject.getUTCDay()];
  const selectedDateAvailable = dateIsOpen(selectedDate); const hasAvailableDates = days.some((day) => dateIsOpen(dateKeyFromParts(year, month, day)));
  useEffect(() => { if (!selectedDateAvailable) { const first = days.find((day) => dateIsOpen(dateKeyFromParts(year, month, day))); if (first) setSelectedDate(dateKeyFromParts(year, month, first)); } }, [year, month, coupon.usageStartDate, coupon.usageEndDate, coupon.expiry, schedule.businessDays.join(","), schedule.holidayExceptions.join(",")]);
  useEffect(() => { if (timeOptions.length && !timeOptions.includes(pickupTime)) setPickupTime(timeOptions[0]); }, [timeOptions.join(",")]);
  const moveMonth = (offset: number) => setMonthCursor((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1)));
  const safePartySize = Math.max(1, Math.min(99, Number(partySize) || 1));
  const partyLabel = `${safePartySize}명`;
  const visitDate = `${selectedDateObject.getUTCFullYear()}년 ${selectedDateObject.getUTCMonth() + 1}월 ${selectedDateObject.getUTCDate()}일(${weekday})`;
  const holidayForDay = (dateKey: string) => koreanHolidayFor(dateKey);
  const canSubmit = Boolean(selectedDateAvailable && pickupTime && timeOptions.includes(pickupTime) && hasAvailableDates && partySize);
  const canConfirm = canSubmit && phoneShareAgreed;
  return <div className="overlay visit-calendar-overlay" onClick={onClose}><section className="visit-date-sheet visit-calendar-fullscreen" onClick={(event) => event.stopPropagation()}>
    <header className="visit-calendar-header"><div><span>매장 방문 예약</span></div><button className="close-btn" onClick={onClose} aria-label="방문 예약 닫기"><X size={17} /></button></header>
    <div className="korean-calendar-card"><div className="korean-calendar-month"><button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">‹</button><strong>{year}년 {month}월</strong><button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">›</button></div><div className="korean-calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((label, index) => <span key={label} className={index === 0 ? "sunday" : index === 6 ? "saturday" : ""}>{label}</span>)}</div><div className="korean-calendar-grid">{Array.from({ length: firstWeekday }, (_, index) => <i key={`empty-${index}`} />)}{days.map((day) => { const key = dateKeyFromParts(year, month, day); const dayOfWeek = new Date(`${key}T00:00:00Z`).getUTCDay(); const holiday = holidayForDay(key); const available = dateIsOpen(key); return <button type="button" key={key} disabled={!available} className={`${dayOfWeek === 0 || holiday ? "holiday" : dayOfWeek === 6 ? "saturday" : ""} ${selectedDate === key ? "selected" : ""} ${!available ? "disabled" : ""}`} onClick={() => setSelectedDate(key)}><span>{day}</span>{holiday && <small>{holiday.replace("대체공휴일", "대체")}</small>}</button>; })}</div></div>
    <p className="visit-period-note">쿠폰 마감일: <b>~ {expiryEndDateKey(coupon)}까지</b></p>
    <div className="visit-selection-row"><label className="visit-select-field"><span><Clock3 size={15} /> 방문 시간 <em>30분 단위</em></span><select value={pickupTime} disabled={!selectedDateAvailable || timeEntries.length === 0} onChange={(event) => setPickupTime(event.target.value)} aria-label="방문 시간 선택"><option value="" disabled>시간 선택</option>{timeEntries.map((entry) => <option key={entry.label} value={entry.label}>{entry.displayLabel}</option>)}</select></label><label className="visit-select-field"><span><Users size={15} /> 방문 인원</span><input className="visit-party-input" type="number" min="1" max="99" inputMode="numeric" list="visit-party-options" placeholder="인원 입력" value={partySize} onChange={(event) => setPartySize(event.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="방문 인원 직접 입력" /><datalist id="visit-party-options"><option value="1" label="1명" /><option value="2" label="2명" /><option value="3" label="3명" /><option value="4" label="4명" /><option value="5" label="5명 이상" /></datalist></label></div>
    {selectedDateAvailable && timeEntries.length === 0 && <div className="schedule-time-empty">매장 운영시간에 예약 가능한 시간이 없습니다.</div>}{!hasAvailableDates && <div className="schedule-closed-notice">이번 달에는 쿠폰 사용 기간과 영업일이 겹치는 날짜가 없습니다.</div>}
    <div className="reservation-phone-consent">
      <label><input type="checkbox" checked={phoneShareAgreed} onChange={(event) => setPhoneShareAgreed(event.target.checked)} /><span><b>[필수]</b> 예약 확인을 위한 전화번호 제공에 동의합니다.</span></label>
    </div>
    <div className="visit-calendar-confirm"><div><span>선택 일정</span><b>{canSubmit ? `${visitDate} · ${pickupTime} · ${partyLabel}` : "날짜와 시간·인원을 선택해 주세요"}</b></div><button className="wide-orange reservation-submit-btn" disabled={!canConfirm} onClick={() => onConfirm(visitDate, selectedDate, pickupTime, partyLabel, phoneShareAgreed)}>예약 완료하기 <ArrowRight size={16} /></button></div>
  </section></div>;
}
type MediaViewerItem = { store: string; title: string; image: string; imageSources?: string[]; videoUrl?: string; mediaType?: string; mediaItems?: ConsumerCouponDto["mediaItems"]; latitude?: number; longitude?: number; actionLabel: string; onAction: () => void; kind: "coupon" | "experience"; locationText: string; originalPrice?: number; salePrice?: number; discountRate?: number; discountLabel?: string; benefit?: string; isOwned?: boolean };
type StoreMapItem = { store: string; address: string; distance: string; latitude?: number; longitude?: number };
function StoreMapModal({ item, onClose }: { item: StoreMapItem; onClose: () => void }) {
  const hasCoordinates = item.latitude !== undefined && item.longitude !== undefined && Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
  const encodedAddress = encodeURIComponent(item.address);
  const kakao = hasCoordinates ? `https://map.kakao.com/link/to/${encodeURIComponent(item.store)},${item.latitude},${item.longitude}` : `https://map.kakao.com/?q=${encodedAddress}`;
  const naver = hasCoordinates ? `https://m.map.naver.com/route.nhn?menu=route&ename=${encodeURIComponent(item.store)}&lat=${item.latitude}&lng=${item.longitude}` : `https://map.naver.com/p/search/${encodedAddress}`;
  const roads = item.address.match(/[가-힣0-9]+(?:대로|로|길)/g) ?? [];
  return <div className="store-map-overlay" role="dialog" aria-modal="true" aria-label={`${item.store} 매장 위치`} onClick={onClose}><section className="store-map-fullscreen" onClick={(event) => event.stopPropagation()}><header><button type="button" className="store-map-back" onClick={onClose} aria-label="매장 위치에서 뒤로가기"><ArrowLeft size={19} /><span>뒤로가기</span></button><div><b>{item.store}</b><span>{item.address}</span><small>{item.distance}</small></div></header><div className="store-map-canvas">{hasCoordinates ? <><div className="map-road map-road-a" /><div className="map-road map-road-b" /><div className="map-road map-road-c" /><div className="store-map-pin"><MapPin size={25} /><span>매장 좌표</span></div><div className="map-label map-label-a">{roads[0] ?? "주변 도로"}</div><div className="map-label map-label-b">{roads[1] ?? "매장 주변"}</div></> : <div className="store-map-address-only"><MapPin size={25} /><strong>매장 좌표가 등록되지 않았습니다</strong><span>주소를 기준으로 외부 지도에서 위치를 확인할 수 있습니다.</span></div>}</div><div className="store-map-actions"><a href={kakao} target="_blank" rel="noreferrer">카카오맵으로 열기</a><a href={naver} target="_blank" rel="noreferrer">네이버 지도로 열기</a></div></section></div>;
}
function MediaViewer({ item, onClose, onOpenMap, onToast }: { item: MediaViewerItem; onClose: () => void; onOpenMap: (item: StoreMapItem) => void; onToast: (message: string) => void }) {
  const [slide, setSlide] = useState(0);
  const [copied, setCopied] = useState(false);
  const fallbackMedia = item.mediaType === "video" && item.videoUrl
    ? { id: "legacy-video", kind: "video" as const, name: item.title, url: item.videoUrl, posterUrl: item.image }
    : { id: "legacy-image", kind: "image" as const, name: item.title, url: item.image, posterUrl: item.image };
  const mergedGallery = mergeCouponMediaItems(item.mediaItems, item.imageSources ?? [item.image], item.videoUrl, item.image, item.title);
  const gallery: NonNullable<ConsumerCouponDto["mediaItems"]> = mergedGallery.length ? mergedGallery : [fallbackMedia];
  const current = gallery[Math.min(slide, gallery.length - 1)] ?? fallbackMedia;
  const isVideo = current.kind === "video";
  const original = item.originalPrice ?? 0;
  const sale = item.salePrice ?? 0;
  const rate = item.discountRate ?? 0;
  return <div className="media-viewer-overlay" role="dialog" aria-modal="true" aria-label={`${item.store} ${item.title} 미디어 보기`} onClick={onClose}><section className="media-viewer-sheet" onClick={(event) => event.stopPropagation()}>
    <header className="media-viewer-header"><div><b>{item.store}</b><span>{item.title}</span></div><button type="button" onClick={onClose} aria-label="미디어 뷰어 닫기"><X size={20} /></button></header>
    <div className="media-viewer-stage">{isVideo ? <video key={current.id} src={current.url} poster={current.posterUrl ?? item.image} controls autoPlay playsInline aria-label={`${item.store} ${item.title} 동영상`} /> : <CouponMediaImage key={current.id} sources={[current.url, current.posterUrl, item.image, ...(item.imageSources ?? [])]} alt={`${item.store} ${item.title} ${current.name} 미디어`} />}{gallery.length > 1 && <><button type="button" className="media-viewer-prev" onClick={() => setSlide((value) => (value - 1 + gallery.length) % gallery.length)} aria-label="이전 미디어"><ArrowLeft size={18} /></button><button type="button" className="media-viewer-next" onClick={() => setSlide((value) => (value + 1) % gallery.length)} aria-label="다음 미디어"><ArrowRight size={18} /></button></>}</div>
    <div className="media-viewer-info"><div className="media-viewer-location"><MapPin size={15} /><span>{item.locationText}</span></div><div className="media-viewer-location-actions"><button type="button" onClick={async () => { try { await navigator.clipboard?.writeText(item.locationText.split(" (도보")[0]); } catch {} setCopied(true); onToast("주소가 복사되었습니다"); window.setTimeout(() => setCopied(false), 1600); }}><Copy size={12} /> {copied ? "복사됨" : "주소 복사"}</button><button type="button" onClick={() => onOpenMap({ store: item.store, address: item.locationText.split(" (도보")[0], distance: item.locationText.includes(" (도보") ? `도보 ${item.locationText.split(" (도보")[1].replace(")", "")}` : "거리 정보 없음", latitude: item.latitude, longitude: item.longitude })}><MapPin size={12} /> 매장 위치</button><a href={`https://m.map.naver.com/route.nhn?menu=route&ename=${encodeURIComponent(item.store)}`} target="_blank" rel="noreferrer"><Navigation size={12} /> 빠른 길안내</a></div>{item.kind === "coupon" ? <div className="media-viewer-price"><span className="media-viewer-original">정상가 {original.toLocaleString()}원</span><b>{item.discountLabel ?? `${rate}% 할인`}</b><strong>{sale === 0 ? "0원 (무료)" : `${sale.toLocaleString()}원`}</strong></div> : <div className="media-viewer-benefit"><Gift size={15} /><span>제공 혜택</span><strong>{item.benefit}</strong></div>}</div>
    {gallery.length > 1 && <div className="media-viewer-caption"><span>{slide + 1} / {gallery.length}</span></div>}
    {item.kind === "coupon" ? (item.isOwned ? null : <div className="media-viewer-action-grid"><button type="button" className="media-viewer-action-button media-viewer-close-action" onClick={onClose}>닫기</button><button type="button" className="media-viewer-action-button media-viewer-action" onClick={() => { item.onAction(); onClose(); }}>쿠폰 받기</button></div>) : <button type="button" className="media-viewer-action" onClick={() => { item.onAction(); onClose(); }}>{item.actionLabel}</button>}
  </section></div>;
}
function couponMediaViewerItem(coupon: Coupon, options: { actionLabel: string; onAction: () => void; isOwned?: boolean }): MediaViewerItem {
  const pricing = couponPriceDisplay(coupon);
  const imageSources = couponImageSourceCandidates(coupon);
  return {
    store: coupon.store, title: coupon.title, image: imageSources[0] ?? couponMediaImageFor(coupon.store, coupon.category), imageSources,
    videoUrl: coupon.videoUrl, mediaType: coupon.mediaType, mediaItems: coupon.mediaItems,
    latitude: coupon.latitude, longitude: coupon.longitude,
    kind: "coupon", locationText: coupon.storeAddress ?? coupon.address, originalPrice: pricing.originalPrice, salePrice: pricing.salePrice,
    discountRate: coupon.discountValue, discountLabel: pricing.discountLabel, benefit: coupon.description, actionLabel: options.actionLabel,
    onAction: options.onAction, isOwned: options.isOwned,
  };
}
function CouponCard({ coupon, onSelect, onIssue, onOpenMedia, issued, isPremium, isFavorite = false, onToggleFavorite = () => {} }: { coupon: Coupon; onSelect: () => void; onIssue: () => void; onOpenMedia: () => void; onOpenMap: (item: StoreMapItem) => void; issued: boolean; isPremium: boolean; isFavorite?: boolean; onToggleFavorite?: () => void }) {
  const [localFavorite, setLocalFavorite] = useState(isFavorite);
  useEffect(() => setLocalFavorite(isFavorite), [isFavorite]);
  const memberOnly = isVipOnlyCoupon(coupon);
  const soldOut = coupon.remaining <= 0;
  const { originalPrice, salePrice, discountLabel } = couponPriceDisplay(coupon);
  const ddayLabel = couponDdayLabel(coupon);
  const neighborhood = coupon.address.split(" ").find((part) => part.endsWith("동")) ?? "내 동네";
  return <article className={`coupon-card ${soldOut ? "sold-out" : ""}`} style={{ "--coupon-bg": coupon.color, "--coupon-ink": coupon.accent } as React.CSSProperties} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(); }}>
    <div className="coupon-thumb" role="button" tabIndex={0} aria-label={`${coupon.store} 대표 이미지 사진·영상 보기`} onClick={(event) => { event.stopPropagation(); onOpenMedia(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onOpenMedia(); } }}><CouponMediaImage sources={couponImageSources(coupon)} alt={`${coupon.store} 대표 이미지`} />{(coupon.mediaType === "video" || Boolean(coupon.videoUrl)) && <i className="coupon-media-play" aria-hidden="true">▶</i>}<button type="button" className={`coupon-favorite-button thumbnail-favorite-button ${localFavorite ? "active" : ""}`} aria-label={localFavorite ? `${coupon.store} 찜 해제` : `${coupon.store} 찜하기`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setLocalFavorite((current) => !current); onToggleFavorite(); }}><Star className={`favorite-star-icon ${localFavorite ? "active" : ""}`} size={16} fill="currentColor" aria-hidden="true" /></button></div>
    <div className="coupon-body">
      <div className="coupon-meta"><span className="coupon-store-name">{coupon.store}</span>{memberOnly && <b className={`coupon-eligibility ${isPremium ? "premium-unlocked" : ""}`}>{isPremium ? "정회원" : "정회원 전용"}</b>}{ddayLabel && <span className="coupon-dday-badge" aria-label={`쿠폰 종료 ${ddayLabel}`}>{ddayLabel}</span>}</div>
      <h3 className="coupon-title">{coupon.title}</h3>
      <div className="coupon-price-row">{originalPrice !== undefined && originalPrice > salePrice && <del>{originalPrice.toLocaleString("ko-KR")}원</del>}<strong>{salePrice === 0 ? "무료" : `${salePrice.toLocaleString("ko-KR")}원`}</strong><em>{discountLabel}</em></div>
      <div className="coupon-card-bottom"><button type="button" className="coupon-download-action" onClick={(event) => { event.stopPropagation(); if (!issued && !soldOut) onIssue(); }} disabled={issued || soldOut}>{issued ? "보유중" : soldOut ? "마감" : "쿠폰받기"}</button></div>
    </div>
  </article>;
}
function WalletMediaCard({ coupon, title, subtitle, status, statusClass = "", actionLabel = "매장 확인", actionClassName = "", onAction, secondaryActionLabel, onSecondaryAction, onOpenMedia, onOpenDetail, dimmed = false, deleteAction, reviewAction, cancelAction, cancelActionPosition = "meta", cancelActionLabel = "보유 취소" }: {
  coupon: Coupon;
  title: string;
  subtitle: string;
  status: string;
  statusClass?: string;
  actionLabel?: string;
  actionClassName?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onOpenMedia: () => void;
  onOpenDetail?: () => void;
  dimmed?: boolean;
  deleteAction?: () => void;
  reviewAction?: () => void;
  cancelAction?: () => void;
  cancelActionPosition?: "meta" | "actions";
  cancelActionLabel?: string;
}) {
  const pricing = couponPriceDisplay(coupon);
  const merchantPhone = merchantPhoneFor(coupon);
  return (
    <article className={`wallet-media-card ${dimmed ? "dimmed" : ""}`} onClick={() => onOpenDetail?.()} role={onOpenDetail ? "button" : undefined} tabIndex={onOpenDetail ? 0 : undefined}>
      <button type="button" className="wallet-media-thumb" aria-label={`${coupon.store} 대표 이미지 사진·영상 보기`} onClick={onOpenMedia}>
        <CouponMediaImage sources={couponImageSources(coupon)} alt={`${coupon.store} 대표 이미지`} />
        {(coupon.mediaType === "video" || Boolean(coupon.videoUrl)) && <i aria-hidden="true">▶</i>}
      </button>
      <div className="wallet-media-content">
        <div className="wallet-media-meta">
          <strong>{coupon.store}</strong>
          {couponDdayLabel(coupon) && <span className="coupon-dday-badge" aria-label={`쿠폰 종료 ${couponDdayLabel(coupon)}`}>{couponDdayLabel(coupon)}</span>}
          {cancelAction && cancelActionPosition !== "actions" && <button type="button" className="wallet-cancel-action" onClick={(event) => { event.stopPropagation(); cancelAction(); }}>{cancelActionLabel}</button>}
        </div>
        <h3>{title}</h3>
        <div className="wallet-media-price">
          {pricing.originalPrice !== undefined && pricing.originalPrice > pricing.salePrice && <del>{pricing.originalPrice.toLocaleString("ko-KR")}원</del>}
          <strong>{pricing.salePrice === 0 ? "무료" : `${pricing.salePrice.toLocaleString("ko-KR")}원`}</strong>
          <em>{pricing.discountLabel}</em>
        </div>
        <div className={`wallet-media-bottom ${reviewAction ? "has-review-action" : ""}`}>
          {subtitle && <span className={coupon.remaining <= 3 ? "wallet-low-stock" : ""}>{subtitle}</span>}
          <div className={`wallet-card-actions ${reviewAction ? "has-review-action" : ""} ${cancelAction && cancelActionPosition === "actions" ? "has-cancel-action" : ""}`}>
            {merchantPhone ? <a href={phoneHref(merchantPhone)} className="wallet-mini-call" aria-label={`${coupon.store} 전화문의`} onClick={(event) => event.stopPropagation()}><Phone size={14} aria-hidden="true" /></a> : <button type="button" className="wallet-mini-call" aria-label={`${coupon.store} 전화번호 없음`} title="등록된 매장 전화번호가 없습니다" disabled><Phone size={14} aria-hidden="true" /></button>}
            {reviewAction ? (
              <div className="wallet-review-delete-actions">
                <button type="button" className="wallet-review-action" onClick={(event) => { event.stopPropagation(); reviewAction(); }}>리뷰 달기</button>
                {deleteAction && <button type="button" className="wallet-delete-action" onClick={(event) => { event.stopPropagation(); deleteAction(); }}><Trash2 size={12} /> 삭제</button>}
              </div>
            ) : deleteAction ? (
              <button type="button" className="wallet-delete-action" onClick={(event) => { event.stopPropagation(); deleteAction(); }}><Trash2 size={12} /> 삭제</button>
            ) : (
              <>
                {onSecondaryAction && <button type="button" className="wallet-reserve-action" onClick={(event) => { event.stopPropagation(); onSecondaryAction(); }}>{secondaryActionLabel}</button>}
                <div className="wallet-primary-actions">
                  <button type="button" className={`wallet-detail-action ${actionClassName}`} onClick={(event) => { event.stopPropagation(); onAction?.(); }}>{actionLabel}</button>
                  {cancelAction && cancelActionPosition === "actions" && <button type="button" className="wallet-cancel-action" onClick={(event) => { event.stopPropagation(); cancelAction(); }}>{cancelActionLabel}</button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
function CouponBox({ status, coupon, historyKey, onDelete, onOpenMedia, onOpenDetail, onAction, onReserve, onReview, onCancel }: {
  status: "보유" | "사용" | "만료";
  coupon?: Coupon;
  historyKey?: string;
  onDelete?: () => void;
  onOpenMedia: () => void;
  onOpenDetail?: () => void;
  onAction?: () => void;
  onReserve?: (record: IssuedCouponRecord) => void;
  onReview?: () => void;
  onCancel?: () => void;
}) {
  const labels = { 보유: "사용 가능한 쿠폰", 사용: "사용 완료 쿠폰", 만료: "기간이 지난 쿠폰" };
  const locationCoupon = coupon ?? coupons[status === "보유" ? 0 : status === "사용" ? 1 : 3];
  const subtitle = status === "보유" ? "" : `${labels[status]} · ${locationCoupon.usage_type === "매장 방문" ? "매장 방문" : locationCoupon.usage_type === "예약 필수" ? "예약" : "방문"}`;
  const previewRecord: IssuedCouponRecord = { coupon: locationCoupon, visitDate: "방문 예정 없음", dateKey: simulatedToday, pickupTime: "미정", partySize: "1명", status: "ACTIVE", userCouponId: `preview-${locationCoupon.id}` };
  return <WalletMediaCard coupon={locationCoupon} title={locationCoupon.title} subtitle={subtitle} status={status === "보유" ? "사용 가능" : status === "사용" ? "사용 완료" : "만료"} statusClass={status === "보유" ? "available" : "history"} actionLabel="매장 확인" onAction={onAction} secondaryActionLabel="방문 예약" onSecondaryAction={status === "보유" && onReserve ? () => onReserve(previewRecord) : undefined} cancelAction={status === "보유" ? onCancel : undefined} cancelActionPosition="actions" onOpenMedia={onOpenMedia} onOpenDetail={onOpenDetail} dimmed={status !== "보유"} deleteAction={onDelete} reviewAction={status === "사용" ? onReview : undefined} />;
}
function IssuedCouponBox({ record, onBarcode, onReserve, onOpenReservationChat, onCancel, onOpenMedia, onOpenDetail }: { record: IssuedCouponRecord; onBarcode: () => void; onReserve: () => void; onOpenReservationChat: () => void; onCancel?: () => void; onOpenMedia: () => void; onOpenDetail?: () => void }) { const reserved = record.pickupTime !== "미정" && record.visitDate !== "방문 예정 없음"; const reservationLabel = reserved ? `${record.dateKey.replaceAll("-", ".")} ${record.pickupTime} 예약 완료` : ""; return <WalletMediaCard coupon={record.coupon} title={record.coupon.title} subtitle={reservationLabel} status={reserved ? "예약 완료" : "사용 가능"} statusClass={reserved ? "confirmed" : "available"} actionLabel="매장 확인" onAction={onBarcode} secondaryActionLabel={reserved ? "1:1 채팅" : "방문 예약"} onSecondaryAction={reserved ? onOpenReservationChat : onReserve} cancelAction={onCancel} cancelActionPosition="actions" onOpenMedia={onOpenMedia} onOpenDetail={onOpenDetail} />; }
function ReturnedCouponBox({ record, onDelete, onOpenMedia, onOpenDetail, onReview }: {
  record: IssuedCouponRecord;
  onDelete: () => void;
  onOpenMedia: () => void;
  onOpenDetail?: () => void;
  onReview?: () => void;
}) {
  const used = canReviewCompletedCoupon(record);
  return <WalletMediaCard coupon={record.coupon} title={record.coupon.title} subtitle={used ? `사용 완료 · ${record.usedAt}` : "기한 만료 / 회수됨 · 재고 +1"} status={used ? "사용 완료" : "회수됨"} statusClass="history" onOpenMedia={onOpenMedia} dimmed deleteAction={onDelete} reviewAction={used ? onReview : undefined} onOpenDetail={onOpenDetail} />;
}
type CampaignApplication = {
  id: string;
  campaignId: number;
  store: string;
  title: string;
  benefit: string;
  art: string;
  tone: string;
  image?: string;
  channels: string;
  visitDate: string;
  visitTime: string;
  promise: string;
  status: "WAITING" | "SELECTED" | "NOT_SELECTED";
  centralCampaignId?: string;
  centralApplicationId?: string;
};
function UnifiedPendingCouponCard({ coupon }: { coupon: Coupon }) { const [copied, setCopied] = useState(false); const address = "서울 강남구 테헤란로 118, 1층"; const mapQuery = encodeURIComponent(address); const copyAddress = async () => { try { await navigator.clipboard?.writeText(address); } catch { /* clipboard may be unavailable in preview */ } setCopied(true); window.setTimeout(() => setCopied(false), 1800); }; return <article className="unified-pending-card"><div className="unified-pending-head"><div className="unified-pending-title"><span className="unified-pending-icon" aria-hidden="true"><Ticket size={18} /></span><div><strong>그레이스 커피 로스터스</strong><span>아메리카노 1잔 무료</span></div></div><div className="unified-pending-status"><b>대기 중</b><span>15분 후 픽업 예정</span></div></div><div className="unified-pending-location"><div className="unified-pending-address"><span>도보 4분(280m) · {address}</span><button type="button" onClick={copyAddress}><Copy size={12} /> {copied ? "복사됨" : "주소 복사"}</button></div><div className="unified-pending-actions"><button type="button" onClick={() => window.alert("그레이스 커피 로스터스 위치 정보를 확인합니다.")}><MapPin size={13} /> 매장 위치 보기</button><a href={`https://map.naver.com/p/search/${mapQuery}`} target="_blank" rel="noreferrer"><Navigation size={13} /> 빠른 길안내</a></div></div></article>; }

function UnifiedConfirmedCouponCard({ coupon }: { coupon: Coupon }) { const [copied, setCopied] = useState(false); const address = "서울 강남구 역삼로 158, B1"; const mapQuery = encodeURIComponent(address); const copyAddress = async () => { try { await navigator.clipboard?.writeText(address); } catch { /* clipboard may be unavailable in preview */ } setCopied(true); window.setTimeout(() => setCopied(false), 1800); }; return <article className="unified-pending-card unified-confirmed-card"><div className="unified-pending-head"><div className="unified-pending-title"><span className="unified-pending-icon" aria-hidden="true"><Clock3 size={19} /></span><div><strong>필라테스 체험 · 예약 확정</strong><span>모브 필라테스 · 내일 14:00 · 1인</span></div></div><div className="unified-pending-status confirmed"><b>확정</b></div></div><div className="unified-pending-location"><div className="unified-pending-address"><span>도보 13분(850m) · {address}</span><button type="button" onClick={copyAddress}><Copy size={12} /> {copied ? "복사됨" : "주소 복사"}</button></div><div className="unified-pending-actions"><button type="button" onClick={() => window.alert("모브 필라테스 위치 정보를 확인합니다.")}><MapPin size={13} /> 매장 위치 보기</button><a href={`https://map.naver.com/p/search/${mapQuery}`} target="_blank" rel="noreferrer"><Navigation size={13} /> 빠른 길안내</a></div></div></article>; }

function CouponWallet({ issuedCoupons, sharedWalletRecords = [], returnedCoupons, favoriteStores = [], favoriteCouponIds = [], favoriteCampaigns = [], onToggleFavoriteCampaign, onBarcode, onReserve, onOpenReservationChat, onIssue, onRemoveFavorite, onReturn, onToast, applications, onUpdateApplication, onCancelApplication, historyRequest, initialStatusRequest, deletedHistoryKeys, onDeleteHistory, onOpenMedia, onOpenDetail, onOpenReview, onOpenChat }: { issuedCoupons: IssuedCouponRecord[]; sharedWalletRecords?: IssuedCouponRecord[]; returnedCoupons: IssuedCouponRecord[]; favoriteStores?: string[]; favoriteCouponIds?: number[]; favoriteCampaigns?: Campaign[]; onToggleFavoriteCampaign: (campaign: Campaign) => void; onBarcode: (record: IssuedCouponRecord) => void; onReserve: (record: IssuedCouponRecord) => void; onOpenReservationChat: (record: IssuedCouponRecord) => void; onIssue: (coupon: Coupon, onSuccess?: () => void) => void; onRemoveFavorite: (coupon: Coupon) => void; onReturn: (record: IssuedCouponRecord, status?: CouponStatus, returnReason?: "CANCELLED" | "EXPIRED") => void; onToast: (message: string) => void; applications: CampaignApplication[]; onUpdateApplication?: (application: CampaignApplication) => void; onCancelApplication: (applicationId: string) => void; historyRequest: number; initialStatusRequest: number; deletedHistoryKeys: string[]; onDeleteHistory: (keys: string[]) => void; onOpenMedia: (coupon: Coupon) => void; onOpenDetail: (coupon: Coupon) => void; onOpenReview: (coupon: Coupon, claimKey: string) => void; onOpenChat: (application: CampaignApplication) => void }) { const [status, setStatus] = useState<"사용 가능" | "찜 매장" | "사용 완료/만료" | "체험단 내역">("사용 가능"); const [cancelledPreviewCouponIds, setCancelledPreviewCouponIds] = useState<number[]>([]); const tabs: typeof status[] = ["사용 가능", "찜 매장", "체험단 내역", "사용 완료/만료"]; const recordKey = (record: IssuedCouponRecord) => `returned-${record.coupon.id}-${record.dateKey}`; const walletProjection = reconcileCouponWalletRecords(issuedCoupons, sharedWalletRecords, returnedCoupons); const visibleReturnedCoupons = walletProjection.historyRecords.filter((record) => !deletedHistoryKeys.includes(recordKey(record))).sort((left, right) => Number(left.returnReason === "CANCELLED") - Number(right.returnReason === "CANCELLED")); const staticHistoryKeys = ["static-used-lunch", "static-expired-pilates"]; const visibleStaticHistory = staticHistoryKeys.filter((key) => !deletedHistoryKeys.includes(key)); const historyCount = visibleReturnedCoupons.length + visibleStaticHistory.length; const favoriteCoupons = coupons.filter((coupon) => favoriteCouponIds.includes(coupon.id)); const previewWalletCoupons = [coupons[0], coupons[2]].filter((coupon) => !cancelledPreviewCouponIds.includes(coupon.id)); const cancelPreviewCoupon = (coupon: Coupon) => { setCancelledPreviewCouponIds((current) => current.includes(coupon.id) ? current : [...current, coupon.id]); onToast("보유가 취소되었습니다."); }; const counts = { available: walletProjection.activeRecords.length + previewWalletCoupons.length, favorites: favoriteCoupons.length + favoriteCampaigns.length, completed: historyCount, history: applications.length + 3 }; useEffect(() => { if (historyRequest > 0) setStatus("체험단 내역"); }, [historyRequest]); useEffect(() => { if (initialStatusRequest > 0 && historyRequest === 0) setStatus("사용 완료/만료"); }, [initialStatusRequest, historyRequest]); const countFor = (tab: typeof status) => tab === "사용 가능" ? counts.available : tab === "찜 매장" ? counts.favorites : tab === "사용 완료/만료" ? counts.completed : counts.history; const requestDelete = (key: string) => { onDeleteHistory([key]); }; const availableIssuedRecords = walletProjection.activeRecords.map((record, index) => ({ record, index })).sort((left, right) => (right.record.issuedAt ?? 0) - (left.record.issuedAt ?? 0) || right.index - left.index).map(({ record }) => record); const previewRecord = (coupon: Coupon): IssuedCouponRecord => ({ coupon, visitDate: "2026년 10월 3일(토)", dateKey: simulatedToday, pickupTime: "11:30", partySize: "1명", status: "ACTIVE" }); const clearHistory = () => { if (!historyCount) return; onDeleteHistory([...visibleReturnedCoupons.map(recordKey), ...visibleStaticHistory]); }; return <><div className="wallet-tabs wallet-minimal-tabs" aria-label="쿠폰함 필터">{tabs.map((tab) => { const label = tab === "사용 가능" ? "사용 가능" : tab === "찜 매장" ? "찜 매장" : tab === "사용 완료/만료" ? "사용 완료" : "체험단"; return <button key={tab} type="button" className={status === tab ? "active" : ""} onClick={() => setStatus(tab)}>{label} <b>{countFor(tab)}</b></button>; })}</div>{status === "체험단 내역" ? <CampaignHistory applications={applications} onUpdateApplication={onUpdateApplication} onCancelApplication={onCancelApplication} onToast={onToast} onOpenChat={onOpenChat} /> : <>{status === "찜 매장" && <>{favoriteCoupons.map((coupon) => { const isOwned = issuedCoupons.some((record) => record.coupon.id === coupon.id); return <WalletMediaCard key={`favorite-${coupon.id}`} coupon={coupon} title={coupon.title} subtitle={`${coupon.store} · 관심 매장`} status="찜 매장" actionLabel={isOwned ? "보유중" : "쿠폰받기"} actionClassName="favorite-issue-action" cancelAction={() => { onRemoveFavorite(coupon); onToast("찜 매장에서 삭제되었습니다."); }} cancelActionLabel="찜 해제" onAction={() => { if (isOwned) { setStatus("사용 가능"); onToast("이미 쿠폰함에 보관된 쿠폰입니다."); return; } onIssue(coupon, () => { setStatus("사용 가능"); onToast("쿠폰이 발급되었습니다! '사용 가능' 탭에서 확인하세요."); }); }} onOpenMedia={() => onOpenMedia(coupon)} onOpenDetail={() => onOpenDetail(coupon)} />; })}{favoriteCampaigns.map((campaign) => <WalletFavoriteCampaignCard key={campaignFavoriteKey(campaign)} campaign={campaign} onToggleFavorite={onToggleFavoriteCampaign} />)}{!favoriteCoupons.length && !favoriteCampaigns.length && <div className="history-empty"><Heart size={22} /><b>찜한 매장이 없어요</b><span>홈에서 하트 버튼을 눌러 관심 매장을 저장해 보세요.</span></div>}</>}{status === "사용 가능" && <>{availableIssuedRecords.map((record, index) => <IssuedCouponBox key={`issued-${record.userCouponId ?? record.coupon.id}-${index}`} record={record} onBarcode={() => onBarcode(record)} onReserve={() => onReserve(record)} onOpenReservationChat={() => onOpenReservationChat(record)} onCancel={() => { void onReturn(record, "EXPIRED", "CANCELLED"); }} onOpenMedia={() => onOpenMedia(record.coupon)} onOpenDetail={() => onOpenDetail(record.coupon)} />)}{previewWalletCoupons.map((coupon) => <CouponBox key={`preview-${coupon.id}`} status="보유" coupon={coupon} onOpenMedia={() => onOpenMedia(coupon)} onOpenDetail={() => onOpenDetail(coupon)} onAction={() => onBarcode(previewRecord(coupon))} onReserve={onReserve} onCancel={() => cancelPreviewCoupon(coupon)} />)}</>}{status === "사용 완료/만료" && <><div className="wallet-section-label"><Check size={15} /> 사용 내역</div><div className="wallet-history-head"><button type="button" onClick={clearHistory} disabled={!historyCount}><Trash2 size={13} /> 완료 내역 모두 비우기</button></div>{visibleReturnedCoupons.map((record) => <ReturnedCouponBox key={recordKey(record)} record={record} onDelete={() => requestDelete(recordKey(record))} onOpenMedia={() => onOpenMedia(record.coupon)} onOpenDetail={() => onOpenDetail(record.coupon)} onReview={() => onOpenReview(record.coupon, record.userCouponId ?? `returned-${record.coupon.id}-${record.dateKey}`)} />)}{!deletedHistoryKeys.includes("static-used-lunch") && <CouponBox status="사용" coupon={coupons[1]} historyKey="static-used-lunch" onOpenDetail={() => onOpenDetail(coupons[1])} onDelete={() => requestDelete("static-used-lunch")} onOpenMedia={() => onOpenMedia(coupons[1])} onReview={() => onOpenReview(coupons[1], "static-used-lunch")} />}{!deletedHistoryKeys.includes("static-expired-pilates") && <CouponBox status="만료" coupon={coupons[3]} historyKey="static-expired-pilates" onOpenDetail={() => onOpenDetail(coupons[3])} onDelete={() => requestDelete("static-expired-pilates")} onOpenMedia={() => onOpenMedia(coupons[3])} />}{!historyCount && <div className="history-empty"><Check size={22} /><b>정리된 내역이 없어요</b><span>사용 완료·만료 쿠폰이 여기에 보관됩니다.</span></div>}</>}</>}</>};
const campaignHistoryImages = {
  coffee: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=700&q=85",
  pilates: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=700&q=85",
  beauty: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=700&q=85",
} as const;
function campaignHistoryImageFor(title: string) { if (/필라테스|PT/.test(title)) return campaignHistoryImages.pilates; if (/레이어|케어|뷰티/.test(title)) return campaignHistoryImages.beauty; return campaignHistoryImages.coffee; }
function CampaignMediaThumb({ image, label }: { image: string; label: string }) { return <div className="campaign-history-media" role="img" aria-label={`${label} 대표 사진`}><CouponMediaImage sources={[image]} alt={`${label} 대표 사진`} /></div>; }
function CampaignHistoryCard({ image, title, subtitle, statusClass, status, children, action }: { image: string; title: string; subtitle: string; statusClass: string; status: string; children?: React.ReactNode; action?: React.ReactNode }) { return <article className="campaign-history-card submitted-history-card"><CampaignMediaThumb image={image} label={title} /><div className="campaign-history-card-content"><div className="campaign-history-card-head"><div><strong>{title}</strong><span>{subtitle}</span></div><b className={`campaign-status ${statusClass}`}>{status}</b></div>{children}{action}</div></article>; }
function CampaignHistory({ applications, onUpdateApplication: _onUpdateApplication, onCancelApplication, onToast, onOpenChat }: { applications: CampaignApplication[]; onUpdateApplication?: (application: CampaignApplication) => void; onCancelApplication: (applicationId: string) => void; onToast: (message: string) => void; onOpenChat: (application: CampaignApplication) => void }) { const [completedStaticHistory, setCompletedStaticHistory] = useState(false); const [cancelledStaticHistory, setCancelledStaticHistory] = useState(false); const statusLabel = { WAITING: "선정 대기중", SELECTED: "선정 완료", NOT_SELECTED: "미선정" }; return <><div className="wallet-section-label"><Users size={12} /> 체험단 신청내역</div>{applications.map((application) => { const title = `${application.store} ${application.title}`; return <CampaignHistoryCard key={application.id} image={application.image ?? campaignHistoryImageFor(title)} title={title} subtitle={application.benefit} statusClass={application.status.toLowerCase()} status={statusLabel[application.status]}><div className="campaign-history-details"><div><span>방문 희망 일시</span><b>{application.visitDate} {application.visitTime}</b></div><div><span>제출 채널</span><b>{application.channels}</b></div><div><span>지원 각오</span><b>{application.promise || "정성껏 체험하고 진짜 후기를 남길게요."}</b></div></div>{application.status === "SELECTED" ? <div className="campaign-history-actions"><button className="chat-btn" type="button" onClick={() => onOpenChat(application)}><Send size={16} aria-hidden="true" /> <span>1:1 채팅 문의</span></button></div> : application.status === "WAITING" && <div className="campaign-history-actions"><button type="button" onClick={() => { onCancelApplication(application.id); onToast("체험단 신청이 취소되었습니다."); }}>신청 취소</button></div>}</CampaignHistoryCard>; })}{!cancelledStaticHistory && <CampaignHistoryCard image={campaignHistoryImages.coffee} title="그레이스 커피 신메뉴 2인 체험단" subtitle="50,000원 상당 2인 식사권" statusClass="waiting" status="선정 대기중"><div className="campaign-history-details"><div><span>방문 희망 일시</span><b>2026.10.06 14:00</b></div><div><span>제출 채널</span><b>인스타그램</b></div><div><span>지원 각오</span><b>정성껏 체험하고 진짜 후기를 남길게요.</b></div></div><div className="campaign-history-actions"><button type="button" onClick={() => { onToast("체험단 신청이 취소되었습니다."); setCancelledStaticHistory(true); }}>신청 취소</button></div></CampaignHistoryCard>}<CampaignHistoryCard image={campaignHistoryImages.pilates} title="모브 필라테스 체험" subtitle="80,000원 상당 개인 레슨 1회" statusClass="selected" status="선정 완료" action={<button className="chat-btn" type="button" onClick={() => onOpenChat({ id: "static-selected-pilates", campaignId: 2, store: "모브 필라테스", title: "1:1 PT 체험단", benefit: "80,000원 상당 개인 레슨 1회", art: "♧", tone: "green", image: campaignHistoryImages.pilates, channels: "인스타그램", visitDate: "2026.10.06", visitTime: "14:00", promise: "정성껏 체험하고 진짜 후기를 남길게요.", status: "SELECTED" })}><Send size={16} aria-hidden="true" /> <span>1:1 채팅 문의</span></button>} />{!completedStaticHistory && <CampaignHistoryCard image={campaignHistoryImages.beauty} title="스튜디오 레이어 케어 체험" subtitle="70,000원 상당 케어 프로그램" statusClass="upcoming" status="방문 예정" action={<button className="review-write-btn campaign-visit-complete-btn" type="button" onClick={() => { onToast("체험단 방문이 완료되었습니다!"); setCompletedStaticHistory(true); }}>체험단 방문 완료</button>} />}</>; }
type Campaign = { id: number; centralCampaignId?: string; store: string; storeCategory?: string; storeSubcategory?: string; title: string; benefit: string; mission: string; recruited: number; applicants: number; art: string; tone: string; image: string; imageSources?: string[]; videoUrl?: string; mediaType?: string; mediaItems?: ConsumerCouponDto["mediaItems"]; targetRegionCodes?: string[]; latitude?: number; longitude?: number; province: string; district: string; address: string; phone: string; distance: string; applicationEndsOn?: string | null; facilityTags?: string[]; }; const campaigns: Campaign[] = [{ id: 1, store: "그레이스 커피", storeCategory: "카페·디저트", storeSubcategory: "카페", title: "신메뉴 2인 체험단", benefit: "50,000원 상당 2인 식사권", mission: "네이버 영수증 포토리뷰 + 인스타그램 릴스 1건", recruited: 5, applicants: 18, art: "☕", tone: "orange", province: "서울특별시", district: "강남구", address: "서울특별시 강남구 테헤란로 118, 1층", phone: "02-1234-5678", distance: "도보 4분 (280m)", image: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=700&q=85" }, { id: 2, store: "모브 필라테스", storeCategory: "운동·헬스", storeSubcategory: "필라테스", title: "1:1 PT 체험단", benefit: "80,000원 상당 개인 레슨 1회", mission: "수업 인증 사진 2장 + 솔직한 후기 1건", recruited: 3, applicants: 12, art: "♧", tone: "green", province: "서울특별시", district: "강남구", address: "서울특별시 강남구 역삼로 158, B1", phone: "02-555-1580", distance: "도보 13분 (850m)", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=700&q=85" }, { id: 3, store: "스튜디오 레이어", storeCategory: "뷰티·미용", storeSubcategory: "피부관리실", title: "퍼스널 케어 체험단", benefit: "70,000원 상당 케어 프로그램", mission: "방문 전후 사진 + 인스타그램 스토리 2건", recruited: 4, applicants: 21, art: "✦", tone: "purple", province: "서울특별시", district: "강남구", address: "서울특별시 강남구 봉은사로 226, 3층", phone: "02-555-3226", distance: "도보 10분 (650m)", image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=700&q=85" }];
function CampaignComplete({ application, onClose, onViewHistory }: { application: CampaignApplication; onClose: () => void; onViewHistory: () => void }) { return <div className="overlay campaign-overlay" onClick={onClose}><section className="campaign-complete-sheet" onClick={(event) => event.stopPropagation()}><div className="campaign-complete-mark"><Check size={32} /></div><h2>체험단 신청이 완료되었습니다!</h2><p>사장님이 신청 내용을 확인하고 있어요.<br />선정 결과는 알림으로 알려드릴게요.</p><div className="campaign-complete-summary"><div><span>신청 매장</span><b>{application.store} {application.title}</b></div><div><span>희망 방문 일시</span><b>{application.visitDate} {application.visitTime}</b></div><div><span>선택 채널</span><b>{application.channels}</b></div><div><span>지원 각오</span><b>{application.promise || "정성껏 체험하고 진짜 후기를 남길게요."}</b></div></div><div className="campaign-complete-actions"><button className="wide-orange" onClick={onViewHistory}>체험단 신청내역 확인하기 <ArrowRight size={15} /></button><button className="campaign-home-btn" onClick={onClose}>홈으로 이동</button></div></section></div>; }
function CampaignApply({ campaign, onClose, onSubmit, onViewHistory }: { campaign: Campaign; onClose: () => void; onSubmit: (application: CampaignApplication) => void | Promise<CampaignApplication | void>; onViewHistory: () => void }) {
  const [step, setStep] = useState(1);
  const progressPercent = step === 1 ? 33 : step === 2 ? 66 : 100;
  const snsChannels = [
    { id: "naver", label: "네이버 블로그" },
    { id: "instagram", label: "인스타그램" },
    { id: "youtube", label: "유튜브" },
    { id: "tiktok", label: "틱톡" },
    { id: "facebook", label: "페이스북" },
    { id: "threads", label: "스레드" },
  ] as const;
  const currentYear = 2026;
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["instagram"]);
  const [otherSelected, setOtherSelected] = useState(false);
  const [otherChannel, setOtherChannel] = useState("");
  const [visitYear, setVisitYear] = useState(String(currentYear));
  const [visitMonth, setVisitMonth] = useState("10");
  const [visitDay, setVisitDay] = useState("12");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(currentYear, 9, 1));
  const [visitTime, setVisitTime] = useState("14:00");
  const [promise, setPromise] = useState("");
  const [submittedApplication, setSubmittedApplication] = useState<CampaignApplication | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const calendarDaysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const calendarLeadingEmptyDays = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const calendarDays = Array.from({ length: calendarDaysInMonth }, (_, index) => new Date(calendarYear, calendarMonthIndex, index + 1));
  const calendarMonthIsCurrent = calendarYear === today.getFullYear() && calendarMonthIndex === today.getMonth();
  const isSameCalendarDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  const selectedCalendarDate = new Date(Number(visitYear), Number(visitMonth) - 1, Number(visitDay));
  const selectCalendarDate = (date: Date) => { if (date < today) return; setVisitYear(String(date.getFullYear())); setVisitMonth(String(date.getMonth() + 1)); setVisitDay(String(date.getDate())); };
  const moveCalendarMonth = (offset: number) => { const next = new Date(calendarYear, calendarMonthIndex + offset, 1); const minimum = new Date(today.getFullYear(), today.getMonth(), 1); if (next < minimum) return; setCalendarMonth(next); };
  const timeSlots = Array.from({ length: 48 }, (_, index) => {
    const totalMinutes = index * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { value, label: value };
  });
  const formattedVisitDate = `${visitYear}.${visitMonth.padStart(2, "0")}.${visitDay.padStart(2, "0")}`;
  const toggleChannel = (id: string) => setSelectedChannels((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectedChannelLabels = [...snsChannels.filter((channel) => selectedChannels.includes(channel.id)).map((channel) => channel.label), ...(otherSelected && otherChannel.trim() ? [otherChannel.trim()] : [])].join(", ");
  const selectedChannelCount = selectedChannels.length + (otherSelected ? 1 : 0);
  const profileReady = selectedChannels.length > 0 && (!otherSelected || otherChannel.trim().length > 0);
  const applicationData = { channels: selectedChannelLabels, visitDate: formattedVisitDate, visitTime, promise };
  const goBack = () => setStep((current) => Math.max(1, current - 1));
  const submitApplication = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError("");
    const application: CampaignApplication = { id: `${campaign.id}-${Date.now()}`, campaignId: campaign.id, centralCampaignId: campaign.centralCampaignId, store: campaign.store, title: campaign.title, benefit: campaign.benefit, art: campaign.art, tone: campaign.tone, image: campaign.image, ...applicationData, status: "WAITING" };
    try {
      const saved = await onSubmit(application);
      setSubmittedApplication(saved ?? application);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "체험단 지원을 접수하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };
  if (submittedApplication) return <CampaignComplete application={submittedApplication} onClose={onClose} onViewHistory={onViewHistory} />;
  return <div className="overlay campaign-overlay" onClick={onClose}><section className="campaign-sheet" onClick={(event) => event.stopPropagation()}>
    <div className="campaign-modal-header">
      <span className="campaign-back-placeholder" aria-hidden="true" />
      <div className="campaign-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label={`체험단 지원 ${step}단계 진행률`}><i style={{ width: `${progressPercent}%` }} /></div>
      <button className="close-btn" onClick={onClose} aria-label="모달 닫기"><X size={17} /></button>
    </div>
    {step === 1 && <><h2>운영 중인 채널을 골라주세요</h2><p className="sheet-copy">운영 중인 채널을 여러 개 선택할 수 있어요.</p><div className="profile-options" role="group" aria-label="체험단 지원 SNS 채널 선택">{snsChannels.map((channel) => { const selected = selectedChannels.includes(channel.id); return <button key={channel.id} type="button" role="checkbox" aria-checked={selected} className={selected ? "selected" : ""} onClick={() => toggleChannel(channel.id)}><span className="profile-check-box" aria-hidden="true">{selected ? <Check size={12} /> : null}</span><span className="profile-option-copy"><b>{channel.label}</b></span></button>; })}</div><button type="button" role="checkbox" aria-checked={otherSelected} className={`profile-other-option ${otherSelected ? "selected" : ""}`} onClick={() => setOtherSelected((current) => !current)}><span><Plus size={15} /> 기타 채널 직접 입력</span><b>{otherSelected ? <Check size={16} /> : "+"}</b></button>{otherSelected && <input className="profile-other-input" type="text" value={otherChannel} onChange={(event) => setOtherChannel(event.target.value)} placeholder="활동 채널명 직접 입력 (예: 지역 맘카페, 당근 모임, 카카오뷰 등)" aria-label="기타 활동 채널명" />}<p className="profile-selection-count">현재 <b>{selectedChannelCount}개</b> 채널 선택</p><button className="wide-orange campaign-next-button" disabled={!profileReady} onClick={() => setStep(2)}>다음 ({selectedChannelCount}개 선택) <ArrowRight size={15} /></button></>}
    {step === 2 && <><div className="campaign-schedule-fields campaign-schedule-fields-top"><div className="campaign-calendar-field"><span>방문 날짜</span><div className="campaign-calendar" aria-label="방문 날짜 달력"><div className="campaign-calendar-header"><button type="button" aria-label="이전 달" onClick={() => moveCalendarMonth(-1)} disabled={calendarMonthIsCurrent}><ChevronLeft size={17} /></button><strong>{calendarYear}년 {calendarMonthIndex + 1}월</strong><button type="button" aria-label="다음 달" onClick={() => moveCalendarMonth(1)}><ChevronRight size={17} /></button></div><div className="campaign-calendar-weekdays" aria-hidden="true">{["일", "월", "화", "수", "목", "금", "토"].map((weekday, index) => <span key={weekday} className={index === 0 ? "sunday" : index === 6 ? "saturday" : ""}>{weekday}</span>)}</div><div className="campaign-calendar-grid">{Array.from({ length: calendarLeadingEmptyDays }, (_, index) => <span className="campaign-calendar-empty" key={`empty-${index}`} />)}{calendarDays.map((date) => { const holiday = getMeetingHolidayName(date); const isPast = date < today; const selected = isSameCalendarDay(date, selectedCalendarDate); const isToday = isSameCalendarDay(date, today); const isSunday = date.getDay() === 0; const isSaturday = date.getDay() === 6; return <button key={date.toISOString()} type="button" disabled={isPast} aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일${holiday ? ` ${holiday}` : ""}`} aria-pressed={selected} className={`campaign-calendar-day ${isSunday || holiday ? "holiday" : isSaturday ? "saturday" : ""} ${isPast ? "past" : ""} ${selected ? "selected" : ""}`} onClick={() => selectCalendarDate(date)}>{isToday && <i aria-hidden="true" />}{date.getDate()}</button>; })}</div></div></div><label className="campaign-time-field"><span>방문 희망 시간</span><select aria-label="방문 희망 시간" value={visitTime} onChange={(event) => setVisitTime(event.target.value)}>{timeSlots.map((slot) => <option key={slot.value} value={slot.label}>{slot.label}</option>)}</select></label></div><div className="campaign-step-actions"><button className="campaign-secondary-btn" onClick={goBack}><ArrowLeft size={14} /> 이전 단계</button><button className="wide-orange campaign-next-button" onClick={() => setStep(3)}>다음 <ArrowRight size={15} /></button></div></>}
    {step === 3 && <><h2>이번 체험단에 지원한 각오</h2><p className="sheet-copy">사장님께 보여드릴 한 줄 다짐을 작성해주세요.</p><textarea className="promise-input" maxLength={80} value={promise} onChange={(event) => setPromise(event.target.value)} placeholder="정성껏 체험하고 우리 동네에 진짜 후기를 남길게요." /><small className="character-count">{promise.length}/80</small><div className="application-summary"><span>프로필</span><b>{selectedChannelLabels}</b><span>방문</span><b>{formattedVisitDate} · {visitTime}</b></div>{submitError && <p role="alert" style={{ color: "#b42318", fontSize: 13, margin: "0 0 10px" }}>{submitError}</p>}<div className="campaign-step-actions"><button className="campaign-secondary-btn" onClick={goBack} disabled={isSubmitting}><ArrowLeft size={14} /> 이전 단계</button><button className="wide-orange" onClick={submitApplication} disabled={isSubmitting}><Check size={15} /> {isSubmitting ? "지원 접수 중" : "지원 제출하기"}</button></div></>}
  </section></div>;
}
function CampaignDetail({ campaign, onClose, onApply, isSubscriber, onOpenMap, onToast }: { campaign: Campaign; onClose: () => void; onApply: () => void; isSubscriber: boolean; onOpenMap: (item: StoreMapItem) => void; onToast: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => { try { await navigator.clipboard?.writeText(campaign.address); } catch { /* clipboard may be unavailable in preview */ } setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className="overlay campaign-overlay" onClick={onClose}><section className="campaign-detail-sheet campaign-detail-sheet-info" onClick={(event) => event.stopPropagation()}><button className="close-btn campaign-detail-close" onClick={onClose} aria-label="상세 모달 닫기"><X size={17} /></button><div className="campaign-detail-body"><p className="eyebrow campaign-detail-store">{campaign.store}</p><span className="campaign-member-badge">정회원 전용</span><h2>{campaign.title}</h2><div className="campaign-detail-summary-card"><div className="campaign-summary-row"><Gift size={17} /><div><strong>제공 내역</strong><span>{campaign.benefit}</span></div></div><div className="campaign-summary-row"><Check size={17} /><div><strong>필수 미션</strong><span>{campaign.mission}</span></div></div><StoreFacilityBadges tags={campaign.facilityTags} /><div className="campaign-summary-row campaign-summary-location"><MapPin size={17} /><div><strong>매장 위치 & 연락처</strong><div className="campaign-address-row"><span className="campaign-address-value">{campaign.address}</span><button type="button" className="campaign-address-copy" onClick={copyAddress}>주소 복사</button></div>{copied && <span className="campaign-address-copied">주소가 복사되었습니다.</span>}<span>{campaign.distance ? `${campaign.distance} · ` : ""}{campaign.phone}</span></div></div><div className="campaign-store-actions"><button type="button" onClick={() => onOpenMap({ store: campaign.store, address: campaign.address, distance: campaign.distance, latitude: campaign.latitude, longitude: campaign.longitude })}><MapPin size={13} /> 매장 위치</button><a href={`https://m.map.naver.com/route.nhn?menu=route&ename=${encodeURIComponent(campaign.store)}`} target="_blank" rel="noreferrer"><Navigation size={13} /> 길찾기</a><a href={phoneHref(campaign.phone)}><Phone size={13} /> 전화 걸기</a></div></div><div className="recruitment-line"><span>모집 현황</span><b>{campaign.recruited}명 모집 / {campaign.applicants}명 지원 중</b></div><div className="recruitment-track"><i style={{ width: `${Math.min(100, campaign.applicants / (campaign.recruited * 5) * 100)}%` }} /></div><button className="wide-orange campaign-apply-cta" onClick={onApply}><Users size={15} /> 체험단 지원하기</button></div></section></div>;
}
type GenderRestriction = "누구나" | "여성 전용" | "남성 전용";
type GenderRequirement = "ALL" | "FEMALE_ONLY" | "MALE_ONLY";
type AgeRequirement = "ALL" | "AGE_2030" | "AGE_3040" | "AGE_4050" | "AGE_5060_PLUS" | "CUSTOM";
type MeetingPlaceMode = "PARTNER" | "FREE";
function roleLabel(role: MeetingMemberRole) { return role === "HOST" ? "방장" : role === "MANAGER" ? "매니저" : "멤버"; }
function formatMeetingScheduleDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜를 확인해 주세요";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
}
function upcomingScheduleFor(meeting: Meeting): MeetingSchedule | null {
  const upcoming = (meeting.schedules ?? [])
    .filter((schedule) => new Date(schedule.startAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return upcoming[0] ?? null;
}
const koreanHolidayNames: Record<string, string> = {
  "2026-01-01": "신정", "2026-02-17": "설날", "2026-03-01": "삼일절", "2026-05-05": "어린이날", "2026-05-24": "부처님오신날", "2026-06-06": "현충일", "2026-08-15": "광복절", "2026-09-25": "추석", "2026-09-26": "추석", "2026-09-27": "추석", "2026-10-03": "개천절", "2026-10-09": "한글날", "2026-12-25": "성탄절",
  "2027-01-01": "신정", "2027-02-06": "설날", "2027-03-01": "삼일절", "2027-05-05": "어린이날", "2027-05-13": "부처님오신날", "2027-06-06": "현충일", "2027-08-15": "광복절", "2027-09-14": "추석", "2027-09-15": "추석", "2027-09-16": "추석", "2027-10-03": "개천절", "2027-10-09": "한글날", "2027-12-25": "성탄절",
};
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatKoreanDateTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return "날짜와 시간을 선택해 주세요"; const day = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()]; const hour = date.getHours(); return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일(${day}) ${String(hour).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function defaultMeetingDateTime() { const next = new Date(Date.now() + 60 * 60 * 1000); next.setSeconds(0, 0); const minutes = next.getMinutes(); next.setMinutes(minutes === 0 ? 0 : minutes <= 30 ? 30 : 60, 0, 0); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}T${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`; }
function MeetingDateTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const roundToNextHalfHour = (source: Date) => {
    const next = new Date(source);
    next.setSeconds(0, 0);
    const minutes = next.getMinutes();
    next.setMinutes(minutes === 0 ? 0 : minutes <= 30 ? 30 : 60, 0, 0);
    return next;
  };
  const initial = value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value)
    : roundToNextHalfHour(new Date(Date.now() + 86400000));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState(initial);
  const [timeValue, setTimeValue] = useState(`${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const lastDate = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: firstDay + lastDate }, (_, index) => index < firstDay ? null : new Date(month.getFullYear(), month.getMonth(), index - firstDay + 1));
  const timeOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const openPicker = () => {
    const next = value && !Number.isNaN(new Date(value).getTime())
      ? new Date(value)
      : roundToNextHalfHour(new Date(Date.now() + 86400000));
    setSelected(next);
    setTimeValue(`${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    setOpen(true);
  };

  const updateDraft = (date: Date, nextTime = timeValue) => {
    const [hours, minutes] = nextTime.split(":").map(Number);
    const next = new Date(date);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() < Date.now()) return;
    setSelected(next);
    setTimeValue(nextTime);
  };

  const confirmSelection = () => {
    if (selected.getTime() < Date.now()) return;
    onChange(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}T${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}`);
    setOpen(false);
  };

  return <>
    <div className="meeting-custom-datetime">
      <button type="button" className="meeting-datetime-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={openPicker}>
        {value ? formatKoreanDateTime(value) : "날짜와 시간을 선택해 주세요"}
        <ChevronDown size={17} />
      </button>
    </div>
    {open && createPortal(
      <div className="meeting-date-time-overlay" role="presentation" onClick={() => setOpen(false)}>
        <section className="meeting-date-time-modal" role="dialog" aria-modal="true" aria-label="날짜 및 시간 선택" onClick={(event) => event.stopPropagation()}>
          <header>
            <strong>날짜 및 시간 선택</strong>
            <button type="button" aria-label="달력 닫기" onClick={() => setOpen(false)}><X size={19} /></button>
          </header>
          <div className="meeting-date-time-modal-content">
            <div className="meeting-custom-calendar">
              <header>
                <button type="button" aria-label="이전 달" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button>
                <strong>{month.getFullYear()}년 {month.getMonth() + 1}월</strong>
                <button type="button" aria-label="다음 달" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button>
              </header>
              <div className="meeting-calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <span className={index === 0 ? "sunday" : index === 6 ? "saturday" : ""} key={day}>{day}</span>)}</div>
              <div className="meeting-calendar-grid">{days.map((date, index) => {
                if (!date) return <i key={`empty-${index}`} />;
                const key = dateKey(date);
                const holiday = koreanHolidayNames[key];
                const past = date < today;
                const selectedDay = dateKey(selected) === key;
                return <button type="button" key={key} disabled={past} className={`${date.getDay() === 0 || holiday ? "holiday" : date.getDay() === 6 ? "saturday" : ""} ${past ? "past" : ""} ${selectedDay ? "selected" : ""}`} onClick={() => updateDraft(date)}><b>{date.getDate()}</b>{holiday && <small>{holiday}</small>}</button>;
              })}</div>
            </div>
            <div className="meeting-time-dropdown-block">
              <div><strong>시간 선택</strong><small>24시간 · 30분 단위</small></div>
              <select value={timeValue} aria-label="24시간 일정 시간 선택" onChange={(event) => updateDraft(selected, event.target.value)}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</select>
            </div>
          </div>
          <button type="button" className="meeting-datetime-done" onClick={confirmSelection}>선택 완료</button>
        </section>
      </div>,
      document.body,
    )}
  </>;
}
function MeetingScheduleCreateSheet({ meeting, creatorName, creatorRole, onClose, onCreate }: { meeting: Meeting; creatorName: string; creatorRole: MeetingMemberRole; onClose: () => void; onCreate: (schedule: MeetingSchedule) => void }) {
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [maxMembers, setMaxMembers] = useState("8");
  const [partnerStore, setPartnerStore] = useState<PartnerStore | undefined>(meeting.partnerStore);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const canSubmit = title.trim().length > 0 && Boolean(startAt) && Number(maxMembers) >= 4;
  return <div className="meeting-schedule-overlay" onClick={onClose}>
    <section className="meeting-schedule-create-sheet" onClick={(event) => event.stopPropagation()}>
      <header><button type="button" onClick={onClose} aria-label="일정 만들기 닫기"><X size={22} /></button><h2>새 일정 만들기</h2></header>
      <div className="meeting-schedule-create-body">
        <label><span>일정 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="주말 뒤풀이 번개" maxLength={60} /></label>
        <label><span>날짜 및 시간</span><MeetingDateTimePicker value={startAt} onChange={setStartAt} /></label>
        <label><span>최대 참석 정원</span><select value={maxMembers} onChange={(event) => setMaxMembers(event.target.value)}>{[4, 5, 6, 7, 8, 10, 12, 15, 20].map((count) => <option key={count} value={count}>{count}명</option>)}</select></label>
        <div className="meeting-schedule-store-field meeting-schedule-azit-field"><span>모임 아지트 <small>제휴 매장 추천</small></span>{partnerStore ? <button type="button" className="meeting-schedule-store-selected" onClick={() => setStorePickerOpen(true)}><strong>{partnerStore.name}</strong><span>{partnerStore.benefit}</span><b>변경</b></button> : <button type="button" className="meeting-schedule-store-empty" onClick={() => setStorePickerOpen(true)}><span className="meeting-azit-empty-copy"><strong>제휴 혜택 매장 찾기</strong><small>방문 시 디저트 무료 / 음료 할인 혜택 제공</small></span><ChevronRight size={17} aria-hidden="true" /></button>}</div>
      </div>
      <div className="meeting-schedule-create-actions"><button type="button" disabled={!canSubmit} onClick={() => onCreate({ id: `schedule-${Date.now()}`, title: title.trim(), startAt, maxMembers: Number(maxMembers), partnerStore, attendeeIds: [], createdBy: creatorName, creatorRole })}>일정 만들기 완료</button></div>
      {storePickerOpen && <PartnerStorePicker selectedCategory={meeting.category} selectedAreas={[meeting.address.split(",")[0] ?? ""]} onSelect={(store) => { setPartnerStore(store); setStorePickerOpen(false); }} onClose={() => setStorePickerOpen(false)} />}
    </section>
  </div>;
}
function MeetingSchedulePlaceEditor({ meeting, schedule, onClose, onUpdate }: { meeting: Meeting; schedule: MeetingSchedule; onClose: () => void; onUpdate: (partnerStore?: PartnerStore) => void }) {
  return <PartnerStorePicker selectedCategory={meeting.category} selectedAreas={[meeting.address.split(",")[0] ?? ""]} onSelect={(store) => onUpdate(store)} onClear={() => onUpdate(undefined)} onClose={onClose} />;
}
function MeetingScheduleSection({ meeting, currentUserId, isHost, onChange, onMembersChange, onScheduleNotice }: { meeting: Meeting; currentUserId: string; isHost: boolean; onChange: (schedules: MeetingSchedule[]) => void; onMembersChange: (members: MeetingMember[], allowAll: boolean) => void; onScheduleNotice: (message: string) => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [placeEditSchedule, setPlaceEditSchedule] = useState<MeetingSchedule | null>(null);
  const schedules = meeting.schedules ?? [];
  const members = meeting.membersList ?? [{ id: meeting.hostId ?? currentUserId, nickname: meeting.organizerName ?? "방장", role: "HOST" as MeetingMemberRole }];
  const currentMember = members.find((member) => member.id === currentUserId);
  const canCreate = isHost || currentMember?.role === "MANAGER" || Boolean(meeting.allowMemberScheduleCreation);
  const creatorRole: MeetingMemberRole = isHost ? "HOST" : currentMember?.role ?? "MEMBER";
  const creatorName = currentMember?.nickname ?? "크루원";
  const now = Date.now();
  const upcoming = schedules.filter((item) => new Date(item.startAt).getTime() >= now).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const past = schedules.filter((item) => new Date(item.startAt).getTime() < now).sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const toggleAttendance = (schedule: MeetingSchedule) => {
    const attendeeIds = toggleMeetingScheduleAttendee(schedule.attendeeIds, currentUserId, schedule.maxMembers);
    if (attendeeIds === schedule.attendeeIds) return;
    onChange(schedules.map((item) => item.id === schedule.id ? { ...item, attendeeIds } : item));
    syncCommunityEventAttendance(schedule.id, attendeeIds);
  };
  const setManager = (memberId: string, nextManager: boolean) => {
    if (nextManager && members.filter((member) => member.role === "MANAGER").length >= 3) { window.alert("매니저는 최대 3명까지 지정할 수 있어요."); return; }
    onMembersChange(members.map((member) => member.id === memberId ? { ...member, role: nextManager ? "MANAGER" : "MEMBER" } : member), Boolean(meeting.allowMemberScheduleCreation));
  };
  const viewerName = currentMember?.nickname ?? "나";
  const canEditPlace = (schedule: MeetingSchedule) => isHost || currentMember?.role === "MANAGER" || schedule.createdBy === viewerName;
  const updateSchedulePlace = (schedule: MeetingSchedule, partnerStore?: PartnerStore) => {
    const nextSchedules = schedules.map((item) => item.id === schedule.id ? { ...item, partnerStore } : item);
    onChange(nextSchedules);
    syncCommunityEventPlace(schedule.id, partnerStore);
    onScheduleNotice(`모임 장소가 ${partnerStore?.name ?? "일반 동네 장소"}으로 변경되었습니다.`);
    setPlaceEditSchedule(null);
  };
  const scheduleCard = (schedule: MeetingSchedule, isPast = false) => {
    const attending = schedule.attendeeIds.includes(currentUserId);
    const full = schedule.attendeeIds.length >= schedule.maxMembers && !attending;
    return <article className={`meeting-schedule-card ${isPast ? "past" : ""}`} key={schedule.id}><div className="meeting-schedule-date">{formatMeetingScheduleDate(schedule.startAt)}</div><h4>{schedule.title}</h4><div className="meeting-schedule-place"><span>{schedule.partnerStore?.name ?? "장소 미정"}</span>{schedule.partnerStore?.benefit && <em>{schedule.partnerStore.benefit}</em>}</div><div className="meeting-schedule-creator">주최자: {schedule.createdBy} <b>{roleLabel(schedule.creatorRole)}</b></div><div className="meeting-schedule-card-footer"><span>참석 {schedule.attendeeIds.length}명 / 정원 {schedule.maxMembers}명</span>{!isPast && canEditPlace(schedule) && <button type="button" className="meeting-schedule-place-edit" onClick={() => setPlaceEditSchedule(schedule)}>장소 변경</button>}{!isPast && <button type="button" disabled={full} className={attending ? "attending" : ""} onClick={() => toggleAttendance(schedule)}>{attending ? "참석취소" : full ? "마감" : "참석하기"}</button>}{isHost && <button type="button" className="meeting-schedule-delete" onClick={() => { if (window.confirm("이 일정을 취소할까요?")) onChange(schedules.filter((item) => item.id !== schedule.id)); saveCommunityEvents(readCommunityEvents().filter((event) => event.schedule.id !== schedule.id)); }}>삭제</button>}</div></article>;
  };
  return <section className="meeting-schedules-section"><div className="meeting-schedules-header"><h3>모임 일정</h3>{canCreate && <button type="button" onClick={() => setCreateOpen(true)}>+ 일정 만들기</button>}</div>{isHost && <details className="meeting-member-management"><summary>멤버 권한 관리</summary><label><input type="checkbox" checked={Boolean(meeting.allowMemberScheduleCreation)} onChange={(event) => onMembersChange(members, event.target.checked)} /> 모든 멤버가 일정 만들기 허용</label>{members.filter((member) => member.role !== "HOST").map((member) => <div className="meeting-member-row" key={member.id}><span>{member.nickname} <b>{roleLabel(member.role)}</b></span><button type="button" onClick={() => setManager(member.id, member.role !== "MANAGER")}>{member.role === "MANAGER" ? "매니저 해제" : "매니저로 임명"}</button></div>)}</details>}{upcoming.length ? <div className="meeting-schedule-list">{upcoming.map((schedule) => scheduleCard(schedule))}</div> : <div className="meeting-schedule-empty">아직 예정된 정모 일정이 없어요.<br />방장님이 첫 일정을 만들어보세요!</div>}{past.length > 0 && <details className="meeting-past-schedules"><summary>종료된 지난 일정 ({past.length})</summary><div className="meeting-schedule-list">{past.map((schedule) => scheduleCard(schedule, true))}</div></details>}{createOpen && <MeetingScheduleCreateSheet meeting={meeting} creatorName={creatorName} creatorRole={creatorRole} onClose={() => setCreateOpen(false)} onCreate={(schedule) => { onChange([...schedules, schedule]); publishCommunityEvent(meeting, { id: schedule.id, title: schedule.title, startAt: schedule.startAt, place: schedule.partnerStore?.address ?? meeting.place, maxMembers: schedule.maxMembers, partnerStore: schedule.partnerStore, attendeeIds: schedule.attendeeIds }); setCreateOpen(false); onScheduleNotice("일정이 등록되어 참여 탭에 표시됩니다."); }} />}{placeEditSchedule && <MeetingSchedulePlaceEditor meeting={meeting} schedule={placeEditSchedule} onClose={() => setPlaceEditSchedule(null)} onUpdate={(partnerStore) => updateSchedulePlace(placeEditSchedule, partnerStore)} />}</section>;
}
type VerifiedUser = { isVerified: boolean; gender: "M" | "F" };
const genderRestrictionOptions: GenderRestriction[] = ["누구나", "여성 전용", "남성 전용"];
type MeetingCategory = "전체" | "골프/스크린" | "밥/술 번개" | "카페/소통" | "러닝/운동" | "반려동물/산책" | "심야·라이브";
const meetingCategoryLabel = (category: string) => category.replace(/^[^가-힣A-Za-z0-9]+/, "").trim();
type Participation = { currentMembers: number; maxMembers: number | null; isJoined: boolean };
type MeetingMemberRole = "HOST" | "MANAGER" | "MEMBER";
type MeetingMember = { id: string; nickname: string; role: MeetingMemberRole };
const BLOCKED_USERS_STORAGE_KEY = "dangam_blocked_users";
const REPORTS_STORAGE_KEY = "dangam_user_reports";
function readBlockedUsers(): BlockedUser[] { try { return JSON.parse(window.localStorage.getItem(BLOCKED_USERS_STORAGE_KEY) ?? "[]") as BlockedUser[]; } catch { return []; } }
function blockMeetingMember(member: MeetingMember) { const current = readBlockedUsers(); if (current.some((user) => user.id === member.id)) return false; const next = [...current, { id: member.id, nickname: member.nickname, blockedAt: new Date().toLocaleDateString("ko-KR") }]; window.localStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(next)); window.dispatchEvent(new CustomEvent("dangam:blocked-users-changed")); return true; }
function reportMeetingMember(member: MeetingMember, context: string) { let current: Array<{ id: string; nickname: string; context: string; reportedAt: string }> = []; try { current = JSON.parse(window.localStorage.getItem(REPORTS_STORAGE_KEY) ?? "[]") as typeof current; } catch { current = []; } current.unshift({ id: member.id, nickname: member.nickname, context, reportedAt: new Date().toISOString() }); window.localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(current)); }

type TinkerbellStatus = "idle" | "flying" | "landed" | "feed_opened";
type MeetingSchedule = { id: string; title: string; startAt: string; maxMembers: number; partnerStore?: PartnerStore; attendeeIds: string[]; createdBy: string; creatorRole: MeetingMemberRole };
type AgeRange = { min: number; max: number };
type Meeting = { id: number; regionCode?: string; regionCodes?: string[]; latitude?: number; longitude?: number; coverImage?: string; detailImages?: string[]; thumbnail?: string; mediaUrls?: string[]; schedules?: MeetingSchedule[]; membersList?: MeetingMember[]; allowMemberScheduleCreation?: boolean;  partnerStore?: PartnerStore; isCommunity?: boolean; isExperienceDirectChat?: boolean; isReservationDirectChat?: boolean; communitySince?: string; ageRequirement?: AgeRequirement; ageMin?: number; ageMax?: number; ageRanges?: AgeRange[]; adultOnly?: boolean; category: Exclude<MeetingCategory, "전체">; customTopic?: string; image?: string; intro?: string; title: string; place: string; address: string; schedule: string; members: string; favoriteCount?: number; benefit: string; icon: string; tone: string; manager?: string; nightlifeGuide?: string; organizerName?: string; organizerPhone?: string; storePhone?: string; hostId?: string; maxMembers?: number | null; isUnlimited?: boolean; placeMode?: MeetingPlaceMode; placeNote?: string; genderRestriction?: GenderRestriction; genderRequirement?: GenderRequirement; petGuide?: string };


const meetingCategories: MeetingCategory[] = ["전체", "골프/스크린", "밥/술 번개", "카페/소통", "러닝/운동", "반려동물/산책", "심야·라이브"];
const parseMeetingCapacity = (meeting: Meeting): { currentMembers: number; maxMembers: number | null } => { const current = Number(meeting.members.match(/^(\d+)/)?.[1] ?? 0); const unlimited = meeting.isUnlimited || meeting.maxMembers === null || /제한 없음/.test(meeting.members); const max = meeting.maxMembers ?? Number(meeting.members.match(/\d+\/(\d+)/)?.[1] ?? 4); return { currentMembers: current, maxMembers: unlimited ? null : max }; }; const meetingCapacityLabel = (participation: Participation) => participation.maxMembers === null ? `${participation.currentMembers}명 / 제한 없음` : `${participation.currentMembers}/${participation.maxMembers}명`; const meetingCapacityShortLabel = (participation: Participation) => participation.maxMembers === null ? `${participation.currentMembers}명 / 제한 없음` : `${participation.currentMembers}/${participation.maxMembers}명`;
const meetingWeekdays = ["일", "월", "화", "수", "목", "금", "토"] as const;
const formatMeetingSchedule = (schedule: string) => {
  const numeric = schedule.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*\((.)\)\s*(오전|오후)\s*(\d{1,2}:\d{2})/);
  if (numeric) return `${Number(numeric[2])}월 ${Number(numeric[3])}일(${numeric[4]}) ${numeric[5]} ${numeric[6]}`;
  const today = new Date();
  const shortRelative = schedule.match(/^(오늘|내일)\s*(오전|오후)\s*(\d{1,2}:\d{2})/);
  if (shortRelative) {
    const [, relativeDay, ampm, time] = shortRelative;
    const date = new Date(today);
    date.setDate(today.getDate() + (relativeDay === "내일" ? 1 : 0));
    return `${date.getMonth() + 1}월 ${date.getDate()}일(${meetingWeekdays[date.getDay()]}) ${ampm} ${time}`;
  }
  const explicit = schedule.match(/(?:20\d{2}년\s*)?(\d{1,2})월\s*(\d{1,2})일\s*(?:([일월화수목금토])요일?\s*)?(오전|오후)\s*(\d{1,2}:\d{2})/);
  if (explicit) {
    const [, month, day, weekday, ampm, time] = explicit;
    const date = new Date(today.getFullYear(), Number(month) - 1, Number(day));
    return `${Number(month)}월 ${Number(day)}일(${weekday || meetingWeekdays[date.getDay()]}) ${ampm} ${time}`;
  }
  const relative = schedule.match(/^(이번 주|다음 주)?\s*(일|월|화|수|목|금|토)요일?\s*(오전|오후)\s*(\d{1,2}:\d{2})/);
  if (!relative) return schedule.replace(/^(이번 주|다음 주)\s*/, "");
  const [, period, weekday, ampm, time] = relative;
  const targetDay = meetingWeekdays.indexOf(weekday as (typeof meetingWeekdays)[number]);
  let daysAhead = (targetDay - today.getDay() + 7) % 7;
  if (period === "다음 주") daysAhead += 7;
  const date = new Date(today);
  date.setDate(today.getDate() + daysAhead);
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${weekday}) ${ampm} ${time}`;
};

const meetings: Meeting[] = [
  { id: 1, category: "골프/스크린", title: "주말 오전 4인 스크린 골프 한판 치실 분", place: "의왕 골프존파크", address: "경기 의왕시 오전로 123 2층", schedule: "이번 주 토요일 오전 10:00", members: "3/4명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", benefit: " 4인 1팀 라운딩 시 총 10,000원 할인 (인당 2,500원)", icon: "", tone: "green", membersList: [{ id: "user-001", nickname: "홍길동", role: "HOST" }, { id: "member-002", nickname: "산본러너", role: "MEMBER" }, { id: "member-003", nickname: "주말골퍼", role: "MEMBER" }, { id: "member-004", nickname: "파전마니아", role: "MEMBER" }], allowMemberScheduleCreation: false, schedules: [{ id: "schedule-demo-1", title: "정기 스크린골프 치고 파전 뒤풀이", startAt: "2026-10-18T18:00", maxMembers: 8, partnerStore: { storePublicId: "store-golf-demo", name: "의왕 골프존파크", category: "운동·레저", area: "산본동", distance: "차량 8분 · 2.1km", address: "경기 의왕시 오전로 123 2층", benefit: "4인 1팀 라운딩 시 10,000원 할인", image: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=500&auto=format&fit=crop&q=85" }, attendeeIds: ["user-001", "member-002", "member-003", "member-004"], createdBy: "산본골퍼", creatorRole: "HOST" }] },
  { id: 2, category: "밥/술 번개", title: "금요일 저녁 파전에 막걸리 한잔 번개", place: "솥뚜껑 파전", address: "경기 의왕시 오전로 123 1층", schedule: "이번 주 금요일 오후 7:30", members: "2/6명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", benefit: " 4인 이상 방문 시 5만원 이상 주문 시 5,000원 할인", icon: "", tone: "orange" },
  { id: 3, category: "카페/소통", title: "일요일 오후 동네 커피 & 독서 모임", place: "그레이스 커피", address: "서울 강남구 테헤란로 218 1층", schedule: "이번 주 일요일 오후 2:00", members: "4/6명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", benefit: " 4인 이상 방문 시 대표 디저트/베이커리 1개 무료 제공", icon: "", tone: "purple" },
  { id: 4, category: "러닝/운동", title: "안양천 저녁 러닝 & 시원한 음료 타임", place: "안양천 집결 · 팅커벨 제휴 카페", address: "경기 안양시 동안구 시민대로 245 1층", schedule: "오늘 오후 7:00", members: "5/8명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", benefit: " 운동 후 제휴 매장 방문 시 에너지 음료/사이드 서비스", icon: "", tone: "blue" },
  { id: 5, category: "심야·라이브", title: "주말 저녁 가볍게 맥주 기본상 & 음악 번개", place: "○○나이트클럽", address: "서울 강남구 테헤란로 312 지하 1층", schedule: "이번 주 토요일 오후 9:00", members: "2/6명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", benefit: " 기본상 주문 시 10,000원 즉시 할인", icon: "", tone: "night", manager: "WT 독도", nightlifeGuide: " 입장 꿀팁: 입구에서 안내원에게 [WT 독도]를 지명하시면 10,000원 할인 혜택이 적용됩니다." },
  { id: 6, category: "카페/소통", ageRequirement: "AGE_2030", ageMin: 20, ageMax: 39, title: "오전 브런치 & 동네 카페 힐링 수다 모임", place: "그레이스 커피", address: "서울 강남구 테헤란로 218 1층", schedule: "다음 주 수요일 오전 11:00", members: "3/4명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", genderRestriction: "누구나", genderRequirement: "ALL", benefit: " 4인 이상 방문 시 대표 디저트/베이커리 1개 무료 제공", icon: "", tone: "rose" },
  { id: 7, category: "골프/스크린", ageRequirement: "AGE_3040", ageMin: 30, ageMax: 49, title: "[남성 전용] 퇴근 후 시원하게 스크린골프 18홀 번개", place: "의왕 골프존파크", address: "경기 의왕시 오전로 123 2층", schedule: "다음 주 목요일 오후 7:30", members: "3/4명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", genderRestriction: "남성 전용", genderRequirement: "MALE_ONLY", benefit: " 4인 1팀 라운딩 시 총 10,000원 할인 (인당 2,500원)", icon: "", tone: "indigo" },
  { id: 8, category: "반려동물/산책", title: "[산책 번개] 주말 오전 백운호수 강아지 산책 & 동반 카페 모임", place: "백운호수 멍멍라운지", address: "경기 의왕시 백운로 451 1층", schedule: "이번 주 토요일 오전 9:30", members: "2/6명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", benefit: " 애견 동반 카페 방문 시 반려견 멍푸치노 or 수제간식 증정", icon: "", tone: "pet", petGuide: "반려견 동반 가능(펫 프렌들리) 제휴 매장입니다. 리드줄 착용 등 펫티켓을 준수해 주세요." },
  { id: 9, category: "반려동물/산책", ageRequirement: "AGE_4050", ageMin: 40, ageMax: 59, title: "[반려견] 평일 저녁 동네 하천길 야간 산책 크루 구해요", place: "안양천 펫프렌즈 카페", address: "경기 안양시 동안구 시민대로 245 1층", schedule: "이번 주 수요일 오후 7:30", members: "2/4명", organizerName: "홍길동", hostId: "user-001", organizerPhone: "010-1234-5678", benefit: " 애견 동반 카페 방문 시 반려견 멍푸치노 or 수제간식 증정", icon: "", tone: "pet", petGuide: "반려견 동반 가능(펫 프렌들리) 제휴 매장입니다. 리드줄 착용 등 펫티켓을 준수해 주세요." },
];

const regionMockMeetings: Meeting[] = [
  { id: 414105401, regionCode: COMMUNITY_REGION_CODES.sanbon1Dong, category: "러닝/운동", title: "산본천 저녁 산책과 가벼운 러닝", place: "산본천 산책로 입구", address: "경기 군포시 산본1동 산본천", schedule: "오늘 오후 7:00", members: "2/6명", hostId: "demo-sanbon-runner", organizerName: "산본러너", benefit: "함께 걷고 달리는 동네 모임", icon: "러닝", tone: "blue" },
  { id: 414105402, regionCode: COMMUNITY_REGION_CODES.sanbon1Dong, category: "밥/술 번개", title: "산본시장 점심 파전 번개", place: "산본시장 입구", address: "경기 군포시 산본1동 산본시장", schedule: "내일 오후 12:30", members: "3/6명", hostId: "demo-sanbon-food", organizerName: "동네한끼", benefit: "점심 식사 후 자유롭게 해산합니다", icon: "식사", tone: "orange" },
  { id: 414105403, regionCode: COMMUNITY_REGION_CODES.sanbon1Dong, category: "카페/소통", title: "산본 카페에서 주말 독서 모임", place: "산본역 인근 카페", address: "경기 군포시 산본1동 산본역", schedule: "이번 주 토요일 오후 2:00", members: "2/5명", hostId: "demo-sanbon-book", organizerName: "책읽는이웃", benefit: "읽고 싶은 책을 가져와 함께 읽어요", icon: "독서", tone: "purple" },
  { id: 116806401, regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong, category: "카페/소통", title: "역삼 직장인 점심 커피 모임", place: "역삼역 1번 출구", address: "서울 강남구 역삼1동 역삼역", schedule: "오늘 오후 12:30", members: "2/5명", hostId: "demo-yeoksam-coffee", organizerName: "점심산책", benefit: "점심시간에 커피를 마시며 이야기해요", icon: "커피", tone: "peach" },
  { id: 116806402, regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong, category: "밥/술 번개", title: "역삼 퇴근 후 저녁 식사 모임", place: "테헤란로 식당가", address: "서울 강남구 역삼1동 테헤란로", schedule: "내일 오후 7:00", members: "3/6명", hostId: "demo-yeoksam-dinner", organizerName: "퇴근한끼", benefit: "퇴근 후 편하게 저녁을 함께합니다", icon: "식사", tone: "orange" },
  { id: 116806403, regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong, category: "러닝/운동", title: "역삼 저녁 스트레칭과 산책", place: "선릉공원 입구", address: "서울 강남구 역삼1동 선릉공원", schedule: "이번 주 토요일 오후 6:30", members: "2/6명", hostId: "demo-yeoksam-walk", organizerName: "저녁산책", benefit: "초보도 함께할 수 있는 가벼운 활동입니다", icon: "산책", tone: "green" },
];
const meetingStorePhoneFor = (meeting: Meeting) => meeting.storePhone ?? (meeting.place.includes("파전") ? "031-123-4567" : meeting.place.includes("골프") ? "031-456-7890" : "031-987-6543");

const meetingCategoryFallbackImage = (category: string) => {
  if (category.includes("러닝/운동")) return "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300&auto=format&fit=crop&q=80";
  if (category.includes("반려동물/산책")) return "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=300&auto=format&fit=crop&q=80";
  if (category.includes("골프/스크린")) return "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=300&auto=format&fit=crop&q=80";
  if (category.includes("밥/술 번개")) return "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=300&auto=format&fit=crop&q=80";
  if (category.includes("카페/소통")) return "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&auto=format&fit=crop&q=80";
  return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80";
};

const isEmbeddedMeetingImage = (value: string | undefined) => Boolean(value && /^(data:image\/|blob:)/i.test(value));
const meetingWithoutEmbeddedImages = (meeting: Meeting): Meeting => {
  const imageCandidates = [meeting.coverImage, meeting.thumbnail, meeting.image, ...(meeting.detailImages ?? []), ...(meeting.mediaUrls ?? [])];
  const coverImage = imageCandidates.find((image): image is string => Boolean(image?.trim()) && !isEmbeddedMeetingImage(image))
    ?? meetingCategoryFallbackImage(meeting.category);
  return { ...meeting, coverImage, thumbnail: undefined, image: undefined, detailImages: [], mediaUrls: [] };
};
const meetingThumbnailFor = (meeting: Meeting) => {
  if (meeting.coverImage) return meeting.coverImage;
  if (meeting.thumbnail) return meeting.thumbnail;
  if (meeting.image) return meeting.image;
  if (meeting.detailImages?.[0]) return meeting.detailImages[0];
  if (meeting.mediaUrls?.[0]) return meeting.mediaUrls[0];
  return meetingCategoryFallbackImage(meeting.category);
};
const meetingStores = [
  { name: "의왕 골프존파크", address: "경기 의왕시 오전로 123 2층", benefit: " 4인 1팀 라운딩 시 총 10,000원 할인 (인당 2,500원)", category: "골프/스크린" as const },
  { name: "명품 솥뚜껑 파전", address: "경기 의왕시 오전로 123 1층", benefit: " 4인 이상 방문 시 5만원 이상 주문 시 5,000원 할인", category: "밥/술 번개" as const },
  { name: "그레이스 커피", address: "서울 강남구 테헤란로 218 1층", benefit: " 4인 이상 방문 시 대표 디저트/베이커리 1개 무료 제공", category: "카페/소통" as const },
  { name: "안양천 팅커벨 제휴 카페", address: "경기 안양시 동안구 시민대로 245 1층", benefit: " 운동 후 제휴 매장 방문 시 에너지 음료/사이드 서비스", category: "러닝/운동" as const },
  { name: "○○나이트클럽", address: "서울 강남구 테헤란로 312 지하 1층", benefit: " 기본상 주문 시 10,000원 즉시 할인", category: "심야·라이브" as const, manager: "WT 독도", nightlifeGuide: "입구에서 담당 지명 매니저 확인 시 적용 (기본상 이상 주문 시 유효)" },
  { name: "백운호수 멍멍라운지", address: "경기 의왕시 백운로 451 1층", benefit: " 애견 동반 카페 방문 시 반려견 멍푸치노 or 수제간식 증정", category: "반려동물/산책" as const, petGuide: "반려견 동반 가능(펫 프렌들리) 제휴 매장입니다. 리드줄 착용 등 펫티켓을 준수해 주세요." },
  { name: "안양천 펫프렌즈 카페", address: "경기 안양시 동안구 시민대로 245 1층", benefit: " 애견 동반 카페 방문 시 반려견 멍푸치노 or 수제간식 증정", category: "반려동물/산책" as const, petGuide: "반려견 동반 가능(펫 프렌들리) 제휴 매장입니다. 리드줄 착용 등 펫티켓을 준수해 주세요." },
];
const meetingTone: Record<Exclude<MeetingCategory, "전체">, string> = { "골프/스크린": "green", "밥/술 번개": "orange", "카페/소통": "purple", "러닝/운동": "blue", "반려동물/산책": "pet", "심야·라이브": "night" };
const meetingIcon: Record<Exclude<MeetingCategory, "전체">, string> = { "골프/스크린": "", "밥/술 번개": "", "카페/소통": "", "러닝/운동": "", "반려동물/산책": "", "심야·라이브": "" };
const ageOptions: { value: AgeRequirement; label: string; min?: number; max?: number }[] = [{ value: "ALL", label: "누구나 (연령 무관)" }, { value: "AGE_2030", label: "2030 (20~39세)", min: 20, max: 39 }, { value: "AGE_3040", label: "3040 (30~49세)", min: 30, max: 49 }, { value: "AGE_4050", label: "4050 (40~59세)", min: 40, max: 59 }, { value: "AGE_5060_PLUS", label: "5060+ (50세 이상)", min: 50, max: 120 }, { value: "CUSTOM", label: "직접 설정" }];
const ageBounds = (requirement: AgeRequirement) => ageOptions.find((option) => option.value === requirement) ?? ageOptions[0];
const ageLabel = (meeting: Meeting) => { const requirement = meeting.ageRequirement ?? "ALL"; if (requirement === "ALL") return "누구나 참여 가능"; if (meeting.ageRanges?.length) return `${meeting.ageRanges.map((range) => `${range.min}~${range.max}세`).join(", ")} 전용 `; if (requirement === "AGE_5060_PLUS") return "50세 이상 전용 "; const min = meeting.ageMin ?? ageBounds(requirement).min ?? 0; const max = meeting.ageMax ?? ageBounds(requirement).max ?? 0; return `${min}~${max}세 전용 `; };
const ageAllowedFor = (meeting: Meeting, currentAge: number) => { if (currentAge < 19) return false; if (meeting.ageRanges?.length) return meeting.ageRanges.some((range) => currentAge >= range.min && currentAge <= range.max); const requirement = meeting.ageRequirement ?? "ALL"; if (requirement === "ALL") return true; const min = meeting.ageMin ?? ageBounds(requirement).min ?? 0; const max = meeting.ageMax ?? ageBounds(requirement).max ?? 120; return currentAge >= min && currentAge <= max; };
type NextGathering = { title: string; schedule: string; place: string; address: string; capacity: number | null; placeMode: MeetingPlaceMode };

const getMeetingHolidayName = (date: Date) => {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const fixed: Record<string, string> = { "01-01": "신정", "03-01": "삼일절", "05-05": "어린이날", "06-06": "현충일", "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "크리스마스" };
  const lunar: Record<number, Record<string, string>> = { 2026: { "02-16": "설날", "02-17": "설날", "02-18": "설날", "09-24": "추석", "09-25": "추석", "09-26": "추석" }, 2027: { "02-06": "설날", "02-07": "설날", "02-08": "설날", "09-14": "추석", "09-15": "추석", "09-16": "추석" } };
  return fixed[key.slice(5)] ?? lunar[date.getFullYear()]?.[key.slice(5)] ?? "";
};
type MeetingMedia = { id: string; file: File; url: string };

function MeetingCreateSheet({ hostId, hostGender, onClose, onCreate }: { hostId: string; hostGender: VerifiedUser["gender"]; onClose: () => void; onCreate: (meeting: Meeting) => void }) {
  const [title, setTitle] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [selectedAreas, setSelectedAreas] = useState(["산본1동"]); const [selectedAreaCodes, setSelectedAreaCodes] = useState<string[]>(() => { const code = findAdminRegionCode("경기도", "군포시", "산본1동"); return code ? [code] : []; });
  const [areaSettingsOpen, setAreaSettingsOpen] = useState(false);
  const [creationStep, setCreationStep] = useState<1 | 2 | 3>(1);
  const [introduction, setIntroduction] = useState("");
  const [aiAssist, setAiAssist] = useState(false);
  const [aiGeneratedIntroduction, setAiGeneratedIntroduction] = useState("");
  const [attachedMedia, setAttachedMedia] = useState<MeetingMedia[]>([]);
  const [mediaToast, setMediaToast] = useState("");
  const [representativeImage, setRepresentativeImage] = useState("");
  const [creating, setCreating] = useState(false);
  const uploadMeetingMedia = trpc.media.upload.useMutation();
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [genderGroup, setGenderGroup] = useState("누구나");
  const [unlimitedMembers, setUnlimitedMembers] = useState(true);
  const [meetingMaxMembers, setMeetingMaxMembers] = useState("");
  const [partnerCatalogOpen, setPartnerCatalogOpen] = useState(false);
  const [selectedPartnerStore, setSelectedPartnerStore] = useState<PartnerStore | null>(null);
  const [organizerName, setOrganizerName] = useState("홍길동");
  const allowedGenderOptions = hostGender === "M" ? ["누구나", "남성"] : ["누구나", "여성"];
  const genderPolicyMessage = "동성 모임 또는 누구나 참여 가능한 모임만 개설할 수 있습니다.";
  const basicCategories = ["운동/러닝", "동네 맛집/카페", "독서/스터디", "반려동물", "취미/DIY", "육아/가족", "기타"];
  const defaultNearbyAreaNames = ["산본1동", "산본2동", "금정동", "당동"];
  const activityArea = selectedAreas[0] ?? "";
  const selectedLegacyCategory: Exclude<MeetingCategory, "전체"> = selectedCategory === "운동/러닝" ? "러닝/운동" : selectedCategory === "동네 맛집/카페" ? "밥/술 번개" : selectedCategory === "반려동물" ? "반려동물/산책" : selectedCategory === "육아/가족" ? "심야·라이브" : "카페/소통";
  const canContinue = Boolean(title.trim()) && Boolean(selectedCategory) && (selectedCategory !== "기타" || Boolean(customTopic.trim())) && selectedAreas.length > 0;
  const introductionLength = introduction.replace(/\s/g, "").length;
  const canCreate = introductionLength >= 10 && (unlimitedMembers || (Number.isInteger(Number(meetingMaxMembers)) && Number(meetingMaxMembers) >= 1));
  const toggleArea = (area: string) => { const code = findAdminRegionCode("경기도", "군포시", area) ?? selectedAreaCodes.find((candidate) => findAdminRegionByCode(candidate)?.dong === area); const removing = selectedAreas.includes(area); setSelectedAreas((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area]); if (code) setSelectedAreaCodes((current) => removing ? current.filter((item) => item !== code) : current.includes(code) ? current : [...current, code]); };
  const handleMediaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const remaining = 6 - attachedMedia.length;
    if (files.length > remaining) setMediaToast("사진은 최대 6장까지 등록할 수 있어요.");
    const nextFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, Math.max(remaining, 0));
    const nextMedia = nextFiles.map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file) }));
    setAttachedMedia((current) => [...current, ...nextMedia]);
    event.target.value = "";
  };
  const removeMedia = (id: string) => setAttachedMedia((current) => {
    const target = current.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    return current.filter((item) => item.id !== id);
  });
  const generateAiIntroduction = () => {
    const groupTitle = title.trim() || selectedCategory || "동네 모임";
    const area = activityArea || "우리 동네";
    return `${area} 주변에서 ${groupTitle} 함께해요! 서로 편하게 소통하고 즐겁게 활동하는 동네 이웃 모임입니다.`;
  };
  const enableAiIntroduction = () => {
    const generated = generateAiIntroduction();
    setAiAssist(true);
    setAiGeneratedIntroduction(generated);
    setIntroduction(generated);
  };
  const toggleAiIntroduction = () => {
    if (aiAssist) {
      setAiAssist(false);
      if (introduction === aiGeneratedIntroduction) setIntroduction("");
      setAiGeneratedIntroduction("");
      return;
    }
    enableAiIntroduction();
  };
  const enterIntroductionStep = () => {
    if (aiAssist) enableAiIntroduction();
    setCreationStep(2);
  };
  const submit = () => {
    if (!canContinue) return;
    enterIntroductionStep();
  };
  const createMeeting = async () => {
    if (creating) return;
    if (!canContinue || !canCreate) { window.alert(unlimitedMembers ? "소개글을 10자 이상 작성해 주세요." : "소개글과 참여 인원을 확인해 주세요."); return; }
    const genderAllowed = genderGroup === "누구나" || (hostGender === "M" && genderGroup === "남성") || (hostGender === "F" && genderGroup === "여성");
    if (!genderAllowed) { window.alert(genderPolicyMessage); setGenderGroup("누구나"); return; }
    setCreating(true);
    const uploadedDetailImages = (await Promise.all(attachedMedia.map(async (media) => {
      try {
        const compressed = await compressMeetingImage(media.file, MEETING_DETAIL_COMPRESSION);
        try {
          const baseName = media.file.name.replace(/\.[^/.]+$/, "") || "meeting-photo";
          const uploaded = await uploadMeetingMedia.mutateAsync({
            originalName: `${baseName}.jpg`,
            mimeType: "image/jpeg",
            sizeBytes: compressed.blob.size,
            dataBase64: compressed.dataUrl,
          });
          return uploaded.url || compressed.dataUrl;
        } catch {
          return compressed.dataUrl;
        }
      } catch {
        return "";
      }
    }))).filter((image): image is string => Boolean(image));
    const detailImages = uploadedDetailImages.slice(0, 6); const coverFallback = meetingCategoryFallbackImage(selectedLegacyCategory);
    const coverSource = representativeImage || detailImages[0];
    let coverImage = coverFallback;
    if (coverSource) {
      if (/^(data:image\/|blob:)/i.test(coverSource)) {
        try {
          const compressedCover = await compressMeetingImage(coverSource, MEETING_COVER_COMPRESSION);
          coverImage = compressedCover.dataUrl;
        } catch {
          coverImage = coverFallback;
        }
      } else {
        coverImage = coverSource;
      }
    }
    const place = selectedPartnerStore?.name ?? (selectedAreas.length > 1 ? `${activityArea} 외 ${selectedAreas.length - 1}곳 활동 지역` : `${activityArea} 활동 지역`);
    const address = selectedPartnerStore ? formatPartnerStoreAddress(selectedPartnerStore) : selectedAreas.join(", ");
    const ageRequirement: AgeRequirement = ageGroups.length > 0 ? "CUSTOM" : "ALL";
    const ageGroupRanges: Record<string, { min: number; max: number }> = { "20대": { min: 20, max: 29 }, "30대": { min: 30, max: 39 }, "40대": { min: 40, max: 49 }, "50대": { min: 50, max: 59 }, "60대 이상": { min: 60, max: 120 } };
    const selectedAgeRanges = ageGroups.map((group) => ageGroupRanges[group]).filter(Boolean);
    const firstAgeRange = selectedAgeRanges[0];
    const genderRequirement: GenderRequirement = genderGroup === "여성" ? "FEMALE_ONLY" : genderGroup === "남성" ? "MALE_ONLY" : "ALL";
    const numericMaxMembers = Number(meetingMaxMembers);
    onCreate({ id: Date.now(), category: selectedLegacyCategory, customTopic: selectedCategory === "기타" ? customTopic.trim() : undefined, intro: introduction.trim(), title: title.trim(), place, schedule: "일정은 모임방에서 정해요", members: unlimitedMembers ? "1명 / 제한 없음" : `1/${numericMaxMembers}명`, maxMembers: unlimitedMembers ? null : numericMaxMembers, isUnlimited: unlimitedMembers, address, regionCode: selectedAreaCodes[0], regionCodes: selectedAreaCodes, placeMode: selectedPartnerStore ? "PARTNER" : "FREE", benefit: selectedPartnerStore?.benefit ?? "동네에서 편하게 만나는 모임", icon: meetingIcon[selectedLegacyCategory], tone: meetingTone[selectedLegacyCategory], genderRestriction: genderGroup === "여성" ? "여성 전용" : genderGroup === "남성" ? "남성 전용" : "누구나", genderRequirement, ageRequirement, ageMin: firstAgeRange?.min, ageMax: firstAgeRange?.max, ageRanges: selectedAgeRanges.length ? selectedAgeRanges : undefined, organizerName: organizerName.trim() || "홍길동", hostId, partnerStore: selectedPartnerStore ?? undefined, organizerPhone: "010-1234-5678", coverImage, detailImages });
    setCreating(false);
    onClose();
  };
  return <div className="overlay meeting-overlay meeting-fullscreen-overlay" onClick={onClose}>
    <section className="meeting-create-sheet meeting-create-step1" onClick={(event) => event.stopPropagation()}>
      {creationStep === 3 ? <div className="meeting-create-step3">
        <header className="meeting-create-step3-header"><button type="button" className="meeting-create-back close-btn" onClick={() => setCreationStep(2)} aria-label="2단계로 돌아가기"><ArrowLeft size={20} /></button><h2 className="meeting-step3-title">모임 마지막 설정을 해요</h2><button type="button" className="meeting-create-close close-btn" onClick={onClose} aria-label="모임 만들기 닫기"><X size={18} /></button></header>
        <div className="meeting-create-step3-body">
          <div className="meeting-step3-hero">
            {representativeImage ? <img className="meeting-step3-hero-image" src={representativeImage} alt="모임 대표 사진" /> : <div className="meeting-step3-photo-empty"><Camera size={24} aria-hidden="true" /><span>대표 사진을 등록해 주세요</span></div>}
            <label className="meeting-step3-photo-change"><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file || !file.type.startsWith("image/")) return; const nextPreviewUrl = URL.createObjectURL(file); if (representativeImage.startsWith("blob:")) URL.revokeObjectURL(representativeImage); setRepresentativeImage(nextPreviewUrl); }} /><Camera size={16} aria-hidden="true" /><span>사진 변경</span></label>
          </div>
          <div className="meeting-final-preview"><strong>{title}</strong><span>{selectedCategory === "기타" ? customTopic.trim() : selectedCategory} · {selectedAreas.join(", ")}</span></div>
          <section className="meeting-final-section"><h3>참여 멤버 조건</h3><div className="meeting-final-chips" aria-label="참여 대상 나이대">{["20대", "30대", "40대", "50대", "60대 이상"].map((item) => <button type="button" key={item} className={ageGroups.includes(item) ? "selected" : ""} aria-pressed={ageGroups.includes(item)} onClick={() => setAgeGroups((current) => current.includes(item) ? current.filter((group) => group !== item) : [...current, item])}>{item}</button>)}</div><div className="meeting-final-chips" aria-label="참여 대상 성별">{allowedGenderOptions.map((item) => <button type="button" key={item} className={genderGroup === item ? "selected" : ""} aria-pressed={genderGroup === item} onClick={() => setGenderGroup(item)}>{item === "누구나" ? "누구나 참여 가능" : `${item}만`}</button>)}</div></section>
          <section className="meeting-final-capacity" aria-label="참여 인원"><span>참여 인원</span><div className="meeting-capacity-options"><button type="button" className={unlimitedMembers ? "selected" : ""} aria-pressed={unlimitedMembers} onClick={() => { setUnlimitedMembers(true); setMeetingMaxMembers(""); }}>제한 없음</button><button type="button" className={!unlimitedMembers ? "selected" : ""} aria-pressed={!unlimitedMembers} onClick={() => setUnlimitedMembers(false)}>인원 설정</button>{!unlimitedMembers && <input type="number" min="1" step="1" inputMode="numeric" value={meetingMaxMembers} onChange={(event) => setMeetingMaxMembers(event.target.value.replace(/[^0-9]/g, ""))} placeholder="인원수" aria-label="참여 인원 직접 입력" />}</div></section>
          <section className="meeting-affiliate-section" aria-label="팅커벨 제휴 매장 선택"><h3>팅커벨 제휴 매장</h3>{selectedPartnerStore ? <div className="meeting-affiliate-selected">{selectedPartnerStore.image ? <img src={selectedPartnerStore.image} alt={`${selectedPartnerStore.name} 매장 사진`} /> : <span className="meeting-affiliate-store-placeholder" aria-hidden="true">{selectedPartnerStore.category}</span>}<div><strong>{selectedPartnerStore.name}</strong><small>{selectedPartnerStore.area} · {selectedPartnerStore.address}</small><em> {selectedPartnerStore.benefit}</em></div><button type="button" onClick={() => { setSelectedPartnerStore(null); }} aria-label="선택한 제휴사 삭제"><X size={16} /></button><button type="button" className="meeting-affiliate-change" onClick={() => setPartnerCatalogOpen(true)}>변경</button></div> : <button type="button" className="meeting-affiliate-search-trigger" onClick={() => setPartnerCatalogOpen(true)}><Search size={17} aria-hidden="true" /><span>팅커벨 제휴 매장 선택</span><ChevronRight size={17} aria-hidden="true" /></button>}</section>
          <label className="meeting-final-nickname">모임장 닉네임<input value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} maxLength={20} /></label>
        </div>
        <div className="meeting-step3-actions"><button type="button" className="meeting-step3-prev" onClick={() => setCreationStep(2)}>이전</button><button type="button" className="meeting-step3-next" onClick={createMeeting}>모임 만들기 완료</button></div>
      </div> : creationStep === 2 ? <div className="meeting-create-step2">
        <header className="meeting-create-step2-header"><button type="button" className="meeting-create-back close-btn" onClick={() => setCreationStep(1)} aria-label="1단계로 돌아가기"><ArrowLeft size={20} /></button><h2 className="meeting-step2-title">모임을 소개해 주세요</h2><button type="button" className="meeting-create-close close-btn" onClick={onClose} aria-label="모임 만들기 닫기"><X size={18} /></button></header>
        <div className="meeting-create-step2-body">
          <div className="meeting-ai-assist"><div><strong>AI 소개</strong></div><button type="button" className={`meeting-ai-toggle ${aiAssist ? "on" : ""}`} onClick={toggleAiIntroduction} aria-pressed={aiAssist} aria-label="AI 소개 토글"><span /></button></div>
          <label className="meeting-step2-label" htmlFor="meeting-introduction">모임 소개</label>
          <textarea id="meeting-introduction" className="meeting-step2-textarea" value={introduction} onChange={(event) => { setIntroduction(event.target.value); if (event.target.value !== aiGeneratedIntroduction) setAiGeneratedIntroduction(""); }} maxLength={200} placeholder="활동 중심으로 10자 이상 소개해 주세요." autoFocus />
          <div className="meeting-step2-counter">{introduction.length}/200</div>
          <div className="meeting-media-upload" aria-label="모임 사진 및 동영상 첨부">
            <label className="meeting-media-add"><input type="file" accept="image/*" multiple onChange={handleMediaChange} disabled={attachedMedia.length >= 6} /><Camera size={22} /><strong>{attachedMedia.length}/6</strong></label>
            <div className="meeting-media-list">{attachedMedia.map((item) => <div className="meeting-media-preview" key={item.id}><img src={item.url} alt={`${item.file.name} 미리보기`} /><button type="button" className="meeting-media-remove" onClick={() => removeMedia(item.id)} aria-label={`${item.file.name} 삭제`}>×</button></div>)}</div>
          </div>{mediaToast && <p className="meeting-media-toast" role="status">{mediaToast}</p>}
        </div>
        <div className="meeting-step2-actions"><button type="button" className="meeting-step2-prev" onClick={() => setCreationStep(1)}>이전</button><button type="button" className="meeting-step2-next" disabled={!canCreate} onClick={() => setCreationStep(3)}>다음</button></div>
      </div> : !areaSettingsOpen ? <>
        <header className="meeting-create-step1-header"><button type="button" className="meeting-create-back close-btn" onClick={onClose} aria-label="커뮤니티로 돌아가기"><ArrowLeft size={20} /></button><div className="meeting-step1-heading"><h2 className="meeting-step1-title">어떤 모임을 만들까요?</h2></div><button type="button" className="meeting-create-close close-btn" onClick={onClose} aria-label="모임 만들기 닫기"><X size={18} /></button></header>
        <div className="meeting-create-step1-body">
          <p className="meeting-step1-copy">동네 이웃과 함께하고 싶은 활동 주제를 선택해 주세요.</p>
          <div className="meeting-step1-section meeting-category-section"><span className="meeting-step1-label">모임 주제</span><div className="meeting-category-chip-list">{basicCategories.map((category) => <button type="button" key={category} className={`meeting-step1-chip meeting-category-chip ${selectedCategory === category ? "selected" : ""}`} aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}><span>{category}</span>{selectedCategory === category && <Check size={15} strokeWidth={3} aria-hidden="true" />}</button>)}</div></div>
          {selectedCategory === "기타" && <div className="meeting-step1-section meeting-custom-topic-section"><input id="meeting-custom-topic-step1" className="meeting-step1-input meeting-custom-topic-input" value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="원하시는 모임 주제를 직접 입력해 주세요 (예: 플리마켓, 보드게임)" aria-label="원하시는 모임 주제 직접 입력" /></div>}
          <div className="meeting-step1-section meeting-name-section"><label className="meeting-step1-label" htmlFor="meeting-name-step1">모임 이름</label><input id="meeting-name-step1" className="meeting-step1-input" value={title} maxLength={50} onChange={(event) => setTitle(event.target.value)} placeholder="예: 산본 주말 저녁 러닝 모임" /></div>
          <div className="meeting-step1-section meeting-area-section"><span className="meeting-step1-label">활동 지역</span><div className="meeting-area-toolbar"><button type="button" className="meeting-area-search" onClick={() => setAreaSettingsOpen(true)} aria-label="활동 지역 검색">⌕ 검색</button><div className="meeting-area-chip-list">{defaultNearbyAreaNames.map((area) => <button type="button" key={area} className={`meeting-step1-chip meeting-area-chip ${selectedAreas.includes(area) ? "selected" : ""}`} onClick={() => toggleArea(area)}>{area}{area === "산본1동" ? " · 현재 위치" : ""}</button>)}</div></div>{selectedAreas.filter((area) => !defaultNearbyAreaNames.includes(area)).map((area) => <button type="button" key={area} className="meeting-step1-chip meeting-area-chip selected" onClick={() => toggleArea(area)}>{area}</button>)}</div>
        </div>
        <div className="meeting-step1-actions"><button type="button" className="meeting-step1-next" disabled={!canContinue} onClick={submit}>다음</button></div>
      </> : createPortal(<LocationSheet
        initialDongs={selectedAreas}
        initialRegionCodes={selectedAreaCodes}
        storageKey="dangam_meeting_creation_dongs"
        onClose={() => setAreaSettingsOpen(false)}
        onApply={(dongs, _label, _detailAddress, regionCodes) => { setSelectedAreas(Array.from(new Set(dongs))); const normalizedRegionCodes = Array.from(new Set((regionCodes ?? []).filter((code) => /^\d{10}$/.test(code)))); setSelectedAreaCodes(normalizedRegionCodes); }}
      />, document.body)}
    </section>{partnerCatalogOpen && <PartnerStorePicker selectedCategory={selectedCategory} selectedAreas={selectedAreas} onClose={() => setPartnerCatalogOpen(false)} onClear={() => { setSelectedPartnerStore(null); setPartnerCatalogOpen(false); }} onSelect={(store) => { setSelectedPartnerStore(store); setPartnerCatalogOpen(false); }} />}
  </div>;
}
function NextGatheringSheet({ source, onClose, onSubmit }: { source: Meeting; onClose: () => void; onSubmit: (next: NextGathering) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const currentCapacity = parseMeetingCapacity(source).maxMembers ?? 4;
  const [title, setTitle] = useState(source.title);
  const [selectedDate, setSelectedDate] = useState("");
  const [timeValue, setTimeValue] = useState("18:00");
  const [capacity, setCapacity] = useState(Math.max(2, Math.min(20, currentCapacity)));
  const [isUnlimited, setIsUnlimited] = useState(parseMeetingCapacity(source).maxMembers === null);
  const [placeMode, setPlaceMode] = useState<MeetingPlaceMode>(source.placeMode ?? "PARTNER");
  const [store, setStore] = useState(source.placeMode === "FREE" ? "" : source.place);
  const [customPlace, setCustomPlace] = useState(source.placeMode === "FREE" ? source.place : "");
  const [customAddress, setCustomAddress] = useState(source.placeMode === "FREE" ? source.address : "");
  const dates = Array.from({ length: 14 }, (_, offset) => { const date = new Date(today); date.setDate(today.getDate() + offset); return date; });
  const timeOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
  const formatTime = (value: string) => { const [rawHour, minute] = value.split(":").map(Number); return `${rawHour < 12 ? "오전" : "오후"} ${rawHour % 12 || 12}:${String(minute).padStart(2, "0")}`; };
  const isCustom = placeMode === "FREE";
  const submit = () => {
    if (!title.trim()) { window.alert("다음 모임 주제를 입력해주세요."); return; }
    if (!selectedDate) { window.alert("다음 모임 날짜를 선택해주세요."); return; }
    if (isCustom && !customPlace.trim()) { window.alert("직접 장소 이름을 입력해주세요."); return; }
    const selectedStore = meetingStores.find((item) => item.name === store) ?? meetingStores[0];
    const date = new Date(`${selectedDate}T${timeValue}:00`);
    onSubmit({ title: title.trim(), schedule: date.toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }), place: isCustom ? customPlace.trim() : store, address: isCustom ? customAddress.trim() || "상세 위치는 채팅방에서 안내해요" : selectedStore.address, capacity: isUnlimited ? null : capacity, placeMode });
  };
  return createPortal(<div className="overlay meeting-overlay next-gathering-portal" onClick={onClose}><section className="next-gathering-sheet" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose} aria-label="다음 모임 설정 닫기"><X size={17} /></button><p className="eyebrow">다음 모임</p><h2>다음 정모·번개 설정</h2><p className="meeting-form-copy">이번 모임과 다른 제목, 인원, 장소로 새 일정을 만들 수 있어요.</p>
    <label className="meeting-form-label">새 번개·정모 주제 <em>필수</em></label><input className="meeting-input" value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} aria-label="다음 모임 주제" />
    <label className="meeting-form-label">약속 날짜·시간 <em>필수</em></label><div className="meeting-date-chip-scroller next-gathering-dates">{dates.map((date, offset) => { const value = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; return <button type="button" key={value} className={`meeting-date-chip ${date.getDay() === 0 ? "holiday" : date.getDay() === 6 ? "saturday" : ""} ${selectedDate === value ? "selected" : ""}`} onClick={() => setSelectedDate(value)}><strong>{offset === 0 ? "오늘" : offset === 1 ? "내일" : `${date.getMonth()+1}/${date.getDate()}`}</strong><span>{["일","월","화","수","목","금","토"][date.getDay()]}</span></button>; })}</div><select className="meeting-simple-time-select" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} aria-label="다음 모임 시간 선택">{timeOptions.map((value) => <option key={value} value={value}>{formatTime(value)}</option>)}</select>
    <label className="meeting-form-label">모집 정원</label><div className={`capacity-control ${isUnlimited ? "unlimited" : ""}`}><button type="button" disabled={isUnlimited} onClick={() => setCapacity((value) => Math.max(2, value - 1))}>−</button>{isUnlimited ? <b>무제한</b> : <input className="capacity-input" type="number" min={2} max={20} value={capacity} onChange={(event) => setCapacity(Math.max(2, Math.min(20, Number(event.target.value) || 2)))} aria-label="다음 모임 모집 정원" />}<button type="button" disabled={isUnlimited} onClick={() => setCapacity((value) => Math.min(20, value + 1))}>＋</button></div><label className="capacity-unlimited-toggle"><input type="checkbox" checked={isUnlimited} onChange={(event) => setIsUnlimited(event.target.checked)} /> 모집 정원 제한 없음 (오픈 커뮤니티)</label>
    <label className="meeting-form-label">모임 장소 <em>필수</em></label><div className="meeting-place-mode-tabs" role="tablist" aria-label="다음 모임 장소 입력 방식"><button type="button" role="tab" aria-selected={!isCustom} className={!isCustom ? "active" : ""} onClick={() => setPlaceMode("PARTNER")}> 팅커벨 제휴 매장 <small>(할인/혜택)</small></button><button type="button" role="tab" aria-selected={isCustom} className={isCustom ? "active" : ""} onClick={() => setPlaceMode("FREE")}> 직접 장소 변경 <small>(일반 모임)</small></button></div>{!isCustom ? <select className="meeting-input meeting-store-select" value={store} onChange={(event) => setStore(event.target.value)} aria-label="다음 모임 제휴 매장 선택">{meetingStores.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.category}</option>)}</select> : <div className="meeting-custom-place-fields"><input className="meeting-input" value={customPlace} onChange={(event) => setCustomPlace(event.target.value)} placeholder="새 장소 이름" aria-label="다음 모임 직접 장소 이름" /><input className="meeting-input" value={customAddress} onChange={(event) => setCustomAddress(event.target.value)} placeholder="상세 위치/주소 (선택)" aria-label="다음 모임 직접 장소 주소" /></div>}
    <button type="button" className="wide-orange meeting-quick-submit" disabled={!selectedDate} onClick={submit}>이 조건으로 다음 모임 공지하기</button></section></div>, document.body);
}

function PartnerReservationDetail({ meeting, viewerRole }: { meeting: Meeting; viewerRole: "consumer" | "partner" }) { if (viewerRole !== "partner") return null; return <div className="partner-reservation-panel"><p className="eyebrow">PARTNER RESERVATION DETAIL</p><h3>주선자(방장) 정보</h3><strong>{meeting.organizerName ?? "홍길동"} (방장)</strong><a className="organizer-phone" href={phoneHref(meeting.organizerPhone ?? "010-1234-5678")}>{meeting.organizerPhone ?? "010-1234-5678"}</a><div className="organizer-actions"><a href={phoneHref(meeting.organizerPhone ?? "010-1234-5678")}><Phone size={15} /> 전화걸기</a><a href={`sms:${meeting.organizerPhone ?? "010-1234-5678"}`}>문자보내기</a></div></div>; }
function LockedMeetingDetail({ meeting, onClose, message }: { meeting: Meeting; onClose: () => void; message: string }) { return <div className="overlay meeting-detail-overlay" onClick={onClose}><section className="meeting-detail-sheet meeting-detail-locked" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose}><X size={17} /></button><div className="locked-meeting-content"><div className="locked-meeting-icon"></div><p className="eyebrow">참여 제한 안내</p><h2>{message.includes("청소년") ? "미성년자는 모임에 참여할 수 없어요" : "상세 정보가 잠겨 있어요"}</h2><p>{message}</p><span>{message.includes("청소년") ? "만 19세 이상 회원만 동네모임의 참여·채팅 기능을 이용할 수 있습니다." : "연령·성별 본인인증 조건이 일치하는 회원만 장소와 모임 정보를 확인할 수 있습니다."}</span><button className="wide-orange" onClick={onClose}>확인</button></div></section></div>; }
function MeetingChatSheet({ meeting, currentUserId = getClientUserId(), onClose, onSchedulesChange, notices = [] }: { meeting: Meeting; currentUserId?: string; onClose: () => void; onSchedulesChange: (schedules: MeetingSchedule[]) => void; notices?: string[] }) {
  const [actionOpen, setActionOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; name: string; text: string; senderId?: string }>>([{ id: "welcome", name: meeting.organizerName ?? "방장", senderId: meeting.hostId, text: "새 모임 채팅방이 열렸어요. 반갑습니다!" }]);
  const [scheduleCreateOpen, setScheduleCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [profileMember, setProfileMember] = useState<MeetingMember | null>(null);
  const [profileNotice, setProfileNotice] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(() => readBlockedUsers());
  useEffect(() => { const syncBlockedUsers = () => setBlockedUsers(readBlockedUsers()); window.addEventListener("dangam:blocked-users-changed", syncBlockedUsers); window.addEventListener("storage", syncBlockedUsers); return () => { window.removeEventListener("dangam:blocked-users-changed", syncBlockedUsers); window.removeEventListener("storage", syncBlockedUsers); }; }, []);
  const blockedIds = new Set(blockedUsers.map((user) => user.id));
  const blockedNames = new Set(blockedUsers.map((user) => user.nickname));
  const schedules = meeting.schedules ?? [];
  const members = meeting.membersList ?? [];
  const currentMember = members.find((member) => member.id === currentUserId);
  const canCreate = meeting.hostId === currentUserId || currentMember?.role === "MANAGER" || Boolean(meeting.allowMemberScheduleCreation);
  const upcoming = schedules.filter((schedule) => new Date(schedule.startAt).getTime() >= Date.now()).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const pinned = upcoming[0];
  const sendMessage = () => { if (!message.trim()) return; setMessages((current) => [...current, { id: `message-${Date.now()}`, name: "나", senderId: currentUserId, text: message.trim() }]); setMessage(""); };
  const toggleScheduleAttendance = (schedule: MeetingSchedule) => { const attendeeIds = toggleMeetingScheduleAttendee(schedule.attendeeIds, currentUserId, schedule.maxMembers); onSchedulesChange(schedules.map((item) => item.id === schedule.id ? { ...item, attendeeIds } : item)); };
  const scheduleBubble = (schedule: MeetingSchedule) => { const attending = schedule.attendeeIds.includes(currentUserId); return <article className="meeting-chat-schedule-card"><strong>{schedule.title}</strong><span>{formatMeetingScheduleDate(schedule.startAt)}</span><span> {schedule.partnerStore?.name ?? "장소 미정"}</span>{schedule.partnerStore?.benefit && <em>{schedule.partnerStore.benefit}</em>}{schedule.partnerStore && <nav className="meeting-schedule-map-links"><a href={`https://map.naver.com/p/search/${encodeURIComponent(schedule.partnerStore.address)}`} target="_blank" rel="noreferrer">네이버 길찾기</a><a href={`https://map.kakao.com/?q=${encodeURIComponent(schedule.partnerStore.address)}`} target="_blank" rel="noreferrer">카카오 길찾기</a></nav>}<div><b>참석 {schedule.attendeeIds.length}명 / 정원 {schedule.maxMembers}명</b><button type="button" className={attending ? "attending" : ""} onClick={() => toggleScheduleAttendance(schedule)}>{attending ? "참석취소" : "참석하기"}</button></div></article>; };
  return <div className="meeting-chat-overlay"><section className="meeting-chat-sheet"><header className="meeting-chat-header"><button type="button" onClick={onClose} aria-label="채팅방 닫기"><ArrowLeft size={21} /></button><div><h2>{meeting.title}</h2><button type="button" className="meeting-chat-member-trigger" onClick={() => setMembersOpen((value) => !value)} aria-expanded={membersOpen}>{members.length || 1}명 참여 중 <Users size={14} /></button></div><button type="button" onClick={onClose} aria-label="채팅방 닫기"><X size={20} /></button></header>{membersOpen && <div className="meeting-chat-member-roster" aria-label="모임 참여자 목록">{members.length ? members.map((member) => <button type="button" key={member.id} onClick={() => { setProfileMember(member); setProfileNotice(""); }}><span>{member.nickname.slice(0, 1)}</span><b>{member.nickname}</b>{member.role === "HOST" && <small>방장</small>}</button>) : <span>참여자 정보를 불러오는 중입니다.</span>}</div>}{profileMember && <div className="meeting-chat-profile-menu"><div><span className="settings-blocked-avatar">{profileMember.nickname.slice(0, 1)}</span><strong>{profileMember.nickname}</strong></div><button type="button" onClick={() => { const added = blockMeetingMember(profileMember); setProfileNotice(added ? `${profileMember.nickname}님을 차단했습니다.` : "이미 차단한 사용자입니다."); }}>차단하기</button><button type="button" onClick={() => { reportMeetingMember(profileMember, `모임 채팅: ${meeting.title}`); setProfileNotice("신고가 접수되었습니다."); }}>신고하기</button><button type="button" onClick={() => setProfileMember(null)}>닫기</button>{profileNotice && <p role="status">{profileNotice}</p>}</div>}{pinned && <button type="button" className="meeting-chat-pinned" onClick={() => window.alert(`${pinned.title}\n${formatMeetingScheduleDate(pinned.startAt)} · ${pinned.partnerStore?.name ?? "장소 미정"}\n참석 ${pinned.attendeeIds.length}명 / 정원 ${pinned.maxMembers}명`)}>다가오는 약속: {formatMeetingScheduleDate(pinned.startAt)} · {pinned.partnerStore?.name ?? "장소 미정"} · 참석 {pinned.attendeeIds.length}명 <ChevronRight size={15} /></button>}<div className="meeting-chat-messages">{messages.filter((item) => !blockedIds.has(item.senderId ?? (item.name === meeting.organizerName ? (meeting.hostId ?? "") : "")) && !blockedNames.has(item.name)).map((item) => <div className="meeting-chat-message" key={item.id}><b>{item.name}</b><p>{item.text}</p></div>)}{notices.map((notice, index) => <div className="meeting-chat-message meeting-chat-notice" key={`notice-${index}`}><p>{notice}</p></div>)}{schedules.filter((schedule) => !blockedNames.has(schedule.createdBy)).map((schedule) => <div className="meeting-chat-message meeting-chat-event" key={`event-${schedule.id}`}><b>{schedule.createdBy} · 일정 공유</b>{scheduleBubble(schedule)}</div>)}</div><div className="meeting-chat-composer"><button type="button" className="meeting-chat-plus" onClick={() => setActionOpen((value) => !value)} aria-label="채팅 첨부 메뉴">+</button><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} placeholder="메시지를 입력하세요" /><button type="button" onClick={sendMessage}>전송</button>{actionOpen && <div className="meeting-chat-actions"><button type="button" disabled={!canCreate} onClick={() => { setActionOpen(false); setScheduleCreateOpen(true); }}> 일정 만들기</button><label> 사진 첨부<input type="file" accept="image/*" onChange={() => { setActionOpen(false); setMessages((current) => [...current, { id: `photo-${Date.now()}`, name: "나", senderId: currentUserId, text: "사진을 첨부했어요." }]); }} /></label></div>}</div>{scheduleCreateOpen && <MeetingScheduleCreateSheet meeting={meeting} creatorName={currentMember?.nickname ?? meeting.organizerName ?? "크루원"} creatorRole={meeting.hostId === currentUserId ? "HOST" : currentMember?.role ?? "MEMBER"} onClose={() => setScheduleCreateOpen(false)} onCreate={(schedule) => { onSchedulesChange([...schedules, schedule]); setScheduleCreateOpen(false); setMessages((current) => [...current, { id: `event-message-${schedule.id}`, name: schedule.createdBy, text: `일정을 공유했어요: ${schedule.title}` }]); }} />}</section></div>;
}
function MeetingDetailSheet({ meeting, currentUserId = getClientUserId(), participation, onJoin, onOpenChat, onConfirmUpdate, onReleaseMeeting, onClose, genderAllowed, ageAllowed, onAccessBlocked, isHost, hostConfirmed, onConfirmMeeting, bulkVisitAuth, onOpenBulkPin, onEditPlace, onCancelPlace, onSchedulesChange, onMembersChange, onScheduleNotice }: { meeting: Meeting; currentUserId?: string; participation: Participation; onJoin?: () => void; onOpenChat?: () => void; onConfirmUpdate: () => void; onReleaseMeeting: () => void; onClose: () => void; genderAllowed: boolean; ageAllowed: boolean; onAccessBlocked: () => void; isHost: boolean; hostConfirmed: boolean; onConfirmMeeting: () => void; bulkVisitAuth?: MeetingBulkVisitAuth; onOpenBulkPin: () => void; onEditPlace: () => void; onCancelPlace: () => void; onSchedulesChange: (schedules: MeetingSchedule[]) => void; onMembersChange: (members: MeetingMember[], allowAll: boolean) => void; onScheduleNotice: (message: string) => void }) {
  const { currentMembers, maxMembers } = participation;
  const upcoming = upcomingScheduleFor(meeting);
  const isOwner = isHost || currentUserId === meeting.hostId;
  const isMember = participation.isJoined;
  const isFull = maxMembers !== null && currentMembers >= maxMembers;
  const canJoin = (!isFull || isMember || isOwner) && genderAllowed && ageAllowed;
  const thumbnail = meetingThumbnailFor(meeting);
  const scheduleLabel = upcoming ? formatMeetingScheduleDate(upcoming.startAt) : (meeting.schedule || "일정은 모임방에서 정해요");
  const memberLabel = maxMembers === null ? `${currentMembers}명 참여 중` : `${currentMembers}/${maxMembers}명 모집`;
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  return <div className="simple-meeting-detail" role="dialog" aria-label={`${meeting.title} 모임 상세`}><header className="simple-meeting-detail-header"><button type="button" onClick={onClose} aria-label="모임 목록으로 돌아가기"><ArrowLeft size={21} /></button><h1>모임 상세</h1><span aria-hidden="true" /></header><main className="simple-meeting-detail-body"><section className="simple-meeting-hero"><img src={thumbnail} alt={`${meeting.title} 모임 썸네일`} /><div><span className="simple-meeting-category">{meeting.customTopic || meetingCategoryLabel(meeting.category)}</span><h2>{meeting.title}</h2><p>{meeting.address.split(",")[0] || "우리 동네"}</p></div></section><section className="simple-meeting-info" aria-label="모임 기본 정보"><div><span>모집 인원</span><strong>{memberLabel}</strong></div><div><span>만나는 일정</span><strong>{scheduleLabel}</strong></div><div><span>모임 장소</span><strong>{meeting.place}</strong></div></section><section className="simple-meeting-intro"><h2>모임 소개</h2><p>{meeting.intro || "동네에서 편하게 만나 이야기 나누고 함께 즐기는 모임입니다."}</p></section>{isOwner && <section className="meeting-host-controls" aria-label="모임장 운영 관리"><div className="meeting-host-controls-heading"><h2>모임 운영</h2><span className={hostConfirmed ? "confirmed" : ""}>{hostConfirmed ? "확정됨" : "확정 전"}</span></div><div className="meeting-host-controls-actions">{!hostConfirmed && participation.maxMembers !== null && participation.currentMembers >= participation.maxMembers && <button type="button" className="primary" onClick={onConfirmMeeting}>모임 확정하기</button>}{!hostConfirmed && (participation.maxMembers === null || participation.currentMembers < participation.maxMembers) && <span className="meeting-host-confirm-hint">모집 정원에 도달하면 모임을 확정할 수 있습니다.</span>}<button type="button" onClick={onEditPlace}>장소 변경</button>{meeting.partnerStore && <button type="button" className="danger" onClick={onCancelPlace}>제휴 매장 예약 취소</button>}<button type="button" className="danger meeting-release-trigger" onClick={() => setReleaseConfirmOpen(true)}>모임 해제</button></div><p>확정 알림은 현재 Preview의 Mock 상태로 기록됩니다.</p></section>}{participation.isJoined && <MeetingScheduleSection meeting={meeting} currentUserId={currentUserId} isHost={isOwner} onChange={onSchedulesChange} onMembersChange={onMembersChange} onScheduleNotice={onScheduleNotice} />}</main>{releaseConfirmOpen && <div className="meeting-release-confirm-overlay" role="presentation"><section className="meeting-release-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="meeting-release-title"><h2 id="meeting-release-title">모임 해제</h2><p>모임을 해제하시겠습니까?</p><div className="meeting-release-confirm-actions"><button type="button" onClick={() => setReleaseConfirmOpen(false)}>취소</button><button type="button" className="danger" onClick={onReleaseMeeting}>모임 해제</button></div></section></div>}<div className={`simple-meeting-cta ${isOwner ? "is-host" : "is-single-action"}`}>{isOwner && <button type="button" className="simple-meeting-cta-copy" onClick={onConfirmUpdate}>이대로 모임 만들기</button>}<button type="button" className="wide-orange" onClick={() => (isOwner || isMember) ? onOpenChat?.() : canJoin ? onJoin?.() : onAccessBlocked()}>{isOwner || isMember ? "채팅방 입장하기" : "모임 가입하기"}</button></div></div>;
}
function defaultMeetingChatDateTime() {
  const local = new Date(Date.now() + 60 * 60 * 1000);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}
function meetingChatStorageKey(roomId: string | number, userId = getClientUserId(), roomType: ChatRoomType = "meet") { return scopedStorageKey(`dangam_chat_messages_${chatRoomDataScope(roomType, roomId)}`, userId); }
function meetingChatNicknameStorageKey(roomId: string | number, userId = getClientUserId(), roomType: ChatRoomType = "meet") { return scopedStorageKey(`dangam_chat_nickname_${chatRoomDataScope(roomType, roomId)}`, userId); }
function readMeetingChatNickname(roomId: string | number, userId = getClientUserId(), roomType: ChatRoomType = "meet") { try { const key = meetingChatNicknameStorageKey(roomId, userId, roomType); const legacyKey = roomType === "meet" ? scopedStorageKey(`dangam_meeting_chat_nickname_room_${roomId}`, userId) : null; const value = window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null); return value?.trim().slice(0, 10) || "민"; } catch { return "민"; } }
function meetingChatNicknameChangedStorageKey(roomId: string | number, userId = getClientUserId(), roomType: ChatRoomType = "meet") { return scopedStorageKey(`dangam_chat_nickname_changed_${chatRoomDataScope(roomType, roomId)}`, userId); }
function readMeetingChatNicknameChanged(roomId: string | number, userId = getClientUserId(), roomType: ChatRoomType = "meet") { try { const key = meetingChatNicknameChangedStorageKey(roomId, userId, roomType); const legacyKey = roomType === "meet" ? scopedStorageKey(`dangam_meeting_chat_nickname_changed_${roomId}`, userId) : null; return window.localStorage.getItem(key) === "true" || Boolean(legacyKey && window.localStorage.getItem(legacyKey) === "true"); } catch { return false; } }
function readRoomBlockedMembers(storageKey: string): Array<{ id: string; nickname: string }> { try { const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown; return Array.isArray(value) ? value.filter((item): item is { id: string; nickname: string } => Boolean(item && typeof item.id === "string" && typeof item.nickname === "string")) : []; } catch { return []; } }
function readRoomBlockState(storageKey: string): boolean { try { return window.localStorage.getItem(storageKey) === "true"; } catch { return false; } }
type MeetingChatSchedule = { id: string; title: string; startAt: string; place: string; maxMembers: number; partnerStore?: PartnerStore; attendeeIds: string[] };
type MeetingChatMessage = { id: string; author: string; text: string; time: string; mine?: boolean; image?: string; schedule?: MeetingChatSchedule; senderId?: string; localOnly?: boolean };
type CommunityEvent = { id: string; meetingId: number; meetingTitle: string; meetingImage: string; meetingPlace: string; schedule: MeetingChatSchedule };
const communityEventsStorageKey = "dangam_community_events";
function readCommunityEvents(): CommunityEvent[] { try { const raw = window.localStorage.getItem(communityEventsStorageKey); return raw ? JSON.parse(raw) as CommunityEvent[] : []; } catch { return []; } }
function publishCommunityEvent(meeting: Meeting, schedule: MeetingChatSchedule) { const event: CommunityEvent = { id: `community-event-${schedule.id}`, meetingId: meeting.id, meetingTitle: meeting.title, meetingImage: meetingThumbnailFor(meeting), meetingPlace: meeting.address, schedule }; const next = [event, ...readCommunityEvents().filter((item) => item.id !== event.id)]; window.localStorage.setItem(communityEventsStorageKey, JSON.stringify(next)); window.dispatchEvent(new CustomEvent("dangam:community-event-created", { detail: event })); return event; }
function saveCommunityEvents(events: CommunityEvent[]) { window.localStorage.setItem(communityEventsStorageKey, JSON.stringify(events)); window.dispatchEvent(new CustomEvent("dangam:community-events-updated", { detail: events })); }
function syncCommunityEventAttendance(scheduleId: string, attendeeIds: string[]) { const events = readCommunityEvents(); let changed = false; const next = events.map((event) => { if (event.schedule.id !== scheduleId) return event; changed = true; return { ...event, schedule: { ...event.schedule, attendeeIds } }; }); if (changed) saveCommunityEvents(next); }
function syncCommunityEventPlace(scheduleId: string, partnerStore?: PartnerStore) { const events = readCommunityEvents(); let changed = false; const next = events.map((event) => { if (event.schedule.id !== scheduleId) return event; changed = true; return { ...event, schedule: { ...event.schedule, partnerStore, place: partnerStore ? formatPartnerStoreAddress(partnerStore) : "장소 미정" } }; }); if (changed) saveCommunityEvents(next); }
function removeMeetingMemberFromScheduleState(meetingId: number, userId: string) {
  const events = readCommunityEvents();
  const nextEvents = events.map((event) => event.meetingId === meetingId ? { ...event, schedule: { ...event.schedule, attendeeIds: removeMeetingScheduleAttendee([event.schedule], userId)[0].attendeeIds } } : event);
  if (nextEvents.some((event, index) => event.schedule.attendeeIds !== events[index]?.schedule.attendeeIds)) saveCommunityEvents(nextEvents);
  const chatKey = meetingChatStorageKey(meetingId, userId);
  try { const raw = window.localStorage.getItem(chatKey); if (raw) { const messages = JSON.parse(raw) as MeetingChatMessage[]; const nextMessages = messages.map((message) => message.schedule ? { ...message, schedule: { ...message.schedule, attendeeIds: removeMeetingScheduleAttendee([message.schedule], userId)[0].attendeeIds } } : message); window.localStorage.setItem(chatKey, JSON.stringify(nextMessages)); } } catch { /* preserve existing messages if local data is malformed */ }
  const meetingKey = scopedStorageKey("dangam_user_meetings", userId);
  try { const raw = window.localStorage.getItem(meetingKey); if (raw) { const meetings = JSON.parse(raw) as Meeting[]; const nextMeetings = meetings.map((meeting) => meeting.id === meetingId && meeting.schedules ? { ...meeting, schedules: removeMeetingScheduleAttendee(meeting.schedules, userId) } : meeting); window.localStorage.setItem(meetingKey, JSON.stringify(nextMeetings)); } } catch { /* preserve existing meeting records if local data is malformed */ }
}
function formatChatScheduleDate(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value; const weekday = meetingWeekdays[date.getDay()]; const pad = (number: number) => String(number).padStart(2, "0"); return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} (${weekday}) ${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function formatReservationScheduleLabel(value: string) {
  const match = value.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/);
  if (match) return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일 ${match[4].padStart(2, "0")}:${match[5]}`;
  return value.replaceAll("T", " ").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}
function defaultMeetingMessages(meeting: Meeting): MeetingChatMessage[] { if (meeting.isExperienceDirectChat) return [
  { id: "experience-welcome", author: "사업자", text: `안녕하세요. ${meeting.title} 체험단 문의 채팅입니다. 방문 일정과 체험 안내를 도와드릴게요.`, time: "18:42" },
  { id: "experience-reply", author: "민", text: "안녕하세요. 방문 일정 확인하고 약속을 잡고 싶어요.", time: "18:45", mine: true },
]; return [
  { id: "welcome", author: "모임장 지수", text: "안녕하세요 민님! 모임에 오신 걸 진심으로 환영해요 ", time: "18:42" },
  { id: "reply", author: "서준", text: "안녕하세요~ 반갑습니다! 편하게 소통해요 ", time: "18:45" },
  { id: "mine", author: "민", text: "네, 반갑습니다! 잘 부탁드려요.", time: "18:47", mine: true },
]; }
function readMeetingChatMessages(meeting: Meeting, userId = getClientUserId(), roomId: string | number = meeting.id, roomType: ChatRoomType = "meet"): MeetingChatMessage[] {
  try {
    const key = meetingChatStorageKey(roomId, userId, roomType);
    let raw = window.localStorage.getItem(key);
    if (!raw && roomType === "meet") {
      const legacyKey = scopedStorageKey(`dangam_meeting_chat_messages_${roomId}`, userId);
      raw = window.localStorage.getItem(legacyKey);
      if (raw) window.localStorage.setItem(key, raw);
    }
    const saved = raw ? JSON.parse(raw) as MeetingChatMessage[] : null;
    const hasLegacyWelcome = saved?.some((item) => item.text.includes("7시까지") || item.text.includes("이번 주 모임에 오시나요"));
    return saved && !hasLegacyWelcome ? saved : defaultMeetingMessages(meeting);
  } catch {
    return defaultMeetingMessages(meeting);
  }
}
function MeetingGroupChat({ meeting, participation, onBack, onToast, onLeave, onMeetingSchedulesChange, remoteTrialApplicationId, roomId, reviewMission, reviewMissionStatus }: { meeting: Meeting; participation: Participation; onBack: () => void; onToast?: (message: string) => void; onLeave?: (meetingId: number, roomId: string | number, roomType: ChatRoomType, serverRoomId: number | null) => void; onMeetingSchedulesChange?: (schedules: MeetingSchedule[]) => void; remoteTrialApplicationId?: string; roomId?: string; reviewMission?: string; reviewMissionStatus?: string }) {
  const currentUserId = getClientUserId();
  const chatType: ChatRoomType = remoteTrialApplicationId || (meeting.isExperienceDirectChat && !meeting.isReservationDirectChat) ? "review" : "meet";
  const chatRoomIdentity = roomId ?? remoteTrialApplicationId ?? meeting.id;
  const chatKey = meetingChatStorageKey(chatRoomIdentity, currentUserId, chatType);
  const defaultScheduleRsvpKey = scopedStorageKey(`dangam_meeting_schedule_rsvp_${chatRoomDataScope(chatType, chatRoomIdentity)}_${encodeURIComponent(meeting.schedule ?? "")}`, currentUserId);
  const [fallbackScheduleAttending, setFallbackScheduleAttending] = useState(() => { try { return window.localStorage.getItem(defaultScheduleRsvpKey) === "1"; } catch { return false; } });
  const hiddenMessageStorageKey = `${chatKey}_hidden_message_ids`;
  const editedMessageStorageKey = `${chatKey}_edited_message_texts`;
  const blockedMembersStorageKey = `${chatKey}_blocked_member_ids`;
  const roomBlockStorageKey = `${chatKey}_blocked`;
  useEffect(() => { if (chatType === "meet") clearMeetingUnreadCount(meeting.id); }, [chatType, meeting.id]);
  const [message, setMessage] = useState("");
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [messageDeleteId, setMessageDeleteId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(() => { try { return new Set<string>(JSON.parse(window.localStorage.getItem(hiddenMessageStorageKey) ?? "[]") as string[]); } catch { return new Set<string>(); } });
  const [editedMessageTexts, setEditedMessageTexts] = useState<Record<string, string>>(() => { try { return JSON.parse(window.localStorage.getItem(editedMessageStorageKey) ?? "{}") as Record<string, string>; } catch { return {}; } });
  const [messages, setMessages] = useState<MeetingChatMessage[]>(() => readMeetingChatMessages(meeting, currentUserId, chatRoomIdentity, chatType));
  const [communicationRoomId, setCommunicationRoomId] = useState<number | null>(null);
  const joinCommunicationRoom = trpc.communication.joinRoom.useMutation();
  const leaveCommunicationRoom = trpc.communication.leaveRoom.useMutation();
  const sendCommunicationMessage = trpc.communication.sendMessage.useMutation();
  const markCommunicationRead = trpc.communication.markRead.useMutation();
  const uploadCommunicationMedia = trpc.media.upload.useMutation();
  const [olderCursor, setOlderCursor] = useState<number | null>(null); const [hasOlderMessages, setHasOlderMessages] = useState(true); const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false); const remoteMessages = trpc.communication.listMessages.useQuery({ roomId: communicationRoomId ?? -1, clientUserId: currentUserId, limit: 200 }, { enabled: communicationRoomId !== null, refetchInterval: 2000, staleTime: 1000 }); const olderMessages = trpc.communication.listMessages.useQuery({ roomId: communicationRoomId ?? -1, clientUserId: currentUserId, limit: 200, beforeId: olderCursor ?? undefined }, { enabled: communicationRoomId !== null && olderCursor !== null, staleTime: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachmentDrawerOpen, setAttachmentDrawerOpen] = useState(false);
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const [blockedRoomMembers, setBlockedRoomMembers] = useState(() => readRoomBlockedMembers(blockedMembersStorageKey));
  const [reviewRoomBlocked, setReviewRoomBlocked] = useState(() => readRoomBlockState(roomBlockStorageKey));
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [nicknameEditOpen, setNicknameEditOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [nicknameError, setNicknameError] = useState("");
  const [nicknameChanged, setNicknameChanged] = useState(() => readMeetingChatNicknameChanged(chatRoomIdentity, currentUserId, chatType));
  const [chatNickname, setChatNickname] = useState(() => readMeetingChatNickname(chatRoomIdentity, currentUserId, chatType));
  const [nicknameDraft, setNicknameDraft] = useState(() => readMeetingChatNickname(chatRoomIdentity, currentUserId, chatType));
  const centralTrialChatQuery = useQuery({
    queryKey: ["consumer-trial-chat", chatRoomDataScope("review", chatRoomIdentity)],
    queryFn: () => remoteTrialApplicationId ? consumerApi.listTrialChatMessages(remoteTrialApplicationId) : Promise.resolve([]),
    enabled: Boolean(remoteTrialApplicationId),
    refetchInterval: 2000,
  });
  const toTrialMessages = (rows: Awaited<ReturnType<typeof consumerApi.listTrialChatMessages>>) => rows.map((row) => ({
    id: row.publicId,
    author: row.senderRole === "consumer" ? chatNickname : row.senderName,
    text: row.text,
    time: new Date(row.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    mine: row.senderRole === "consumer",
  }));
  useEffect(() => {
    if (!remoteTrialApplicationId || !centralTrialChatQuery.data) return;
    const serverMessages = toTrialMessages(centralTrialChatQuery.data);
    setMessages((current) => [...serverMessages, ...current.filter((item) => item.localOnly && !serverMessages.some((serverItem) => serverItem.id === item.id))]);
  }, [remoteTrialApplicationId, centralTrialChatQuery.data, chatNickname]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".chat-room-layout-more")) return;
      if (headerMenuRef.current && !headerMenuRef.current.contains(target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [menuOpen]);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleStartAt, setScheduleStartAt] = useState(() => defaultMeetingDateTime());
  const [schedulePlace, setSchedulePlace] = useState("");
  const [scheduleMaxMembers, setScheduleMaxMembers] = useState("8");
  const [selectedPartnerStore, setSelectedPartnerStore] = useState<PartnerStore | null>(null);
  const [partnerStorePickerOpen, setPartnerStorePickerOpen] = useState(false);
  const [schedulePreviewOpen, setSchedulePreviewOpen] = useState(false);
  const [scheduleMapOpen, setScheduleMapOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null); const messagesContainerRef = useRef<HTMLElement | null>(null); const stickToLatestMessageRef = useRef(true); const pendingPrependScrollHeightRef = useRef<number | null>(null); const processedOlderCursorRef = useRef<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("비매너/욕설/비방");
  const [reportReason, setReportReason] = useState("");
  const [reportEvidence, setReportEvidence] = useState<AdminReport["evidence"] | null>(null);
  const closeScheduleComposer = () => { setScheduleOpen(false); setPartnerStorePickerOpen(false); setScheduleTitle(""); setScheduleStartAt(defaultMeetingDateTime()); setSchedulePlace(""); setScheduleMaxMembers("8"); setSelectedPartnerStore(null);  };
  useEffect(() => { if (remoteTrialApplicationId) { setCommunicationRoomId(null); return; } let active = true; joinCommunicationRoom.mutate({ meetingId: meeting.id, meetingTitle: meeting.title, thumbnailUrl: meetingThumbnailFor(meeting), category: meeting.category, roomType: chatType, clientUserId: currentUserId, displayName: chatNickname }, { onSuccess: (room) => { if (active) setCommunicationRoomId(room.id); } }); return () => { active = false; }; }, [remoteTrialApplicationId, meeting.id, meeting.title, meeting.coverImage, meeting.detailImages?.[0], meeting.mediaUrls?.[0], meeting.thumbnail, meeting.image, meeting.category, currentUserId, chatNickname]);
  useEffect(() => { const savedNickname = readMeetingChatNickname(chatRoomIdentity, currentUserId, chatType); setChatNickname(savedNickname); setNicknameDraft(savedNickname); setNicknameChanged(readMeetingChatNicknameChanged(chatRoomIdentity, currentUserId, chatType)); }, [chatRoomIdentity, chatType, currentUserId]);
  const lastNotifiedMessageRef = useRef<number | null>(null);
  useEffect(() => { const rows = remoteMessages.data ?? []; if (!rows.length) return; const newest = rows[0]; const activityAt = new Date(newest.createdAt).getTime(); if (Number.isFinite(activityAt)) markMeetingChatActivity(meeting.id, activityAt); if (communicationRoomId !== null) void markCommunicationRead.mutateAsync({ roomId: communicationRoomId, clientUserId: currentUserId, messageId: newest.id }).catch(() => undefined); if (newest.senderId !== currentUserId && lastNotifiedMessageRef.current !== newest.id && typeof Notification !== "undefined" && Notification.permission === "granted") { new Notification(`${meeting.title} 새 메시지`, { body: newest.text ?? "사진을 보냈어요." }); } lastNotifiedMessageRef.current = newest.id; if (olderCursor === null) setHasOlderMessages(rows.length === 200); const mapped = rows.slice().reverse().filter((row) => !hiddenMessageIds.has(String(row.id))).map((row) => ({ id: String(row.id), author: row.senderId === currentUserId ? chatNickname : row.senderName, text: editedMessageTexts[String(row.id)] ?? row.text ?? (row.attachmentUrl ? "사진을 보냈어요." : ""), time: new Date(row.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }), mine: row.senderId === currentUserId, senderId: String(row.senderId), image: row.attachmentUrl ?? undefined })); setMessages((current) => { const incomingIds = new Set(mapped.map((item) => item.id)); return [...current.filter((item) => !incomingIds.has(item.id)), ...mapped]; }); }, [remoteMessages.data, currentUserId, communicationRoomId, meeting.title, chatNickname, hiddenMessageIds, editedMessageTexts, olderCursor]);
  useEffect(() => { if (communicationRoomId === null) return; setOlderCursor(null); setHasOlderMessages(true); setIsLoadingOlderMessages(false); processedOlderCursorRef.current = null; }, [communicationRoomId]); useEffect(() => { const rows = olderMessages.data ?? []; if (olderCursor === null || olderMessages.isFetching || processedOlderCursorRef.current === olderCursor) return; processedOlderCursorRef.current = olderCursor; setIsLoadingOlderMessages(false); if (!rows.length) { setHasOlderMessages(false); setOlderCursor(null); return; } const mapped = rows.slice().reverse().filter((row) => !hiddenMessageIds.has(String(row.id))).map((row) => ({ id: String(row.id), author: row.senderId === currentUserId ? chatNickname : row.senderName, text: editedMessageTexts[String(row.id)] ?? row.text ?? (row.attachmentUrl ? "사진을 보냈어요." : ""), time: new Date(row.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }), mine: row.senderId === currentUserId, senderId: String(row.senderId), image: row.attachmentUrl ?? undefined })); setMessages((current) => { const existingIds = new Set(current.map((item) => item.id)); return [...mapped.filter((item) => !existingIds.has(item.id)), ...current]; }); if (rows.length < 200) setHasOlderMessages(false); setOlderCursor(null); }, [olderMessages.data, olderMessages.isFetching, olderCursor, currentUserId, chatNickname, hiddenMessageIds, editedMessageTexts]);
  useEffect(() => { if (typeof Notification === "undefined" || Notification.permission !== "default") return; const request = () => { void Notification.requestPermission(); }; window.addEventListener("click", request, { once: true }); return () => window.removeEventListener("click", request); }, []);
  useEffect(() => { window.localStorage.setItem(chatKey, JSON.stringify(messages)); }, [chatKey, messages]); useEffect(() => { window.localStorage.setItem(hiddenMessageStorageKey, JSON.stringify([...hiddenMessageIds])); }, [hiddenMessageStorageKey, hiddenMessageIds]); useEffect(() => { window.localStorage.setItem(editedMessageStorageKey, JSON.stringify(editedMessageTexts)); }, [editedMessageStorageKey, editedMessageTexts]); const handleMessagesScroll = () => { const element = messagesContainerRef.current; if (!element) return; stickToLatestMessageRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 56; if (element.scrollTop <= 48 && hasOlderMessages && !isLoadingOlderMessages && communicationRoomId !== null) { const oldestId = messages.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b)[0]; if (oldestId !== undefined) { pendingPrependScrollHeightRef.current = element.scrollHeight; processedOlderCursorRef.current = null; setIsLoadingOlderMessages(true); setOlderCursor(oldestId); } } }; useEffect(() => { const element = messagesContainerRef.current; if (!element) return; const frame = window.requestAnimationFrame(() => { if (pendingPrependScrollHeightRef.current !== null) { element.scrollTop += element.scrollHeight - pendingPrependScrollHeightRef.current; pendingPrependScrollHeightRef.current = null; return; } if (stickToLatestMessageRef.current) element.scrollTop = element.scrollHeight; }); return () => window.cancelAnimationFrame(frame); }, [messages.length, communicationRoomId]);
  const latestSchedule = [...messages].reverse().find((item) => item.schedule)?.schedule;
  const openNicknameEditor = () => { setMenuOpen(false); if (nicknameChanged) { onToast?.("채팅방 닉네임은 최초 1회만 변경할 수 있습니다."); return; } setNicknameError(""); setNicknameDraft(chatNickname); setNicknameEditOpen(true); };
  const completeNicknameChange = () => { const nextNickname = nicknameDraft.trim().slice(0, 10); if (nicknameChanged) { setNicknameEditOpen(false); onToast?.("채팅방 닉네임은 최초 1회만 변경할 수 있습니다."); return; } if (!nextNickname) { setNicknameError("닉네임을 입력해 주세요."); return; } const duplicate = messages.some((item) => !item.mine && item.author.trim() === nextNickname); if (duplicate) { setNicknameError("이미 이 채팅방에서 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요."); return; } const roomId = chatRoomIdentity; window.localStorage.setItem(meetingChatNicknameStorageKey(roomId, currentUserId, chatType), nextNickname); window.localStorage.setItem(meetingChatNicknameChangedStorageKey(roomId, currentUserId, chatType), "true"); setChatNickname(nextNickname); setNicknameChanged(true); setMessages((current) => current.map((item) => item.mine ? { ...item, author: nextNickname } : item)); setNicknameEditOpen(false); onToast?.("닉네임이 변경되었습니다."); };
  const requestLeaveChat = () => { setMenuOpen(false); setLeaveConfirmOpen(true); };
  const confirmLeaveChat = () => { const roomId = chatRoomIdentity; window.localStorage.removeItem(meetingChatNicknameStorageKey(roomId, currentUserId, chatType)); window.localStorage.removeItem(meetingChatNicknameChangedStorageKey(roomId, currentUserId, chatType)); setChatNickname("민"); setNicknameDraft("민"); setNicknameChanged(false); setLeaveConfirmOpen(false); onLeave?.(meeting.id, chatRoomIdentity, chatType, communicationRoomId); if (!onLeave) onBack(); if (communicationRoomId !== null) void leaveCommunicationRoom.mutateAsync({ roomId: communicationRoomId, clientUserId: currentUserId }).catch(() => onToast?.("탈퇴 처리에 실패했지만 목록으로 이동합니다.")); onToast?.("모임에서 탈퇴했습니다."); };
  const pinnedSchedule = meeting.isExperienceDirectChat ? { title: "지원자가 예약한 방문 희망 일정", startAt: meeting.schedule.replace(/^희망 방문 /, "").replaceAll(".", "-").replace(" ", "T") + ":00", place: meeting.place, maxMembers: 1, partnerStore: undefined, attendeeIds: [currentUserId] } : latestSchedule ?? (meeting.schedule ? { title: "다음 모임", startAt: meeting.schedule, place: meeting.place, maxMembers: participation.maxMembers ?? 20, partnerStore: undefined, attendeeIds: fallbackScheduleAttending ? [currentUserId] : [] } : undefined);
  const showPinnedScheduleActions = Boolean(meeting.isReservationDirectChat || meeting.isExperienceDirectChat || isConcreteMeetingSchedule(pinnedSchedule)); const isAttendingPinnedSchedule = latestSchedule ? latestSchedule.attendeeIds.includes(currentUserId) : fallbackScheduleAttending; const pinnedScheduleAttendeeCount = latestSchedule ? latestSchedule.attendeeIds.length : Math.max(1, participation.currentMembers - 1) + (fallbackScheduleAttending ? 1 : 0); const isPinnedScheduleAtCapacity = latestSchedule ? !isAttendingPinnedSchedule && latestSchedule.attendeeIds.length >= latestSchedule.maxMembers : !isAttendingPinnedSchedule && Math.max(1, participation.currentMembers - 1) >= (participation.maxMembers ?? 20); const togglePinnedScheduleAttendance = () => { if (latestSchedule) { toggleScheduleAttendance(latestSchedule.id); return; } toggleDefaultScheduleAttendance(); }; const openMessageActions = (item: MeetingChatMessage) => { if (!item.mine) return; setMessageActionId(item.id); };
  const beginMessageEdit = (item: MeetingChatMessage) => { setEditingMessageId(item.id); setMessage(item.text); setMessageActionId(null); };
  const deleteMessage = (messageId: string) => { setMessages((current) => current.filter((item) => item.id !== messageId)); setHiddenMessageIds((current) => new Set(current).add(messageId)); setMessageActionId(null); setMessageDeleteId(null); if (editingMessageId === messageId) { setEditingMessageId(null); setMessage(""); } onToast?.("메시지가 삭제되었습니다."); };
  const send = () => {
    const text = message.trim();
    if (!text) return;
    if (reviewRoomBlocked) { onToast?.("차단한 체험단 대화에서는 메시지를 보낼 수 없습니다."); return; }
    if (editingMessageId) {
      setMessages((current) => current.map((item) => item.id === editingMessageId ? { ...item, text } : item));
      setEditedMessageTexts((current) => ({ ...current, [editingMessageId]: text }));
      setEditingMessageId(null); setMessage(""); onToast?.("메시지가 수정되었습니다."); return;
    }
    if (chatType === "meet") markMeetingChatActivity(meeting.id);
    const clientMessageId = `${chatKey}:${currentUserId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    setMessages((current) => [...current, { id: clientMessageId, author: chatNickname, text, time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }), mine: true, senderId: currentUserId }]);
    setMessage("");
    if (remoteTrialApplicationId) {
      void consumerApi.sendTrialChatMessage(remoteTrialApplicationId, text)
        .then(() => consumerApi.listTrialChatMessages(remoteTrialApplicationId))
        .then((rows) => { const serverMessages = toTrialMessages(rows); setMessages((current) => [...serverMessages, ...current.filter((item) => item.localOnly && !serverMessages.some((serverItem) => serverItem.id === item.id))]); })
        .catch(() => onToast?.("메시지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } else if (communicationRoomId !== null) {
      void sendCommunicationMessage.mutateAsync({ roomId: communicationRoomId, clientMessageId, senderId: currentUserId, senderName: chatNickname, text })
        .catch(() => onToast?.("메시지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }
  };
  const attachPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || reviewRoomBlocked) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const image = typeof reader.result === "string" ? reader.result : "";
      if (!image) return;
      if (chatType === "meet") markMeetingChatActivity(meeting.id);
      const clientMessageId = `${chatKey}:photo:${currentUserId}:${Date.now()}`;
      const localPhoto: MeetingChatMessage = { id: clientMessageId, author: chatNickname, text: "사진을 보냈어요.", time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }), mine: true, senderId: currentUserId, image, ...(chatType === "review" ? { localOnly: true } : {}) };
      setMessages((current) => [...current, localPhoto]);
      if (communicationRoomId !== null) {
        try {
          const uploaded = await uploadCommunicationMedia.mutateAsync({ originalName: file.name, mimeType: file.type, sizeBytes: file.size, dataBase64: image });
          await sendCommunicationMessage.mutateAsync({ roomId: communicationRoomId, clientMessageId, senderId: currentUserId, senderName: chatNickname, attachmentUrl: uploaded.url, attachmentType: file.type });
        } catch { onToast?.("사진을 저장하지 못했습니다. 다시 시도해 주세요."); }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };
  const syncLinkedMeetingSchedules = (schedule: MeetingChatSchedule) => { const linked: MeetingSchedule = { id: schedule.id, title: schedule.title, startAt: schedule.startAt, maxMembers: schedule.maxMembers, partnerStore: schedule.partnerStore, attendeeIds: schedule.attendeeIds, createdBy: chatNickname, creatorRole: "MEMBER" }; const next = [...(meeting.schedules ?? []).filter((item) => item.id !== linked.id), linked]; onMeetingSchedulesChange?.(next); };
  const createSchedule = () => {
    if (chatType === "review" && reviewRoomBlocked) { onToast?.("차단한 체험단 대화에서는 일정을 제안할 수 없습니다."); return; }
    const maxMembers = Number(scheduleMaxMembers);
    if (!scheduleTitle.trim() || !schedulePlace.trim()) { onToast?.("일정 제목과 만나는 장소를 입력해 주세요."); return; }
    if (!scheduleStartAt) { onToast?.("날짜와 시간을 선택해 주세요"); return; }
    if (!Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > 20) { onToast?.("모집 인원은 1명부터 20명까지 입력해 주세요."); return; }
    const createdAt = Date.now();
    const schedule: MeetingChatSchedule = { id: `${chatRoomDataScope(chatType, chatRoomIdentity)}:chat-schedule-${createdAt}`, title: scheduleTitle.trim(), startAt: scheduleStartAt, place: schedulePlace.trim(), maxMembers, partnerStore: selectedPartnerStore ?? undefined, attendeeIds: [] };
    if (chatType === "review") {
      const proposalText = `체험 일정 제안 · ${schedule.title}\n희망 일시: ${formatChatScheduleDate(schedule.startAt)}\n매장/장소: ${schedule.partnerStore?.name ?? schedule.place}`;
      const proposal: MeetingChatMessage = { id: `${chatKey}:schedule:${createdAt}`, author: chatNickname, text: proposalText, time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }), mine: true, senderId: currentUserId, ...(remoteTrialApplicationId ? {} : { localOnly: true }) };
      if (remoteTrialApplicationId) {
        void consumerApi.sendTrialChatMessage(remoteTrialApplicationId, proposalText)
          .then(() => consumerApi.listTrialChatMessages(remoteTrialApplicationId))
          .then((rows) => { const serverMessages = toTrialMessages(rows); setMessages((current) => [...serverMessages, ...current.filter((item) => item.localOnly && !serverMessages.some((serverItem) => serverItem.id === item.id))]); })
          .catch(() => onToast?.("체험 일정 제안을 저장하지 못했습니다. 다시 시도해 주세요."));
      } else {
        setMessages((current) => [...current, proposal]);
      }
      closeScheduleComposer();
      onToast?.("체험 일정 제안을 보냈습니다.");
      return;
    }
    setMessages((current) => [...current, { id: `${chatKey}:schedule-message-${createdAt}`, author: chatNickname, text: "새 모임 일정", time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }), mine: true, senderId: currentUserId, schedule }]);
    publishCommunityEvent(meeting, schedule);
    syncLinkedMeetingSchedules(schedule);
    setScheduleTitle(""); setScheduleStartAt(""); setSchedulePlace(""); setSelectedPartnerStore(null); closeScheduleComposer();
  };
  const toggleDefaultScheduleAttendance = () => { const next = !fallbackScheduleAttending; const currentCount = Math.max(1, participation.currentMembers - 1); if (next && currentCount >= (participation.maxMembers ?? 20)) return; setFallbackScheduleAttending(next); try { if (next) window.localStorage.setItem(defaultScheduleRsvpKey, "1"); else window.localStorage.removeItem(defaultScheduleRsvpKey); } catch {} }; const toggleScheduleAttendance = (scheduleId: string) => { const target = messages.find((item) => item.schedule?.id === scheduleId)?.schedule; if (!target) return; const attendeeIds = toggleMeetingScheduleAttendee(target.attendeeIds, currentUserId, target.maxMembers); if (attendeeIds === target.attendeeIds) return; const nextSchedule = { ...target, attendeeIds }; setMessages((current) => current.map((item) => item.schedule?.id === scheduleId ? { ...item, schedule: nextSchedule } : item)); syncCommunityEventAttendance(scheduleId, attendeeIds); syncLinkedMeetingSchedules(nextSchedule); };
  const blockCandidates = Array.from(new Map([
    ...(meeting.membersList ?? []).filter((member) => member.id !== currentUserId).map((member) => [member.id, { id: member.id, nickname: member.nickname }] as const),
    ...messages.filter((item) => !item.mine && item.senderId && item.senderId !== currentUserId).map((item) => [item.senderId!, { id: item.senderId!, nickname: item.author }] as const),
  ]).values());
  const openRoomBlockAction = () => {
    setMenuOpen(false);
    if (chatType === "review") {
      if (reviewRoomBlocked) {
        window.localStorage.removeItem(roomBlockStorageKey); setReviewRoomBlocked(false); onToast?.("체험단 대화 차단을 해제했습니다."); return;
      }
      if (!window.confirm("이 체험단 대화를 차단할까요? 차단하면 이 방에서 메시지를 보내거나 볼 수 없습니다.")) return;
      window.localStorage.setItem(roomBlockStorageKey, "true"); setReviewRoomBlocked(true); onToast?.("체험단 대화를 차단했습니다."); return;
    }
    if (!blockCandidates.length) { onToast?.("차단할 대화 상대를 찾을 수 없습니다."); return; }
    setBlockPickerOpen(true);
  };
  const toggleRoomMemberBlock = (member: { id: string; nickname: string }) => {
    const blocked = blockedRoomMembers.some((item) => item.id === member.id);
    const next = blocked ? blockedRoomMembers.filter((item) => item.id !== member.id) : [...blockedRoomMembers, member];
    try { window.localStorage.setItem(blockedMembersStorageKey, JSON.stringify(next)); setBlockedRoomMembers(next); setBlockPickerOpen(false); onToast?.(blocked ? `${member.nickname}님 차단을 해제했습니다.` : `${member.nickname}님을 이 방에서 차단했습니다.`); }
    catch { onToast?.("차단 설정을 저장하지 못했습니다."); }
  };
  const openReport = () => { setMenuOpen(false); setReportEvidence({ capturedAt: new Date().toISOString(), messages: messages.slice(-30) }); setReportOpen(true); };
  const submitReport = () => { if (!reportEvidence) return; const report: AdminReport = { id: `report-${Date.now()}`, createdAt: new Date().toISOString(), reporterId: currentUserId, meetingId: meeting.id, meetingTitle: meeting.title, chatType, chatRoomId: String(chatRoomIdentity), reportType, reason: reportReason.trim(), evidence: reportEvidence, status: "대기중" }; try { const current = JSON.parse(window.localStorage.getItem("dangam_admin_reports") ?? "[]") as AdminReport[]; window.localStorage.setItem("dangam_admin_reports", JSON.stringify([report, ...current])); window.dispatchEvent(new CustomEvent("dangam:admin-report-created", { detail: report })); } catch { window.localStorage.setItem("dangam_admin_reports", JSON.stringify([report])); } setReportOpen(false); setReportReason(""); onToast?.("신고가 정상적으로 접수되었습니다. 관리자 검토 후 조치됩니다."); };
  const visibleRoomMessages = reviewRoomBlocked ? [] : messages.filter((item) =>
    !hiddenMessageIds.has(item.id)
    && !blockedRoomMembers.some((blocked) => blocked.id === item.senderId || blocked.nickname === item.author)
  );
  return <ChatRoomLayout
    className={`meeting-group-chat-page ${meeting.isExperienceDirectChat || meeting.isReservationDirectChat ? "meeting-direct-inquiry-chat" : ""}`}
    ariaLabel={`${meeting.title} 모임 채팅방`}
    title={meeting.title}
    subtitle={`${participation.currentMembers}명`}
    onBack={onBack}
    onMore={() => { setAttachmentDrawerOpen(false); setMenuOpen((value) => !value); }}    moreExpanded={menuOpen}
    headerMenu={menuOpen && (
      <div className="meeting-group-chat-menu" ref={headerMenuRef} role="menu" aria-label="채팅방 관리">
        <button type="button" role="menuitem" onClick={openNicknameEditor}>닉네임 변경</button>
        <button type="button" role="menuitem" onClick={openReport}>신고하기</button>
        <button type="button" role="menuitem" onClick={openRoomBlockAction}>{chatType === "review" && reviewRoomBlocked ? "차단 해제" : "차단하기"}</button>
        {chatType === "meet" && <><div className="meeting-chat-menu-divider" role="separator" /><button type="button" role="menuitem" onClick={requestLeaveChat}>모임 탈퇴</button></>}
      </div>
    )}
    banner={chatType === "review" ? (
      <div className="meeting-group-chat-pinned meeting-group-chat-pinned-review" aria-label="체험단 정보와 미션 상태">
        <img src={meeting.image} alt="" />
        <span className="meeting-group-chat-pinned-review-copy">
          <strong>{meeting.place || meeting.title}</strong>
          <span>{reviewMission || meeting.benefit || meeting.title}</span>
        </span>
        <span className="meeting-group-chat-review-status">{reviewMissionStatus || "신청 확인 중"}</span>
      </div>
    ) : (
      <div className={`meeting-group-chat-pinned meeting-group-chat-pinned-tinkerbell ${pinnedSchedule ? "has-schedule" : ""} ${showPinnedScheduleActions ? "" : "no-attendance"}`}>
        <button type="button" className="meeting-group-chat-pinned-copy" onClick={() => { if (chatType !== "meet") return; setAttachmentDrawerOpen(false); if (latestSchedule) setSchedulePreviewOpen(true); else setScheduleOpen(true); }}>
          <span className="meeting-group-chat-pinned-label">{meeting.isReservationDirectChat ? "방문 일정:" : "다음 모임"}</span>
          {!showPinnedScheduleActions && <span className="meeting-group-chat-pinned-divider" aria-hidden="true" />}
          <span className="meeting-group-chat-pinned-description">
            {pinnedSchedule ? (
              meeting.isReservationDirectChat
                ? formatReservationScheduleLabel(meeting.schedule)
                : <>
                    {latestSchedule ? formatChatScheduleDate(pinnedSchedule.startAt) : formatMeetingSchedule(pinnedSchedule.startAt)} · {pinnedSchedule.place}
                    {pinnedSchedule.partnerStore && <em className="meeting-schedule-benefit-badge">제휴 매장 혜택 적용</em>}
                  </>
            ) : !meeting.isReservationDirectChat ? (
              <>일정은 모임방에서 정해요 · {(meeting.address || "산본1동").replace(/\s*활동 지역$/, "")} 활동 지역</>
            ) : (
              <>방문 일정을 확인해 주세요</>
            )}
          </span>
          {!showPinnedScheduleActions && <ChevronRight className="meeting-group-chat-pinned-chevron" size={14} aria-hidden="true" />}
        </button>
        {showPinnedScheduleActions && <div className="meeting-group-chat-pinned-actions">
          {meeting.isReservationDirectChat ? <span className="meeting-group-chat-attendance">방문 일정</span> : <>
            <span className="meeting-group-chat-attendance">참석 {pinnedScheduleAttendeeCount}명</span>
            <button type="button" className={`meeting-group-chat-rsvp ${isAttendingPinnedSchedule ? "attending" : ""}`} aria-label={isAttendingPinnedSchedule ? "참석 취소" : "참석하기"} disabled={isPinnedScheduleAtCapacity} onClick={togglePinnedScheduleAttendance}>{isAttendingPinnedSchedule ? "참석중" : "참석"}</button>
          </>}
        </div>}
      </div>
    )}
    messagesRef={messagesContainerRef}
    onMessagesClick={() => setAttachmentDrawerOpen(false)}    messagesClassName="meeting-group-chat-messages"
    composer={<>
<form className="meeting-group-chat-input" onSubmit={(event) => { event.preventDefault(); send(); }}><div className="meeting-chat-attach-wrap"><button type="button" aria-label="추가 기능" aria-expanded={attachmentDrawerOpen} disabled={reviewRoomBlocked} onClick={() => { setMenuOpen(false); setAttachmentDrawerOpen((value) => !value); }}><Plus size={19} /></button><input ref={fileInputRef} type="file" accept="image/*" onChange={attachPhoto} className="meeting-chat-file-input" aria-label="채팅 사진 선택" hidden /></div><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={reviewRoomBlocked ? "차단된 체험단 대화입니다" : editingMessageId ? "메시지를 수정하세요..." : "메시지를 입력하세요..."} aria-label="메시지 입력" disabled={reviewRoomBlocked} /><button type="submit" aria-label="메시지 전송" disabled={reviewRoomBlocked}><Send size={17} /></button></form>
    </>}
    actionDrawer={attachmentDrawerOpen && <div className="chat-room-action-options" role="group" aria-label="사진 및 일정 기능"><button type="button" disabled={reviewRoomBlocked} onClick={() => { setAttachmentDrawerOpen(false); fileInputRef.current?.click(); }}><Images size={21} aria-hidden="true" /><span>사진 올리기</span></button><button type="button" disabled={reviewRoomBlocked} onClick={() => { setAttachmentDrawerOpen(false); setScheduleTitle(chatType === "review" ? "체험 방문 일정 제안" : ""); setScheduleStartAt(defaultMeetingDateTime()); setSchedulePlace(chatType === "review" ? meeting.place : ""); setScheduleOpen(true); }}><CalendarDays size={21} aria-hidden="true" /><span>일정 잡기</span></button></div>}
    overlays={<>
{blockPickerOpen && <div className="meeting-chat-block-overlay" onClick={() => setBlockPickerOpen(false)}><section className="meeting-chat-block-modal" role="dialog" aria-modal="true" aria-label="차단할 대화 상대 선택" onClick={(event) => event.stopPropagation()}><header><h2>차단할 대화 상대</h2><button type="button" aria-label="차단 창 닫기" onClick={() => setBlockPickerOpen(false)}><X size={19} /></button></header><p>선택한 상대의 메시지를 이 방에서만 숨깁니다.</p>{blockCandidates.map((member) => { const blocked = blockedRoomMembers.some((item) => item.id === member.id); return <button type="button" className="meeting-chat-block-member" key={member.id} onClick={() => toggleRoomMemberBlock(member)}><span>{member.nickname}</span><strong>{blocked ? "차단 해제" : "차단하기"}</strong></button>; })}</section></div>}
{nicknameEditOpen && <div className="meeting-chat-nickname-overlay" onClick={() => setNicknameEditOpen(false)}><section className="meeting-chat-nickname-modal" onClick={(event) => event.stopPropagation()}><h2>이 채팅방에서 사용할 닉네임 변경</h2><p>이 모임 채팅방에서만 적용되는 개별 닉네임입니다.</p><p className="meeting-chat-nickname-guidance"> 닉네임은 1회만 변경 가능하며, 방 내 다른 참여자와 중복된 닉네임은 사용할 수 없습니다.</p><input value={nicknameDraft} maxLength={10} onChange={(event) => { setNicknameDraft(event.target.value.slice(0, 10)); setNicknameError(""); }} aria-label="채팅방 닉네임" autoFocus /><div className="meeting-chat-nickname-error" role="alert">{nicknameError}</div><div className="meeting-chat-nickname-actions"><button type="button" onClick={() => setNicknameEditOpen(false)}>취소</button><button type="button" onClick={completeNicknameChange}>변경 완료</button></div></section></div>}{leaveConfirmOpen && <div className="meeting-chat-leave-overlay" onClick={() => setLeaveConfirmOpen(false)}><section className="meeting-chat-leave-modal" onClick={(event) => event.stopPropagation()}><h2>모임에서 탈퇴하시겠습니까?</h2><p>탈퇴 시 활동 정보와 설정한 닉네임이 초기화됩니다.</p><div className="meeting-chat-leave-actions"><button type="button" onClick={() => setLeaveConfirmOpen(false)}>취소</button><button type="button" onClick={confirmLeaveChat}>탈퇴하기</button></div></section></div>}{messageDeleteId && <div className="meeting-chat-delete-overlay" onClick={() => setMessageDeleteId(null)}><section className="meeting-chat-delete-modal" onClick={(event) => event.stopPropagation()}><h2>삭제하시겠습니까?</h2><div className="meeting-chat-delete-actions"><button type="button" onClick={() => setMessageDeleteId(null)}>취소</button><button type="button" onClick={() => deleteMessage(messageDeleteId)}>삭제</button></div></section></div>}{schedulePreviewOpen && latestSchedule && <div className="meeting-schedule-preview-overlay" onClick={() => setSchedulePreviewOpen(false)}><section className="meeting-schedule-preview-modal meeting-schedule-detail-modal" onClick={(event) => event.stopPropagation()}><header><div><span> 모임 일정</span><h2>{latestSchedule.title}</h2></div><button type="button" onClick={() => setSchedulePreviewOpen(false)} aria-label="일정 상세 닫기"><X size={19} /></button></header><div className="meeting-schedule-detail-row"><span></span><strong>{formatChatScheduleDate(latestSchedule.startAt)}</strong></div><div className="meeting-schedule-detail-row"><span></span><div><strong>{latestSchedule.partnerStore?.name ?? latestSchedule.place}</strong><small>{latestSchedule.partnerStore?.address ?? meeting.address}</small></div></div>{latestSchedule.partnerStore && <em className="meeting-schedule-benefit-badge"> {latestSchedule.partnerStore.benefit}</em>}<button type="button" className="meeting-schedule-map-button" onClick={() => setScheduleMapOpen(true)}> 지도 보기</button><div className="meeting-schedule-attendees"><div><strong>참석 현황</strong><span>{latestSchedule.attendeeIds.length}명 참석 / 최대 {latestSchedule.maxMembers}명</span></div><div className="meeting-schedule-avatar-list">{latestSchedule.attendeeIds.length ? latestSchedule.attendeeIds.map((id) => <span key={id} title={id}>{id === currentUserId ? "민" : "멤"}</span>) : <small>아직 참석한 멤버가 없어요</small>}</div></div><p className="meeting-schedule-rsvp-question">이 모임 일정에 참석하시겠습니까?</p><footer><button type="button" className="meeting-schedule-rsvp-button" disabled={!latestSchedule.attendeeIds.includes(currentUserId) && latestSchedule.attendeeIds.length >= latestSchedule.maxMembers} onClick={() => toggleScheduleAttendance(latestSchedule.id)}>{latestSchedule.attendeeIds.includes(currentUserId) ? "참석 취소" : "참석하기"}</button><button type="button" className="meeting-schedule-close-button" onClick={() => setSchedulePreviewOpen(false)}>닫기</button></footer></section></div>}{scheduleMapOpen && latestSchedule && <div className="meeting-schedule-map-overlay" onClick={() => setScheduleMapOpen(false)}><section className="meeting-schedule-map-modal" onClick={(event) => event.stopPropagation()}><header><h2>매장 위치</h2><button type="button" onClick={() => setScheduleMapOpen(false)} aria-label="지도 닫기"><X size={19} /></button></header><div className="meeting-schedule-map-preview"><MapPin size={30} /><strong>{latestSchedule.partnerStore?.name ?? latestSchedule.place}</strong><span>{latestSchedule.partnerStore?.address ?? meeting.address}</span></div><div className="meeting-schedule-map-links"><a href={`https://map.kakao.com/?q=${encodeURIComponent(latestSchedule.partnerStore?.address ?? latestSchedule.place)}`} target="_blank" rel="noreferrer">카카오맵으로 보기</a><a href={`https://map.naver.com/p/search/${encodeURIComponent(latestSchedule.partnerStore?.address ?? latestSchedule.place)}`} target="_blank" rel="noreferrer">네이버지도로 보기</a></div></section></div>}{lightboxImage && <div className="meeting-chat-lightbox" onClick={() => setLightboxImage(null)}><button type="button" onClick={() => setLightboxImage(null)} aria-label="사진 확대 보기 닫기"><X size={22} /></button><img src={lightboxImage} alt="확대된 채팅 사진" /></div>}{reportOpen && <div className="meeting-report-overlay" onClick={() => setReportOpen(false)}><section className="meeting-report-modal" onClick={(event) => event.stopPropagation()}><header><div><span>COMMUNITY SAFETY</span><h2>모임/채팅 신고하기</h2></div><button type="button" onClick={() => setReportOpen(false)} aria-label="신고 모달 닫기"><X size={19} /></button></header><p className="meeting-report-copy">부적절한 대화나 비매너 회원을 신고합니다. 현재 대화 내역이 증거 자료로 관리자에게 함께 전송됩니다.</p><div className="meeting-report-types">{["비매너/욕설/비방", "상업적 광고/스팸", "불법/음란물", "기타"].map((type) => <button type="button" key={type} className={reportType === type ? "active" : ""} onClick={() => setReportType(type)}>{type}</button>)}</div><label className="meeting-report-reason"><span>상세 사유 <small>(선택)</small></span><textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} rows={4} placeholder="신고 사유를 입력해 주세요." /></label><div className="meeting-report-evidence">최근 대화 {reportEvidence?.messages.length ?? 0}건이 증거 자료로 캡처됩니다.</div><button type="button" className="meeting-report-submit" onClick={submitReport}>신고 접수하기</button></section></div>}{scheduleOpen && <div className="meeting-chat-schedule-overlay" onClick={() => closeScheduleComposer()}><section className="meeting-chat-schedule-modal" onClick={(event) => event.stopPropagation()}><header><h2>{chatType === "review" ? "체험 일정 제안" : "모임 일정 만들기"}</h2><button type="button" onClick={() => closeScheduleComposer()} aria-label="일정 만들기 닫기"><X size={19} /></button></header><div className="meeting-chat-schedule-form"><label><span> 일정 제목</span><input value={scheduleTitle} onChange={(event) => setScheduleTitle(event.target.value)} placeholder="이번 주 불금 치맥 번개" /></label><label><span> 날짜 및 시간</span><MeetingDateTimePicker value={scheduleStartAt} onChange={setScheduleStartAt} /></label><label><span>{chatType === "review" ? "매장 / 만나는 장소" : "만나는 장소"}</span><input value={schedulePlace} onChange={(event) => { setSchedulePlace(event.target.value); setSelectedPartnerStore(null); }} placeholder="안양천 제휴 카페 앞" /></label>{chatType === "meet" && <label><span> 정원 설정</span><input type="number" min="1" max="20" step="1" inputMode="numeric" value={scheduleMaxMembers} onChange={(event) => setScheduleMaxMembers(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="최대 20명" aria-label="모임 정원" /></label>}{chatType === "meet" && <section className="meeting-schedule-partner-field"><h3> 팅커벨 제휴 매장 <small>(선택)</small></h3><p>모임 할인 및 서비스 혜택이 제공되는 제휴 매장을 선택해보세요</p>{selectedPartnerStore ? <div className="meeting-schedule-partner-selected">{selectedPartnerStore.image ? <img src={selectedPartnerStore.image} alt="" /> : <span className="meeting-schedule-partner-selected-placeholder" aria-hidden="true">{selectedPartnerStore.category}</span>}<div><strong>{selectedPartnerStore.name}</strong><small>{selectedPartnerStore.area} · {selectedPartnerStore.address}</small><em> {selectedPartnerStore.benefit}</em></div><div className="meeting-schedule-partner-selected-actions"><button type="button" onClick={() => { setScheduleOpen(true); setPartnerStorePickerOpen(true); }}>변경</button><button type="button" onClick={() => { setSelectedPartnerStore(null); setSchedulePlace(""); }} aria-label="선택한 제휴 매장 취소"><X size={16} /></button></div></div> : <button type="button" className="meeting-schedule-partner-trigger" onClick={() => { setScheduleOpen(true); setPartnerStorePickerOpen(true); }}>+ 제휴 매장 찾고 모임 혜택 받기</button>}</section>}</div><footer className="meeting-chat-schedule-footer-bar"><button type="button" className="meeting-chat-schedule-submit" disabled={!scheduleTitle.trim() || !schedulePlace.trim()} onClick={createSchedule}>{chatType === "review" ? "일정 제안 보내기" : "일정 만들기 완료"}</button></footer></section></div>}{partnerStorePickerOpen && chatType === "meet" && !meeting.isExperienceDirectChat && !meeting.isReservationDirectChat && <PartnerStorePicker selectedCategory={meeting.category} selectedAreas={[meeting.address.split(",")[0] ?? ""]} onClose={() => setPartnerStorePickerOpen(false)} onSelect={(store) => { setSelectedPartnerStore(store); setSchedulePlace(`${store.name} · ${store.address}`); setPartnerStorePickerOpen(false); }} />}
        </>}
    onClick={() => { if (messageActionId !== null) setMessageActionId(null); }}
  >
    <>
{isLoadingOlderMessages && <div className="meeting-group-chat-history-loading">이전 대화를 불러오는 중...</div>}<div className="meeting-group-chat-system">민님이 모임에 참여했습니다. 따뜻하게 환영해주세요! </div>{visibleRoomMessages.filter((item) => !item.schedule).map((item) => <div key={item.id} className={`meeting-chat-message-row ${item.mine ? "mine" : ""}`}><div className="meeting-chat-avatar">{item.author.slice(0, 1)}</div><div className="meeting-chat-message-copy"><span>{item.author}</span><div className="meeting-chat-bubble-wrap">{item.image ? <button type="button" className="meeting-chat-image-bubble" onClick={(event) => { event.stopPropagation(); item.mine ? openMessageActions(item) : setLightboxImage(item.image!); }}><img src={item.image} alt="채팅으로 보낸 사진" /></button> : item.mine ? <button type="button" className="meeting-chat-own-text-bubble" onClick={(event) => { event.stopPropagation(); openMessageActions(item); }}>{item.text}</button> : <p>{item.text}</p>}<time>{item.time}</time>{messageActionId === item.id && item.mine && <div className="meeting-chat-message-actions" onClick={(event) => event.stopPropagation()}>{item.image ? <button type="button" onClick={() => deleteMessage(item.id)}>삭제</button> : <><button type="button" onClick={() => beginMessageEdit(item)}>수정</button><button type="button" onClick={() => { setMessageActionId(null); setMessageDeleteId(item.id); }}>삭제</button></>}</div>}</div></div></div>)}
    </>
  </ChatRoomLayout>; }
function MeetingBulkMerchantPinSheet({ meeting, memberCount, onClose, onComplete }: { meeting: Meeting; memberCount: number; onClose: () => void; onComplete: (auth: MeetingBulkVisitAuth) => void }) { const [pin, setPin] = useState(""); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false); const [completed, setCompleted] = useState(false); const [verifiedAt, setVerifiedAt] = useState(""); const addDigit = (digit: string) => { if (submitting || completed || pin.length >= 4) return; setError(""); setPin((value) => `${value}${digit}`); }; const verify = () => { if (pin.length !== 4 || submitting) return; if (pin !== "1234") { setError("PIN 번호가 일치하지 않습니다. 다시 확인해 주세요."); setPin(""); return; } setSubmitting(true); const time = new Date().toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replaceAll("/", "."); const auth: MeetingBulkVisitAuth = { meetingId: meeting.id, store: meeting.place, verifiedAt: time, memberCount, verifiedBy: "모임장" }; window.localStorage.setItem(meetingBulkVisitKey(meeting.id), JSON.stringify(auth)); window.dispatchEvent(new CustomEvent("dangam:meeting-bulk-visit", { detail: auth })); setVerifiedAt(time); setCompleted(true); setSubmitting(false); onComplete(auth); }; return <div className="overlay meeting-bulk-pin-overlay" onClick={onClose}><section className="meeting-bulk-pin-sheet" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose} aria-label="모임 매장 PIN 인증 닫기"><X size={17} /></button>{completed ? <div className="meeting-bulk-success"><div className="merchant-success-icon"><Check size={34} /></div><p className="eyebrow">단체 방문 인증 완료</p><h2>모임 매장 방문 인증 완료</h2><p>{memberCount}명의 확정 참석자 쿠폰이 사용 완료로 처리되었습니다.</p><div className="meeting-bulk-receipt"><span>방문 매장</span><b>{meeting.place}</b><span>인증 시각</span><b>{verifiedAt}</b><span>동기화 상태</span><b>참석자 앱에 실시간 반영됨</b></div><button className="wide-orange" onClick={onClose}>확인</button></div> : <><p className="eyebrow">모임장 전용 일괄 인증</p><h2> 모임장 대표 일괄 인증</h2><p className="meeting-bulk-copy">사장님 전용 PIN 4자리를 입력하면 참석 확정 멤버 전원의 매장 방문이 한 번에 인증됩니다.</p><div className="meeting-bulk-target"><strong>{meeting.place}</strong><span>확정 참석자 {memberCount}명 · {meeting.benefit}</span></div><div className="merchant-pin-dots" aria-label={`입력된 PIN ${pin.length}자리`}>{[0, 1, 2, 3].map((index) => <i key={index} className={index < pin.length ? "filled" : ""} />)}</div>{error && <p className="merchant-pin-error" role="alert">{error}</p>}<div className="merchant-keypad">{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <button key={digit} type="button" onClick={() => addDigit(digit)}>{digit}</button>)}<button type="button" className="keypad-clear" onClick={() => { setPin(""); setError(""); }}>⌫ 지우기</button><button type="button" onClick={() => addDigit("0")}>0</button><button type="button" className="keypad-confirm" disabled={pin.length !== 4 || submitting} onClick={verify}>{submitting ? "확인 중" : "일괄 인증 완료"}</button></div><small className="merchant-test-pin">테스트용 PIN: 1234</small></>}</section></div>; }
function MeetingAdultGate({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) { return <div className="overlay adult-gate-overlay" onClick={onClose}><section className="adult-gate-sheet" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose}><X size={17} /></button><div className="adult-gate-icon"></div><p className="eyebrow">ACCOUNT VERIFICATION</p><h2> 성인 전용 콘텐츠 안내</h2><p className="adult-gate-copy">청소년 보호법에 따라 성인 전용 콘텐츠는 최초 1회 휴대폰 본인확인이 필요합니다.<br /><br />본인확인 완료 후 계정의 성인 인증 상태가 저장되어 다음부터는 별도 확인 없이 이용할 수 있습니다.</p><div className="adult-gate-actions"><button className="wide-orange" onClick={onConfirm}>휴대폰 본인인증 진행하기</button><button className="adult-gate-back" onClick={onClose}>뒤로 가기</button></div></section></div>; }
type MeetingSort = "최신순" | "거리순" | "인기순";
function MeetingView({ userPosition = null, browseRegionCodes = [], currentLocationRequested = false, currentLocationPoint = null, meetingSearchQuery = "", onOpenChatList, onJoinMeeting, onOpenChat, onMeetingReleased, onToast, returnToMeetingDetail, returnToMeetingParticipation, onReturnToMeetingDetailHandled }: { userPosition?: GeoPoint | null; sortByDistance?: boolean; browseRegionCodes?: string[]; currentLocationRequested?: boolean; currentLocationPoint?: Wgs84Point | null; meetingSearchQuery?: string; onOpenChatList?: () => void; onJoinMeeting?: (meeting: Meeting) => void; onOpenChat?: (meeting: Meeting, returnToDetail?: boolean, returnParticipation?: Participation) => void; onMeetingReleased?: (meetingId: number) => void; onToast?: (message: string) => void; returnToMeetingDetail?: Meeting | null; returnToMeetingParticipation?: Participation | null; onReturnToMeetingDetailHandled?: () => void }) { const [previewCommunityModeration, setPreviewCommunityModeration] = useState<Awaited<ReturnType<typeof consumerApi.getPreviewCommunityModeration>> | null>(null); const previewMockMode = import.meta.env.DEV && isConsumerPreviewDemo(); const communityActionBlocked = previewMockMode && (!previewCommunityModeration || previewCommunityModeration.currentAccountSanction === "restricted" || previewCommunityModeration.currentAccountSanction === "locked"); useEffect(() => { if (!previewMockMode) { setPreviewCommunityModeration(null); return; } let mounted = true; const refresh = () => { void consumerApi.getPreviewCommunityModeration().then(value => { if (mounted) setPreviewCommunityModeration(value); }).catch(() => undefined); }; refresh(); const timer = window.setInterval(refresh, 5000); return () => { mounted = false; window.clearInterval(timer); }; }, [previewMockMode]); const { user: authenticatedUser } = useAuth(); const currentUserId = authenticatedUser?.openId ?? getClientUserId(); const meetingStorageKey = scopedStorageKey("dangam_user_meetings", currentUserId); const meetingStorageKeyRef = useRef(meetingStorageKey); const [blockedUserIds, setBlockedUserIds] = useState<string[]>(() => readBlockedUsers().map((user) => user.id)); useEffect(() => { const syncBlockedUsers = () => setBlockedUserIds(readBlockedUsers().map((user) => user.id)); window.addEventListener("dangam:blocked-users-changed", syncBlockedUsers); window.addEventListener("storage", syncBlockedUsers); return () => { window.removeEventListener("dangam:blocked-users-changed", syncBlockedUsers); window.removeEventListener("storage", syncBlockedUsers); }; }, []); useEffect(() => { const syncEvents = () => setCommunityEvents(readCommunityEvents()); window.addEventListener("storage", syncEvents); window.addEventListener("dangam:community-event-created", syncEvents); window.addEventListener("dangam:community-events-updated", syncEvents); return () => { window.removeEventListener("storage", syncEvents); window.removeEventListener("dangam:community-event-created", syncEvents); window.removeEventListener("dangam:community-events-updated", syncEvents); }; }, []); const [category, setCategory] = useState<MeetingCategory>("전체"); const [meetingSort, setMeetingSort] = useState<MeetingSort>("최신순"); const [communityTab, setCommunityTab] = useState("동네모임"); const [communitySubTab, setCommunitySubTab] = useState(() => new URLSearchParams(window.location.search).get("tab") === "my_meeting" ? "내 모임" : "홈"); const releasedMeetingIdsStorageKey = "dangam_released_meeting_ids"; const [releasedMeetingIds, setReleasedMeetingIds] = useState<number[]>(() => { try { const parsed = JSON.parse(window.localStorage.getItem(releasedMeetingIdsStorageKey) || "[]"); return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []; } catch { return []; } }); const [communityEvents, setCommunityEvents] = useState<CommunityEvent[]>(() => readCommunityEvents()); const [fabExpanded, setFabExpanded] = useState(false); const [createOpen, setCreateOpen] = useState(false); const [detail, setDetail] = useState<Meeting | null>(null); useEffect(() => { if (!returnToMeetingDetail) return; setDetail(returnToMeetingDetail); if (returnToMeetingParticipation) setParticipation((current) => ({ ...current, [returnToMeetingDetail.id]: returnToMeetingParticipation })); onReturnToMeetingDetailHandled?.(); }, [returnToMeetingDetail, returnToMeetingParticipation]); const [chatMeeting, setChatMeeting] = useState<Meeting | null>(null); const [communityChatListOpen, setCommunityChatListOpen] = useState(() => window.location.pathname === "/community/chat-list"); const [communityChatMeeting, setCommunityChatMeeting] = useState<Meeting | null>(null); const [partnerStoreEditMeeting, setPartnerStoreEditMeeting] = useState<Meeting | null>(null); const [adultVerified, setAdultVerified] = useState(() => new URLSearchParams(window.location.search).get("adult") === "unverified" ? false : window.localStorage.getItem("dangam_is_adult") !== "false"); const [adultGateOpen, setAdultGateOpen] = useState(false); const [pendingNight, setPendingNight] = useState<Meeting | null>(null); const [pendingCreate, setPendingCreate] = useState(false); const [userMeetings, setUserMeetings] = useState<Meeting[]>(() => {
    try {
      const saved = window.localStorage.getItem(meetingStorageKey) ?? (currentUserId === getClientUserId() ? window.localStorage.getItem("dangam_user_meetings") : null);
      return saved ? JSON.parse(saved) as Meeting[] : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (meetingStorageKeyRef.current !== meetingStorageKey) {
      meetingStorageKeyRef.current = meetingStorageKey;
      try {
        const saved = window.localStorage.getItem(meetingStorageKey);
        setUserMeetings(saved ? JSON.parse(saved) as Meeting[] : []);
      } catch {
        setUserMeetings([]);
      }
      return;
    }
    const result = persistMeetingStorageSafely(
      window.localStorage,
      meetingStorageKey,
      userMeetings,
      userMeetings.map(meetingWithoutEmbeddedImages),
      currentUserId === getClientUserId() ? ["dangam_user_meetings"] : [],
    );
    if (result !== "memory-only" && currentUserId === getClientUserId()) {
      try { window.localStorage.removeItem("dangam_user_meetings"); } catch { /* 구형 모임 캐시 정리는 선택 작업입니다. */ }
    }
  }, [meetingStorageKey, userMeetings]); const [participation, setParticipation] = useState<Record<number, Participation>>(() => Object.fromEntries([...userMeetings, ...meetings].map((meeting) => { const parsed = parseMeetingCapacity(meeting); return [meeting.id, { ...parsed, currentMembers: parsed.currentMembers + (window.localStorage.getItem(`dangam_meeting_joined_${currentUserId}_${meeting.id}`) === "true" ? 1 : 0), isJoined: window.localStorage.getItem(`dangam_meeting_joined_${currentUserId}_${meeting.id}`) === "true" }]; }))); useEffect(() => { const syncMembership = (event: Event) => { const detail = (event as CustomEvent<{ meetingId?: number; userId?: string }>).detail; const meetingId = Number(detail?.meetingId); if (!Number.isFinite(meetingId)) return; if (detail?.userId) { const userId = detail.userId; setUserMeetings((items) => items.map((meeting) => meeting.id === meetingId && meeting.schedules ? { ...meeting, schedules: removeMeetingScheduleAttendee(meeting.schedules, userId) } : meeting)); setDetail((meeting) => meeting?.id === meetingId && meeting.schedules ? { ...meeting, schedules: removeMeetingScheduleAttendee(meeting.schedules, userId) } : meeting); } setParticipation((state) => { const current = state[meetingId]; if (!current || !current.isJoined) return state; return { ...state, [meetingId]: { ...current, isJoined: false, currentMembers: Math.max(0, current.currentMembers - 1) } }; }); }; const syncSchedules = (event: Event) => { const detail = (event as CustomEvent<{ meetingId?: number; schedules?: MeetingSchedule[] }>).detail; const meetingId = Number(detail?.meetingId); if (!Number.isFinite(meetingId) || !detail?.schedules) return; setUserMeetings((items) => items.map((meeting) => meeting.id === meetingId ? { ...meeting, schedules: detail.schedules } : meeting)); setDetail((meeting) => meeting?.id === meetingId ? { ...meeting, schedules: detail.schedules } : meeting); }; window.addEventListener(MEETING_MEMBERSHIP_CHANGED_EVENT, syncMembership); window.addEventListener("dangam:meeting-schedules-updated", syncSchedules); return () => { window.removeEventListener(MEETING_MEMBERSHIP_CHANGED_EVENT, syncMembership); window.removeEventListener("dangam:meeting-schedules-updated", syncSchedules); }; }, []); const [meetingToast, setMeetingToast] = useState(""); const [partnerNotice, setPartnerNotice] = useState(""); const [bulkVisitAuthByMeeting, setBulkVisitAuthByMeeting] = useState<Record<number, MeetingBulkVisitAuth>>({}); const [hostConfirmedByMeeting, setHostConfirmedByMeeting] = useState<Record<number, boolean>>(() => { const next: Record<number, boolean> = {}; [...userMeetings, ...meetings, ...regionMockMeetings].forEach((meeting) => { try { next[meeting.id] = Boolean(JSON.parse(window.localStorage.getItem(`dangam_meeting_host_confirm_${meeting.id}`) || "false")); } catch { next[meeting.id] = false; } }); return next; }); const [communityByMeeting, setCommunityByMeeting] = useState<Record<number, boolean>>(() => { const next: Record<number, boolean> = {}; meetings.forEach((meeting) => { next[meeting.id] = window.localStorage.getItem(`dangam_meeting_community_${meeting.id}`) === "true"; }); return next; }); const [bulkPinMeeting, setBulkPinMeeting] = useState<Meeting | null>(null); const [nextGatheringFor, setNextGatheringFor] = useState<Meeting | null>(null); const [nextGatherings, setNextGatherings] = useState<Record<number, NextGathering>>({}); useEffect(() => { const syncBulkVisits = () => { setBulkVisitAuthByMeeting((current) => { const next = { ...current }; meetings.forEach((meeting) => { const raw = window.localStorage.getItem(meetingBulkVisitKey(meeting.id)); if (raw) { try { next[meeting.id] = JSON.parse(raw) as MeetingBulkVisitAuth; } catch { /* ignore malformed demo state */ } } }); return next; }); }; syncBulkVisits(); window.addEventListener("storage", syncBulkVisits); const timer = window.setInterval(syncBulkVisits, 1000); return () => { window.removeEventListener("storage", syncBulkVisits); window.clearInterval(timer); }; }, []); const completeBulkVisit = (auth: MeetingBulkVisitAuth) => { setBulkVisitAuthByMeeting((current) => ({ ...current, [auth.meetingId]: auth })); showFeedback(`${auth.memberCount}명 참석자의 매장 방문 인증이 완료되었습니다.`, setMeetingToast); }; const confirmMeetingByHost = (meeting: Meeting) => { const participationForMeeting = getParticipation(meeting); if (participationForMeeting.maxMembers === null || participationForMeeting.currentMembers < participationForMeeting.maxMembers) { showFeedback("모집 정원에 도달한 후 모임을 확정할 수 있습니다.", setMeetingToast); return; } const confirmedAt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replaceAll("/", "."); const notification = { meetingId: meeting.id, store: meeting.place, memberCount: participationForMeeting.currentMembers, confirmedAt, status: "HOST_CONFIRMED" }; window.localStorage.setItem(`dangam_meeting_host_confirm_${meeting.id}`, JSON.stringify(notification)); window.dispatchEvent(new CustomEvent("dangam:meeting-host-confirmed", { detail: notification })); setHostConfirmedByMeeting((current) => ({ ...current, [meeting.id]: true })); showFeedback("모임이 확정되었습니다.", setMeetingToast); showFeedback(`제휴 매장 사장님께 ${meeting.place} 방문 확정 알림을 전달했습니다.`, setPartnerNotice); }; const allMeetings = [...userMeetings, ...meetings, ...regionMockMeetings].filter((meeting) => !releasedMeetingIds.includes(meeting.id) && !blockedUserIds.includes(meeting.hostId ?? "") && !previewCommunityModeration?.closedCommunitySourceKeys.includes(previewActivitySourceKey(`meeting-${meeting.id}`))); const regionFilteredMeetings = currentLocationRequested ? filterCommunityRecordsByLocation(allMeetings, "current", currentLocationPoint) : filterByRegionCodes(allMeetings, browseRegionCodes); const activeMeetings = allMeetings.filter((meeting) => participation[meeting.id]?.isJoined === true); const regionActiveMeetings = regionFilteredMeetings.filter((meeting) => participation[meeting.id]?.isJoined === true); const communityStoryItems = [...regionActiveMeetings.map((meeting) => ({ id: `meeting-${meeting.id}`, title: meeting.title, image: meetingThumbnailFor(meeting), hasUnread: false, regionCode: meeting.regionCode, meeting })), ...(currentLocationRequested ? filterCommunityRecordsByLocation(communityStoryMocks, "current", currentLocationPoint) : filterByRegionCodes(communityStoryMocks, browseRegionCodes))]; const communityFilteredMeetings = (communityTab === "동네모임" ? regionFilteredMeetings : regionFilteredMeetings.filter((meeting) => communityTab === "밥·술 번개" ? meetingCategoryLabel(meeting.category).includes("밥/술") : communityTab === "운동·취미" ? /운동|골프/.test(meetingCategoryLabel(meeting.category)) : communityTab === "육아·가족" ? /육아|가족/.test(`${meeting.title} ${meeting.intro ?? ""}`) : communityTab === "동네생활" ? meeting.placeMode === "FREE" : meeting.placeMode !== "FREE")); const scheduledMeetings = communityFilteredMeetings.filter((meeting) => Boolean(upcomingScheduleFor(meeting)));
 const subTabMeetings = communitySubTab === "내 모임" ? activeMeetings : communitySubTab === "참여" ? scheduledMeetings : communityFilteredMeetings;
 const meetingQuery = meetingSearchQuery.trim().toLowerCase(); const searchFilteredMeetings = meetingQuery ? subTabMeetings.filter((meeting) => `${meeting.title} ${meeting.category} ${meeting.place} ${meeting.address} ${meeting.intro ?? ""}`.toLowerCase().includes(meetingQuery)) : subTabMeetings; const filteredMeetings = category === "전체" ? searchFilteredMeetings : searchFilteredMeetings.filter((meeting) => meetingCategoryLabel(meeting.category) === category);
 const visible = [...filteredMeetings].sort((a, b) => { if (communitySubTab === "참여") return new Date(upcomingScheduleFor(a)?.startAt ?? "9999-12-31").getTime() - new Date(upcomingScheduleFor(b)?.startAt ?? "9999-12-31").getTime(); if (meetingSort === "거리순") return distanceForMeeting(a, userPosition) - distanceForMeeting(b, userPosition) || b.id - a.id; if (meetingSort === "인기순") return parseMeetingCapacity(b).currentMembers - parseMeetingCapacity(a).currentMembers || (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0) || b.id - a.id; return b.id - a.id; }); const toggleCommunityEvent = (event: CommunityEvent) => { const meeting = regionFilteredMeetings.find((item) => item.id === event.meetingId); if (!meeting) return; const current = getParticipation(meeting); const attending = event.schedule.attendeeIds.includes(currentUserId); const atCapacity = event.schedule.attendeeIds.length >= event.schedule.maxMembers; if (!current.isJoined) { if (communityActionBlocked) { showFeedback("관리자 조치로 모임 참여가 제한되어 있습니다.", setMeetingToast); return; } if (!genderAllowedFor(meeting) || !ageAllowedFor(meeting, currentUser.age)) { handleAccessBlocked(meeting); return; } if (atCapacity) { showFeedback("이 일정은 모집 인원이 마감되었습니다.", setMeetingToast); return; } toggleParticipation(meeting); onJoinMeeting?.(meeting); const nextEvent = { ...event, schedule: { ...event.schedule, attendeeIds: [...event.schedule.attendeeIds, currentUserId] } }; setCommunityEvents((events) => { const next = events.map((item) => item.id === event.id ? nextEvent : item); saveCommunityEvents(next); return next; }); showFeedback("모임 가입과 일정 참석이 완료되었습니다!", setMeetingToast); onToast?.("모임 가입과 일정 참석이 완료되었습니다!"); onOpenChat?.(meeting); return; } const nextIds = attending ? event.schedule.attendeeIds.filter((id) => id !== currentUserId) : atCapacity ? event.schedule.attendeeIds : [...event.schedule.attendeeIds, currentUserId]; const nextEvent = { ...event, schedule: { ...event.schedule, attendeeIds: nextIds } }; setCommunityEvents((events) => { const next = events.map((item) => item.id === event.id ? nextEvent : item); saveCommunityEvents(next); return next; }); showFeedback(attending ? "일정 참석을 취소했습니다." : "일정 참석이 완료되었습니다!", setMeetingToast); onToast?.(attending ? "일정 참석을 취소했습니다." : "일정 참석이 완료되었습니다!"); };
 const getParticipation = (meeting: Meeting): Participation => participation[meeting.id] ?? { ...parseMeetingCapacity(meeting), isJoined: false }; const myQuickMeeting = regionFilteredMeetings.find((meeting) => getParticipation(meeting).isJoined) ?? null; const quickMeetingIsCreated = myQuickMeeting ? userMeetings.some((meeting) => meeting.id === myQuickMeeting.id) : false; const isNight = (value: MeetingCategory | Meeting) => typeof value === "string" ? value.includes("심야·라이브") : value.category.includes("심야·라이브"); const showFeedback = (message: string, setter: (value: string) => void) => { setter(message); window.setTimeout(() => setter(""), 3000); }; const previewMinor = new URLSearchParams(window.location.search).get("minor") === "1"; const currentUser: VerifiedUser & { id: string; age: number } = { id: currentUserId, isVerified: true, gender: "M", age: previewMinor ? 16 : 32 }; const getGenderRequirement = (meeting: Meeting): GenderRequirement => meeting.genderRequirement ?? (meeting.genderRestriction === "여성 전용" ? "FEMALE_ONLY" : meeting.genderRestriction === "남성 전용" ? "MALE_ONLY" : "ALL"); const genderLabel = (requirement: GenderRequirement) => requirement === "FEMALE_ONLY" ? "여성 전용 " : requirement === "MALE_ONLY" ? "남성 전용 " : "누구나 · 성별 무관"; const genderAllowedFor = (meeting: Meeting) => { const requirement = getGenderRequirement(meeting); return currentUser.isVerified && (requirement === "ALL" || (requirement === "FEMALE_ONLY" && currentUser.gender === "F") || (requirement === "MALE_ONLY" && currentUser.gender === "M")); }; const ageBlockedMessage = (meeting: Meeting) => { if (currentUser.age < 19) return "미성년자는 안전한 운영을 위해 동네모임에 참여할 수 없습니다."; const requirement = meeting.ageRequirement ?? "ALL"; const min = meeting.ageMin ?? ageBounds(requirement).min ?? 0; const max = meeting.ageMax ?? ageBounds(requirement).max ?? 120; return requirement === "AGE_5060_PLUS" ? "본 모임은 50세 이상 전용 모임입니다. 연령 조건이 맞지 않아 참여할 수 없습니다." : `본 모임은 ${min}대~${Math.floor(max / 10)}0대 전용 모임입니다. 연령 조건이 맞지 않아 참여할 수 없습니다.`; }; const genderBlockedMessage = (meeting: Meeting) => `본 모임은 ${genderLabel(getGenderRequirement(meeting)).replace(" ", "").replace(" ", "")} 모임입니다. PASS 본인인증 성별이 일치하는 회원만 참여 가능합니다.`; const toggleParticipation = (meeting: Meeting, joinedMessage?: string) => {
    const current = getParticipation(meeting);
    if (!genderAllowedFor(meeting) || !ageAllowedFor(meeting, currentUser.age)) {
      showFeedback(!genderAllowedFor(meeting) ? genderBlockedMessage(meeting) : ageBlockedMessage(meeting), setMeetingToast);
      return false;
    }
    if (!current.isJoined && current.maxMembers !== null && current.currentMembers >= current.maxMembers) return false;
    const nextJoined = !current.isJoined;
    const nextCount = current.currentMembers + (nextJoined ? 1 : -1);
    try { window.localStorage.setItem(`dangam_meeting_joined_${currentUserId}_${meeting.id}`, String(nextJoined)); } catch { /* 가입 표시와 인원은 화면 상태에도 반영합니다. */ }
    setParticipation((state) => ({ ...state, [meeting.id]: { ...current, currentMembers: nextCount, isJoined: nextJoined } }));
    if (nextJoined) {
      if (current.maxMembers !== null && nextCount === current.maxMembers) {
        showFeedback(joinedMessage ?? " 목표 인원이 모두 모여 모임이 확정되었습니다! 단체 혜택 쿠폰이 발급되었습니다.", setMeetingToast);
        showFeedback("파트너스 앱 푸시 알림: 모임이 확정되었습니다. 매장 예약을 준비해주세요.", setPartnerNotice);
      } else {
        showFeedback(joinedMessage ?? "모임 참여가 완료되었습니다. 현재 참여 인원이 업데이트되었습니다.", setMeetingToast);
      }
    } else {
      showFeedback("모임 참여를 취소했습니다. 모집 중 상태로 변경되었습니다.", setMeetingToast);
    }
    return true;
  };
  const joinMeeting = (meeting: Meeting) => {
    if (communityActionBlocked) { showFeedback("관리자 조치 또는 계정 상태 확인 전에는 모임 참여가 제한됩니다.", setMeetingToast); return; }
    const current = getParticipation(meeting);
    if (current.isJoined) return;
    const allowed = (current.maxMembers === null || current.currentMembers < current.maxMembers) && genderAllowedFor(meeting) && ageAllowedFor(meeting, currentUser.age);
    if (!allowed) { handleAccessBlocked(meeting); return; }
    if (!toggleParticipation(meeting, "모임에 가입되었습니다.")) return;
    const currentMembersList = meeting.membersList ?? [];
    const nextMembersList = currentMembersList.some((member) => member.id === currentUserId)
      ? currentMembersList
      : [...currentMembersList, { id: currentUserId, nickname: "나", role: "MEMBER" as const }];
    const nextMemberCount = current.currentMembers + 1;
    const nextMemberCountLabel = current.maxMembers === null
      ? `${nextMemberCount}명 / 제한 없음`
      : `${nextMemberCount}/${current.maxMembers}명`;
    const joinedMeeting: Meeting = { ...meeting, members: nextMemberCountLabel, membersList: nextMembersList };
    setUserMeetings((items) => items.map((item) => item.id === meeting.id ? joinedMeeting : item));
    setDetail((currentDetail) => currentDetail?.id === meeting.id ? joinedMeeting : currentDetail);
    onJoinMeeting?.(joinedMeeting);
  };
  const openMeetingChatFromDetail = (meeting: Meeting) => {
    const current = getParticipation(meeting);
    setDetail(null);
    setChatMeeting(null);
    setCommunityChatListOpen(false);
    onOpenChat?.(meeting, true, current);
  };
  const handleGenderBlocked = (meeting: Meeting) => showFeedback(genderBlockedMessage(meeting), setMeetingToast); const handleAccessBlocked = (meeting: Meeting) => showFeedback(!genderAllowedFor(meeting) ? genderBlockedMessage(meeting) : ageBlockedMessage(meeting), setMeetingToast); const addCreatedMeeting = (meeting: Meeting) => { const regionCodes = Array.from(new Set([...(meeting.regionCodes ?? []), ...(meeting.regionCode ? [meeting.regionCode] : [])].filter((code) => /^\d{10}$/.test(code)))); const regionCode = regionCodes[0]; const detailImages = meeting.detailImages ?? meeting.mediaUrls ?? []; const coverImage = meeting.coverImage || meeting.thumbnail || meeting.image || detailImages[0] || meetingCategoryFallbackImage(meeting.category); const initialMembers = meeting.membersList ?? []; const hostMember: MeetingMember = { id: meeting.hostId ?? currentUserId, nickname: meeting.organizerName?.trim() || "모임장", role: "HOST" }; const membersList = initialMembers.some((member) => member.id === hostMember.id) ? initialMembers : [hostMember, ...initialMembers]; const scopedMeeting = { ...meeting, coverImage, detailImages, regionCode, regionCodes, membersList }; setUserMeetings((current) => [scopedMeeting, ...current]); try { window.localStorage.setItem(`dangam_meeting_joined_${currentUserId}_${scopedMeeting.id}`, "true"); } catch { /* 가입 상태는 메모리와 가입 모임 캐시를 우선 사용합니다. */ } const parsed = parseMeetingCapacity(scopedMeeting); setParticipation((state) => ({ ...state, [scopedMeeting.id]: { ...parsed, isJoined: true } })); onJoinMeeting?.(scopedMeeting); setCreateOpen(false); setCategory("전체"); setCommunitySubTab("내 모임"); showFeedback("모임이 개설되었습니다. 내 모임에서 확인할 수 있습니다.", setMeetingToast); }; const updateMeetingRecord = (meetingId: number, patch: Partial<Meeting>) => {
    setUserMeetings((current) => current.map((item) => item.id === meetingId ? { ...item, ...patch } : item));
    setDetail((current) => current?.id === meetingId ? { ...current, ...patch } : current);
  };
  const navigateToMyMeetings = () => {
    setCommunityTab("동네모임");
    setCommunitySubTab("내 모임");
    setCategory("전체");
    window.history.replaceState(window.history.state, "", "/community?tab=my_meeting");
  };
  const confirmMeetingUpdates = (meeting: Meeting) => {
    if (meeting.hostId !== currentUserId) return;
    setUserMeetings((current) => current.some((item) => item.id === meeting.id)
      ? current.map((item) => item.id === meeting.id ? { ...item, ...meeting } : item)
      : [meeting, ...current]);
    setParticipation((current) => ({ ...current, [meeting.id]: { ...(current[meeting.id] ?? parseMeetingCapacity(meeting)), isJoined: true } }));
    try { window.localStorage.setItem(`dangam_meeting_joined_${currentUserId}_${meeting.id}`, "true"); } catch { /* 업데이트 완료 후 현재 화면 상태는 계속 유지합니다. */ }
    onJoinMeeting?.(meeting);
    setDetail(null);
    navigateToMyMeetings();
    onToast?.("모임 정보가 업데이트되었습니다.");
  };
  const releaseMeeting = (meeting: Meeting) => {
    if (meeting.hostId !== currentUserId) return;
    const releasedIds = Array.from(new Set([...releasedMeetingIds, meeting.id]));
    setReleasedMeetingIds(releasedIds);
    setUserMeetings((current) => current.filter((item) => item.id !== meeting.id));
    setParticipation((current) => { const next = { ...current }; delete next[meeting.id]; return next; });
    setHostConfirmedByMeeting((current) => { const next = { ...current }; delete next[meeting.id]; return next; });
    setBulkVisitAuthByMeeting((current) => { const next = { ...current }; delete next[meeting.id]; return next; });
    const remainingEvents = readCommunityEvents().filter((event) => event.meetingId !== meeting.id);
    setCommunityEvents(remainingEvents);
    try {
      window.localStorage.setItem(releasedMeetingIdsStorageKey, JSON.stringify(releasedIds));
      saveCommunityEvents(remainingEvents);
      window.dispatchEvent(new CustomEvent("dangam:community-events-updated"));
      window.localStorage.removeItem(`dangam_meeting_host_confirm_${meeting.id}`);
      const chatKey = meetingChatStorageKey(meeting.id, currentUserId);
      window.localStorage.removeItem(chatKey);
      window.localStorage.removeItem(`${chatKey}_hidden_message_ids`);
      window.localStorage.removeItem(`${chatKey}_edited_messages`);
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (!key) continue;
        if (key.startsWith("dangam_meeting_joined_") && key.endsWith(`_${meeting.id}`)) {
          window.localStorage.removeItem(key);
        } else if (key.startsWith("dangam_joined_meetings_")) {
          try {
            const cached = JSON.parse(window.localStorage.getItem(key) || "[]");
            if (Array.isArray(cached)) window.localStorage.setItem(key, JSON.stringify(cached.filter((item) => Number(item?.id) !== meeting.id)));
          } catch { /* 손상된 가입 캐시는 건드리지 않습니다. */ }
        } else if (key.startsWith(`dangam_meeting_chat_messages_${meeting.id}`)
          || key.startsWith(`dangam_meeting_schedule_rsvp_${meeting.id}_`)
          || key.startsWith(`dangam_meeting_chat_nickname_room_${meeting.id}`)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch { /* 로컬 캐시 정리 실패와 무관하게 비활성화 상태를 유지합니다. */ }
    setDetail(null);
    setChatMeeting((current) => current?.id === meeting.id ? null : current);
    setCommunityChatMeeting((current) => current?.id === meeting.id ? null : current);
    setCommunityChatListOpen(false);
    setPartnerStoreEditMeeting((current) => current?.id === meeting.id ? null : current);
    setBulkPinMeeting((current) => current?.id === meeting.id ? null : current);
    onMeetingReleased?.(meeting.id);
    navigateToMyMeetings();
    onToast?.("모임이 해제되었습니다.");
  };
  const canEditMeetingPlace = (meeting: Meeting) => Boolean(hostConfirmedByMeeting[meeting.id]);
  const openMeetingPlaceEditor = (meeting: Meeting) => {
    if (canEditMeetingPlace(meeting) && !window.confirm("이미 매장 사장님 확인이 진행 중인 모임입니다. 장소 변경 시 기존 예약이 취소됩니다. 진행하시겠습니까?")) return;
    setPartnerStoreEditMeeting(meeting);
  };
  const selectMeetingPartnerStore = (store: PartnerStore) => {
    const meeting = partnerStoreEditMeeting;
    if (!meeting) return;
    updateMeetingRecord(meeting.id, { partnerStore: store, place: store.name, address: store.address, benefit: store.benefit, placeMode: "PARTNER" });
    setPartnerStoreEditMeeting(null);
    showFeedback("모임 장소가 변경되었습니다.", setMeetingToast);
  };
  const cancelMeetingPartnerStore = (meeting: Meeting) => {
    if (canEditMeetingPlace(meeting) && !window.confirm("이미 매장 사장님 확인이 진행 중인 모임입니다. 장소 변경 시 기존 예약이 취소됩니다. 진행하시겠습니까?")) return;
    if (!window.confirm("제휴 매장 지정을 취소하시겠습니까? 제휴 혜택 제공이 중단됩니다.")) return;
    updateMeetingRecord(meeting.id, { partnerStore: undefined, place: "일정은 모임방에서 정해요", placeMode: "FREE", benefit: "동네에서 편하게 만나는 모임" });
    showFeedback("제휴 매장 지정이 취소되었습니다.", setMeetingToast);
  };
  const requestAdultAccess = (meeting?: Meeting) => { if (adultVerified) { if (meeting) setDetail(meeting); else setCategory("심야·라이브"); return; } setPendingCreate(false); setPendingNight(meeting ?? null); setAdultGateOpen(true); }; const handleCategory = (item: MeetingCategory) => isNight(item) ? requestAdultAccess() : setCategory(item); const detailAccessMessage = (meeting: Meeting) => { if (currentUser.age < 19) return "미성년자는 안전한 운영을 위해 동네모임에 참여할 수 없습니다."; const conditions = [ageLabel(meeting) !== "누구나 참여 가능" ? ageLabel(meeting) : "", getGenderRequirement(meeting) !== "ALL" ? genderLabel(getGenderRequirement(meeting)) : ""].filter(Boolean).join(" / "); return `본 모임은 ${conditions || "제한된 참여 조건"} 모임입니다. 참여 조건이 일치하지 않아 상세 정보를 조회할 수 없습니다.`; }; const handleMeetingOpen = (meeting: Meeting) => { if (currentUser.age < 19) { setDetail(meeting); return; } if (!genderAllowedFor(meeting) || !ageAllowedFor(meeting, currentUser.age)) { showFeedback(detailAccessMessage(meeting), setMeetingToast); return; } if (isNight(meeting)) requestAdultAccess(meeting); else setDetail(meeting); }; const openCreate = () => { if (communityActionBlocked) { showFeedback("관리자 조치 또는 계정 상태 확인 전에는 모임을 만들 수 없습니다.", setMeetingToast); return; } if (adultVerified) { setCreateOpen(true); return; } setPendingNight(null); setPendingCreate(true); setAdultGateOpen(true); }; const closeCreate = () => { setCreateOpen(false); }; const confirmAdult = () => { if (pendingCreate && communityActionBlocked) { showFeedback("관리자 조치 또는 계정 상태 확인 전에는 모임을 만들 수 없습니다.", setMeetingToast); setAdultGateOpen(false); setPendingCreate(false); return; } setAdultVerified(true); window.localStorage.setItem("dangam_is_adult", "true"); setAdultGateOpen(false); if (pendingCreate) setCreateOpen(true); else if (pendingNight) setDetail(pendingNight); else setCategory("심야·라이브"); setPendingNight(null); setPendingCreate(false); }; const closeGate = () => { setAdultGateOpen(false); setPendingNight(null); setPendingCreate(false); }; return <div className="subview meeting-view">{chatMeeting ? (<MeetingGroupChat key={`chat:${currentUserId}:${chatMeeting.id}`} meeting={chatMeeting} participation={getParticipation(chatMeeting)} onMeetingSchedulesChange={(schedules) => updateMeetingRecord(chatMeeting.id, { schedules })} onBack={() => { setChatMeeting(null); }} />) : (<>{previewMockMode && (!previewCommunityModeration || previewCommunityModeration.currentAccountSanction !== "clear") && <div role="status" style={{ margin: "0 16px 12px", padding: "12px 14px", border: "1px solid #fcd34d", borderRadius: 12, background: "#fffbeb", color: "#78350f", fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>{!previewCommunityModeration ? "Preview 계정 조치 상태를 확인 중입니다. 확인 전에는 모임 생성과 참여가 제한됩니다." : previewCommunityModeration.currentAccountSanction === "warning" ? "커뮤니티 이용 경고가 등록되어 있습니다. 커뮤니티 이용 수칙을 확인해 주세요." : previewCommunityModeration.currentAccountSanction === "restricted" ? "관리자 조치로 모임 생성과 참여가 일시 제한되어 있습니다." : previewCommunityModeration.currentAccountSanction === "locked" ? "관리자 조치로 커뮤니티 활동이 잠겨 있습니다. 기간 만료 또는 관리자 해제 후 이용할 수 있습니다." : ""}</div>}{partnerNotice && <div className="partner-push-notice"><Bell size={15} /><span>{partnerNotice}</span></div>}{meetingToast && <div className="meeting-action-toast"><Check size={15} /><span>{meetingToast}</span></div>}<div className="community-story-row" aria-label="내 참여 모임">{communityStoryItems.map((item) => <button type="button" className="community-story-item" key={`story-${item.id}`} onClick={() => ("meeting" in item && item.meeting) ? handleMeetingOpen(item.meeting) : setCommunitySubTab("내 모임")}><span className="community-story-image"><img src={item.image} alt={`${item.title} 모임 사진`} />{item.hasUnread && <i aria-label="새 소식" />}</span><b>{item.title}</b></button>)}</div><div className="community-sub-tabs" role="tablist" aria-label="모임 보기 방식">{["홈", "참여", "내 모임"].map((item) => <button key={item} type="button" role="tab" aria-selected={communitySubTab === item} className={communitySubTab === item ? "active" : ""} onClick={() => { setCommunitySubTab(item); if (item === "내 모임") setCategory("전체"); }}>{item}</button>)}</div><div className="community-main-tabs" data-legacy-toolbar="meeting-minimal-toolbar" data-create-label="모임 만들기" data-legacy-filter="meeting-category-scroll" role="tablist" aria-label="커뮤니티 대분류">{["동네모임", "밥·술 번개", "운동·취미", "육아·가족", "동네생활"].map((item) => <button key={item} type="button" role="tab" aria-selected={communityTab === item} className={communityTab === item ? "active" : ""} onClick={() => { setCommunityTab(item); setCategory("전체"); }}>{item}</button>)}</div><div className="meeting-feed-head"><span>우리 동네 모임</span><div className="meeting-sort-tabs" role="tablist" aria-label="우리 동네 모임 정렬">{(["최신순", "거리순", "인기순"] as MeetingSort[]).map((item) => <button type="button" role="tab" key={item} aria-selected={meetingSort === item} className={meetingSort === item ? "active" : ""} onClick={() => setMeetingSort(item)}>{item}</button>)}</div></div>{communitySubTab === "참여" && communityEvents.length > 0 && <section className="community-event-list" aria-label="커뮤니티 일정"><h2>모임 일정</h2>{communityEvents.map((event) => { const eventMeeting = regionFilteredMeetings.find((item) => item.id === event.meetingId); const joined = eventMeeting ? getParticipation(eventMeeting).isJoined : false; const attending = event.schedule.attendeeIds.includes(currentUserId); return <article className="community-event-card" key={event.id}><img src={event.meetingImage} alt={`${event.meetingTitle} 모임 사진`} /><div className="community-event-card-body"><span className="community-event-kicker">{event.meetingTitle}</span><h3>{event.schedule.title}</h3><p> {formatChatScheduleDate(event.schedule.startAt)}</p><p> {event.schedule.partnerStore?.name ?? event.schedule.place}</p>{event.schedule.partnerStore && <em> 제휴 할인 혜택</em>}<strong>{event.schedule.attendeeIds.length}/{event.schedule.maxMembers}명 참여 중</strong><button type="button" className={joined ? "community-event-rsvp" : "community-event-join"} onClick={() => eventMeeting && toggleCommunityEvent(event)}>{joined ? (attending ? "참석 취소" : "일정 참석하기") : "모임 가입 및 참석하기"}</button></div></article>; })}</section>}<div className="meeting-list">{visible.length === 0 ? <p className="community-location-empty" role="status">{currentLocationRequested ? "현 위치 5km 이내에 유효한 좌표가 등록된 모임이 없습니다. 지역 선택으로 다시 찾아볼 수 있어요." : "선택한 지역에 모임이 없습니다."}</p> : visible.map((meeting) => { const current = getParticipation(meeting); const isFull = current.maxMembers !== null && current.currentMembers >= current.maxMembers; const genderAllowed = genderAllowedFor(meeting); const ageAllowed = ageAllowedFor(meeting, currentUser.age); const genderRequirement = getGenderRequirement(meeting); const upcomingSchedule = upcomingScheduleFor(meeting); const scheduleAttendees = upcomingSchedule ? upcomingSchedule.attendeeIds.length : current.currentMembers; const scheduleCapacity = upcomingSchedule?.maxMembers ?? current.maxMembers; return <article className={`meeting-card compact-horizontal ${meeting.tone} ${communitySubTab === "참여" ? "participation-schedule-card" : ""}`} key={meeting.id} role="button" tabIndex={0} onClick={() => handleMeetingOpen(meeting)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleMeetingOpen(meeting); } }}><div className="meeting-compact-thumb"><img src={meetingThumbnailFor(meeting)} alt={`${meeting.title} 모임 사진`} /></div><div className="meeting-compact-content"><div className="meeting-compact-topline"><span className="meeting-category compact-category">{meeting.customTopic || meetingCategoryLabel(meeting.category)}</span><span className={`age-badge compact-badge ${ageAllowed ? "" : "gender-locked-badge"}`}>{currentUser.age < 19 ? "미성년자 참여 불가" : meeting.adultOnly ? "성인만 참여" : meeting.placeMode === "FREE" ? "동네 약속" : ageLabel(meeting).replace(" 참여 가능", "")}</span>{communitySubTab === "참여" && <span className="schedule-live-badge">참여 가능</span>}<strong className={`meeting-compact-members ${isFull ? "confirmed" : ""}`}>{communitySubTab === "참여" ? `${scheduleAttendees}명 / ${scheduleCapacity === null ? "제한 없음" : `정원 ${scheduleCapacity}명`}` : meetingCapacityShortLabel(current)}</strong></div><h3 className="meeting-compact-title">{meeting.title}</h3>{communitySubTab === "참여" && <button type="button" className="meeting-compact-join" onClick={(event) => { event.stopPropagation(); toggleParticipation(meeting); }}>{getParticipation(meeting).isJoined ? "참여 취소" : "참여하기"}</button>}</div><ChevronRight className="meeting-compact-arrow" size={21} aria-hidden="true" /></article>; })}</div>{communitySubTab === "홈" && !createOpen && !adultGateOpen && <button type="button" className={`community-create-fab ${fabExpanded ? "expanded" : ""}`} onMouseEnter={() => setFabExpanded(true)} onMouseLeave={() => setFabExpanded(false)} onTouchStart={() => setFabExpanded(true)} onClick={() => openCreate()} aria-label="모임 만들기"><Plus className="community-create-plus-icon" size={18} aria-hidden="true" /><span className="community-fab-label">모임 만들기</span></button>}{createOpen && <MeetingCreateSheet hostId={currentUser.id} hostGender={currentUser.gender} onClose={closeCreate} onCreate={addCreatedMeeting} />}{adultGateOpen && <MeetingAdultGate onClose={closeGate} onConfirm={confirmAdult} />}{detail && (!genderAllowedFor(detail) || !ageAllowedFor(detail, currentUser.age) ? <LockedMeetingDetail meeting={detail} message={detailAccessMessage(detail)} onClose={() => setDetail(null)} /> : <MeetingDetailSheet currentUserId={currentUser.id} meeting={detail} participation={getParticipation(detail)} onJoin={() => joinMeeting(detail)} onOpenChat={() => openMeetingChatFromDetail(detail)} onConfirmUpdate={() => confirmMeetingUpdates(detail)} onReleaseMeeting={() => releaseMeeting(detail)} onAccessBlocked={() => handleAccessBlocked(detail)} genderAllowed={genderAllowedFor(detail)} ageAllowed={ageAllowedFor(detail, currentUser.age)} isHost={currentUser.id === detail.hostId} hostConfirmed={Boolean(hostConfirmedByMeeting[detail.id])} onConfirmMeeting={() => confirmMeetingByHost(detail)} bulkVisitAuth={bulkVisitAuthByMeeting[detail.id]} onOpenBulkPin={() => setBulkPinMeeting(detail)} onEditPlace={() => openMeetingPlaceEditor(detail)} onCancelPlace={() => cancelMeetingPartnerStore(detail)} onSchedulesChange={(schedules) => { updateMeetingRecord(detail.id, { schedules }); }} onMembersChange={(members, allowAll) => updateMeetingRecord(detail.id, { membersList: members, allowMemberScheduleCreation: allowAll })} onScheduleNotice={(message) => showFeedback(message, setMeetingToast)} onClose={() => setDetail(null)} />)}{partnerStoreEditMeeting && <PartnerStorePicker selectedCategory={partnerStoreEditMeeting.category} selectedAreas={[partnerStoreEditMeeting.address.split(",")[0] ?? ""]} onSelect={selectMeetingPartnerStore} onClose={() => setPartnerStoreEditMeeting(null)} />}{bulkPinMeeting && <MeetingBulkMerchantPinSheet meeting={bulkPinMeeting} memberCount={getParticipation(bulkPinMeeting).currentMembers} onClose={() => setBulkPinMeeting(null)} onComplete={completeBulkVisit} />} </> )}</div>; }
function campaignFavoriteKey(campaign: Campaign) { return campaign.centralCampaignId ? `central:${campaign.centralCampaignId}` : `local:${campaign.id}`; }
function ExperienceFavoriteToggle({ campaign, isFavorite, onToggleFavorite }: { campaign: Campaign; isFavorite: boolean; onToggleFavorite: (campaign: Campaign) => void }) { return <button type="button" className={`experience-favorite-toggle ${isFavorite ? "active" : ""}`} aria-label={isFavorite ? `${campaign.store} 찜 해제` : `${campaign.store} 찜하기`} aria-pressed={isFavorite} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite(campaign); }}><Star className="experience-favorite-star" size={16} fill="currentColor" aria-hidden="true" /></button>; }
function WalletFavoriteCampaignCard({ campaign, onToggleFavorite }: { campaign: Campaign; onToggleFavorite: (campaign: Campaign) => void }) { return <article className="experience-media-card wallet-favorite-campaign-card" data-favorite-campaign-id={campaignFavoriteKey(campaign)}><div className={`experience-media-thumb ${campaign.tone}`}><CouponMediaImage sources={[...(campaign.imageSources ?? [campaign.image]), couponMediaImageFor(campaign.store)]} alt={`${campaign.store} 대표 이미지`} /><ExperienceFavoriteToggle campaign={campaign} isFavorite onToggleFavorite={onToggleFavorite} /></div><div className="experience-card-info"><div className="experience-card-top"><div><span className="experience-store">{campaign.store}</span><b className="experience-title">{campaign.title}</b></div><span className="wallet-favorite-campaign-kind">체험단</span></div><p className="experience-benefit">{campaign.benefit}</p><div className="experience-card-bottom"><span>찜 매장에 저장됨</span><button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite(campaign); }}>찜 해제</button></div></div></article>; }
function ExperienceMediaThumb({ campaign, onOpen, isFavorite, onToggleFavorite }: { campaign: Campaign; onOpen: () => void; isFavorite: boolean; onToggleFavorite: (campaign: Campaign) => void }) { return <div className={`experience-media-thumb ${campaign.tone}`}><button type="button" className="experience-media-open-button" aria-label={`${campaign.store} ${campaign.title} 사진·영상 보기`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(); }}><CouponMediaImage sources={[...(campaign.imageSources ?? [campaign.image]), couponMediaImageFor(campaign.store)]} alt={`${campaign.store} 대표 이미지`} /></button><ExperienceFavoriteToggle campaign={campaign} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} /></div>; }
type ExperienceCategory = StoreCategory;
function experienceCategoryForCampaign(campaign: Campaign): ExperienceCategory {
  return experienceCampaignCategory(campaign);
}
function ExperienceCampaignDday({ applicationEndsOn }: { applicationEndsOn?: string | null }) { const label = formatCouponDday(applicationEndsOn ?? undefined); return label ? <div className="experience-card-badges"><span className="coupon-dday-badge" aria-label={`신청 종료 ${label}`}>{label}</span></div> : null; } function ExperienceView({ applications, campaigns, favoriteCampaignIds, onToggleFavoriteCampaign, onSubmit, onViewHistory, isSubscriber, onStartMembership, onOpenMap, onToast, targetDongs, targetRegionCodes, isVerifiedAdult }: { applications: CampaignApplication[]; campaigns: Campaign[]; favoriteCampaignIds: string[]; onToggleFavoriteCampaign: (campaign: Campaign) => void; onSubmit: (application: CampaignApplication) => void; onViewHistory: () => void; isSubscriber: boolean; onStartMembership: () => void; onOpenMap: (item: StoreMapItem) => void; onToast: (message: string) => void; targetDongs: string[] | null; targetRegionCodes: string[] | null; isVerifiedAdult: boolean }) {
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExperienceCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  useEffect(() => { if (!isVerifiedAdult && (selectedCategory === "주류/유흥" || selectedCategory === "숙박")) { setSelectedCategory(null); setSelectedSubcategory(null); } }, [isVerifiedAdult, selectedCategory]);
  const visibleSelectedCategory = isVerifiedAdult || (selectedCategory !== "주류/유흥" && selectedCategory !== "숙박") ? selectedCategory : null;
  const [apply, setApply] = useState<Campaign | null>(null);
  const [membershipCampaign, setMembershipCampaign] = useState<Campaign | null>(null);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerItem | null>(null);
  const selectedCodes = (targetRegionCodes ?? []).filter((code) => /^\d{10}$/.test(code));
  const filteredCampaigns = campaigns.filter((campaign) => {
    const campaignCodes = normalizeAdminRegionTargetCodes(campaign.targetRegionCodes ?? []);
    const matchesTarget = selectedCodes.length === 0 || campaignCodes.some((targetCode) =>
      targetCode === "__nationwide__" || selectedCodes.some((selectedCode) => adminRegionMatchesTarget(targetCode, selectedCode))
    );
    const matchesCategory = isExperienceCampaignVisible(campaign, isVerifiedAdult) && (!visibleSelectedCategory || experienceCategoryForCampaign(campaign) === visibleSelectedCategory);
    const matchesSubcategory = !selectedSubcategory || experienceCampaignSubcategory(campaign) === selectedSubcategory;
    const hasActiveApplication = applications.some((application) => application.campaignId === campaign.id && application.status !== "NOT_SELECTED");
    return matchesTarget && matchesCategory && matchesSubcategory && !hasActiveApplication;
  });
  return <div className="subview experience-subview"><div className="experience-inline-head"><CouponCatalogCategoryFilter ariaLabel="체험단 업종 필터" isVerifiedAdult={isVerifiedAdult} value={(visibleSelectedCategory ?? "전체") as CouponCatalogCategory} onChange={(value) => { setSelectedCategory(value === "전체" ? null : value); setSelectedSubcategory(null); }} /></div>{visibleSelectedCategory && <div className="experience-subcategory-chips" aria-label={`${visibleSelectedCategory} 체험단 세부 업종`}>{experienceSubcategories(visibleSelectedCategory).map((subcategory) => <button type="button" key={subcategory} className={selectedSubcategory === subcategory ? "active" : ""} aria-pressed={selectedSubcategory === subcategory} onClick={() => setSelectedSubcategory((current) => current === subcategory ? null : subcategory)}>{subcategory}</button>)}</div>}<div className="experience-list">{filteredCampaigns.map((campaign) => <article className="experience-media-card" key={campaign.id} onClick={() => setSelected(campaign)}><ExperienceMediaThumb campaign={campaign} isFavorite={favoriteCampaignIds.includes(campaignFavoriteKey(campaign))} onToggleFavorite={onToggleFavoriteCampaign} onOpen={() => setMediaViewer({ store: campaign.store, title: campaign.title, image: campaign.image, imageSources: campaign.imageSources, latitude: campaign.latitude, longitude: campaign.longitude, videoUrl: campaign.videoUrl, mediaType: campaign.mediaType, mediaItems: campaign.mediaItems, kind: "experience", locationText: [campaign.address, campaign.distance].filter(Boolean).join(" · ") || "매장 위치", benefit: campaign.benefit, actionLabel: "체험단 지원하기", onAction: () => { if (isSubscriber) { setApply(campaign); } else { setMembershipCampaign(campaign); } } })} /><div className="experience-card-info"><div className="experience-card-top"><div><span className="experience-store">{campaign.store}</span><b className="experience-title">{campaign.title}</b></div><ExperienceCampaignDday applicationEndsOn={campaign.applicationEndsOn} /></div><p className="experience-benefit">{campaign.benefit}</p><div className="experience-card-bottom"><span>모집 {campaign.recruited}명 · {campaign.applicants}명 지원</span><button type="button" onClick={(event) => { event.stopPropagation(); setSelected(campaign); }}>상세 보기</button></div></div></article>)}{filteredCampaigns.length === 0 && <div className="experience-empty-state"><MapPin size={20} /><b>아직 체험단 공고가 없어요.</b><span>새로운 공고를 준비하고 있어요.</span></div>}</div>{selected && <CampaignDetail campaign={selected} isSubscriber={isSubscriber} onOpenMap={onOpenMap} onToast={onToast} onClose={() => setSelected(null)} onApply={() => { if (isSubscriber) { setApply(selected); setSelected(null); } else { setMembershipCampaign(selected); setSelected(null); } }} />}{apply && <CampaignApply campaign={apply} onClose={() => setApply(null)} onSubmit={onSubmit} onViewHistory={() => { setApply(null); onViewHistory(); }} />}{mediaViewer && <MediaViewer item={mediaViewer} onClose={() => setMediaViewer(null)} onOpenMap={onOpenMap} onToast={onToast} />}{membershipCampaign && <CampaignMembershipSheet onClose={() => setMembershipCampaign(null)} onStart={() => { setMembershipCampaign(null); onStartMembership(); }} />}</div>;
}
function WithdrawalModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) { const [agreed, setAgreed] = useState(false); return <div className="overlay" onClick={onClose}><section className="withdrawal-modal" onClick={(event) => event.stopPropagation()}><header className="withdrawal-head"><div><h2>회원 탈퇴 안내</h2></div><button className="close-btn" onClick={onClose} aria-label="회원 탈퇴 안내 닫기"><X size={17} /></button></header><div className="withdrawal-danger">회원 탈퇴 시 아래의 모든 혜택 및 수당 자격이 즉시 영구 소멸되며, 복구할 수 없습니다.</div><div className="withdrawal-loss-list"><article><strong>1. 파트너 영업 수당 소멸</strong><p>미정산 수당과 파트너 영업 수당 정산 자격이 영구 소멸됩니다.</p></article><article><strong>2. 멤버십·쿠폰 혜택 종료</strong><p>보유 쿠폰과 멤버십 혜택, 체험단 신청 내역이 삭제됩니다.</p></article><article><strong>3. 계정 데이터 삭제</strong><p>찜 매장과 쿠폰 사용 이력 등 계정 활동 데이터가 영구 삭제됩니다.</p></article></div><label className="withdrawal-agreement"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>[필수] 파트너 수당 소멸 및 멤버십 혜택 삭제 안내를 확인하였으며, 탈퇴에 동의합니다.</span></label><div className="withdrawal-actions"><button type="button" className="withdrawal-continue" onClick={onClose}>취소하고 계속 이용하기</button><button type="button" className="withdrawal-confirm" disabled={!agreed} onClick={onConfirm}>탈퇴하기</button></div></section></div>; }
function LogoutModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) { return <div className="overlay" onClick={onClose}><section className="logout-modal" onClick={(event) => event.stopPropagation()}><button className="close-btn" onClick={onClose} aria-label="로그아웃 안내 닫기"><X size={17} /></button><div className="logout-icon"><LogOut size={24} /></div><header className="logout-head"><h2>로그아웃</h2><p>현재 계정에서 로그아웃하시겠습니까? 다시 이용하시려면 언제든 다시 로그인해 주세요.</p></header><div className="logout-actions"><button type="button" className="logout-cancel" onClick={onClose}>취소</button><button type="button" className="logout-confirm" onClick={onConfirm}>로그아웃</button></div></section></div>; }

function PartnerScheduleSimulator({ coupons, schedules, onChange }: { coupons: Coupon[]; schedules: Record<number, BusinessSchedule>; onChange: (couponId: number, schedule: BusinessSchedule) => void }) { const [couponId, setCouponId] = useState(coupons[0]?.id ?? 1); const [merchantCategory, setMerchantCategory] = useState<Category>("카페·디저트"); const merchantSubcategories = merchantCategory === "카페·디저트" ? foodCategoryChips["카페·디저트"] : merchantCategory === "식당·맛집" ? ["전체", ...foodSubcategories.map((item) => item.label)] : generalCategoryChips[merchantCategory as GeneralCategory] ?? ["전체"]; const [merchantSubcategory, setMerchantSubcategory] = useState(merchantSubcategories[0]); const current = schedules[couponId] ?? scheduleForStore(coupons[0]?.store ?? ""); const [preset, setPreset] = useState("default"); const applyPreset = (value: string) => { setPreset(value); const next = value === "extended" ? { ...current, operatingHours: { open: "12:00", close: "24:00" }, lastOrder: "23:30", breakTime: undefined } : value === "sunday" ? { ...current, businessDays: [1, 2, 3, 4, 5, 6], holidayExceptions: ["2026-10-09"] } : scheduleForStore(coupons.find((coupon) => coupon.id === couponId)?.store ?? ""); onChange(couponId, next); }; return <section className="partner-schedule-panel"><div className="subview-head"><div><p className="eyebrow">PARTNER PREVIEW</p><h3>가맹점 운영 일정 연동</h3></div><Zap size={15} /></div><p>사업자 설정 변경이 소비자 예약 폼에 즉시 반영되는 시뮬레이터입니다.</p><div className="partner-category-fields"><label><span>매장 대분류</span><select value={merchantCategory} onChange={(event) => { const next = event.target.value as Category; setMerchantCategory(next); const nextOptions = next === "카페·디저트" ? foodCategoryChips["카페·디저트"] : next === "식당·맛집" ? ["전체", ...foodSubcategories.map((item) => item.label)] : generalCategoryChips[next as GeneralCategory] ?? ["전체"]; setMerchantSubcategory(nextOptions[0]); }} aria-label="매장 대분류"><option value="카페·디저트">카페·디저트</option><option value="식당·맛집">음식점·맛집</option><option value="생활·편의">교육·학원</option><option value="병원·약국">병원/약국</option><option value="생활·편의">생활·편의</option><option value="기타">여가·공간</option><option value="운동·헬스">헬스·스포츠</option><option value="뷰티·미용">뷰티·미용</option></select></label><label><span>매장 소분류</span><select value={merchantSubcategory} onChange={(event) => setMerchantSubcategory(event.target.value)} aria-label="매장 소분류">{merchantSubcategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><select value={couponId} onChange={(event) => { const nextId = Number(event.target.value); setCouponId(nextId); setPreset("default"); }} aria-label="운영 일정을 변경할 매장">{coupons.map((coupon) => <option key={coupon.id} value={coupon.id}>{coupon.store}</option>)}</select><div className="partner-schedule-summary"><b>{current.operatingHours.open}~{current.operatingHours.close} · 라스트오더 {current.lastOrder}</b><span>영업 요일 {current.businessDays.map((value) => ["일", "월", "화", "수", "목", "금", "토"][value]).join("·")} · 임시휴무 {current.holidayExceptions.length ? current.holidayExceptions.join(", ") : "없음"}</span><span>{current.breakTime ? `브레이크타임 ${current.breakTime.start}~${current.breakTime.end}` : "브레이크타임 없음"}</span></div><div className="partner-schedule-actions"><button className={preset === "default" ? "active" : ""} onClick={() => applyPreset("default")}>기본 일정</button><button className={preset === "sunday" ? "active" : ""} onClick={() => applyPreset("sunday")}>일요일 휴무·임시휴무</button><button className={preset === "extended" ? "active" : ""} onClick={() => applyPreset("extended")}>12:00~24:00 연장</button></div></section>; }
function MediaUploadPanel() { const { isAuthenticated, loading } = useAuth(); const mediaQuery = trpc.media.listMine.useQuery(undefined, { enabled: isAuthenticated, retry: false }); const upload = trpc.media.upload.useMutation({ onSuccess: () => { setMessage("파일이 저장되었습니다."); void mediaQuery.refetch(); }, onError: (error) => setMessage(error.message || "파일 업로드에 실패했습니다.") }); const [message, setMessage] = useState(""); const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { setMessage("이미지 또는 동영상만 업로드할 수 있습니다."); return; } if (file.size > 15 * 1024 * 1024) { setMessage("파일은 15MB 이하로 선택해 주세요."); return; } if (!isAuthenticated) { startLogin(); return; } const dataBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다.")); reader.readAsDataURL(file); }); upload.mutate({ originalName: file.name, mimeType: file.type, sizeBytes: file.size, dataBase64 }); }; return <section className="media-upload-panel"><div className="media-upload-heading"><div><p className="eyebrow">DANGAM MEDIA STORAGE</p><h3>매장 사진·영상 보관함</h3><p>업로드한 미디어는 안전한 파일 저장소에 보관하고 필요한 카드에 재사용할 수 있어요.</p></div><label className={`media-upload-button ${upload.isPending ? "disabled" : ""}`}><span>{upload.isPending ? "저장 중…" : "＋ 파일 올리기"}</span><input type="file" accept="image/*,video/*" onChange={handleFile} disabled={upload.isPending} /></label></div>{message && <p className="media-upload-message">{message}</p>}{loading ? <p className="media-upload-empty">인증 상태를 확인하는 중이에요.</p> : !isAuthenticated ? <p className="media-upload-empty">파일을 올리려면 로그인해 주세요.</p> : mediaQuery.isLoading ? <p className="media-upload-empty">저장된 파일을 불러오는 중이에요.</p> : mediaQuery.data?.length ? <div className="media-upload-grid">{mediaQuery.data.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="media-upload-item">{file.mimeType.startsWith("video/") ? <video src={file.url} muted /> : file.mimeType === "application/pdf" ? <span className="media-upload-pdf-icon" aria-hidden="true"><ClipboardList size={28} /></span> : <img src={file.url} alt={file.originalName} />}<span>{file.originalName}</span></a>)}</div> : <p className="media-upload-empty">아직 저장된 사진·영상이 없습니다.</p>}</section>; }
function PartnerRecruitmentSheet({ onClose, onStudentStart }: { onClose: () => void; onStudentStart: () => void }) {
  return <div className="overlay partner-recruitment-overlay" onClick={onClose}><section className="partner-recruitment-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="partner-recruitment-title"><header className="partner-recruitment-header"><div><h2 id="partner-recruitment-title">팅커벨 파트너 안내</h2><p>친구에게 팅커벨을 소개하고 매달 특별한 혜택을 받아보세요.</p></div><button type="button" onClick={onClose} aria-label="파트너 안내 닫기"><X size={18} /></button></header><div className="partner-recruitment-cards"><article className="partner-benefit-card student"><span className="partner-benefit-kicker">🎓 학생·청소년 전용</span><h3>친구 3명 초대 시 매월 무료 쿠폰 지급!</h3><p>복잡한 통장이나 서류 제출 없이 누구나 간편하게 참여할 수 있어요. 초대한 친구 수에 따라 매월 100% 무료 쿠폰을 드립니다.</p><button type="button" onClick={onStudentStart}>간편 추천코드 발급받기</button></article></div></section></div>;
}
function StudentPartnerConsentSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, phone: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const phoneDigits = phone.replace(/\D/g, "");
  const canSubmit = name.trim().length > 0 && phoneDigits.length >= 10 && phoneDigits.length <= 11 && policyAgreed && privacyAgreed;
  return <div className="overlay student-consent-overlay" onClick={onClose}><section className="student-consent-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="student-consent-title"><header className="student-consent-header"><div><p className="eyebrow">학생 파트너</p><h2 id="student-consent-title">🎓 학생 파트너 간편 등록</h2><p>보호자 동의 후 서류 없이 추천코드를 발급받아 친구를 초대해 보세요.</p><p className="student-consent-guardian-note">학생은 보호자와 함께 내용을 확인한 뒤 동의해 주세요.</p></div><button type="button" onClick={onClose} aria-label="학생 파트너 간편 등록 닫기"><X size={18} /></button></header><div className="student-consent-body"><label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="신청자 본인 이름" autoComplete="name" /></label><label><span>휴대폰 번호</span><input value={phone} onChange={(event) => setPhone(formatStudentPhone(event.target.value))} placeholder="010-0000-0000" inputMode="numeric" autoComplete="tel" maxLength={13} pattern="01[0-9]-[0-9]{3,4}-[0-9]{4}" /></label><div className="student-consent-checks"><label><input type="checkbox" checked={policyAgreed} onChange={(event) => setPolicyAgreed(event.target.checked)} /><span><b>[필수]</b> 학생 파트너 활동 규정 및 쿠폰 지급 정책 동의<small>월 1회 초대 인원 비례 차등 지급 규정</small></span></label><label><input type="checkbox" checked={privacyAgreed} onChange={(event) => setPrivacyAgreed(event.target.checked)} /><span><b>[필수]</b> 혜택 지급을 위한 개인정보 수집 및 이용 동의</span></label></div><button type="button" className={`student-consent-submit ${canSubmit ? "is-enabled" : ""}`} disabled={!canSubmit} onClick={() => { if (!canSubmit) return; onSubmit(name.trim(), phone.trim()); }}>동의하고 추천코드 발급받기 <ArrowRight size={15} /></button></div></section></div>;
}
function StudentPartnerInviteSheet({ onClose, onOpenCoupons, onToast }: { onClose: () => void; onOpenCoupons: () => void; onToast: (message: string) => void }) {
  const studentCode = window.localStorage.getItem("dangam_student_partner_code") || STUDENT_PARTNER_CODE;
  const [inviteCount] = useState(() => getStudentInviteCount(window.localStorage.getItem(`dangam_referral_count_${studentCode}`)));
  const referralLink = getStudentPartnerReferralLink(window.location.origin, studentCode);
  const rewardTier = getStudentRewardTier(inviteCount);
  const copyCode = async () => { try { await navigator.clipboard?.writeText(studentCode); } catch { /* clipboard may be unavailable */ } onToast("코드가 복사되었습니다"); };
  const shareInvite = async () => {
    if (navigator.share) { try { await navigator.share({ title: "팅커벨 학생 파트너 초대", text: `팅커벨 친구 초대 코드 ${studentCode}로 가입해 보세요!`, url: referralLink }); return; } catch { /* 사용자가 공유 창을 닫은 경우 */ } }
    try { await navigator.clipboard?.writeText(referralLink); } catch { /* clipboard may be unavailable */ }
    onToast("카카오톡으로 보낼 초대 링크가 복사되었습니다.");
  };
  return <div className="overlay student-invite-overlay" onClick={onClose}><section className="student-invite-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="student-invite-title"><header className="student-invite-header"><div><p className="eyebrow">STUDENT PARTNER</p><h2 id="student-invite-title">🎉 학생 파트너 등록 완료!</h2><p><b>친구 3명 이상 초대 시, 초대 인원에 비례하여 매월 1회 100% 무료 쿠폰 차등 지급!</b><br />더 많은 친구를 초대할수록 쿠폰 금액과 혜택이 점점 더 커집니다.</p></div><button type="button" onClick={onClose} aria-label="학생 파트너 초대 센터 닫기"><X size={18} /></button></header><div className="student-invite-body"><section className="student-code-card"><div><small>내 추천코드</small><strong>{studentCode}</strong></div><button type="button" onClick={copyCode}><Copy size={14} /> 코드 복사</button></section><section className="student-progress-card"><div className="student-progress-head"><b>현재 초대 인원: {inviteCount}명</b><span className={`student-tier-status ${rewardTier !== "NONE" ? "qualified" : ""}`}>{rewardTier === "NONE" ? `최소 3명까지 ${getStudentInviteRemaining(inviteCount)}명 남음` : "이번 달 쿠폰 자격 획득"}</span></div><p className="student-progress-copy">{inviteCount}명 (최소 3명 달성 시 이번 달 쿠폰 확정!)</p><div className="student-reward-list"><div className={rewardTier === "BASE" ? "active" : ""}><span>🥉</span><div><b>3명 달성</b><small>100% 무료 쿠폰</small></div></div><div className={rewardTier === "UP" ? "active" : ""}><span>🥈</span><div><b>10명 달성</b><small>100% 무료 쿠폰</small></div></div><div className={rewardTier === "MAX" ? "active" : ""}><span>🥇</span><div><b>30명 이상 달성</b><small>100% 무료 쿠폰 지급</small></div></div></div><p className="student-payout-note">🗓️ 지급 주기: 매월 1일 전월 누적 초대 인원에 맞춰 쿠폰함으로 자동 지급</p></section><button type="button" className="student-share-button" onClick={shareInvite}>카카오톡 / 친구에게 공유 링크 보내기 <ArrowRight size={15} /></button><button type="button" className="student-wallet-button" onClick={() => { onClose(); onOpenCoupons(); }}>내 무료 쿠폰함 가기 <Ticket size={15} /></button></div></section></div>;
}
type SettingsPage = "main" | "account" | "email" | "phone" | "notifications" | "blocked-users" | "notices" | "membership" | "student" | "partner" | "settlement";
type UserProfileRecord = { nickname: string; avatar: string };
const USER_PROFILE_STORAGE_KEY = "dangam_user_profile";
function readUserProfile(): UserProfileRecord { const fallback: UserProfileRecord = { nickname: "민", avatar: "" }; try { const raw = window.localStorage.getItem(USER_PROFILE_STORAGE_KEY); if (raw) { const parsed = JSON.parse(raw) as Partial<UserProfileRecord>; const normalized = { nickname: typeof parsed.nickname === "string" && parsed.nickname.trim() ? parsed.nickname : fallback.nickname, avatar: typeof parsed.avatar === "string" ? parsed.avatar : fallback.avatar }; window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(normalized)); return normalized; } } catch { /* use defaults */ } window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(fallback)); return fallback; }
function readNicknameRegistry() { try { const raw = window.localStorage.getItem("dangam_nickname_registry"); return raw ? (JSON.parse(raw) as string[]) : []; } catch { return []; } }
function nicknameIsAvailable(value: string, current: string) { const normalized = value.trim().toLocaleLowerCase("ko-KR"); return Boolean(normalized) && (normalized === current.trim().toLocaleLowerCase("ko-KR") || !readNicknameRegistry().some((item) => item.toLocaleLowerCase("ko-KR") === normalized)); }


type BlockedUser = { id: string; nickname: string; blockedAt: string };
const VERIFIED_PHONE_STORAGE_KEY = "dangam_verified_phone";
const VERIFIED_STATUS_STORAGE_KEY = "dangam_phone_verified";
function formatVerifiedPhone(value: string) { const digits = value.replace(/\D/g, ""); const local = digits.startsWith("82") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits; if (local.length === 10) return `+82 ${local.slice(0, 2)}-${local.slice(2, 6)}-${local.slice(6)}`; if (local.length === 9) return `+82 ${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`; return local ? `+82 ${local}` : ""; }
function readPhoneVerificationStatus() { return window.localStorage.getItem(VERIFIED_STATUS_STORAGE_KEY) === "true" || Boolean(window.localStorage.getItem(VERIFIED_PHONE_STORAGE_KEY)); }
function readVerifiedPhone() { const stored = window.localStorage.getItem(VERIFIED_PHONE_STORAGE_KEY) || window.localStorage.getItem("dangam_account_phone") || window.localStorage.getItem("dangam_auth_phone") || ""; return formatVerifiedPhone(stored); }

const SETTINGS_NOTICES = [{ id: "notice-privacy", title: "개인정보 보호 안내", date: "2026.10.10", body: "팅커벨은 안전한 동네 생활을 위해 필요한 정보만 수집하고, 이용자의 선택을 존중합니다." }, { id: "notice-coupon", title: "쿠폰 이용 정책 변경 안내", date: "2026.10.01", body: "매장별 쿠폰 이용 조건과 남은 수량은 매장 카드에서 실시간으로 확인할 수 있습니다." }, { id: "notice-community", title: "안전한 동네모임 이용 안내", date: "2026.09.24", body: "서로 배려하는 커뮤니티를 위해 불편한 사용자는 차단하거나 신고할 수 있습니다." }];
const NOTICE_READ_STORAGE_KEY = "dangam_notice_read_ids";
function readNoticeIds(): string[] { try { return JSON.parse(window.localStorage.getItem(NOTICE_READ_STORAGE_KEY) ?? "[]") as string[]; } catch { return []; } }
function countUnreadNotices() { const read = new Set(readNoticeIds()); return SETTINGS_NOTICES.filter((notice) => !read.has(notice.id)).length; }
function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) { return <header className="settings-detail-header"><h2>{title}</h2></header>; }
function SettingsDetailRow({ icon, title, description, trailing, onClick }: { icon: React.ReactNode; title: string; description?: string; trailing?: React.ReactNode; onClick?: () => void }) { return <button type="button" className="settings-detail-row" onClick={onClick}><span className="settings-detail-icon">{icon}</span><span className="settings-detail-copy"><b>{title}</b>{description && <small>{description}</small>}</span>{trailing ?? <ChevronRight size={18} aria-hidden="true" />}</button>; }
function SettingsEmailPage({ email, onBack, onSaved, onToast }: { email: string; onBack: () => void; onSaved: (email: string) => void; onToast: (message: string) => void }) { const domains = ["직접 입력", "naver.com", "gmail.com", "daum.net", "kakao.com", "yahoo.com"]; const saved = email.split("@"); const [localPart, setLocalPart] = useState(saved[0] ?? ""); const savedDomain = saved.slice(1).join("@"); const [domainMode, setDomainMode] = useState(domains.includes(savedDomain) ? savedDomain : "직접 입력"); const [customDomain, setCustomDomain] = useState(domains.includes(savedDomain) ? "" : savedDomain); const domain = domainMode === "직접 입력" ? customDomain : domainMode; const fullEmail = `${localPart.trim()}@${domain.trim()}`; const valid = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(fullEmail); const save = () => { if (!valid) return; window.localStorage.setItem("dangam_account_email", fullEmail); window.dispatchEvent(new CustomEvent("dangam:account-email-changed", { detail: fullEmail })); onSaved(fullEmail); onToast("이메일이 등록되었습니다."); onBack(); }; return <div className="settings-detail-page settings-email-page"><SettingsHeader title="이메일 등록/수정" onBack={onBack} /><section className="settings-email-form"><p className="settings-email-help">이메일 주소를 등록하면 계정 안내와 중요한 알림을 받을 수 있어요.</p><label className="settings-email-label">이메일 주소<div className="settings-email-composer"><input value={localPart} onChange={(event) => setLocalPart(event.target.value)} placeholder="아이디" autoComplete="username" aria-label="이메일 아이디" /><span>@</span><input value={domain} onChange={(event) => { if (domainMode === "직접 입력") setCustomDomain(event.target.value); }} readOnly={domainMode !== "직접 입력"} placeholder="도메인" autoComplete="email" aria-label="이메일 도메인" /><select value={domainMode} onChange={(event) => setDomainMode(event.target.value)} aria-label="이메일 도메인 선택">{domains.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></label>{fullEmail !== "@" && !valid && <p className="settings-email-error" role="alert">아이디와 유효한 도메인을 입력해 주세요.</p>}<button type="button" className={`settings-email-save ${valid ? "enabled" : ""}`} disabled={!valid} onClick={save}>{email ? "저장" : "등록하기"}</button></section></div>; }
function SettingsPhoneReauthPage({ phone, onBack, onToast }: { phone: string; onBack: () => void; onToast: (message: string) => void }) {
  const startIdentityVerification = trpc.integration.startIdentityVerification.useMutation();
  const [newPhone, setNewPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [sent, setSent] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState("");
  const digits = newPhone.replace(/\D/g, "");
  const formattedInput = digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : newPhone;
  const canSend = /^01[016789]\d{8}$/.test(digits);
  const sendCode = async () => {
    if (!canSend) { setError("휴대폰 번호 11자리를 정확히 입력해 주세요."); return; }
    if (!consentChecked) { setError("본인인증 정보 수집·이용에 동의해 주세요."); return; }
    setError("");
    try {
      await startIdentityVerification.mutateAsync({ clientUserId: getClientUserId(), policyVersion: "identity-v1", consentTypes: ["IDENTITY_VERIFICATION", "PHONE_NUMBER", "PROFILE_PERSONALIZATION", "MINOR_PROTECTION"] });
      setSent(true);
      setVerificationCode("");
      onToast("인증번호가 발송되었습니다. 테스트 인증번호는 123456입니다. 다날 연결 후 실제 인증창이 열립니다.");
    } catch { setError("인증 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."); }
  };
  const verify = () => {
    if (verificationCode !== "123456") { setError("인증번호가 올바르지 않습니다."); return; }
    window.localStorage.setItem(VERIFIED_PHONE_STORAGE_KEY, digits);
    window.localStorage.setItem(VERIFIED_STATUS_STORAGE_KEY, "true");
    window.dispatchEvent(new CustomEvent("dangam:phone-verified", { detail: digits }));
    onToast("휴대폰 번호 재인증이 완료되었습니다.");
    onBack();
  };
  return <div className="settings-detail-page settings-phone-page"><SettingsHeader title="휴대폰 번호 변경(재인증)" onBack={onBack} /><section className="settings-phone-reauth"><div className="settings-phone-lock"><Phone size={28} /></div><h3>현재 인증된 휴대폰 번호</h3><strong>{phone || "인증 번호 없음"}</strong><p>새 번호를 입력하고 본인인증을 완료하면 휴대폰 번호가 변경됩니다.</p><div className="identity-consent-box"><strong>본인인증 정보 이용 동의</strong><p>이름, 휴대폰 번호, 성별, 생년월일을 확인해 회원 식별과 미성년자 보호 혜택에 사용합니다.</p><label><input type="checkbox" checked={consentChecked} onChange={(event) => { setConsentChecked(event.target.checked); setError(""); }} /> 본인인증 및 개인정보 수집·이용에 동의합니다. <b>(필수)</b></label><small>다날 인증 결과는 서버에서 확인하며 주민등록번호 원문은 저장하지 않습니다.</small></div><label className="phone-reauth-field">새 휴대폰 번호<input inputMode="numeric" value={formattedInput} onChange={(event) => { setNewPhone(event.target.value.replace(/[^0-9]/g, "").slice(0, 11)); setError(""); }} placeholder="010-1234-5678" aria-label="새 휴대폰 번호" /></label><button type="button" className="phone-reauth-send" onClick={() => void sendCode()} disabled={startIdentityVerification.isPending}>{startIdentityVerification.isPending ? "인증 준비 중" : sent ? "인증번호 다시 받기" : "인증번호 받기"}</button>{sent && <label className="phone-reauth-field">인증번호<input inputMode="numeric" value={verificationCode} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} placeholder="6자리 인증번호" aria-label="휴대폰 인증번호" /><small>인증번호를 입력해 주세요.</small></label>}{error && <p className="phone-reauth-error" role="alert">{error}</p>}{sent && <button type="button" className="phone-reauth-confirm" disabled={verificationCode.length !== 6} onClick={verify}>번호 변경 완료</button>}</section></div>;
}
function SettingsAccountPage({ isPreviewDemo = false, email, phone, phoneVerified, onBack, onLogout, onOpenEmail, onOpenPhone, onOpenWithdrawal }: { isPreviewDemo?: boolean; email: string; phone: string; phoneVerified: boolean; onBack: () => void; onLogout: () => void; onOpenEmail: () => void; onOpenPhone: () => void; onOpenWithdrawal: () => void }) { return <div className="settings-detail-page settings-account-page"><SettingsHeader title="내 계정" onBack={onBack} /><section className="settings-detail-section"><h3>정보</h3><SettingsDetailRow icon={<span>@</span>} title="이메일" trailing={<span className="settings-detail-value">{isPreviewDemo ? "미리보기에서 미사용" : email || "등록 필요"} <ChevronRight size={17} /></span>} onClick={onOpenEmail} /><SettingsDetailRow icon={<Phone size={18} />} title="휴대폰 번호" trailing={<span className="settings-detail-value">{isPreviewDemo ? "미리보기 · 번호 없음" : phone || "+82 10-****-1234"} <ChevronRight size={17} /></span>} onClick={onOpenPhone} /><SettingsDetailRow icon={<Globe2 size={18} />} title="국가" trailing={<span className="settings-detail-value">대한민국 <ChevronRight size={17} /></span>} /></section><section className="settings-detail-section"><h3>보안</h3><SettingsDetailRow icon={<Check size={18} />} title="본인인증" trailing={<span className="settings-detail-value">{isPreviewDemo ? "미리보기 · 인증 없음" : phoneVerified ? "인증됨" : "인증 필요"} <ChevronRight size={17} /></span>} /></section><section className="settings-detail-section"><h3>기타</h3><SettingsDetailRow icon={<LogOut size={18} />} title="로그아웃" onClick={onLogout} /><SettingsDetailRow icon={<UserRound size={18} />} title="회원 탈퇴" onClick={onOpenWithdrawal} /></section></div>; }
function SettingsNotificationsPage({ onBack, isPreviewDemo, notifications, onMarkRead }: { onBack: () => void; isPreviewDemo: boolean; notifications: ConsumerAppNotificationDto[]; onMarkRead: (notification: ConsumerAppNotificationDto) => Promise<void> }) { const [chatEnabled, setChatEnabled] = useState(() => window.localStorage.getItem("dangam_setting_meeting_chat") !== "false"); const [scheduleEnabled, setScheduleEnabled] = useState(() => window.localStorage.getItem("dangam_setting_meeting_schedule") !== "false"); const [doNotDisturb, setDoNotDisturb] = useState(() => window.localStorage.getItem("dangam_do_not_disturb") === "true"); const [startTime, setStartTime] = useState(() => window.localStorage.getItem("dangam_dnd_start") ?? "23:00"); const [endTime, setEndTime] = useState(() => window.localStorage.getItem("dangam_dnd_end") ?? "08:00"); const toggle = (key: string, value: boolean, setter: (value: boolean) => void) => { setter(value); window.localStorage.setItem(key, String(value)); }; const switchFor = (checked: boolean, label: string) => <span className={`settings-toggle ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label}><i /></span>; return <div className="settings-detail-page"><SettingsHeader title="알림 설정" onBack={onBack} />{isPreviewDemo && <ConsumerAppNotificationCenter notifications={notifications} onMarkRead={onMarkRead} onCouponPreferenceChanged={() => undefined} />}<section className="settings-detail-section"><h3>모임 알림 관리</h3><SettingsDetailRow icon={<MessageCircle size={18} />} title="모임 채팅 알림" description="모임방 새 메시지 수신" trailing={switchFor(chatEnabled, "모임 채팅 알림")} onClick={() => toggle("dangam_setting_meeting_chat", !chatEnabled, setChatEnabled)} /><SettingsDetailRow icon={<CalendarDays size={18} />} title="모임 일정 알림" description="새로운 일정 등록 및 참여 알림" trailing={switchFor(scheduleEnabled, "모임 일정 알림")} onClick={() => toggle("dangam_setting_meeting_schedule", !scheduleEnabled, setScheduleEnabled)} /></section><section className="settings-detail-section"><h3>방해금지 시간</h3><SettingsDetailRow icon={<Clock3 size={18} />} title="방해금지 시간 설정" description="설정한 시간에는 알림을 잠시 쉬어요." trailing={switchFor(doNotDisturb, "방해금지 시간 설정")} onClick={() => toggle("dangam_do_not_disturb", !doNotDisturb, setDoNotDisturb)} />{doNotDisturb && <div className="settings-dnd-times"><label>시작시간<input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); window.localStorage.setItem("dangam_dnd_start", event.target.value); }} /></label><label>종료시간<input type="time" value={endTime} onChange={(event) => { setEndTime(event.target.value); window.localStorage.setItem("dangam_dnd_end", event.target.value); }} /></label></div>}</section></div>; }
function SettingsBlockedUsersPage({ onBack }: { onBack: () => void }) { const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(() => { try { return JSON.parse(window.localStorage.getItem("dangam_blocked_users") ?? "[]") as BlockedUser[]; } catch { return []; } }); const unblock = (id: string) => { const next = blockedUsers.filter((user) => user.id !== id); setBlockedUsers(next); window.localStorage.setItem("dangam_blocked_users", JSON.stringify(next)); }; return <div className="settings-detail-page"><SettingsHeader title="차단한 사용자" onBack={onBack} />{blockedUsers.length === 0 ? <div className="settings-empty-state"><Users size={28} /><strong>차단한 사용자가 없습니다.</strong><span>모임과 채팅에서 차단한 사용자가 여기에 표시됩니다.</span></div> : <section className="settings-blocked-list">{blockedUsers.map((user) => <article className="settings-blocked-user" key={user.id}><span className="settings-blocked-avatar">{user.nickname.slice(0, 1)}</span><div><b>{user.nickname}</b><small>{user.blockedAt} 차단</small></div><button type="button" onClick={() => unblock(user.id)}>차단 해제</button></article>)}</section>}</div>; }
function SettingsNoticesPage({ onBack }: { onBack: () => void }) { const [openNotice, setOpenNotice] = useState<string | null>(null); const [readIds, setReadIds] = useState<string[]>(() => readNoticeIds()); const markRead = (id: string) => { setReadIds((current) => { const next = Array.from(new Set([...current, id])); window.localStorage.setItem(NOTICE_READ_STORAGE_KEY, JSON.stringify(next)); window.dispatchEvent(new CustomEvent("dangam:notices-read")); return next; }); }; return <div className="settings-detail-page"><SettingsHeader title="공지사항" onBack={onBack} /><section className="settings-notice-list">{SETTINGS_NOTICES.map((notice) => { const unread = !readIds.includes(notice.id); return <article key={notice.id}><button type="button" className="settings-notice-trigger" onClick={() => { setOpenNotice(openNotice === notice.id ? null : notice.id); markRead(notice.id); }}><span><b>{unread && <i className="settings-notice-dot" aria-label="읽지 않은 공지" />}{notice.title}</b><small>{notice.date}{unread && <em>새 공지</em>}</small></span>{openNotice === notice.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{openNotice === notice.id && <p>{notice.body}</p>}</article>; })}</section></div>; }
function SettingsMembershipPage({ isPreviewDemo = false, isPremium, nextBillingDate, cancelAtPeriodEnd, onBack, onStart, onSimulateFailure, onCancel, isCanceling, onToast }: { isPreviewDemo?: boolean; isPremium: boolean; nextBillingDate: string; cancelAtPeriodEnd: boolean; onBack: () => void; onStart: () => void; onSimulateFailure: () => void; onCancel: () => Promise<void>; isCanceling: boolean; onToast: (message: string) => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const confirm = async () => {
    try { await onCancel(); setConfirmCancel(false); }
    catch { onToast("구독 해지를 처리하지 못했습니다."); }
  };
  return <div className="settings-detail-page settings-membership-page">
    <SettingsHeader title="정회원 멤버십" onBack={onBack} />
    <section className="settings-membership-hero"><span className="settings-membership-hero-icon" aria-hidden="true">{isPremium ? "✓" : "✦"}</span><b>{isPreviewDemo && isPremium ? "가상 정회원 미리보기" : isPremium ? cancelAtPeriodEnd ? "구독 해지 예약됨" : "정회원 이용 중" : "정회원 멤버십"}</b><p>{isPreviewDemo ? `미리보기 Mock · 다음 종료일 ${nextBillingDate}` : isPremium ? cancelAtPeriodEnd ? `혜택 종료 예정: ${nextBillingDate}` : `다음 결제일: ${nextBillingDate}` : "프리미엄 쿠폰 혜택을 이용해 보세요."}</p></section>
    <div className="settings-membership-price"><span>월 구독료</span><strong>월 10,000원</strong><small>자동갱신</small></div>
    {isPreviewDemo
      ? <div className="settings-membership-preview-actions"><button type="button" className="settings-membership-start" onClick={onStart}>{isPremium ? "월 10,000원 갱신 시뮬레이션" : "월 10,000원 결제 확인 (Mock)"}</button>{isPremium ? <button type="button" className="settings-membership-manage" onClick={onSimulateFailure}>결제 실패 시뮬레이션</button> : null}</div>
      : isPremium
        ? cancelAtPeriodEnd
          ? <button type="button" className="settings-membership-manage" disabled>해지 예약됨</button>
          : <button type="button" className="settings-membership-manage" onClick={() => setConfirmCancel(true)}>구독 해지</button>
        : <button type="button" className="settings-membership-start" onClick={onStart}>구독 시작</button>}
    {confirmCancel && <div className="overlay subscription-payment-overlay" onClick={() => setConfirmCancel(false)}><section className="subscription-payment-sheet" role="dialog" aria-modal="true" aria-labelledby="membership-cancel-title" onClick={(event) => event.stopPropagation()}><h2 id="membership-cancel-title">구독을 해지할까요?</h2><p>빌링키를 해지해 다음 결제를 중단하고, 현재 이용 기간은 종료일까지 유지합니다.</p><div className="subscription-payment-actions"><button type="button" onClick={() => setConfirmCancel(false)}>계속 이용</button><button type="button" disabled={isCanceling} onClick={() => void confirm()}>{isCanceling ? "처리 중…" : "해지 확인"}</button></div></section></div>}
  </div>;
}
function readMembershipStatus(data: unknown): { active: boolean; nextBillingDate: string | null; cancelAtPeriodEnd: boolean } {
  if (!data || typeof data !== "object") return { active: false, nextBillingDate: null, cancelAtPeriodEnd: false };
  const status = data as { active?: boolean; isActive?: boolean; status?: string; nextBillingDate?: string | Date | null; nextBillingAt?: string | Date | null; currentPeriodEnd?: string | Date | null; periodEnd?: string | Date | null; cancelAtPeriodEnd?: boolean };
  const active = status.active === true || status.isActive === true || status.status === "ACTIVE" || status.status === "active";
  const cancelAtPeriodEnd = status.cancelAtPeriodEnd === true;
  const rawDate = status.nextBillingDate ?? status.nextBillingAt ?? status.currentPeriodEnd ?? status.periodEnd;
  if (!active || !rawDate) return { active, nextBillingDate: null, cancelAtPeriodEnd };
  const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
  return { active, nextBillingDate: Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("ko-KR"), cancelAtPeriodEnd };
}
function membershipCallbackBaseUrl(): string {
  const configured = import.meta.env.VITE_CENTRAL_MOCK_URL?.trim();
  if (configured) {
    try { return new URL(configured, window.location.origin).origin; } catch { /* use the current Preview origin below */ }
  }
  const current = new URL(window.location.origin);
  const previewWorkspace = /^\d+-(.+\.manus\.computer)$/i.exec(current.hostname)?.[1];
  return previewWorkspace ? `${current.protocol}//3000-${previewWorkspace}` : current.origin;
}

type PartnerApplicationData = { applicantName: string; phone: string; preferredRegion: string; bank: string; accountNumber: string; accountHolder: string; referralPartnerCode: string; isRecurringSubscription: boolean; isPartnerApplication: boolean; bankbookFileUrl?: string };
function formatPartnerUploadSize(bytes: number) { if (bytes < 1024) return `${bytes}B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`; return `${(bytes / (1024 * 1024)).toFixed(1)}MB`; }
function PartnerApplicationSheet({ onClose, onToast, onComplete, onRequestSubscription, isPremium }: { onClose: () => void; onToast: (message: string) => void; onComplete: (data: PartnerApplicationData) => void; onRequestSubscription: (data: PartnerApplicationData) => void; isPremium: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(() => readVerifiedPhone());
  const [preferredRegion, setPreferredRegion] = useState("");
  const [bank, setBank] = useState<(typeof BANK_LIST)[number]>(BANK_LIST[0]);
  const [account, setAccount] = useState("");
  const [copy, setCopy] = useState<File | null>(null);
  const [bankbookPreviewUrl, setBankbookPreviewUrl] = useState<string | null>(null);
  const [bankbookUploadError, setBankbookUploadError] = useState("");
  const bankbookInputRef = useRef<HTMLInputElement>(null);
  const uploadBankbook = trpc.media.upload.useMutation();
  useEffect(() => {
    if (!copy || !copy.type.startsWith("image/")) {
      setBankbookPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(copy);
    setBankbookPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [copy]);
  const clearBankbookFile = () => {
    setCopy(null);
    setBankbookPreviewUrl(null);
    if (bankbookInputRef.current) bankbookInputRef.current.value = "";
  };
  const [agreed, setAgreed] = useState(false);
  const [isPartnerApplication, setIsPartnerApplication] = useState(true);
  const [isRecurringSubscription, setIsRecurringSubscription] = useState(true);
  const [referralPartnerCode, setReferralPartnerCode] = useState("");
  const [referralCodeStatus, setReferralCodeStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const formatAccount = (value: string) => value.replace(/\D/g, "").slice(0, 14).replace(/(\d{4})(?=\d)/g, "$1-");
  const formatPartnerPhone = (value: string) => {
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("82")) digits = `0${digits.slice(2)}`;
    digits = digits.slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };
  const verifyReferralCode = () => {
    const code = referralPartnerCode.trim();
    if (!code) { setReferralCodeStatus("idle"); onToast("추천인 코드 없이도 신청할 수 있습니다."); return; }
    const validCode = SALES_PARTNER_CODE.replace(/\D/g, "");
    const isValid = /^\d{4}$/.test(code) && code === validCode;
    setReferralCodeStatus(isValid ? "valid" : "invalid");
    onToast(isValid ? "추천인 파트너 코드가 확인되었습니다." : "유효한 추천인 파트너 코드가 아닙니다.");
  };
  const submit = async () => {
    if (!agreed) { window.alert("필수 규약에 동의해 주세요"); return; }
    const normalizedPhone = phone.replace(/\D/g, "");
    if (!name.trim() || !account || !copy) { onToast("신청자 정보와 통장 사본을 모두 입력해 주세요."); return; }
    if (normalizedPhone.length < 8) { onToast("휴대폰 번호를 8자리 이상 입력해 주세요."); return; }
    if (referralPartnerCode && referralCodeStatus !== "valid") { onToast("추천인 파트너 코드를 확인해 주세요."); return; }
    if (!isPartnerApplication && !isRecurringSubscription) { onToast("영업 파트너 신청 또는 정기 구독 중 하나를 선택해 주세요."); return; }
    setBankbookUploadError("");
    let bankbookFileUrl: string | undefined;
    try {
      if (copy) {
        const dataBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("파일을 읽을 수 없습니다.")); reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다.")); reader.readAsDataURL(copy); });
        const uploaded = await uploadBankbook.mutateAsync({ originalName: copy.name, mimeType: copy.type, sizeBytes: copy.size, dataBase64 });
        bankbookFileUrl = uploaded.url;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "통장 사본 업로드에 실패했습니다.";
      setBankbookUploadError(message);
      onToast(message);
      return;
    }
    const data: PartnerApplicationData = { applicantName: name.trim(), phone: phone.trim(), preferredRegion: preferredRegion.trim(), bank, accountNumber: account, accountHolder: name.trim(), referralPartnerCode: referralPartnerCode.trim(), isRecurringSubscription, isPartnerApplication, bankbookFileUrl };
    if (isPartnerApplication && !isRecurringSubscription && !isPremium) {
      window.alert("영업 파트너는 정기구독(월 10,000원) 회원 전용 혜택입니다. 정기구독을 먼저 신청해 주세요.");
      setIsRecurringSubscription(true);
      return;
    }
    if (isRecurringSubscription) {
      onClose();
      onRequestSubscription(data);
      return;
    }
    onClose();
    window.alert("영업 파트너 신청이 완료되었습니다!");
    onComplete(data);
  };
  return <div className="partner-application-backdrop" role="presentation"><section className="partner-application-sheet" role="dialog" aria-modal="true" aria-labelledby="partner-application-title"><header><div><h2 id="partner-application-title">영업 파트너 신청</h2><p>정산 정보를 등록해 주세요.</p></div><button type="button" className="partner-application-close" aria-label="영업 파트너 신청 닫기" onClick={onClose}><X size={20} /></button></header><div className="partner-application-body"><label>이름 (실명)<input value={name} onChange={(event) => setName(event.target.value)} placeholder="이름 입력" /></label><label className="partner-application-phone-field">휴대폰 번호<input value={phone} onChange={(event) => setPhone(formatPartnerPhone(event.target.value))} inputMode="tel" placeholder="010-1234-5678" autoComplete="tel" /></label><label>희망 지역 (선택)<input value={preferredRegion} onChange={(event) => setPreferredRegion(event.target.value.slice(0, 120))} placeholder="예: 서울 강남구" /></label><div className="partner-application-account-row"><label>정산 은행<select value={bank} onChange={(event) => setBank(event.target.value as (typeof BANK_LIST)[number])}>{BANK_LIST.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label>계좌번호<input value={account} onChange={(event) => setAccount(formatAccount(event.target.value))} inputMode="numeric" placeholder="계좌번호 입력" maxLength={17} /></label></div><div className="partner-application-referral"><label htmlFor="partner-referral-code">추천인 파트너 코드 (선택)</label><div className="partner-application-referral-row"><input id="partner-referral-code" value={referralPartnerCode} onChange={(event) => { setReferralPartnerCode(event.target.value.replace(/\D/g, "").slice(0, 4)); setReferralCodeStatus("idle"); }} inputMode="numeric" maxLength={4} placeholder="추천 파트너 코드 4자리 입력 (예: 1004)" /><button type="button" onClick={verifyReferralCode}>확인</button></div>{referralCodeStatus === "valid" && <small className="partner-referral-valid">추천인 코드가 확인되었습니다.</small>}{referralCodeStatus === "invalid" && <small className="partner-referral-invalid">유효한 4자리 파트너 코드가 아닙니다.</small>}</div><div className="partner-bankbook-upload">{bankbookUploadError && <p className="partner-bankbook-error" role="alert">{bankbookUploadError}</p>}{copy ? <div className="partner-bankbook-file">{copy.type.startsWith("image/") && bankbookPreviewUrl ? <img src={bankbookPreviewUrl} alt="첨부한 통장 사본 미리보기" className="partner-bankbook-thumbnail" /> : <span className="partner-bankbook-document-icon" aria-hidden="true"><ClipboardList size={22} /></span>}<span className="partner-bankbook-file-copy"><strong>{copy.name}</strong><small>{formatPartnerUploadSize(copy.size)} · {copy.type === "application/pdf" ? "PDF 문서" : "이미지"}</small></span><button type="button" onClick={clearBankbookFile} aria-label="통장 사본 삭제"><X size={16} /></button></div> : <label className="partner-bankbook-picker"><span>＋ 통장 사본 첨부 (이미지/PDF)</span><input ref={bankbookInputRef} type="file" accept="image/*,application/pdf" onChange={(event) => { const selected = event.target.files?.[0] ?? null; if (selected && (!selected.type.startsWith("image/") && selected.type !== "application/pdf" || selected.size > 10 * 1024 * 1024)) { event.target.value = ""; setCopy(null); onToast("통장 사본은 이미지 또는 PDF, 10MB 이하 파일만 첨부할 수 있습니다."); return; } setCopy(selected); }} /></label>}</div><label className="partner-application-agreement"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>[필수] 파트너 정산 규약 및 해약 시 수당 자동 해지 규정에 동의합니다.</span></label><div className="partner-application-option partner-application-partner-option"><label className="partner-application-subscription-toggle"><input type="checkbox" checked={isPartnerApplication} onChange={(event) => setIsPartnerApplication(event.target.checked)} /><span>[선택] 영업 파트너 신청</span></label><p>동네 가맹점 유치 및 회원 모집을 통한 월별 정산 수당을 지급받습니다.</p></div><div className="partner-application-subscription"><label className="partner-application-subscription-toggle"><input type="checkbox" checked={isRecurringSubscription} onChange={(event) => setIsRecurringSubscription(event.target.checked)} /><span>[선택] 정기 구독 월 10,000원 신청</span></label><p>{isRecurringSubscription ? "매월 정기 결제(자동 갱신)로 파트너 혜택 및 수당 자격이 유지됩니다." : "체크 해제 시 이번 달 1회만 결제되며 다음 달 자동 결제되지 않습니다."}</p></div></div><footer className="partner-application-footer"><button type="button" className="partner-application-submit" onClick={() => void submit()} disabled={uploadBankbook.isPending}>{isPartnerApplication && isRecurringSubscription ? "영업 파트너 & 정기 구독 신청 완료" : isPartnerApplication ? "영업 파트너 등록 신청 완료" : "정기 구독 신청 완료"}</button></footer></section></div>;
}
function SettlementAccountChangeSheet({ onClose, onSave }: { onClose: () => void; onSave: (label: string, data: { bank: string; accountNumber: string; accountHolder: string }) => void }) {
  const [bank, setBank] = useState<(typeof BANK_LIST)[number]>("우리은행");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [copy, setCopy] = useState<File | null>(null);
  const formatAccount = (value: string) => value.replace(/\D/g, "").slice(0, 14).replace(/(\d{4})(?=\d)/g, "$1-");
  const submit = () => {
    onSave(`${bank}${account ? ` ${account}` : ""}${holder.trim() ? ` (${holder.trim()})` : ""}`, { bank, accountNumber: account, accountHolder: holder.trim() });
    onClose();
  };
  return <div className="settlement-account-backdrop" role="presentation" onClick={onClose}><section className="settlement-account-sheet" role="dialog" aria-modal="true" aria-labelledby="settlement-account-title" onClick={(event) => event.stopPropagation()}><header><h2 id="settlement-account-title">정산 계좌 변경</h2><button type="button" onClick={onClose} aria-label="정산 계좌 변경 닫기"><X size={18} /></button></header><div className="settlement-account-body"><div className="settlement-account-row"><label>정산 은행<select value={bank} onChange={(event) => setBank(event.target.value as (typeof BANK_LIST)[number])}>{BANK_LIST.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label>계좌번호<input value={account} onChange={(event) => setAccount(formatAccount(event.target.value))} inputMode="numeric" placeholder="계좌번호 입력" maxLength={17} /></label></div><label>예금주 성함<input value={holder} onChange={(event) => setHolder(event.target.value)} placeholder="예금주 성함 (본인 명의)" /></label><label className="settlement-account-upload">{copy ? <span>{copy.name}<button type="button" onClick={() => setCopy(null)} aria-label="새 통장 사본 삭제"><X size={15} /></button></span> : <><b>＋ 새 통장 사본 첨부 (이미지/PDF)</b><input type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => setCopy(event.target.files?.[0] ?? null)} /></>}</label><button type="button" className="settlement-account-submit" onClick={submit}>정산 계좌 변경 완료</button></div></section></div>;
}

function PartnerSettlementPage({ isPartner, onBack, onToast, onAccountSave }: { isPartner: boolean; onBack: () => void; onToast: (message: string) => void; onAccountSave: (label: string, data: { bank: string; accountNumber: string; accountHolder: string }) => void }) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("우리은행 1005-***-*** (주식회사 명품제이디)");
  const [accountOpen, setAccountOpen] = useState(false);
  const members = [
    { name: "김**", joinedAt: "2026.10.02", status: "정기구독 유지" },
    { name: "이**", joinedAt: "2026.10.04", status: "정기구독 유지" },
    { name: "박**", joinedAt: "2026.10.06", status: "정기구독 유지" },
    { name: "최**", joinedAt: "2026.10.08", status: "정기구독 유지" },
    { name: "정**", joinedAt: "2026.10.10", status: "정기구독 유지" },
    { name: "한**", joinedAt: "2026.10.12", status: "정기구독 유지" },
  ];
  const perMember = 2000;
  const grossAmount = members.length * perMember;
  const taxAmount = Math.round(grossAmount * 0.033);
  const netAmount = grossAmount - taxAmount;
  const history = [
    { month: "2026.10", members: `${members.length}명 유지 · 1인 2,000원`, amount: `${netAmount.toLocaleString()}원`, status: "정산 예정" },
    { month: "2026.09", members: "5명 유지 · 1인 2,000원", amount: "9,669원", status: "지급 완료" },
  ];
  return <div className="settings-detail-page partner-settlement-page"><SettingsHeader title="파트너 정산 내역" onBack={onBack} /><main className="partner-settlement-content"><section className="partner-settlement-summary"><small>{isPartner ? "2026년 10월 정산 예정금 (익월 10일 지급)" : "파트너 정산 예시 · 정기구독 회원 기준"}</small><strong>{netAmount.toLocaleString()}원</strong>{isPartner ? <div className="partner-settlement-account-row"><p>등록 정산 계좌: {accountLabel}</p><button type="button" onClick={() => setAccountOpen(true)}>계좌 변경</button></div> : <p>{members.length}명 × {perMember.toLocaleString()}원 = {grossAmount.toLocaleString()}원 · 세금 3.3% 공제</p>}</section><section className="partner-settlement-calculation"><div><span>총 정산금</span><b>{grossAmount.toLocaleString()}원</b></div><div><span>세금 공제 (3.3%)</span><b>-{taxAmount.toLocaleString()}원</b></div><div className="total"><span>실수령 예정금</span><strong>{netAmount.toLocaleString()}원</strong></div></section><section className="partner-settlement-stats"><div><b>{members.length}명</b><small>이번 달 유입 회원</small></div><div className="is-active"><b>{members.length}명</b><small>구독 유지 회원</small></div><div className="is-muted"><b>3.3%</b><small>세금 공제율</small></div></section><section className="partner-settlement-members"><div className="partner-settlement-section-head"><h2>정산 대상 회원</h2><span>{members.length}명</span></div><p className="partner-settlement-helper">개인정보 보호를 위해 이름은 일부 마스킹되어 표시됩니다.</p><div className="partner-settlement-member-list">{members.map((member) => <div className="partner-settlement-member-row" key={`${member.name}-${member.joinedAt}`}><span className="partner-settlement-member-avatar" aria-hidden="true">{member.name.slice(0, 1)}</span><span><b>{member.name}</b><small>가입일 {member.joinedAt}</small></span><em>{member.status}</em><strong>{perMember.toLocaleString()}원</strong></div>)}</div></section><section className="partner-settlement-history"><h2>월별 정산 내역</h2>{history.map((item) => <button type="button" className="partner-settlement-history-row" key={item.month} onClick={() => setSelectedMonth(item.month)}><span><b>{item.month}</b><small>{item.members}</small></span><span><strong>{item.amount}</strong><em>{item.status}</em></span></button>)}</section><section className="partner-settlement-notice"><p>• 정기구독 회원 1명당 월 10,000원의 20%인 2,000원이 정산됩니다.</p><p>• 정산금에서 세금 3.3%를 원천 공제한 뒤 등록 계좌로 지급됩니다.</p><p>• 유치 회원이 구독을 해약하면 해당 회원의 정산은 다음 달부터 제외됩니다.</p></section></main>{selectedMonth && <div className="partner-settlement-month-modal" role="presentation" onClick={() => setSelectedMonth(null)}><section role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><header><h2>{selectedMonth} 유치 회원</h2><button type="button" onClick={() => setSelectedMonth(null)} aria-label="월별 유치 회원 닫기"><X size={18} /></button></header><p>해당 월의 회원별 정산 내역을 확인할 수 있습니다.</p><button type="button" onClick={() => setSelectedMonth(null)}>확인</button></section></div>}{accountOpen && <SettlementAccountChangeSheet onClose={() => setAccountOpen(false)} onSave={(label, data) => { onAccountSave(label, data); setAccountLabel(label); onToast("정산 계좌가 변경되었습니다."); setAccountOpen(false); }} />}</div>;
}
function SettingsPartnerPage({ onBack, onClose, onToast, onComplete, onRequestSubscription, isPremium }: { onBack: () => void; onClose: () => void; onToast: (message: string) => void; onComplete: (data: PartnerApplicationData) => void; onRequestSubscription: (data: PartnerApplicationData) => void; isPremium: boolean }) {
  const [applicationOpen, setApplicationOpen] = useState(false);
  const benefits = [
    { title: "정기 구독 수당 20% 매월 지급", description: "내가 유치한 회원이 정기 구독(월 10,000원)을 이용하는 동안, 매달 구독료의 20%가 파트너 정산 계좌로 자동 입금됩니다. 단, 유치 회원의 정기 구독 해약 시 해당 회원의 수당 지급은 자동으로 해지됩니다." },
    { title: "10,000원 초과 프리미엄 쿠폰 무제한 사용 및 정회원 혜택", description: "정회원 멤버십 자격 유지 및 1만 원 초과 쿠폰 무제한 다운로드, 전 지점 체험단 우선 참여 기회를 제공합니다." },
    { title: "로컬 파트너 전용 영업 지원", description: "가맹점 유치 및 홍보용 브로슈어, 파트너 전용 실시간 정산 관리 대시보드를 지원합니다." },
  ];
  return <div className="settings-detail-page settings-partner-page"><header className="settings-partner-subheader"><button type="button" className="settings-partner-subheader-action settings-partner-subheader-back" aria-label="설정으로 돌아가기" onClick={onBack}><ChevronLeft size={21} /></button><h1>영업 파트너십 안내</h1><button type="button" className="settings-partner-subheader-action settings-partner-subheader-close" aria-label="홈으로 닫기" onClick={onClose}><X size={20} /></button></header><main className="settings-partner-content"><section className="settings-partner-hero"><h3>동네 상권을 살리는 팅커벨 경제 파트너를 모집합니다.</h3></section><section className="settings-partner-benefits"><h3>파트너 주요 혜택</h3><div>{benefits.map((benefit) => <article key={benefit.title}><span aria-hidden="true">✓</span><div><strong>{benefit.title}</strong><p>{benefit.description}</p></div></article>)}</div></section></main><div className="settings-partner-action"><button type="button" onClick={() => setApplicationOpen(true)}>영업 파트너 문의 및 신청하기</button></div>{applicationOpen && <PartnerApplicationSheet isPremium={isPremium} onClose={() => setApplicationOpen(false)} onToast={onToast} onRequestSubscription={onRequestSubscription} onComplete={onComplete} />}</div>;
}
function StudentPartnerPage({ onBack, onToast, onComplete }: { onBack: () => void; onToast: (message: string) => void; onComplete?: () => void }) {
  const rewards = [
    { invite: "3명 이상 초대 시", reward: "5천원 이하 100% 무료 이용 쿠폰" },
    { invite: "5명 이상 초대 시", reward: "1만원 이하 100% 무료 이용 쿠폰" },
    { invite: "10명 이상 초대 시", reward: "5만원 이하 100% 무료 이용 쿠폰" },
  ];
  return <div className="settings-detail-page student-partner-page"><SettingsHeader title="학생 파트너 안내" onBack={onBack} /><main className="student-partner-content"><section className="student-partner-hero"><GraduationCap size={28} aria-hidden="true" /><h3>초·중·고 학생을 위한 팅커벨 학생 파트너십</h3><p>친구들과 함께 모으고 매월 100% 무료 쿠폰 받자!</p></section><section className="student-partner-benefits"><h3>단계별 100% 무료 쿠폰 혜택</h3><div className="student-partner-reward-list">{rewards.map((item) => <article key={item.invite}><span className="student-partner-reward-badge">{item.invite}</span><div><b>{item.reward}</b><p>달성 즉시 지급</p></div></article>)}</div></section><section className="student-partner-rules"><h3>쿠폰 지급 규정 및 연간 특별 혜택</h3><p><b>발행 주기</b>쿠폰은 월 1회 제공되며, 월 단위 모집 인원 기준으로 집계되어 발행됩니다.</p><p><b>연간 특별 혜택</b>연 누적 모집 우수자에게는 <strong>50만원 상당 무료 쿠폰</strong>이 제공됩니다.</p></section><p className="student-partner-safety-note">• 미성년자 보호 정책에 따라 주류 판매점 및 청소년 유해 업소는 참여 대상에서 자동 제외됩니다.</p></main><div className="student-partner-action"><button type="button" onClick={() => { window.localStorage.setItem("dangam_partner_type", "STUDENT"); window.localStorage.removeItem("dangam_local_sales_partner_status"); window.localStorage.removeItem(SALES_PARTNER_CODE_STORAGE_KEY); window.localStorage.setItem("dangam_student_partner_code", STUDENT_PARTNER_CODE); window.localStorage.setItem("dangam_student_partner_consent", JSON.stringify({ agreedAt: new Date().toISOString(), policyVersion: "2026-10" })); window.dispatchEvent(new CustomEvent(PARTNER_IDENTIFIERS_CHANGED_EVENT)); onComplete?.(); onToast("학생 파트너 신청이 완료되었습니다. 고유 추천번호가 발급되었습니다."); onBack(); }}>학생 파트너 간편 신청</button></div></div>;
}
const SALES_PARTNER_CODE_STORAGE_KEY = "dangam_local_sales_partner_code";
const PARTNER_IDENTIFIERS_CHANGED_EVENT = "dangam:partner-identifiers-updated";
const SALES_PARTNER_CODE = "NO. 1042";
function readPartnerIdentifiers() {
  const salesStatus = window.localStorage.getItem("dangam_local_sales_partner_status");
  const partnerType = window.localStorage.getItem("dangam_partner_type");
  const rawSalesCode = window.localStorage.getItem(SALES_PARTNER_CODE_STORAGE_KEY) || (["ACTIVE", "APPROVED", "PENDING"].includes(salesStatus ?? "") ? SALES_PARTNER_CODE : "");
  const rawStudentCode = window.localStorage.getItem("dangam_student_partner_code") || (window.localStorage.getItem("dangam_student_partner_consent") ? STUDENT_PARTNER_CODE : "");
  if (partnerType === "STUDENT") return { salesCode: "", studentCode: rawStudentCode };
  if (partnerType === "SALES") return { salesCode: rawSalesCode, studentCode: "" };
  return rawStudentCode ? { salesCode: "", studentCode: rawStudentCode } : { salesCode: rawSalesCode, studentCode: "" };
}
function MyProfileView({ userTier, nextBillingDate, cancelAtPeriodEnd, isPartner, profile, onOpenSettings, onOpenMembership, onOpenProfile, onOpenStudent, onOpenPartner, onOpenSettlement, onOpenSupport, salesPartnerCode, studentPartnerCode, isPreviewDemo = false }: { userTier: "FREE" | "PREMIUM"; nextBillingDate: string; cancelAtPeriodEnd: boolean; isPartner: boolean; profile: UserProfileRecord; onOpenSettings: () => void; onOpenMembership: () => void; onOpenProfile: () => void; onOpenStudent: () => void; onOpenPartner: () => void; onOpenSettlement: () => void; onOpenSupport: () => void; salesPartnerCode: string; studentPartnerCode: string; isPreviewDemo?: boolean }) { const partnerIdentity = studentPartnerCode ? { label: "내 고유 학생 번호", code: studentPartnerCode, kind: "student" } : salesPartnerCode ? { label: "파트너 고유번호", code: salesPartnerCode, kind: "sales" } : { label: "파트너 고유번호", code: "승인 후 발급", kind: "placeholder" }; return <div className="my-profile-view"><header className="my-profile-header"><h1>내 정보</h1><div className={`my-profile-id-card ${partnerIdentity.kind === "student" ? "student" : ""} ${partnerIdentity.kind === "placeholder" ? "is-placeholder" : ""}`} aria-label={partnerIdentity.label}><small>{partnerIdentity.label}</small><b>{partnerIdentity.code}</b></div><button type="button" aria-label="설정 열기" onClick={onOpenSettings}><Settings size={21} /></button></header><button type="button" className="my-profile-card" onClick={onOpenProfile}><span className="my-profile-avatar" aria-hidden="true">{profile.avatar ? <img src={profile.avatar} alt="" /> : profile.nickname.slice(0, 1)}</span><div><b>{profile.nickname} · 팅커벨 회원</b><small>{isPreviewDemo ? "미리보기 회원 · 실제 본인인증은 진행되지 않습니다." : "본인인증 회원 · 동네 혜택을 이용 중이에요"}</small></div><ChevronRight size={18} /></button><button type="button" className="my-profile-membership" onClick={onOpenMembership}><span className="my-profile-membership-icon">{isPartner ? "👑" : userTier === "PREMIUM" ? "✓" : "✦"}</span><span><b>{isPreviewDemo ? userTier === "PREMIUM" ? "가상 정회원 미리보기" : "정회원 멤버십 미리보기" : isPartner ? "정회원 파트너 이용 중" : userTier === "PREMIUM" ? (cancelAtPeriodEnd ? "정회원 해지 예약됨" : "정회원 이용 중") : "정회원 멤버십"}</b><small>{isPreviewDemo ? "가상 결제 체험 · 실제 구독·청구·파트너 정산 없음" : isPartner ? `로컬 파트너 활동 중 · 다음 결제일: ${nextBillingDate}` : userTier === "PREMIUM" ? (cancelAtPeriodEnd ? `혜택 종료 예정: ${nextBillingDate}` : `다음 결제일: ${nextBillingDate}`) : "모든 매장 쿠폰 무제한 혜택 · 월 정기결제"}</small></span><strong className="my-profile-membership-action">관리 <ChevronRight size={16} /></strong></button><PreviewMemberBenefitsCard isPreviewDemo={Boolean(isPreviewDemo)} /><button type="button" className="my-profile-student" onClick={onOpenStudent}><span className="my-profile-student-icon"><GraduationCap size={19} /></span><span><b>학생 파트너 안내</b><small>초중고 학생 미성년자 혜택 및 간편 신청</small></span><ChevronRight size={18} /></button><button type="button" className="my-profile-partner" onClick={onOpenPartner}><span className="my-profile-partner-icon"><Briefcase size={19} /></span><span><b>정기 구독 및 영업 파트너 안내</b></span><ChevronRight size={18} /></button><button type="button" className={`my-profile-settlement ${isPartner ? "is-active" : "is-promo"}`} onClick={onOpenSettlement} aria-label="파트너 정산 내역 열기"><span className="my-profile-settlement-icon"><TrendingUp size={19} /></span><span><b>파트너 정산 내역</b><small>{isPartner ? "실시간 유치 회원 통계 및 월별 수당 정산금 확인" : "정산 예시와 회원별 내역을 확인해 보세요"}</small></span><em className="my-profile-settlement-action">내역 보기</em><ChevronRight size={18} /></button><button type="button" className="my-profile-support" onClick={onOpenSupport}><span className="my-profile-support-icon"><MessageCircle size={19} /></span><span><b>고객센터 / 1:1 문의·불만 접수</b></span><ChevronRight size={18} /></button></div>; }
function MyView({ onOpenWithdrawal, onOpenLogout, onToast, onExitSettings, userTier, nextBillingDate, cancelAtPeriodEnd, onStartMembership, onSimulateMembershipFailure, onOpenSubscriptionManagement, isCancelingMembership, onSubmitDashboardPartner, onRequestPartnerSubscription, onSubmitDashboardSettlement, openMembershipOnMount, onMembershipOpenHandled, onPartnerPageChange, appNotifications, onMarkAppNotificationRead, onOpenSupport }: { onOpenSupport: () => void; onOpenWithdrawal: () => void; onOpenLogout: () => void; onToast: (message: string) => void; onExitSettings: () => void; userTier: "FREE" | "PREMIUM"; nextBillingDate: string; cancelAtPeriodEnd: boolean; onStartMembership: () => void; onSimulateMembershipFailure: () => void; onOpenSubscriptionManagement: () => Promise<void>; isCancelingMembership: boolean; onSubmitDashboardPartner: (data: { applicantName: string; phone: string; preferredRegion: string; bank: string; accountNumber: string; accountHolder: string; isRecurringSubscription: boolean }) => Promise<void> | void; onRequestPartnerSubscription: (data: PartnerApplicationData) => void; onSubmitDashboardSettlement: (label: string, data: { bank: string; accountNumber: string; accountHolder: string }) => void; openMembershipOnMount: boolean; onMembershipOpenHandled: () => void; onPartnerPageChange: (open: boolean) => void; appNotifications: ConsumerAppNotificationDto[]; onMarkAppNotificationRead: (notification: ConsumerAppNotificationDto) => Promise<void> }) { const previewDemo = useConsumerPreviewDemo(); const [isPartner, setIsPartner] = useState(() => { if (previewDemo.active) return false; const status = window.localStorage.getItem("dangam_local_sales_partner_status"); return status === "ACTIVE" || status === "APPROVED"; }); const [partnerIdentifiers, setPartnerIdentifiers] = useState(() => previewDemo.active ? { salesCode: "", studentCode: "" } : readPartnerIdentifiers());
  useEffect(() => {
    if (!previewDemo.active) return;
    let mounted = true;
    const refreshPartner = () => { void consumerApi.getPreviewPartnerApplication().then(application => {
      if (!mounted) return;
      const approved = application?.status === "application_approved" && Boolean(application.referralCode);
      setPartnerIdentifiers({ salesCode: approved ? application?.referralCode ?? "" : "", studentCode: "" });
      setIsPartner(approved);
    }).catch(() => undefined); };
    refreshPartner();
    const timer = window.setInterval(refreshPartner, 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [previewDemo.active]);
  const [page, setPage] = useState<SettingsPage>("main"); const [settingsOpen, setSettingsOpen] = useState(false); useEffect(() => { if (!openMembershipOnMount) return; setPage("membership"); setSettingsOpen(true); onMembershipOpenHandled(); }, [openMembershipOnMount, onMembershipOpenHandled]); const [profileOpen, setProfileOpen] = useState(false); const [profile, setProfile] = useState<UserProfileRecord>(() => previewDemo.active && previewDemo.profile ? { nickname: previewDemo.profile.nickname, avatar: previewDemo.profile.avatar ?? "" } : readUserProfile()); const [accountEmail, setAccountEmail] = useState(() => previewDemo.active ? "" : window.localStorage.getItem("dangam_account_email") ?? ""); const [accountPhone, setAccountPhone] = useState(() => previewDemo.active ? "" : readVerifiedPhone()); const [phoneVerified, setPhoneVerified] = useState(() => previewDemo.active ? false : readPhoneVerificationStatus()); const [unreadNotices, setUnreadNotices] = useState(() => countUnreadNotices());
  useEffect(() => { if (previewDemo.active) return; for (const key of ["dangam_selected_region_codes", "dangam_selected_dongs", "dangam_consumer_address_display", "dangam_consumer_detail_address"]) window.localStorage.removeItem(key); }, [previewDemo.active]); useEffect(() => { if (previewDemo.active) return; const handlePhoneVerified = (event: Event) => { const raw = (event as CustomEvent<string>).detail; const formatted = formatVerifiedPhone(raw || ""); if (!formatted) return; window.localStorage.setItem(VERIFIED_PHONE_STORAGE_KEY, raw); window.localStorage.setItem(VERIFIED_STATUS_STORAGE_KEY, "true"); window.localStorage.setItem("dangam_phone_verified_at", new Date().toISOString()); setAccountPhone(formatted); setPhoneVerified(true); }; window.addEventListener("dangam:phone-verified", handlePhoneVerified); return () => window.removeEventListener("dangam:phone-verified", handlePhoneVerified); }, [previewDemo.active]); useEffect(() => { const refresh = () => { setUnreadNotices(countUnreadNotices()); if (!previewDemo.active) setPartnerIdentifiers(readPartnerIdentifiers()); }; window.addEventListener("dangam:notices-read", refresh); window.addEventListener(PARTNER_IDENTIFIERS_CHANGED_EVENT, refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener("dangam:notices-read", refresh); window.removeEventListener(PARTNER_IDENTIFIERS_CHANGED_EVENT, refresh); window.removeEventListener("storage", refresh); }; }, []); useEffect(() => { const handleSettingsRootRequest = () => { setProfileOpen(false); setPage("main"); setSettingsOpen(false); onPartnerPageChange(false); }; window.addEventListener("dangam:settings-root-request", handleSettingsRootRequest); return () => window.removeEventListener("dangam:settings-root-request", handleSettingsRootRequest); }, []); if (profileOpen) return <ConsumerProfileEditor mode="EDIT" previewOnly={previewDemo.active} initialProfile={profile} isPremium={userTier === "PREMIUM"} onBack={() => setProfileOpen(false)} onSaved={setProfile} onPreviewComplete={({ profile: nextProfile }) => { setProfile((current) => ({ ...current, nickname: nextProfile.nickname, avatar: nextProfile.avatar ?? current.avatar })); setProfileOpen(false); }} />; if (settingsOpen && page === "account") return <SettingsAccountPage isPreviewDemo={previewDemo.active} email={accountEmail} phone={accountPhone} phoneVerified={phoneVerified} onBack={() => setPage("main")} onLogout={onOpenLogout} onOpenEmail={() => { if (previewDemo.active) { onToast("미리보기에서는 계정 정보가 저장되지 않습니다."); return; } setPage("email"); }} onOpenPhone={() => { if (previewDemo.active) { onToast("미리보기에서는 실제 휴대폰 인증을 진행하지 않습니다."); return; } setPage("phone"); }} onOpenWithdrawal={onOpenWithdrawal} />; if (settingsOpen && page === "email") return <SettingsEmailPage email={accountEmail} onBack={() => setPage("account")} onSaved={setAccountEmail} onToast={onToast} />; if (settingsOpen && page === "phone") return <SettingsPhoneReauthPage phone={accountPhone} onBack={() => setPage("account")} onToast={onToast} />; if (settingsOpen && page === "notifications") return <SettingsNotificationsPage onBack={() => setPage("main")} isPreviewDemo={previewDemo.active} notifications={appNotifications} onMarkRead={onMarkAppNotificationRead} />; if (settingsOpen && page === "blocked-users") return <SettingsBlockedUsersPage onBack={() => setPage("main")} />; if (settingsOpen && page === "notices") return <SettingsNoticesPage onBack={() => setPage("main")} />; if (settingsOpen && page === "settlement") return <PartnerSettlementPage isPartner={isPartner} onBack={() => { setSettingsOpen(false); onExitSettings(); }} onToast={onToast} onAccountSave={onSubmitDashboardSettlement} />; if (settingsOpen && page === "student") return <StudentPartnerPage onBack={() => { setSettingsOpen(false); onExitSettings(); }} onToast={onToast} onComplete={() => { if (!previewDemo.active) setPartnerIdentifiers(readPartnerIdentifiers()); }} />; if (settingsOpen && page === "partner") return <SettingsPartnerPage isPremium={userTier === "PREMIUM"} onBack={() => { setPage("main"); onPartnerPageChange(false); }} onClose={() => { setSettingsOpen(false); onPartnerPageChange(false); onExitSettings(); }} onToast={onToast} onRequestSubscription={onRequestPartnerSubscription} onComplete={async (data) => {
    try {
      await onSubmitDashboardPartner(data);
      if (!previewDemo.active && data.isPartnerApplication) window.localStorage.setItem("dangam_local_sales_partner_status", "PENDING_REVIEW");
      setSettingsOpen(false); onExitSettings();
      onToast(previewDemo.active ? "파트너 신청이 접수되었습니다. 승인 결과는 알림함에서 안내합니다." : "파트너 신청을 접수했습니다. 승인 후 고유번호가 발급됩니다.");
    } catch (error) { onToast(error instanceof Error ? error.message : "파트너 신청을 접수하지 못했습니다."); }
  }} />; if (settingsOpen && page === "membership") return <SettingsMembershipPage isPreviewDemo={previewDemo.active} isPremium={userTier === "PREMIUM"} nextBillingDate={nextBillingDate} cancelAtPeriodEnd={cancelAtPeriodEnd} onBack={() => setPage("main")} onStart={onStartMembership} onSimulateFailure={onSimulateMembershipFailure} onCancel={onOpenSubscriptionManagement} isCanceling={isCancelingMembership} onToast={onToast} />; if (!settingsOpen) return <MyProfileView userTier={userTier} isPreviewDemo={previewDemo.active} nextBillingDate={nextBillingDate} cancelAtPeriodEnd={cancelAtPeriodEnd} isPartner={isPartner} profile={profile} salesPartnerCode={partnerIdentifiers.salesCode} studentPartnerCode={partnerIdentifiers.studentCode} onOpenSettings={() => setSettingsOpen(true)} onOpenMembership={() => { setPage("membership"); setSettingsOpen(true); }} onOpenProfile={() => setProfileOpen(true)} onOpenStudent={() => { setPage("student"); setSettingsOpen(true); }} onOpenPartner={() => { setPage("partner"); setSettingsOpen(true); onPartnerPageChange(true); }} onOpenSettlement={() => { setPage("settlement"); setSettingsOpen(true); }} onOpenSupport={onOpenSupport} />; return <div className="settings-view"><header className="settings-main-header"><h2>설정</h2></header><div className="settings-essential-list"><button type="button" className="settings-membership-banner" onClick={() => setPage("membership")}><span className="settings-membership-icon" aria-hidden="true">{userTier === "PREMIUM" ? "✓" : "✦"}</span><span className="settings-membership-copy"><b>{previewDemo.active ? userTier === "PREMIUM" ? "가상 정회원 미리보기" : "정회원 멤버십 미리보기" : userTier === "PREMIUM" ? "정회원 이용 중" : "정회원 멤버십"}</b><small>{previewDemo.active ? "실제 구독 및 청구는 발생하지 않습니다." : userTier === "PREMIUM" ? `다음 결제: ${nextBillingDate}` : "모든 매장 쿠폰 무제한 혜택 · 월 정기결제"}</small></span><span className="settings-membership-action">{previewDemo.active ? "미리보기" : userTier === "PREMIUM" ? "관리" : "가입하기"}<ChevronRight size={17} /></span></button><section className="settings-essential-section"><h3>계정</h3><SettingsDetailRow icon={<UserRound size={18} />} title="내 계정" description="휴대폰 번호, 본인인증 등" onClick={() => setPage("account")} /></section><section className="settings-essential-section"><h3>알림 설정</h3><SettingsDetailRow icon={<Bell size={18} />} title="알림 설정" onClick={() => setPage("notifications")} /></section><section className="settings-essential-section"><h3>사용자 관리</h3><SettingsDetailRow icon={<Users size={18} />} title="차단한 사용자" onClick={() => setPage("blocked-users")} /></section><section className="settings-essential-section"><h3>서비스</h3><SettingsDetailRow icon={<ClipboardList size={18} />} title="공지사항" trailing={<span className="settings-notice-badge-wrap">{unreadNotices > 0 && <em className="settings-notice-badge">새 공지 {unreadNotices}</em>}<ChevronRight size={18} /></span>} onClick={() => setPage("notices")} /></section></div></div>; }
type AdminInquiry = { id: string; createdAt: string; author: string; type: string; title: string; content: string; contact: string; status: "대기중" | "처리중" | "답변완료" };
type AdminReport = { id: string; createdAt: string; reporterId: string; meetingId: number; meetingTitle: string; chatType?: ChatRoomType; chatRoomId?: string; reportType: string; reason: string; evidence: { capturedAt: string; messages: MeetingChatMessage[] }; status: "대기중" | "검토중" | "처리완료" };
function SupportSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (inquiry: { type: ConsumerSupportInquiryType; title: string; content: string }) => Promise<void> }) {
  const choices: { value: ConsumerSupportInquiryType; label: string }[] = [
    { value: "coupon_rejected", label: "쿠폰 사용 불가/매장 거절" },
    { value: "payment_refund", label: "결제/환불 문의" },
    { value: "store_service", label: "매장 서비스 불만" },
    { value: "app_other", label: "앱 오류/기타" },
  ];
  const [type, setType] = useState<ConsumerSupportInquiryType>("coupon_rejected");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) {
      setError("제목과 내용을 모두 입력해 주세요.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await onSubmit({ type, title: trimmedTitle, content: trimmedContent });
      setSubmitted(true);
    } catch {
      setError("접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };
  return <div className="settings-modal-overlay" onClick={onClose}><section className="support-sheet consumer-support-sheet" role="dialog" aria-modal="true" aria-labelledby="consumer-support-title" onClick={(event) => event.stopPropagation()}><header className="support-sheet-head"><div><p className="eyebrow">고객센터</p><h2 id="consumer-support-title">1:1 문의·불만 접수</h2></div><button type="button" className="close-btn" aria-label="고객센터 문의 닫기" onClick={onClose}><X size={17} /></button></header><form className="support-form consumer-support-form" onSubmit={submit}><label>문의 유형<select required value={type} onChange={(event) => setType(event.target.value as ConsumerSupportInquiryType)} disabled={isSubmitting || submitted}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label><label>제목<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="문의 제목을 입력해 주세요" maxLength={120} disabled={isSubmitting || submitted} /></label><label>내용<textarea required value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={3000} placeholder="문의 내용을 입력해 주세요" disabled={isSubmitting || submitted} /></label>{error && <p className="consumer-support-error" role="alert">{error}</p>}{submitted && <p className="consumer-support-success" role="status">문의가 접수되었습니다.</p>}<button type="submit" className="support-submit consumer-support-submit" disabled={isSubmitting || submitted}>{isSubmitting ? "접수 중" : "접수하기"}</button></form></section></div>;
}
function AdminInquirySheet({ inquiries, onClose }: { inquiries: AdminInquiry[]; onClose: () => void }) { return <div className="settings-modal-overlay" onClick={onClose}><section className="admin-inquiry-sheet" onClick={(event) => event.stopPropagation()}><header className="support-sheet-head"><div><p className="eyebrow">ADMIN DASHBOARD</p><h2>고객 문의 관리 <b>{inquiries.filter((item) => item.status === "대기중").length}</b></h2></div><button type="button" className="close-btn" aria-label="관리자 문의 닫기" onClick={onClose}><X size={17} /></button></header><div className="admin-inquiry-summary"><span>문의 접수 내역</span><strong>새 문의 {inquiries.filter((item) => item.status === "대기중").length}건</strong></div><div className="admin-inquiry-list">{inquiries.length === 0 ? <div className="admin-inquiry-empty">아직 접수된 문의가 없습니다.</div> : inquiries.map((item) => <article className="admin-inquiry-row" key={item.id}><div className="admin-inquiry-row-head"><strong>{item.title}</strong><span className={item.status === "대기중" ? "pending" : ""}>{item.status}</span></div><p>{item.type} · {item.author} · {new Date(item.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p><small>{item.content}</small><em>답변 연락처: {item.contact}</em></article>)}</div></section></div>; }

function PolicySheet({ onClose }: { onClose: () => void }) { const [tab, setTab] = useState<"terms" | "settlement">("terms"); return <div className="settings-modal-overlay" onClick={onClose}><section className="policy-sheet" onClick={(event) => event.stopPropagation()}><header className="policy-sheet-head"><div><p className="eyebrow">팅커벨 정책</p><h2>서비스 이용약관 및 정산 정책</h2></div><button type="button" className="close-btn" aria-label="약관 모달 닫기" onClick={onClose}><X size={17} /></button></header><div className="policy-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "terms"} className={tab === "terms" ? "active" : ""} onClick={() => setTab("terms")}>1. 서비스 이용약관</button><button type="button" role="tab" aria-selected={tab === "settlement"} className={tab === "settlement" ? "active" : ""} onClick={() => setTab("settlement")}>2. 정산 및 환불 정책</button></div><div className="policy-content">{tab === "terms" ? <><h3>제1조 (목적)</h3><p>본 약관은 '팅커벨(이하 회사)'이 제공하는 지역 기반 단골 쿠폰, 예약 및 체험단 중개 플랫폼 서비스(이하 서비스)의 이용과 관련하여 회사와 회원(소비자 및 가맹점 사업자) 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p><h3>제2조 (용어의 정의)</h3><ol><li>"소비자 회원"이란 본 플랫폼을 통해 지역 매장의 쿠폰을 발급받거나 매장 예약을 이용하는 회원을 말합니다.</li><li>"가맹점(파트너) 회원"이란 플랫폼 내에 매장 정보, 쿠폰, 체험단을 등록하고 소비자에게 혜택을 제공하는 사업자를 말합니다.</li><li>"정회원"이란 유료 월간 멤버십(월 10,000원)을 구독하여 10,000원 초과 프리미엄 쿠폰 이용 및 체험단 지원 자격을 보유한 회원을 말합니다.</li><li>"팅커벨 쿠폰"이란 파트너가 발행하고 소비자가 현장 또는 예약 시 사용할 수 있는 할인·증정 쿠폰을 의미합니다.</li></ol><h3>제3조 (회원 등급 및 이용 정책)</h3><ol><li>일반(무료) 회원은 10,000원 이하의 쿠폰을 무료로 이용할 수 있습니다.</li><li>정회원은 월간 구독을 통해 10,000원 초과의 모든 프리미엄 쿠폰을 무제한으로 이용할 수 있습니다.</li><li>단, 만 19세 미만의 청소년 회원은 청소년 지원 정책에 따라 무료 회원 상태에서도 10,000원 초과 쿠폰을 제한 없이 이용할 수 있습니다.</li></ol><h3>제4조 (위치기반 서비스 제공)</h3><ol><li>회사는 이용자의 현재 위치를 기반으로 주변 매장의 거리 및 예상 도보 시간을 계산하여 제공합니다.</li><li>위치 정보는 이용자의 기기 브라우저 위치 권한 동의 하에 실시간으로 연산되며, 별도의 서버에 영구 저장되지 않습니다.</li></ol><h3>제5조 (쿠폰 사용 및 노쇼 방지)</h3><ol><li>예약 쿠폰을 발급받은 회원은 지정된 방문 일정을 준수해야 합니다.</li><li>정당한 사유 없이 3회 이상 예약 부도(노쇼)가 발생할 경우, 회사는 서비스 이용 제한 또는 멤버십 혜택을 일시 정지할 수 있습니다.</li></ol></> : <><h3>제1조 (정산 정책 - 가맹점 파트너)</h3><ol><li>소비자가 매장에서 정상적으로 쿠폰을 인증 및 사용(PIN 인증 완료)한 내역에 대해 회사는 파트너에게 정산금을 지급합니다.</li><li>정산 주기는 매월 말일 마감 후 익월 10일(영업일 기준)에 등록된 사업자 계좌로 입금됩니다.</li><li>회사의 중개 수수료는 사전 협약된 요율을 적용하며, 정산금 지급 시 원천 공제됩니다.</li></ol><h3>제2조 (멤버십 구독 결제 및 환불)</h3><ol><li>정회원 월간 구독료(10,000원)는 1개월 단위로 자동 갱신됩니다.</li><li>결제 후 7일 이내에 유료 쿠폰 사용 및 체험단 지원 이력이 없는 경우 전액 환불이 가능합니다.</li><li>결제 후 7일이 경과하였거나 유료 쿠폰 사용 이력이 있는 경우 당월 결제액은 환불되지 않으며, 차기 결제일에 대한 자동 갱신 해지만 적용됩니다.</li></ol><h3>제3조 (분쟁 해결 및 고객센터)</h3><p>정산 오차, 환불 문의, 불법 쿠폰 도용 등의 문제는 고객센터 1:1 문의를 통해 접수되며, 회사는 접수일로부터 영업일 기준 3일 이내에 검토 및 답변을 제공합니다.</p></>}</div><button type="button" className="policy-confirm" onClick={onClose}>확인 및 닫기</button></section></div>; }
function expiryMediaImageFor(deal: ExpiryDeal) { return deal.sourceCoupon?.image ?? couponMediaImageFor(deal.store, "식당·맛집"); }
function ExpiryFeed({ dong, onBack, onReserve, onOpenMap, onOpenMedia, stockByDealId, partnerDeals = [], includeSampleDeals = true }: { dong: string; onBack: () => void; onReserve: (deal: ExpiryDeal) => void; onOpenMap: (item: StoreMapItem) => void; onOpenMedia: (coupon: Coupon) => void; stockByDealId: Record<number, number>; partnerDeals?: ExpiryDeal[]; includeSampleDeals?: boolean }) {
  const [chip, setChip] = useState("전체");
  const availableDeals = includeSampleDeals ? [...partnerDeals, ...expiryDeals] : partnerDeals;
  const deals = (chip === "전체" ? availableDeals : availableDeals.filter((deal) => deal.category === chip)).map((deal) => ({ ...deal, remaining: stockByDealId[deal.id] ?? deal.remaining }));
  return <section className="expiry-feed"><div className="drilldown-head"><button type="button" className="expiry-feed-back" aria-label="홈으로 돌아가기" onClick={onBack}><ChevronLeft size={20} /></button><h2>오늘의 마감 특가</h2><span className="expiry-feed-header-spacer" aria-hidden="true" /></div><div className="expiry-chips">{expiryChips.map((item) => <button key={item} className={chip === item ? "active" : ""} onClick={() => setChip(item)}>{item}</button>)}</div><div className="expiry-feed-head"><span>{dong} 실시간 마감 상품</span><b>{deals.length}개 상품</b></div><div className="expiry-deal-list">{deals.map((deal) => {
    const mapItem: StoreMapItem = { store: deal.store, address: deal.address, distance: deal.sourceCoupon?.latitude !== undefined && deal.sourceCoupon.longitude !== undefined ? `도보 ${deal.walkingMinutes}분 · ${deal.distance}` : "거리 정보 없음", latitude: deal.sourceCoupon?.latitude, longitude: deal.sourceCoupon?.longitude };
    const ddayLabel = formatCouponDday(deal.sourceCoupon?.usageEndDate);
    return <article className={`expiry-deal-card ${deal.remaining === 0 ? "sold-out" : ""}`} key={deal.id}>
      <button type="button" className="expiry-deal-thumb" aria-label={`${deal.store} ${deal.title} 사진·영상 보기`} onClick={() => { if (deal.sourceCoupon) onOpenMedia(deal.sourceCoupon); }}><CouponMediaImage sources={[deal.sourceCoupon?.image, deal.sourceCoupon?.mediaUrl, deal.sourceCoupon?.storeImageUrl, deal.sourceCoupon?.foodImageUrl, ...(deal.sourceCoupon?.mediaItems ?? []).filter((media) => media.kind === "image").map((media) => media.url), ...(deal.sourceCoupon?.mediaItems ?? []).filter((media) => media.kind === "video").map((media) => media.posterUrl), expiryMediaImageFor(deal)]} alt={`${deal.store} ${deal.title} 대표 이미지`} />{deal.sourceCoupon?.mediaItems?.some((media) => media.kind === "video") && <i aria-hidden="true">▶</i>}</button>
      <div className="expiry-deal-body"><div className="expiry-deal-meta"><b>{deal.store}</b>{ddayLabel && <span className="coupon-dday-badge" aria-label={`쿠폰 종료 ${ddayLabel}`}>{ddayLabel}</span>}</div>
        <h3>{deal.title}</h3>
        <div className="expiry-deal-card-bottom"><div className="expiry-price"><del>{deal.originalPrice.toLocaleString()}원</del><strong>{deal.salePrice === 0 ? "무료" : `${deal.salePrice.toLocaleString()}원`}</strong><em>{deal.discount} 할인</em></div>
          <div className="expiry-card-actions"><button type="button" className="expiry-map-link" aria-label="매장 위치" onClick={(event) => { event.stopPropagation(); onOpenMap(mapItem); }}><MapPin size={12} /><span>매장 위치</span></button><button type="button" className="expiry-pickup-btn" disabled={deal.remaining === 0} onClick={(event) => { event.stopPropagation(); onReserve(deal); }}>{deal.remaining === 0 ? "소진" : "예약하기"} {deal.remaining > 0 && <ArrowRight size={13} />}</button></div>
        </div>
      </div>
    </article>;
  })}</div></section>;
}
type ConsumerNotificationSettings = { couponArrival: boolean; meetings: boolean; benefits: boolean; sound: string };
type ConsumerSoundOption = { value: string; label: string; file: string | null };
type ConsumerSoundGroup = { label: string; options: ConsumerSoundOption[] };
const consumerSoundGroups: ConsumerSoundGroup[] = [
  { label: "기본 효과음", options: [{ value: "chime", label: "기본 알림음 (팅커벨 띵동)", file: "dangam-consumer-notification-chime.mp3" }, { value: "bell", label: "경쾌한 벨소리", file: "dangam-consumer-notification-bell.mp3" }] },
  { label: "여성 안내 음성", options: [1, 2, 3, 4].map((index) => ({ value: `female-${index}`, label: `여성 보이스 ${index}번`, file: `dangam-consumer-notification-female-${index}.mp3` })) },
  { label: "남성 안내 음성", options: [1, 2, 3, 4].map((index) => ({ value: `male-${index}`, label: `남성 보이스 ${index}번`, file: `dangam-consumer-notification-male-${index}.mp3` })) },
  { label: "기타", options: [{ value: "none", label: "무음", file: null }] },
];
const consumerSoundOptions = consumerSoundGroups.flatMap((group) => group.options);
function ConsumerNotificationModal({ settings, onChange, onToast, onClose }: { settings: ConsumerNotificationSettings; onChange: (key: keyof ConsumerNotificationSettings, value: boolean | string) => void; onToast: (message: string) => void; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);
  const previewSound = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setIsPlaying(false);
    const selected = consumerSoundOptions.find((option) => option.value === settings.sound);
    if (!selected?.file) { onToast("무음으로 설정되었습니다."); return; }
    const audio = new Audio(`/assets/audio/${selected.file}`);
    audioRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => { setIsPlaying(false); onToast("알림음을 재생할 수 없습니다."); };
    setIsPlaying(true);
    void audio.play().catch(() => { setIsPlaying(false); onToast("브라우저에서 오디오 재생을 허용해 주세요."); });
  };
  const rows = [
    { key: "couponArrival" as const, icon: "🔔", title: "신규 쿠폰 도착 알림", description: "새 할인 쿠폰 및 선물 쿠폰 수신 시 알림" },
    { key: "meetings" as const, icon: "👥", title: "동네모임 알림", description: "내 모임 댓글, 신규 모임 소식 알림" },
    { key: "benefits" as const, icon: "🎁", title: "혜택 및 이벤트 알림", description: "정회원 혜택, 체험단 모집 안내 푸시" },
  ];
  return <div className="overlay notification-overlay" onClick={onClose}><section className="consumer-notification-modal" onClick={(event) => event.stopPropagation()}><div className="consumer-notification-head"><div><p className="eyebrow">회원 설정</p><h2>푸시 알림 상세 설정</h2></div><button className="close-btn" aria-label="알림 상세 설정 닫기" onClick={onClose}><X size={17} /></button></div><div className="consumer-notification-list">{rows.map((row) => <div className="consumer-notification-row" key={row.key}><span className="consumer-notification-icon">{row.icon}</span><div><strong>{row.title}</strong><small>{row.description}</small></div><button type="button" className={`notification-switch ${settings[row.key] ? "on" : "off"}`} role="switch" aria-checked={settings[row.key]} aria-label={`${row.title} 설정`} onClick={() => onChange(row.key, !settings[row.key])}><span>{settings[row.key] ? "ON" : "OFF"}</span><i /></button></div>)}</div><div className="notification-sound-box"><div className="notification-sound-head"><span className="notification-sound-icon"><Bell size={18} /></span><div><strong>푸시 알림 수신음</strong><small>쿠폰 도착 및 알림 시 울릴 팅커벨 사운드를 선택하세요.</small></div></div><div className="notification-sound-controls"><select aria-label="푸시 알림 수신음 선택" value={settings.sound} onChange={(event) => onChange("sound", event.target.value)}>{consumerSoundGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</select><button type="button" onClick={previewSound}>{isPlaying ? "■ 재생 중..." : "▶ 미리듣기"}</button></div></div></section></div>;
}
function NotificationSheet({ api, isPreviewDemo, notifications, onMarkRead, onCouponPreferenceChanged, onClose }: { api: DangamApi; isPreviewDemo: boolean; notifications: ConsumerAppNotificationDto[]; onMarkRead: (notification: ConsumerAppNotificationDto) => Promise<void>; onCouponPreferenceChanged: (enabled: boolean) => void; onClose: () => void }) {
  return <div className="overlay notification-overlay" onClick={onClose}><section className="notification-sheet" onClick={(event) => event.stopPropagation()}>
    <div className="notification-head"><div><p className="eyebrow">알림 내역</p><h2>알림 내역</h2></div><button className="close-btn" aria-label="알림 닫기" onClick={onClose}><X size={17} /></button></div>
    {isPreviewDemo ? <ConsumerAppNotificationCenter notifications={notifications} onMarkRead={onMarkRead} onCouponPreferenceChanged={onCouponPreferenceChanged} /> : null}
    <div className="notification-list"><TargetedCouponInbox api={api} /></div>
  </section></div>;
}
const CHAT_ACTIVITY_STORAGE_KEY = "dangam_meeting_chat_activity";
const CHAT_ACTIVITY_CHANGED_EVENT = "dangam:meeting-chat-activity-changed";
function readMeetingChatActivity(): Record<string, number> { try { const raw = window.localStorage.getItem(CHAT_ACTIVITY_STORAGE_KEY); return raw ? JSON.parse(raw) as Record<string, number> : {}; } catch { return {}; } }
function markMeetingChatActivity(meetingId: number, timestamp = Date.now()) { const activity = readMeetingChatActivity(); if ((activity[String(meetingId)] ?? 0) >= timestamp) return; activity[String(meetingId)] = timestamp; window.localStorage.setItem(CHAT_ACTIVITY_STORAGE_KEY, JSON.stringify(activity)); window.dispatchEvent(new CustomEvent(CHAT_ACTIVITY_CHANGED_EVENT, { detail: { meetingId, timestamp } })); }
function meetingChatPreview(meeting: Meeting, userId: string, remoteLastMessage?: string | null) { if (remoteLastMessage) return remoteLastMessage; const messages = readMeetingChatMessages(meeting, userId); return messages[messages.length - 1]?.text ?? ""; }
const CHAT_UNREAD_STORAGE_PREFIX = "dangam_meeting_unread_";
const CHAT_UNREAD_CHANGED_EVENT = "dangam:meeting-unread-changed";
const MEETING_MEMBERSHIP_CHANGED_EVENT = "dangam:meeting-membership-changed";
function meetingUnreadStorageKey(meetingId: number) { return `${CHAT_UNREAD_STORAGE_PREFIX}${meetingId}`; }
function readMeetingUnreadCount(meetingId: number, fallback = 0) {
  const stored = window.localStorage.getItem(meetingUnreadStorageKey(meetingId));
  if (stored === null) return fallback;
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
function clearMeetingUnreadCount(meetingId: number) {
  window.localStorage.setItem(meetingUnreadStorageKey(meetingId), "0");
  window.dispatchEvent(new CustomEvent(CHAT_UNREAD_CHANGED_EVENT, { detail: { meetingId } }));
}
function MeetingChatList({ currentUserId, joinedMeetings, onOpen, onBack, meetingSearchQuery = "", activeSubtab, onSubtabChange, pendingMarketplaceListing, onMarketplaceListingHandled }: { currentUserId: string; joinedMeetings: Meeting[]; onOpen: (meeting: Meeting) => void; onBack: () => void; meetingSearchQuery?: string; activeSubtab: CommunityChatSubtab; onSubtabChange: (tab: CommunityChatSubtab) => void; pendingMarketplaceListing: MarketplaceListing | null; onMarketplaceListingHandled: () => void }) {
  const remoteRooms = trpc.communication.listRooms.useQuery({ clientUserId: currentUserId }, { refetchInterval: 2000, staleTime: 1000, retry: false });
  const [, setUnreadVersion] = useState(0);
  const [activityVersion, setActivityVersion] = useState(0);
  const [archiveVersion, setArchiveVersion] = useState(0);
  useEffect(() => { const refresh = () => { setUnreadVersion((value) => value + 1); setActivityVersion((value) => value + 1); setArchiveVersion((value) => value + 1); }; window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, refresh); window.addEventListener(CHAT_ACTIVITY_CHANGED_EVENT, refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener(CHAT_UNREAD_CHANGED_EVENT, refresh); window.removeEventListener(CHAT_ACTIVITY_CHANGED_EVENT, refresh); window.removeEventListener("storage", refresh); }; }, []);
  const remoteByMeetingId = useMemo(() => new Map((remoteRooms.data ?? []).filter((entry) => entry.room.roomType === "meet").map((entry) => [entry.room.meetingId, entry.room])), [remoteRooms.data]);
  const activity = useMemo(() => readMeetingChatActivity(), [remoteRooms.data, activityVersion]);
  const rooms = useMemo(() => { const query = meetingSearchQuery.trim().toLowerCase(); const activeGroups = joinedMeetings.filter((meeting) => !meeting.isExperienceDirectChat && !meeting.isReservationDirectChat); const source = query ? activeGroups.filter((meeting) => `${meeting.title} ${meeting.category} ${meeting.place} ${meeting.address} ${meeting.intro ?? ""}`.toLowerCase().includes(query)) : activeGroups; return source.map((meeting, index) => ({ meeting, index, room: remoteByMeetingId.get(meeting.id) })).sort((a, b) => { const aRemote = a.room?.lastMessageAt ? new Date(a.room.lastMessageAt).getTime() : 0; const bRemote = b.room?.lastMessageAt ? new Date(b.room.lastMessageAt).getTime() : 0; const aAt = Math.max(Number.isFinite(aRemote) ? aRemote : 0, activity[String(a.meeting.id)] ?? 0); const bAt = Math.max(Number.isFinite(bRemote) ? bRemote : 0, activity[String(b.meeting.id)] ?? 0); return bAt - aAt || a.index - b.index; }); }, [joinedMeetings, remoteByMeetingId, activity, activityVersion, meetingSearchQuery]);
  const archivedChatRooms = useMemo(() => readArchivedCommunityChats(currentUserId), [currentUserId, archiveVersion]);
  const deleteArchivedChatRoom = (room: ArchivedCommunityChat) => {
    removeArchivedCommunityChat(room.id, currentUserId);
    removeArchivedCommunityChatData(room, currentUserId);
    setArchiveVersion((value) => value + 1);
  };
  return (
    <div className="community-chat-list-page">
      <header className="community-chat-list-header">
        <button type="button" aria-label="커뮤니티로 돌아가기" onClick={onBack}><ChevronLeft size={20} aria-hidden="true" /></button>
        <h1>채팅</h1>
      </header>
      <div className="community-chat-subtabs" role="tablist" aria-label="채팅 종류">
        <button type="button" role="tab" aria-selected={activeSubtab === "meetings"} onClick={() => onSubtabChange("meetings")}>모임</button>
        <button type="button" role="tab" aria-selected={activeSubtab === "marketplace"} onClick={() => onSubtabChange("marketplace")}>중고거래</button>
        <button type="button" role="tab" aria-selected={activeSubtab === "completed"} onClick={() => onSubtabChange("completed")}>완료된 채팅</button>
      </div>
      {activeSubtab !== "meetings" ? (
        <MarketplaceChatPanel currentUserId={currentUserId} pendingListing={pendingMarketplaceListing} onPendingListingHandled={onMarketplaceListingHandled}
          onBackToList={() => onSubtabChange(activeSubtab)} completedOnly={activeSubtab === "completed"} archivedChatRooms={archivedChatRooms} onDeleteArchivedChatRoom={deleteArchivedChatRoom}
          renderMeetingDateTimePicker={(value, onChange) => <MeetingDateTimePicker value={value} onChange={onChange} />}
          renderMeetingPartnerPicker={(onSelect, onClose) => <PartnerStorePicker overlayPriority selectedCategory="전체" onSelect={onSelect} onClose={onClose} />} />
      ) : (
        <>
          <h2 className="community-chat-section-title">나의 모임 채팅</h2>
          <main className="community-chat-room-list">
            {rooms.map(({ meeting, index, room }) => {
              const unread = readMeetingUnreadCount(meeting.id);
              const remoteTimestamp = room?.lastMessageAt ? new Date(room.lastMessageAt).getTime() : 0;
              const localTimestamp = activity[String(meeting.id)] ?? 0;
              const lastActivityAt = Math.max(Number.isFinite(remoteTimestamp) ? remoteTimestamp : 0, localTimestamp);
              const lastActivityLabel = lastActivityAt > 0 ? new Date(lastActivityAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "";
              const preview = meetingChatPreview(meeting, currentUserId, room?.lastMessage);
              return (
                <button type="button" className="community-chat-room-card meeting-card compact-horizontal" key={meeting.id} onClick={() => { clearMeetingUnreadCount(meeting.id); onOpen(meeting); }} aria-label={`${meeting.title} 모임 채팅방 열기`}>
                  <div className="meeting-compact-thumb"><img src={meetingThumbnailFor(meeting)} alt={`${meeting.title} 모임 사진`} /></div>
                  <div className="meeting-compact-content meeting-chat-list-content">
                    <h3 className="meeting-compact-title">{meeting.title}</h3>
                    {preview && <p className="meeting-chat-last-message">{preview}</p>}
                  </div>
                  <span className="community-chat-room-meta">
                    {lastActivityLabel && <time dateTime={new Date(lastActivityAt).toISOString()}>{lastActivityLabel}</time>}
                    {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
                  </span>
                </button>
              );
            })}
            {!rooms.length && <div className="community-chat-empty"><MessageCircle size={28} /><strong>가입한 모임 채팅이 없어요</strong><span>커뮤니티에서 모임에 가입하면 채팅방이 여기에 보여요.</span></div>}
          </main>
        </>
      )}
    </div>
  );
}
const BENEFIT_GUIDE_STORAGE_KEY = "dangam_benefit_guide_snooze_until";

function BenefitGuideModal({ onClose }: { onClose: () => void }) {
  const snooze = (durationMs: number) => {
    window.localStorage.setItem(BENEFIT_GUIDE_STORAGE_KEY, String(Date.now() + durationMs));
    onClose();
  };
  return <div className="benefit-guide-overlay" role="dialog" aria-modal="true" aria-labelledby="benefit-guide-title">
    <section className="benefit-guide-modal">
      <header className="benefit-guide-header"><div><span className="benefit-guide-eyebrow">팅커벨 이용 안내</span><h2 id="benefit-guide-title">팅커벨 이용 자격 및 회원 혜택 안내</h2></div><button type="button" className="benefit-guide-close" aria-label="혜택 안내 닫기" onClick={onClose}>×</button></header>
      <div className="benefit-guide-body">
        <article className="benefit-guide-card student"><div className="benefit-guide-card-title"><span aria-hidden="true">🎓</span><strong>학생 및 미성년자</strong><b>청소년 보호 혜택</b></div><ul><li>전체 쿠폰 100% 무료 다운로드</li><li>1만 원 이상 고액 쿠폰도 전액 무료</li><li>학생 전용 체험단 무료 지원·참여</li></ul></article>
        <article className="benefit-guide-card adult"><div className="benefit-guide-card-title"><span aria-hidden="true">👤</span><strong>일반 성인 회원</strong><b>기본 무료</b></div><ul><li>1만 원 이하 쿠폰 무료 다운로드·이용</li></ul></article>
        <article className="benefit-guide-card premium"><div className="benefit-guide-card-title"><span aria-hidden="true">⭐</span><strong>성인 정기구독 회원</strong><b>월 10,000원 VIP</b></div><ul><li>1만 원 이상 프리미엄 쿠폰 무제한 다운로드</li><li>공개 체험단 지원 가능</li></ul></article>
      </div>
      <footer className="benefit-guide-footer"><button type="button" onClick={() => snooze(24 * 60 * 60 * 1000)}>오늘 하루 보지 않기</button><button type="button" onClick={() => snooze(7 * 24 * 60 * 60 * 1000)}>7일간 보지 않기</button><button type="button" className="benefit-guide-dismiss" onClick={onClose}>닫기</button></footer>
    </section>
  </div>;
}

function Home() {
  const previewDemo = useConsumerPreviewDemo();
  const { notifications: appNotifications, unreadCount: appUnreadCount, markRead: markAppNotificationRead } = useConsumerNotificationCount(previewDemo.active);
  const [specialFeedNow, setSpecialFeedNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setSpecialFeedNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const [benefitGuideOpen, setBenefitGuideOpen] = useState(false);
  useEffect(() => {
    const snoozeUntil = Number(window.localStorage.getItem(BENEFIT_GUIDE_STORAGE_KEY) ?? "0");
    if (!Number.isFinite(snoozeUntil) || snoozeUntil <= Date.now()) {
      window.localStorage.removeItem(BENEFIT_GUIDE_STORAGE_KEY);
      setBenefitGuideOpen(true);
    }
  }, []);
  const dashboardClientUserId = getClientUserId();
  useEffect(() => {
    if (!previewDemo.active) return;
    const parseArray = (key: string): unknown[] => {
      try { const value = JSON.parse(window.localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value : []; }
      catch { return []; }
    };
    const reportCategory = (value: unknown) => {
      const text = String(value ?? "").toLocaleLowerCase("ko-KR");
      if (/사기|피싱|금전|fraud/.test(text)) return "fraud" as const;
      if (/욕설|괴롭힘|협박|abuse/.test(text)) return "abuse" as const;
      if (/위험|안전|safety/.test(text)) return "safety" as const;
      if (/광고|도배|스팸|spam/.test(text)) return "spam" as const;
      return "other" as const;
    };
    const sync = () => {
      const storedMeetings = parseArray(scopedStorageKey("dangam_user_meetings", dashboardClientUserId)) as Meeting[];
      const allMeetings = [...new Map([...meetings, ...regionMockMeetings, ...storedMeetings].map(item => [item.id, item])).values()];
      const communityRows = allMeetings.map(meeting => {
        const participation = parseMeetingCapacity(meeting);
        return {
          sourceKey: previewActivitySourceKey(`meeting-${meeting.id}`), kind: "meetup" as const,
          title: meeting.title, category: meeting.category, organizerLabel: meeting.organizerName ?? "Preview 모임장", ...(meeting.regionCode ? { regionCode: String(meeting.regionCode) } : {}),
          scheduledAt: null, participantCount: participation.currentMembers, capacity: participation.maxMembers,
          status: participation.maxMembers !== null && participation.currentMembers >= participation.maxMembers ? "full" as const : "active" as const,
        };
      });
      const scheduleRows: NonNullable<Parameters<typeof syncPreviewActivitySnapshot>[0]["community"]> = [];
      const seenSchedules = new Set<string>();
      const addSchedule = (meeting: Meeting | undefined, schedule: Pick<MeetingChatSchedule, "id" | "title" | "startAt" | "attendeeIds" | "maxMembers">, sourceKey: string) => {
        if (seenSchedules.has(sourceKey)) return;
        seenSchedules.add(sourceKey);
        const scheduledAt = normalizePreviewDate(schedule.startAt);
        const participantCount = Array.isArray(schedule.attendeeIds) ? schedule.attendeeIds.length : 0;
        scheduleRows.push({
          sourceKey: previewActivitySourceKey(`schedule-${sourceKey}`), kind: "schedule", title: schedule.title || meeting?.title || "모임 일정",
          category: meeting?.category ?? "모임 일정", organizerLabel: meeting?.organizerName ?? "Preview 모임장", ...(meeting?.regionCode ? { regionCode: String(meeting.regionCode) } : {}),
          scheduledAt, participantCount, capacity: schedule.maxMembers ?? null,
          status: schedule.maxMembers !== undefined && participantCount >= schedule.maxMembers ? "full" : scheduledAt && new Date(scheduledAt).getTime() < Date.now() ? "completed" : "scheduled",
        });
      };
      allMeetings.forEach(meeting => (meeting.schedules ?? []).forEach(schedule => addSchedule(meeting, schedule, String(schedule.id))));
      readCommunityEvents().forEach(event => addSchedule(allMeetings.find(meeting => meeting.id === event.meetingId), event.schedule, String(event.schedule.id ?? event.id)));
      const communityChats = allMeetings.map(meeting => {
        const messages = parseArray(meetingChatStorageKey(meeting.id, dashboardClientUserId)) as Array<Record<string, unknown>>;
        const lastMessage = messages.at(-1);
        const participation = parseMeetingCapacity(meeting);
        return {
          sourceKey: previewActivitySourceKey(`community-chat-${meeting.id}`), roomType: "community" as const,
          participantCount: Math.max(0, participation.currentMembers), messageCount: messages.length, unreadCount: null,
          lastActivityAt: normalizePreviewDate(lastMessage?.createdAt as string | number | null | undefined),
        };
      });
      const marketplaceChatKey = `dangam_preview_marketplace_chat_activity_v1_${encodeURIComponent(dashboardClientUserId)}`;
      const marketplaceChats = parseArray(marketplaceChatKey).flatMap((value, index) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const participantCount = normalizePreviewCount(item.participantCount, 10000);
        if (participantCount === null) return [];
        return [{
          sourceKey: previewActivitySourceKey(String(item.sourceKey ?? `marketplace-chat-${index}`)), roomType: "marketplace" as const,
          participantCount, messageCount: normalizePreviewCount(item.messageCount, 1000000),
          unreadCount: normalizePreviewCount(item.unreadCount, 100000), lastActivityAt: normalizePreviewDate(item.lastActivityAt as string | number | null | undefined),
        }];
      });
      void syncPreviewActivitySnapshot({ community: [...communityRows, ...scheduleRows].slice(0, 500), chatRooms: [...communityChats, ...marketplaceChats].slice(0, 1000) });

      const reportRows = parseArray("dangam_admin_reports").slice(0, 100) as Array<Record<string, unknown>>;
      reportRows.forEach((report, index) => {
        const sourceKey = previewActivitySourceKey(String(report.id ?? `community-report-${index}`));
        const targetIsChat = typeof report.chatType === "string";
        const targetSourceKey = previewActivitySourceKey(targetIsChat ? `community-chat-${report.meetingId}` : `meeting-${report.meetingId}`);
        void submitPreviewReportSnapshot({ sourceKey, targetType: targetIsChat ? "chat" : "community", category: reportCategory(report.reportType ?? report.type), targetSourceKey, targetLabel: String(report.meetingTitle ?? (targetIsChat ? "모임 채팅 신고" : "동네 모임 신고")).slice(0, 120) });
      });
      const marketplaceReportKey = `dangam_marketplace_reports_v1_${encodeURIComponent(dashboardClientUserId)}`;
      parseArray(marketplaceReportKey).slice(0, 100).forEach((raw, index) => {
        const report = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const sourceKey = previewActivitySourceKey(String(report.id ?? `marketplace-report-${index}-${report.createdAt ?? "preview"}`));
        const targetSourceKey = previewActivitySourceKey(`listing-${report.listingId ?? report.id ?? index}`);
        void submitPreviewReportSnapshot({ sourceKey, targetType: "marketplace", category: reportCategory(report.category), targetSourceKey, targetLabel: "중고 거래 신고 대상" });
      });
    };
    sync();
    const timer = window.setInterval(sync, 5000);
    window.addEventListener("storage", sync);
    window.addEventListener("dangam:community-events-updated", sync);
    window.addEventListener("dangam:meeting-schedules-updated", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
      window.removeEventListener("dangam:community-events-updated", sync);
      window.removeEventListener("dangam:meeting-schedules-updated", sync);
    };
  }, [previewDemo.active, dashboardClientUserId]);
  const membershipStatusQuery = trpc.membership.getStatus.useQuery(undefined, { enabled: !previewDemo.active });
  const [previewSubscription, setPreviewSubscription] = useState<Awaited<ReturnType<typeof consumerApi.getPreviewSubscription>>>(null);
  useEffect(() => {
    if (!previewDemo.active) return;
    let mounted = true;
    const refresh = () => { void consumerApi.getPreviewSubscription().then(status => { if (mounted) setPreviewSubscription(status); }).catch(() => undefined); };
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [previewDemo.active]);
  const membershipStatus = previewDemo.active ? { active: previewSubscription ? previewSubscription.status === "active" : previewDemo.membershipActive, nextBillingDate: previewSubscription?.currentPeriodEndsOn ?? null, cancelAtPeriodEnd: false } : readMembershipStatus(membershipStatusQuery.data);
  const isServerPremiumMember = membershipStatus.active;
  const membershipNextBillingDate = previewDemo.active ? previewSubscription?.currentPeriodEndsOn ? new Date(previewSubscription.currentPeriodEndsOn).toLocaleDateString("ko-KR") : "미리보기 이용 중" : membershipStatus.nextBillingDate ?? "확인 중";
  const startMembershipCheckout = trpc.membership.startCheckout.useMutation();
  const cancelMembership = trpc.membership.cancel.useMutation();
  const submitDashboardPartner = trpc.integration.submitPartnerApplication.useMutation();
  const submitDashboardSettlement = trpc.integration.submitSettlementAccountChange.useMutation();
  const submitDashboardReservation = trpc.integration.submitReservation.useMutation();
  const newDashboardEventId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  useEffect(() => { if (previewDemo.active) return;
 const params = new URLSearchParams(window.location.search); const ref = params.get("ref"); if (ref) { window.localStorage.setItem("dangam_referrer_code", ref); window.localStorage.setItem("dangam_pending_referral", "true"); } const signupComplete = params.get("signup") === "complete" || window.localStorage.getItem("dangam_signup_completed") === "true"; const referrerCode = ref || window.localStorage.getItem("dangam_referrer_code"); if (signupComplete && referrerCode) { const processedKey = `dangam_referral_processed_${referrerCode}`; if (!window.localStorage.getItem(processedKey)) { window.localStorage.setItem(processedKey, "true"); window.localStorage.setItem("dangam_referrer_code", referrerCode); const countKey = `dangam_referral_count_${referrerCode}`; const nextCount = Number(window.localStorage.getItem(countKey) || "0") + 1; window.localStorage.setItem(countKey, String(nextCount)); window.localStorage.removeItem("dangam_pending_referral"); window.dispatchEvent(new CustomEvent("dangam:referral-counted", { detail: { referrerCode, count: nextCount } })); } } }, [previewDemo.active]); const [mediaViewer, setMediaViewer] = useState<MediaViewerItem | null>(null); const [storeMap, setStoreMap] = useState<StoreMapItem | null>(null); const userPosition: GeoPoint | null = null; const distanceEnabled = false; const [couponBrowseRegionCodes, setCouponBrowseRegionCodes] = useState<string[]>(() => {
    let savedBrowseSelectionPresent = false;
    try {
      savedBrowseSelectionPresent = ["dangam_coupon_browse_region_codes", "dangam_coupon_browse_dongs", "dangam_coupon_browse_label"].some((key) => window.localStorage.getItem(key) !== null);
    } catch { /* storage is optional */ }
    return chooseInitialCouponBrowseRegionCodes({
      savedBrowseCodes: readSavedCouponBrowseRegionCodes(),
      savedBrowseSelectionPresent,
    });
  });
  const [communityBrowseRegionCodes, setCommunityBrowseRegionCodes] = useState<string[]>(() => consumerBrowseRegionCodes(readStoredRegionCodes("dangam_community_browse_region_codes", "dangam_community_browse_dongs", "dangam_community_browse_label")));
  const [couponBrowseDongs, setCouponBrowseDongs] = useState<string[]>(() => couponBrowseRegionCodes.flatMap((code) => { const region = findAdminRegionByCode(code); return region ? [region.dong] : []; }));
  const [communityBrowseDongs, setCommunityBrowseDongs] = useState<string[]>(() => communityBrowseRegionCodes.flatMap((code) => { const region = findAdminRegionByCode(code); return region ? [region.dong] : []; })); const communityLocationActionsRef = useRef<CommunityLocationActions | null>(null); const [communityLocationBusy, setCommunityLocationBusy] = useState(false); const registerCommunityLocationActions = useCallback((actions: CommunityLocationActions | null) => { communityLocationActionsRef.current = actions; }, []);
  const [couponBrowseLabel, setCouponBrowseLabel] = useState(() => couponBrowseRegionCodes.length ? formatConsumerBrowseRegionLabel(couponBrowseRegionCodes) : "");
  const [couponBrowseIsExplicit, setCouponBrowseIsExplicit] = useState(() => couponBrowseRegionCodes.length > 0);
  const [experienceTargetDongs, setExperienceTargetDongs] = useState<string[] | null>(null); const [experienceTargetRegionCodes, setExperienceTargetRegionCodes] = useState<string[] | null>(null); const sharedApi = useMemo(() => createDangamApi(() => window.localStorage.getItem("dangam_access_token") ?? ""), []); const sharedCoupons = useSharedConsumerFeed(sharedApi, couponBrowseRegionCodes); const centralPreviewFeedEnabled = import.meta.env.DEV && previewDemo.active && typeof window !== "undefined" && Boolean(resolveCentralPreviewApiBaseUrl(import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined, window.location.origin)); useEffect(() => { if (sharedCoupons.error) console.warn("[팅커벨 공용 쿠폰 피드]", sharedCoupons.error); }, [sharedCoupons.error]); const [remoteCoupons, setRemoteCoupons] = useState<Coupon[]>([]); const [nearbySearchActive, setNearbySearchActive] = useState(false); const [nearbySearchCoupons, setNearbySearchCoupons] = useState<Coupon[]>([]); const [nearbySearchLoading, setNearbySearchLoading] = useState(false); const [couponSortOrigin, setCouponSortOrigin] = useState<GeoPoint | null>(null); const [sortClockMs, setSortClockMs] = useState(() => Date.now()); const nearbySearchRequestId = useRef(0); const distanceSortRequestId = useRef(0); const [apiLoaded, setApiLoaded] = useState(false); const [category, setCategory] = useState<Category | null>(null); const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<CouponCatalogCategory>("전체"); const [feedTab, setFeedTab] = useState<FeedTab>("가까운 순"); const [sortTab, setSortTab] = useState<CouponSortTab>("인기"); const chatPathMeetingId = window.location.pathname.match(/^\/community\/chat\/(\d+)$/)?.[1]; const [nav, setNav] = useState<NavTab>(() => window.location.pathname.startsWith("/community") ? "meetings" : "home"); const [partnerGuideOpen, setPartnerGuideOpen] = useState(false); useEffect(() => { if (nav !== "my") setPartnerGuideOpen(false); }, [nav]); const [communityChatListOpen, setCommunityChatListOpen] = useState(() => window.location.pathname === "/community/chat-list"); const [communityChatSubtab, setCommunityChatSubtab] = useState<CommunityChatSubtab>("meetings"); const [chatListRouteVersion, setChatListRouteVersion] = useState(0); const [pendingMarketplaceListing, setPendingMarketplaceListing] = useState<MarketplaceListing | null>(null); const [communityChatMeeting, setCommunityChatMeeting] = useState<Meeting | null>(null); const [communityChatReturnMeeting, setCommunityChatReturnMeeting] = useState<Meeting | null>(null); const [communityChatReturnParticipation, setCommunityChatReturnParticipation] = useState<Participation | null>(null); const [experienceChatApplication, setExperienceChatApplication] = useState<CampaignApplication | null>(null); const [reservationChatMeeting, setReservationChatMeeting] = useState<Meeting | null>(null); const [joinedMeetings, setJoinedMeetings] = useState<Meeting[]>(() => { try { const saved = window.localStorage.getItem(`dangam_joined_meetings_${getClientUserId()}`); if (saved) return JSON.parse(saved) as Meeting[]; return meetings.filter((meeting) => window.localStorage.getItem(`dangam_meeting_joined_${getClientUserId()}_${meeting.id}`) === "true"); } catch { return []; } }); useEffect(() => { if (!chatPathMeetingId) return; const joinedMeeting = joinedMeetings.find((meeting) => String(meeting.id) === chatPathMeetingId && window.localStorage.getItem(`dangam_meeting_joined_${getClientUserId()}_${meeting.id}`) === "true"); if (joinedMeeting) { setCommunityChatMeeting(joinedMeeting); setCommunityChatListOpen(false); } else { setCommunityChatMeeting(null); setCommunityChatListOpen(true); setNav("meetings"); } }, [chatPathMeetingId, joinedMeetings]); const [chatUnreadVersion, setChatUnreadVersion] = useState(0); useEffect(() => { const refresh = () => setChatUnreadVersion((value) => value + 1); window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener(CHAT_UNREAD_CHANGED_EVENT, refresh); window.removeEventListener("storage", refresh); }; }, []); const totalChatUnread = joinedMeetings.reduce((total, meeting) => total + readMeetingUnreadCount(meeting.id), 0); useEffect(() => {
    const key = `dangam_joined_meetings_${getClientUserId()}`;
    const lightweightMeetings = joinedMeetings.map(meetingWithoutEmbeddedImages);
    persistMeetingStorageSafely(window.localStorage, key, lightweightMeetings, lightweightMeetings);
  }, [joinedMeetings]); const registerJoinedMeeting = (meeting: Meeting) => {
    setJoinedMeetings((current) => {
      const existing = current.find((item) => item.id === meeting.id);
      if (!existing) return [...current, meeting];
      return current.map((item) => item.id === meeting.id
        ? { ...item, ...meeting, membersList: meeting.membersList ?? item.membersList }
        : item);
    });
  }; const openJoinedMeetingChat = (meeting: Meeting, returnToDetail = false, returnParticipation?: Participation) => { registerJoinedMeeting(meeting); setCommunityChatReturnMeeting(returnToDetail ? meeting : null); setCommunityChatReturnParticipation(returnToDetail ? returnParticipation ?? null : null); setNav("meetings"); setCommunityChatSubtab("meetings"); setCommunityChatListOpen(false); setCommunityChatMeeting(meeting); }; const startMarketplaceChat = (listing: MarketplaceListing) => {
    if (listing.sellerId === dashboardClientUserId) { showHeaderToast("내가 등록한 상품에는 거래 문의를 보낼 수 없어요."); return; }
    setPendingMarketplaceListing(listing);
    setCommunityChatSubtab("marketplace");
    setCommunityChatMeeting(null);
    setCommunityChatListOpen(true);
    setNav("meetings");
  }; useEffect(() => { if (nav !== "meetings") { setCommunityChatListOpen(false); setCommunityChatMeeting(null); } }, [nav]); const [searchQuery, setSearchQuery] = useState(""); const [headerSearchOpen, setHeaderSearchOpen] = useState(false); const [recentSearches, setRecentSearches] = useState<string[]>(() => { try { const raw = window.localStorage.getItem("dangam_recent_searches"); return raw ? JSON.parse(raw) as string[] : []; } catch { return []; } }); const [couponWalletStatusRequest, setCouponWalletStatusRequest] = useState(0); const [historyRequest, setHistoryRequest] = useState(0); const [campaignApplications, setCampaignApplications] = useState<CampaignApplication[]>(() => { try { const raw = window.localStorage.getItem("dangam_campaign_applications"); return raw ? JSON.parse(raw) as CampaignApplication[] : []; } catch { return []; } }); const [remoteCampaigns, setRemoteCampaigns] = useState<Campaign[]>([]); const [experienceUnread, setExperienceUnread] = useState(() => { const stored = window.localStorage.getItem("dangam_experience_unread"); if (stored !== null) return stored === "true"; try { const raw = window.localStorage.getItem("dangam_campaign_applications"); const applications = raw ? JSON.parse(raw) as CampaignApplication[] : []; return applications.some((application) => application.status !== "NOT_SELECTED"); } catch { return false; } }); useEffect(() => { if (nav !== "experience") return; let active = true; const refreshCampaigns = () => { void consumerApi.listCampaigns({ regionCodes: experienceTargetRegionCodes ?? [] }).then((rows) => { if (active) setRemoteCampaigns(rows.map((dto) => { const address = dto.address || ""; const regionLabel = dto.target_region_codes.map(adminRegionTargetLabel).find((name) => name !== "전국 전체"); const mediaImages = (dto.media_items ?? []).flatMap((item) => item.kind === "image" ? [item.url] : item.posterUrl ? [item.posterUrl] : []); const imageSources = Array.from(new Set([dto.image_url, ...(dto.images ?? []), dto.media_url, dto.store_image_url, dto.food_image_url, ...mediaImages].filter((value): value is string => Boolean(value?.trim())))); return { id: stableNumericId(dto.id), centralCampaignId: dto.id, store: dto.store_name, storeCategory: dto.store_category, storeSubcategory: dto.store_subcategory, title: dto.title, benefit: dto.benefit, mission: dto.mission, recruited: dto.recruitment_goal, applicants: dto.applicants_count, art: "", tone: "orange", province: address.split(" ")[0] || "", district: regionLabel ?? /[가-힣]+구/.exec(address)?.[0] ?? "", address, phone: dto.phone, distance: "", image: imageSources[0] ?? "", imageSources, videoUrl: dto.video_url, mediaType: dto.media_type, mediaItems: dto.media_items, facilityTags: dto.facility_tags, targetRegionCodes: dto.target_region_codes, latitude: dto.latitude, longitude: dto.longitude, applicationEndsOn: dto.application_ends_on ?? undefined }; })); }).catch((error) => console.warn("[팅커벨 체험단 캠페인]", error)); }; refreshCampaigns(); const interval = window.setInterval(refreshCampaigns, 5000); return () => { active = false; window.clearInterval(interval); }; }, [nav, experienceTargetRegionCodes]); useEffect(() => {
    let active = true;
    const refreshApplications = async () => {
      try {
        const rows = await consumerApi.listMyTrialApplications();
        if (!active) return;
        const applications: CampaignApplication[] = rows.map((dto) => {
          const campaign = remoteCampaigns.find((item) => item.centralCampaignId === dto.campaignPublicId);
          return {
            id: `central:${dto.publicId}`, centralApplicationId: dto.publicId, centralCampaignId: dto.campaignPublicId,
            campaignId: stableNumericId(dto.campaignPublicId), store: dto.storeName, title: dto.campaignTitle,
            benefit: campaign?.benefit ?? "체험단 혜택", art: campaign?.art ?? "", tone: campaign?.tone ?? "orange",
            image: campaign?.image, channels: dto.channels.join(", "), visitDate: dto.preferredDate,
            visitTime: dto.preferredTime, promise: dto.motivation,
            status: dto.status === "selected" || dto.status === "visited" ? "SELECTED" : dto.status === "pending" ? "WAITING" : "NOT_SELECTED",
          };
        });
        setCampaignApplications((current) => {
          const next = [...applications, ...current.filter((item) => !item.centralApplicationId)];
          window.localStorage.setItem("dangam_campaign_applications", JSON.stringify(next));
          return next;
        });
      } catch { /* Keep the last known experience history when the preview bridge is temporarily unavailable. */ }
    };
    void refreshApplications();
    const interval = window.setInterval(() => void refreshApplications(), 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [remoteCampaigns]); useEffect(() => { if (nav !== "experience") return; setExperienceUnread(false); window.localStorage.setItem("dangam_experience_unread", "false"); }, [nav]); const [locationOpen, setLocationOpen] = useState(false); const [membershipOpen, setMembershipOpen] = useState(false); const [membershipRouteRequest, setMembershipRouteRequest] = useState(false); const [membershipCheckoutOpen, setMembershipCheckoutOpen] = useState(false); const [withdrawalOpen, setWithdrawalOpen] = useState(false); const [logoutOpen, setLogoutOpen] = useState(false); const [isMinor] = useState(() => !previewDemo.active && window.localStorage.getItem("dangam_user_is_minor") === "true"); const [localPartnerOpen, setLocalPartnerOpen] = useState(false);
  const [partnerPerformanceOpen, setPartnerPerformanceOpen] = useState(false); const [partnerPerformancePaid, setPartnerPerformancePaid] = useState(false); const [partnerApplicationOpen, setPartnerApplicationOpen] = useState(false); const [partnerFormMode, setPartnerFormMode] = useState(false); const [partnerRecruitmentOpen, setPartnerRecruitmentOpen] = useState(false); const [studentInviteOpen, setStudentInviteOpen] = useState(false); const [studentConsentOpen, setStudentConsentOpen] = useState(false); const [policyOpen, setPolicyOpen] = useState(false); const [supportOpen, setSupportOpen] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false); const [consumerNotificationSettingsOpen, setConsumerNotificationSettingsOpen] = useState(false); const [isNotificationEnabled, setIsNotificationEnabled] = useState(() => window.localStorage.getItem("dangam_notifications") !== "false"); useEffect(() => { if (!previewDemo.active) return; let mounted = true; void consumerApi.getCouponAlertPreference().then(preference => { if (mounted) { setIsNotificationEnabled(preference.couponAlertsEnabled); window.localStorage.setItem("dangam_notifications", String(preference.couponAlertsEnabled)); } }).catch(() => undefined); return () => { mounted = false; }; }, [previewDemo.active]); const [consumerNotificationSettings, setConsumerNotificationSettings] = useState<ConsumerNotificationSettings>(() => { try { const raw = window.localStorage.getItem("dangam_consumer_notification_settings"); const saved = raw ? JSON.parse(raw) as Partial<ConsumerNotificationSettings> : {}; const legacySound = window.localStorage.getItem("dangam_consumer_sound"); const sound = legacySound || (saved.sound === "default" ? "chime" : saved.sound === "voice" ? "female-1" : saved.sound) || "chime"; return { couponArrival: saved.couponArrival ?? true, meetings: saved.meetings ?? true, benefits: saved.benefits ?? true, sound }; } catch { return { couponArrival: true, meetings: true, benefits: true, sound: "chime" }; } }); const [headerToast, setHeaderToast] = useState(""); useEffect(() => { if (!previewDemo.active) return; return subscribePreviewConsumerNotifications((notification) => { setHeaderToast(notification.title); window.setTimeout(() => setHeaderToast((current) => current === notification.title ? "" : current), 4500); }); }, [previewDemo.active]); useEffect(() => {
    const syncCouponPreference = (enabled: boolean) => {
      setIsNotificationEnabled(enabled);
      window.localStorage.setItem("dangam_notifications", String(enabled));
      setConsumerNotificationSettings(current => {
        if (current.couponArrival === enabled) return current;
        const next = { ...current, couponArrival: enabled };
        window.localStorage.setItem("dangam_consumer_notification_settings", JSON.stringify(next));
        return next;
      });
    };
    const handlePreferenceChange = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      if (typeof enabled === "boolean") syncCouponPreference(enabled);
    };
    window.addEventListener("dangam:coupon-alert-preference-changed", handlePreferenceChange);
    if (previewDemo.active) {
      void consumerApi.getCouponAlertPreference().then(preference => syncCouponPreference(preference.couponAlertsEnabled)).catch(() => undefined);
    }
    return () => window.removeEventListener("dangam:coupon-alert-preference-changed", handlePreferenceChange);
  }, [previewDemo.active]); const [selected, setSelected] = useState<Coupon | null>(null); const [selectedSource, setSelectedSource] = useState<"home" | "wallet">("home"); const [reviewFocusClaimKey, setReviewFocusClaimKey] = useState<string | null>(null); const closeCouponMediaViewer = () => { setMediaViewer(null); setSelected(null); setReviewFocusClaimKey(null); if (selectedSource === "wallet") setNav("coupons"); }; const [redeem, setRedeem] = useState<Coupon | null>(null); const [categoryExpanded, setCategoryExpanded] = useState(false); const [foodMode, setFoodMode] = useState(false); const [foodDetailMode, setFoodDetailMode] = useState(false); const [cafeDirectMode, setCafeDirectMode] = useState(false); const [golfDirectMode, setGolfDirectMode] = useState(false); const [generalCategoryMode, setGeneralCategoryMode] = useState<GeneralCategory | null>(null); const tinkerbellStorageKey = scopedStorageKey("dangam_tinkerbell_status");
  const [tinkerbellStatus, setTinkerbellStatus] = useState<TinkerbellStatus>(() => {
    const saved = window.localStorage.getItem(tinkerbellStorageKey);
    return saved === "landed" ? "landed" : "idle";
  });
  const tinkerbellTimerRef = useRef<number | null>(null);
  const tinkerbellMountedRef = useRef(true); const [selectedExpiry, setSelectedExpiry] = useState<ExpiryDeal | null>(null); const [pickupConfirmation, setPickupConfirmation] = useState<(ExpiryDeal & { pickupTime?: string }) | null>(null); const [stockByCouponId, setStockByCouponId] = useState<Record<number, number>>(() => Object.fromEntries(coupons.map((coupon) => [coupon.id, coupon.remaining]))); const [scheduleByCouponId, setScheduleByCouponId] = useState<Record<number, BusinessSchedule>>(() => Object.fromEntries(coupons.map((coupon) => [coupon.id, scheduleForStore(coupon.store)]))); const couponStorageUserId = getClientUserId(); const favoriteStoresStorageKey = scopedStorageKey("dangam_favorite_stores", couponStorageUserId); const [recentlyClaimedCouponIds, setRecentlyClaimedCouponIds] = useState<number[]>([]); const [favoriteStores, setFavoriteStores] = useState<string[]>(() => { try { const parsed = JSON.parse(window.localStorage.getItem(favoriteStoresStorageKey) ?? "[]"); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []; } catch { return []; } }); useEffect(() => { window.localStorage.setItem(favoriteStoresStorageKey, JSON.stringify(favoriteStores)); }, [favoriteStoresStorageKey, favoriteStores]); const toggleFavoriteStore = (store: string) => { setFavoriteStores((current) => current.includes(store) ? current.filter((item) => item !== store) : [...current, store]); }; const favoriteCouponIdsStorageKey = scopedStorageKey("dangam_favorite_coupon_ids", couponStorageUserId); const [favoriteCouponIds, setFavoriteCouponIds] = useState<number[]>(() => { try { const parsed = JSON.parse(window.localStorage.getItem(favoriteCouponIdsStorageKey) ?? "[]"); return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : []; } catch { return []; } }); useEffect(() => { window.localStorage.setItem(favoriteCouponIdsStorageKey, JSON.stringify(favoriteCouponIds)); }, [favoriteCouponIdsStorageKey, favoriteCouponIds]); const toggleFavoriteCoupon = (couponId: number, store: string) => { setFavoriteCouponIds((current) => current.includes(couponId) ? current.filter((item) => item !== couponId) : [...current, couponId]); toggleFavoriteStore(store); }; const favoriteCampaignIdsStorageKey = scopedStorageKey("dangam_favorite_campaign_ids", couponStorageUserId); const [favoriteCampaignIds, setFavoriteCampaignIds] = useState<string[]>(() => { try { const parsed: unknown = JSON.parse(window.localStorage.getItem(favoriteCampaignIdsStorageKey) ?? "[]"); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []; } catch { return []; } }); useEffect(() => { window.localStorage.setItem(favoriteCampaignIdsStorageKey, JSON.stringify(favoriteCampaignIds)); }, [favoriteCampaignIdsStorageKey, favoriteCampaignIds]); const toggleFavoriteCampaign = (campaign: Campaign) => { const favoriteKey = campaignFavoriteKey(campaign); const wasFavorite = favoriteCampaignIds.includes(favoriteKey); const nextFavoriteIds = wasFavorite ? favoriteCampaignIds.filter((item) => item !== favoriteKey) : [...favoriteCampaignIds, favoriteKey]; setFavoriteCampaignIds(nextFavoriteIds); const allCampaigns = [...remoteCampaigns, ...campaigns]; const anotherCampaignForStore = allCampaigns.some((item) => item.store === campaign.store && nextFavoriteIds.includes(campaignFavoriteKey(item))); const couponForStore = coupons.some((item) => item.store === campaign.store && favoriteCouponIds.includes(item.id)); setFavoriteStores((current) => { if (anotherCampaignForStore || couponForStore || !wasFavorite) return current.includes(campaign.store) ? current : [...current, campaign.store]; return current.filter((store) => store !== campaign.store); }); }; const handleFavoriteCampaignToggle = (campaign: Campaign) => { const wasFavorite = favoriteCampaignIds.includes(campaignFavoriteKey(campaign)); toggleFavoriteCampaign(campaign); showHeaderToast(wasFavorite ? "찜 매장에서 삭제되었습니다." : "찜 매장에 추가되었습니다."); }; const couponIssuedStorageKey = scopedStorageKey("dangam_coupon_issued", couponStorageUserId); const couponReturnedStorageKey = scopedStorageKey("dangam_coupon_returned", couponStorageUserId); const readCouponRecords = (key: string) => { try { const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]"); return Array.isArray(parsed) ? parsed as IssuedCouponRecord[] : []; } catch { return []; } }; const [issuedCoupons, setIssuedCoupons] = useState<IssuedCouponRecord[]>(() => readCouponRecords(couponIssuedStorageKey)); const [returnedCoupons, setReturnedCoupons] = useState<IssuedCouponRecord[]>(() => readCouponRecords(couponReturnedStorageKey)); useEffect(() => { window.localStorage.setItem(couponIssuedStorageKey, JSON.stringify(issuedCoupons)); }, [couponIssuedStorageKey, issuedCoupons]); useEffect(() => { window.localStorage.setItem(couponReturnedStorageKey, JSON.stringify(returnedCoupons)); }, [couponReturnedStorageKey, returnedCoupons]); const [deletedHistoryKeys, setDeletedHistoryKeys] = useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem("dangam_deleted_coupon_history") ?? "[]") as string[]; } catch { return []; } }); const [visitCoupon, setVisitCoupon] = useState<Coupon | null>(null); const [reservationRecordKey, setReservationRecordKey] = useState<string | null>(null); const [barcodeRecord, setBarcodeRecord] = useState<IssuedCouponRecord | null>(null); const [alreadyUsedRecord, setAlreadyUsedRecord] = useState<IssuedCouponRecord | null>(null); const [couponBadgeCount, setCouponBadgeCount] = useState(() => { const saved = window.localStorage.getItem("dangam_unread_coupon_count"); if (saved !== null) return Math.max(0, Number(saved) || 0); return 2; }); const [stockByDealId, setStockByDealId] = useState<Record<number, number>>(() => Object.fromEntries(expiryDeals.map((deal) => [deal.id, deal.remaining]))); const [foodSubcategory, setFoodSubcategory] = useState<string | null>(null); const [foodThirdSubcategory, setFoodThirdSubcategory] = useState<string>("전체"); const [foodView, setFoodView] = useState<"grid" | "scroll">("grid"); const expiryRemainingTotal = Object.values(stockByDealId).reduce((sum, value) => sum + value, 0); const playConsumerNotificationSound = () => { const storedSettings = (() => { try { return JSON.parse(window.localStorage.getItem("dangam_consumer_notification_settings") ?? "{}"); } catch { return {}; } })() as Partial<ConsumerNotificationSettings>; const sound = window.localStorage.getItem("dangam_consumer_sound") || storedSettings.sound || consumerNotificationSettings.sound; const couponAlertsEnabled = window.localStorage.getItem("dangam_notifications") !== "false" && (storedSettings.couponArrival ?? consumerNotificationSettings.couponArrival); const selectedSound = consumerSoundOptions.find((option) => option.value === sound); if (!couponAlertsEnabled || !selectedSound?.file || sound === "none") return; const audio = new Audio(`/assets/audio/${selectedSound.file}`); void audio.play().catch((error) => { console.log("[DanGam notification audio] autoplay was blocked", error); }); }; const markCouponsRead = () => { setCouponBadgeCount(0); window.localStorage.setItem("dangam_unread_coupon_count", "0"); }; const resetCouponWalletScroll = () => { const main = document.querySelector<HTMLElement>(".app-main"); if (main) main.scrollTop = 0; }; const openCoupons = () => { resetCouponWalletScroll(); setNav("coupons"); markCouponsRead(); setCommunityChatListOpen(false); setCommunityChatMeeting(null); }; useEffect(() => { if (nav === "coupons") resetCouponWalletScroll(); }, [nav]); const addUnreadCoupon = () => { playConsumerNotificationSound(); setCouponBadgeCount((current) => { const next = current + 1; window.localStorage.setItem("dangam_unread_coupon_count", String(next)); return next; }); }; const clearTinkerbellTimer = () => {
    if (tinkerbellTimerRef.current !== null) {
      window.clearTimeout(tinkerbellTimerRef.current);
      tinkerbellTimerRef.current = null;
    }
  };
  const persistTinkerbellStatus = (next: TinkerbellStatus) => {
    window.localStorage.setItem(tinkerbellStorageKey, next === "landed" ? "landed" : "idle");
  };
  useEffect(() => {
    const syncTinkerbellStatus = (event: StorageEvent) => {
      if (event.key !== tinkerbellStorageKey) return;
      setTinkerbellStatus(event.newValue === "landed" ? "landed" : "idle");
    };
    window.addEventListener("storage", syncTinkerbellStatus);
    tinkerbellMountedRef.current = true;
    return () => {
      window.removeEventListener("storage", syncTinkerbellStatus);
      tinkerbellMountedRef.current = false;
      clearTinkerbellTimer();
    };
  }, []);
  useEffect(() => {
    if (nav !== "home" && tinkerbellStatus !== "idle" && tinkerbellStatus !== "landed") {
      clearTinkerbellTimer();
      setTinkerbellStatus("idle");
      persistTinkerbellStatus("idle");
    }
  }, [nav, tinkerbellStatus]);
  const openExpiryFeed = () => {
    clearTinkerbellTimer();
    setNav("home");
    setTinkerbellStatus("feed_opened");
    persistTinkerbellStatus("idle");
  };
  const dismissTinkerbell = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearTinkerbellTimer();
    setTinkerbellStatus("flying");
    tinkerbellTimerRef.current = window.setTimeout(() => {
      tinkerbellTimerRef.current = null;
      if (!tinkerbellMountedRef.current) return;
      setTinkerbellStatus("landed");
      persistTinkerbellStatus("landed");
    }, 2500);
  };
  const goHome = () => { setCommunityChatListOpen(false); setCommunityChatMeeting(null); clearTinkerbellTimer(); const nextTinkerbellStatus: TinkerbellStatus = tinkerbellStatus === "feed_opened" ? "idle" : (window.localStorage.getItem(tinkerbellStorageKey) === "landed" ? "landed" : "idle"); setNav("home"); setTinkerbellStatus(nextTinkerbellStatus); persistTinkerbellStatus(nextTinkerbellStatus); setSelectedExpiry(null); setPickupConfirmation(null); setFoodMode(false); setFoodDetailMode(false); setCafeDirectMode(false); setGolfDirectMode(false); setGeneralCategoryMode(null); setCategory(null); setFoodSubcategory(null); setFoodThirdSubcategory("전체"); setSelected(null); setRedeem(null); setVisitCoupon(null); setBarcodeRecord(null); }; const showHeaderToast = (message: string) => { setHeaderToast(message); window.setTimeout(() => setHeaderToast(""), 3000); }; useEffect(() => { if (sortTab !== "마감") return; const timer = window.setInterval(() => setSortClockMs(Date.now()), 60_000); return () => window.clearInterval(timer); }, [sortTab]); useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("membershipPayment");
    if (result !== "success" && result !== "failed") return;
    setNav("my");
    setMembershipRouteRequest(true);
    showHeaderToast(result === "success" ? "결제 결과를 확인하고 있습니다." : "결제를 완료하지 못했습니다.");
    window.setTimeout(() => void membershipStatusQuery.refetch(), 400);
    url.searchParams.delete("membershipPayment");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []); const rememberSearch = (value: string) => { const normalized = value.trim(); if (!normalized) return; setRecentSearches((current) => { const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, 6); window.localStorage.setItem("dangam_recent_searches", JSON.stringify(next)); return next; }); }; const chooseSearch = (value: string) => { const normalized = value.trim(); if (!normalized) return; rememberSearch(normalized); setSearchQuery(normalized); setHeaderSearchOpen(false); if (nav !== "meetings") { setNav("home"); setTinkerbellStatus("idle"); } }; const clearRecentSearches = () => { setRecentSearches([]); window.localStorage.removeItem("dangam_recent_searches"); }; const deleteHistoryKeys = (keys: string[]) => { setDeletedHistoryKeys((current) => { const next = Array.from(new Set([...current, ...keys])); window.localStorage.setItem("dangam_deleted_coupon_history", JSON.stringify(next)); return next; }); showHeaderToast(keys.length > 1 ? "완료 및 만료 내역을 모두 비웠습니다." : "쿠폰 내역이 삭제되었습니다."); }; const updateCouponNotificationBadge = (enabled: boolean) => {
    setIsNotificationEnabled(enabled);
    window.localStorage.setItem("dangam_notifications", String(enabled));
    setConsumerNotificationSettings(current => {
      if (current.couponArrival === enabled) return current;
      const next = { ...current, couponArrival: enabled };
      window.localStorage.setItem("dangam_consumer_notification_settings", JSON.stringify(next));
      return next;
    });
  }; const updateConsumerNotification = (key: keyof ConsumerNotificationSettings, value: boolean | string) => { setConsumerNotificationSettings((current) => { const next = { ...current, [key]: value }; window.localStorage.setItem("dangam_consumer_notification_settings", JSON.stringify(next)); if (key === "sound" && typeof value === "string") window.localStorage.setItem("dangam_consumer_sound", value); if (key === "couponArrival" && typeof value === "boolean") {
        updateCouponNotificationBadge(value);
        if (previewDemo.active) void consumerApi.setCouponAlertPreference(value)
          .then(preference => updateCouponNotificationBadge(preference.couponAlertsEnabled))
          .catch(() => { updateCouponNotificationBadge(!value); showHeaderToast("쿠폰 알림 설정을 저장하지 못했습니다."); });
      } return next; }); }; const submitConsumerInquiry = async (input: { type: ConsumerSupportInquiryType; title: string; content: string }) => { await consumerApi.submitSupportInquiry(input); }; const openMembershipGate = () => { setHeaderToast(""); setMembershipOpen(true); }; const openCouponRedemption = (coupon: Coupon) => { if (couponRequiresMembership(coupon, isServerPremiumMember, isMinor)) { setSelected(null); openMembershipGate(); return; } setRedeem(coupon); setSelected(null); }; const issueCoupon = (coupon: Coupon) => { if (issuedCoupons.some((record) => record.coupon.id === coupon.id)) { showHeaderToast("이미 쿠폰함에 보관된 쿠폰입니다."); return; } if (coupon.remaining <= 0) { showHeaderToast("이 쿠폰은 마감되었습니다."); return; } void downloadCoupon(coupon, () => { setRecentlyClaimedCouponIds((current) => current.includes(coupon.id) ? current : [...current, coupon.id]); window.setTimeout(() => setRecentlyClaimedCouponIds((current) => current.filter((id) => id !== coupon.id)), 180); }); }; const claimCoupon = async (
    coupon: Coupon,
    visitDate: string,
    dateKey: string,
    pickupTime: string,
    partySize: string,
    successMessage: string,
    onSuccess?: (userCouponId: string) => void | Promise<void>,
    reservationAfterClaim = false,
  ) => {
    if (couponRequiresMembership(coupon, isServerPremiumMember, isMinor)) { openMembershipGate(); setVisitCoupon(null); return; }
    try {
      const usesSharedApi = sharedRemoteCouponIds.has(coupon.bridgeCouponId ?? String(coupon.id));
      const selectedDongCode = couponBrowseRegionCodes.find((code) => consumerCouponTargetMatchesRegion(coupon.regionTarget, coupon.targetRegionCodes ?? [], [code]));
      const claimOptions = reservationAfterClaim
        ? { selectedDongCode }
        : { visitDate, pickupTime, partySize: normalizePartySize(partySize), selectedDongCode };
      const claimed = usesSharedApi
        ? await sharedCoupons.claim(coupon.bridgeCouponId ?? String(coupon.id), claimOptions)
        : await consumerApi.claimCoupon(coupon.bridgeCouponId ?? String(coupon.id), claimOptions);
      let reservationError: unknown;
      if (reservationAfterClaim) {
        try {
          if (usesSharedApi) throw new Error("사업자 공유 쿠폰의 예약 endpoint가 연결되지 않았습니다.");
          await onSuccess?.(claimed.id);
        } catch (error) {
          reservationError = error;
        }
      } else {
        await onSuccess?.(claimed.id);
      }
      const nextCoupon = { ...coupon, remaining: Math.max(0, coupon.remaining - 1) };
      const schedule = reservationAfterClaim && reservationError
        ? { visitDate: "방문 예약 미완료", dateKey: simulatedToday, pickupTime: "미정", partySize: "1" }
        : { visitDate, dateKey, pickupTime, partySize };
      setRemoteCoupons((current) => current.map((item) => item.id === coupon.id ? nextCoupon : item));
      setIssuedCoupons((current) => [...current, { coupon: nextCoupon, ...schedule, status: "ACTIVE", issuedAt: Date.now(), userCouponId: claimed.id, apiSource: usesSharedApi ? "shared" : "consumer" }]);
      addUnreadCoupon();
      setVisitCoupon(null);
      showHeaderToast(reservationError
        ? "쿠폰은 발급됐지만 예약 저장에 실패했습니다. 쿠폰함에서 예약을 다시 요청해 주세요."
        : successMessage);
      if (reservationError) console.warn("[서버 예약 생성 실패]", reservationError);
    } catch (error) {
      if (error instanceof ConsumerApiError && error.code === "MEMBER_ONLY") { setVisitCoupon(null); openMembershipGate(); return; }
      showHeaderToast(error instanceof ConsumerApiError ? error.message : "쿠폰 발급에 실패했습니다.");
    }
  };
  const openWalletReservation = (record: IssuedCouponRecord) => { setReservationRecordKey(record.userCouponId ?? String(record.coupon.id)); setVisitCoupon(record.coupon); }; const submitReservationToDashboard = (coupon: Coupon, userCouponId: string, visitDate: string, dateKey: string, pickupTime: string, partySize: string) => {
    if (previewDemo.active) return;
    void submitDashboardReservation.mutateAsync({
      eventId: newDashboardEventId(), clientUserId: dashboardClientUserId,
      displayName: window.localStorage.getItem("dangam_user_profile") ? JSON.parse(window.localStorage.getItem("dangam_user_profile") ?? "{}").nickname : "민",
      userCouponId, couponId: coupon.id, couponTitle: coupon.title, merchantName: coupon.store, merchantStore: coupon.store,
      visitDate, dateKey, visitTime: pickupTime, partySize: Number(partySize),
    }).catch((error) => console.warn("[대시보드 예약 전송 실패]", error));
  };
  const saveReservationPhoneConsent = (coupon: Coupon, userCouponId: string) => {
    if (previewDemo.active) return;
    window.localStorage.setItem(`dangam_reservation_phone_consent_${userCouponId}`, JSON.stringify({ phone: consumerPhoneForReservation(), agreedAt: new Date().toISOString(), merchant: coupon.store }));
  };
  const openReservationChat = (coupon: Coupon, userCouponId: string, visitDate: string, pickupTime: string, partySize: string) => {
    const numericKey = Math.abs(Array.from(`${userCouponId}-${coupon.id}`).reduce((hash, char) => ((hash * 31 + char.charCodeAt(0)) | 0), 17));
    const meetingId = -3000000000 - (numericKey % 900000000);
    const reservationMessage = `예약 확정 · ${visitDate} ${pickupTime} · ${partySize}`;
    saveReservationPhoneConsent(coupon, userCouponId);
    setReservationChatMeeting({ id: meetingId, title: `${coupon.store} · 방문 예약 문의`, place: coupon.store, address: `${coupon.store} 업소 문의`, schedule: `${visitDate} ${pickupTime}`, members: "2/2", benefit: reservationMessage, icon: "1:1", tone: "orange", image: coupon.image ?? coupon.mediaUrl ?? couponMediaImageFor(coupon.store, coupon.category), manager: "업소", organizerName: "업소", maxMembers: 2, isExperienceDirectChat: true, isReservationDirectChat: true, category: "카페/소통" });
  };
  const updateWalletReservation = async (visitDate: string, dateKey: string, pickupTime: string, partySize: string, message: string, phoneShareAgreed = false) => {
    if (!reservationRecordKey || !visitCoupon) return;
    const reservationCoupon = visitCoupon;
    const reservationUserCouponId = reservationRecordKey;
    const record = issuedCoupons.find((item) => (item.userCouponId ?? String(item.coupon.id)) === reservationRecordKey);
    if (!record?.userCouponId || record.apiSource === "shared" || reservationCoupon.usageApiType !== "RESERVATION") {
      showHeaderToast("이 쿠폰은 연결된 서버 예약 기능을 사용할 수 없습니다. 쿠폰 상태는 변경하지 않았습니다.");
      return;
    }
    try {
      await consumerApi.createReservation({
        userCouponId: reservationUserCouponId,
        usageType: "RESERVATION",
        visitDate: dateKey,
        visitTime: pickupTime,
        partySize: normalizePartySize(partySize),
      });
    } catch (error) {
      showHeaderToast(error instanceof ConsumerApiError ? error.message : "예약을 저장하지 못했습니다.");
      return;
    }
    setIssuedCoupons((current) => current.map((item) => (item.userCouponId ?? String(item.coupon.id)) === reservationRecordKey ? { ...item, visitDate, dateKey, pickupTime, partySize } : item));
    setVisitCoupon(null);
    setReservationRecordKey(null);
    showHeaderToast(message);
    submitReservationToDashboard(reservationCoupon, reservationUserCouponId, visitDate, dateKey, pickupTime, partySize);
    if (phoneShareAgreed) saveReservationPhoneConsent(reservationCoupon, reservationUserCouponId);
  };
  const confirmCouponIssue = (coupon: Coupon, visitDate: string, dateKey: string, pickupTime: string, partySize: string, phoneShareAgreed = false) => {
    if (coupon.usageApiType !== "RESERVATION") {
      showHeaderToast("이 쿠폰은 서버 예약을 지원하지 않습니다.");
      setVisitCoupon(null);
      return;
    }
    return claimCoupon(coupon, visitDate, dateKey, pickupTime, partySize, `방문 예약 완료! [${visitDate} ${pickupTime}] 방문 일정이 등록되었습니다.`, async (userCouponId) => {
      await consumerApi.createReservation({ userCouponId, usageType: "RESERVATION", visitDate: dateKey, visitTime: pickupTime, partySize: normalizePartySize(partySize) });
      submitReservationToDashboard(coupon, userCouponId, visitDate, dateKey, pickupTime, partySize);
      if (phoneShareAgreed) saveReservationPhoneConsent(coupon, userCouponId);
    }, true);
  };
  const saveCouponToWallet = (coupon: Coupon, visitDate: string, dateKey: string, pickupTime: string, partySize: string) => claimCoupon(coupon, visitDate, dateKey, pickupTime, partySize, "쿠폰함에 저장되었습니다!"); 
  const downloadCoupon = (coupon: Coupon, onSuccess?: () => void) => claimCoupon(coupon, "방문 예정 없음", simulatedToday, "미정", "1", "쿠폰이 쿠폰함에 보관되었습니다!", onSuccess); const handleCouponDownload = (coupon: Coupon) => issueCoupon(coupon); const saveOrderCoupon = (coupon: Coupon, day: string, time: string, people: string) => { const dayOffset = day === "내일" ? 1 : day === "모레" ? 2 : 0; const dateKey = addDateKeyDays(simulatedToday, dayOffset); return claimCoupon(coupon, `${day} ${time}`, dateKey, time, people, "쿠폰함에 저장되었습니다!"); }; const returnCoupon = async (record: IssuedCouponRecord, status: CouponStatus = "EXPIRED", returnReason: "CANCELLED" | "EXPIRED" = "EXPIRED") => { if (record.apiSource === "shared") { if (!record.userCouponId) { showHeaderToast("쿠폰 식별 정보를 확인할 수 없어 취소하지 않았습니다."); return; } try { await sharedCoupons.returnClaim(record.userCouponId); await sharedCoupons.refresh(); } catch (error) { showHeaderToast(error instanceof Error ? error.message : "쿠폰 취소에 실패했습니다."); return; } showHeaderToast("보유 쿠폰이 취소되고 발급 가능 수량이 복구되었습니다."); return; } if (record.userCouponId) { try { await consumerApi.returnCoupon(record.userCouponId); } catch (error) { showHeaderToast(error instanceof ConsumerApiError ? error.message : "쿠폰 취소에 실패했습니다."); return; } } setIssuedCoupons((current) => current.filter((item) => record.userCouponId ? item.userCouponId !== record.userCouponId : item.coupon.id !== record.coupon.id)); setReturnedCoupons((current) => [{ ...record, status, returnedAt: Date.now(), returnReason }, ...current]); setStockByCouponId((current) => ({ ...current, [record.coupon.id]: (current[record.coupon.id] ?? record.coupon.remaining) + 1 })); showHeaderToast(`쿠폰이 회수되었습니다. ${record.coupon.store} 재고가 1개 복구되었습니다.`); }; const openCouponUsage = (record: IssuedCouponRecord) => { setBarcodeRecord(record); }; const completeCouponRedemption = async (record: IssuedCouponRecord, storePin?: string) => { if (!/^\d{4}$/.test(storePin ?? "")) throw new Error("매장 고유 PIN 4자리를 입력해 주세요."); if (record.apiSource === "shared") throw new Error("사업자 PIN 검증 API가 연결되지 않아 쿠폰 상태를 변경하지 않았습니다."); if (!record.userCouponId) throw new Error("서버에서 발급한 쿠폰만 사용할 수 있습니다. 쿠폰을 다시 불러와 주세요."); await consumerApi.useCoupon(record.userCouponId, { pin: storePin, verificationMethod: "MERCHANT_PIN", usageType: record.coupon.usageApiType ?? "VISIT" }); const usedAt = new Date().toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }); setIssuedCoupons((current) => current.filter((item) => item.userCouponId !== record.userCouponId)); setReturnedCoupons((current) => [{ ...record, status: "USED", usedAt }, ...current]); showHeaderToast("쿠폰 사용이 완료되었습니다."); }; useEffect(() => { const handleBulkVisit = (event: Event) => { const auth = (event as CustomEvent<MeetingBulkVisitAuth>).detail; if (!auth?.store) return; const candidates = findBulkVisitCandidates(issuedCoupons, auth); if (!candidates.length) return; showHeaderToast("단체 방문 인증은 매장 서버 검증이 연결되지 않아 쿠폰 상태를 변경하지 않았습니다."); }; const handleBulkVisitStorage = (event: StorageEvent) => { if (!event.key?.startsWith("dangam_meeting_bulk_visit_") || !event.newValue) return; try { handleBulkVisit(new CustomEvent("dangam:meeting-bulk-visit", { detail: JSON.parse(event.newValue) })); } catch { /* ignore malformed demo state */ } }; window.addEventListener("dangam:meeting-bulk-visit", handleBulkVisit); window.addEventListener("storage", handleBulkVisitStorage); return () => { window.removeEventListener("dangam:meeting-bulk-visit", handleBulkVisit); window.removeEventListener("storage", handleBulkVisitStorage); }; }, [issuedCoupons]); const recoverExpiredCoupons = () => { const expired = issuedCoupons.filter((record) => record.dateKey < simulatedToday); if (!expired.length) return; expired.forEach((record) => returnCoupon(record)); }; useEffect(() => { recoverExpiredCoupons(); }, [issuedCoupons]); const reserveExpiry = (deal: ExpiryDeal) => { const remaining = stockByDealId[deal.id] ?? deal.remaining; if (remaining <= 0) { showHeaderToast("마감된 상품입니다."); return; } if (deal.sourceCoupon) { setVisitCoupon(deal.sourceCoupon); return; } setVisitCoupon({ id: 900000 + deal.id, usage_type: "매장 방문", store: deal.store, title: deal.title, description: "마감특가 매장 방문 예약", category: "식당·맛집", discount: deal.discount, discountValue: Number(deal.discount.replace(/[^0-9]/g, "")) || 0, remaining, total: remaining, distanceM: Number(deal.distance.replace(/[^0-9]/g, "")) || 0, expiry: "오늘부터 3일", usageStartDate: simulatedToday, usageEndDate: simulatedToday, price: deal.salePrice, color: deal.color, accent: "#ea580c", address: deal.address, rating: 0, reviews: 0, usage: "매장 방문", thumb: "" }); }; useEffect(() => { let active = true; setApiLoaded(false); consumerApi.listCoupons({}).then((data) => { if (active) setRemoteCoupons(data.map(mapApiCoupon)); }).catch((error) => { if (active) setHeaderToast(error instanceof ConsumerApiError ? error.message : "공통 쿠폰 API를 불러오지 못했습니다."); }).finally(() => { if (active) setApiLoaded(true); }); return () => { active = false; }; }, []); const saveCampaignApplication = async (application: CampaignApplication): Promise<CampaignApplication> => {
    let savedApplication = application;
    if (application.centralCampaignId) {
      const response = await consumerApi.applyToCampaign(application.centralCampaignId, {
        nickname: "체험단 신청자",
        channels: application.channels.split(",").map((value) => value.trim()).filter(Boolean),
        preferredDate: application.visitDate,
        preferredTime: application.visitTime,
        motivation: application.promise,
      });
      savedApplication = { ...application, id: `central:${response.publicId}`, centralApplicationId: response.publicId, centralCampaignId: response.campaignPublicId, status: "WAITING" };
    }
    setCampaignApplications((current) => {
      const next = [savedApplication, ...current.filter((item) => item.centralApplicationId !== savedApplication.centralApplicationId)];
      window.localStorage.setItem("dangam_campaign_applications", JSON.stringify(next));
      return next;
    });
    setExperienceUnread(false);
    window.localStorage.setItem("dangam_experience_unread", "false");
    setNav("coupons");
    setHistoryRequest((current) => current + 1);
    return savedApplication;
  }; const openCampaignHistory = () => { setNav("coupons"); setHistoryRequest((current) => current + 1); }; const updateCampaignApplication = (application: CampaignApplication) => { setCampaignApplications((current) => { const next = current.map((item) => item.id === application.id ? application : item); window.localStorage.setItem("dangam_campaign_applications", JSON.stringify(next)); return next; }); if (application.status !== "NOT_SELECTED") { setExperienceUnread(true); window.localStorage.setItem("dangam_experience_unread", "true"); } }; const cancelCampaignApplication = (applicationId: string) => { setCampaignApplications((current) => { const next = current.filter((application) => application.id !== applicationId); window.localStorage.setItem("dangam_campaign_applications", JSON.stringify(next)); return next; }); }; const sharedRemoteCoupons = useMemo(() => sharedCoupons.consumerCards.map(mapApiCoupon), [sharedCoupons.consumerCards]); useEffect(() => { if (!previewDemo.active) return; const categorySet = new Set([...coupons, ...remoteCoupons, ...sharedRemoteCoupons].filter((coupon) => favoriteCouponIds.includes(coupon.id)).map((coupon) => coupon.category)); void consumerApi.setFavoriteCriteria([], [...categorySet], favoriteStores).catch(() => undefined); }, [previewDemo.active, favoriteStores, favoriteCouponIds, remoteCoupons, sharedRemoteCoupons]);
  const sharedRemoteCouponIds = useMemo(() => new Set(sharedRemoteCoupons.map((coupon) => String(coupon.bridgeCouponId ?? coupon.id))), [sharedRemoteCoupons]);
  const previousAdultEligibility = useRef(false);
  useEffect(() => {
    if (previousAdultEligibility.current && !sharedCoupons.isVerifiedAdult) {
      setSelected(null); setReviewFocusClaimKey(null); setMediaViewer(null); setStoreMap(null);
    }
    previousAdultEligibility.current = sharedCoupons.isVerifiedAdult;
  }, [sharedCoupons.isVerifiedAdult]);
  useEffect(() => {
    if (selectedSource !== "home" || !selected?.bridgeCouponId) return;
    if (!sharedRemoteCouponIds.has(String(selected.bridgeCouponId))) {
      setSelected(null);
      setReviewFocusClaimKey(null);
    }
  }, [selected, selectedSource, sharedRemoteCouponIds]);
  const sharedSpecialCoupons = useMemo(() => {
    const selectedCodes = canonicalManualRegionCodes(couponBrowseRegionCodes);
    const sourceCoupons = previewDemo.active && !centralPreviewFeedEnabled ? remoteCoupons : sharedRemoteCoupons;
    return sourceCoupons.filter((coupon) => {
      if (!sharedCoupons.isVerifiedAdult && isAdultRestrictedStoreCategory(coupon.storeCategory ?? coupon.category)) return false;
      if (coupon.couponType !== "special" || isSpecialCouponExpired(coupon.usageEndDate, coupon.specialCutoffTime, new Date(specialFeedNow))) return false;
      return consumerCouponTargetMatchesRegion(coupon.regionTarget, coupon.targetRegionCodes ?? [], selectedCodes);
    });
  }, [sharedRemoteCoupons, remoteCoupons, specialFeedNow, couponBrowseIsExplicit, couponBrowseRegionCodes, previewDemo.active, centralPreviewFeedEnabled, sharedCoupons.isVerifiedAdult]);
  const specialExpiryDeals = useMemo<ExpiryDeal[]>(() => sharedSpecialCoupons.map((coupon) => ({ id: coupon.id, sourceCoupon: coupon, store: coupon.store, title: coupon.title, category: "당일 특가", originalPrice: coupon.originalPrice ?? coupon.price, salePrice: coupon.price, discount: coupon.discount, remaining: coupon.remaining, deadline: formatSpecialCouponCutoff(coupon.usageEndDate, coupon.specialCutoffTime, new Date(specialFeedNow)), distance: `${coupon.distanceM}m`, walkingMinutes: Math.max(1, Math.ceil(coupon.distanceM / 80)), phone: merchantPhoneFor(coupon), icon: coupon.thumb || "", color: coupon.color, address: coupon.address, pickupTip: "매장 방문 후 쿠폰을 제시해 주세요." })), [sharedSpecialCoupons, specialFeedNow]);
  const sharedWalletState = useMemo(() => {
    const records = sharedCoupons.wallet.map((item) => {
      const couponDto = walletSnapshotToConsumerDto(item.snapshot, item.coupon_id);
      const activeFeedCoupon = sharedRemoteCoupons.find((candidate) => String(candidate.bridgeCouponId ?? candidate.id) === String(couponDto.couponId));
      const mappedCoupon = activeFeedCoupon ?? mapApiCoupon(couponDto);
      const coupon = { ...mappedCoupon, id: stableNumericId(item.id), bridgeCouponId: couponDto.couponId };
      const apiStatus = String(item.effective_status || item.status).toUpperCase();
      const status: CouponStatus = apiStatus === "REDEEMED" || apiStatus === "USED" ? "USED" : apiStatus === "EXPIRED" ? "EXPIRED" : apiStatus === "REVOKED" || apiStatus === "RETURNED" ? "RETURNED" : "ACTIVE";
      const claimedAt = Date.parse(item.claimed_at);
      const dateKey = Number.isFinite(claimedAt) ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(claimedAt)) : simulatedToday;
      const usedAt = item.redeemed_at ? new Date(item.redeemed_at).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : undefined;
      return {
        coupon,
        visitDate: item.snapshot.redemptionOptions?.visitDate ?? "방문 예정 없음",
        dateKey,
        pickupTime: item.snapshot.redemptionOptions?.pickupTime ?? "미정",
        partySize: item.snapshot.redemptionOptions?.partySize ? `${item.snapshot.redemptionOptions.partySize}명` : "1명",
        status,
        issuedAt: Number.isFinite(claimedAt) ? claimedAt : undefined,
        usedAt: status === "USED" ? usedAt ?? "서버 사용 완료" : undefined,
        returnedAt: status === "RETURNED" || status === "EXPIRED" ? (Number.isFinite(claimedAt) ? claimedAt : undefined) : undefined,
        returnReason: status === "EXPIRED" ? "EXPIRED" as const : status === "RETURNED" ? "CANCELLED" as const : undefined,
        userCouponId: item.id,
        apiSource: "shared" as const,
      };
    });
    return {
      active: records.filter((record) => record.status === "ACTIVE"),
      history: records.filter((record) => record.status !== "ACTIVE"),
    };
  }, [sharedCoupons.wallet, sharedRemoteCoupons]);
  const sharedWalletRecords = sharedWalletState.active;
  const sharedWalletHistoryRecords = sharedWalletState.history;
  const verifiedReviewClaimForCoupon = (coupon: Coupon, preferredClaimId?: string | null) => {
    const couponId = String(coupon.bridgeCouponId ?? coupon.id);
    const eligible = sharedWalletHistoryRecords.filter((record) => record.status === "USED" && record.apiSource === "shared" && record.userCouponId && String(record.coupon.bridgeCouponId ?? record.coupon.id) === couponId);
    return eligible.find((record) => record.userCouponId === preferredClaimId)?.userCouponId ?? eligible[0]?.userCouponId ?? null;
  };
  const visible = useMemo(() => { const sourceCoupons = selectHomeCouponFeed({ nearbySearchActive, nearbyCoupons: nearbySearchCoupons, centralPreviewConfigured: centralPreviewFeedEnabled, centralCoupons: sharedRemoteCoupons, previewDemoActive: previewDemo.active, previewCoupons, remoteCoupons }).filter((coupon) => coupon.couponType !== "special" && (sharedCoupons.isVerifiedAdult || !isAdultRestrictedStoreCategory(coupon.storeCategory ?? coupon.category)));
    const selectedCodes = consumerBrowseRegionCodes(couponBrowseRegionCodes);
    const categorized = sourceCoupons.filter((coupon) => { const subcategoryMatches = !foodSubcategory || (homeSubcategoryMatchers[foodSubcategory] ? homeSubcategoryMatchers[foodSubcategory].test(`${coupon.store} ${coupon.title} ${coupon.description}`) : coupon.category === category); return (!category || coupon.category === category) && subcategoryMatches; }).map((coupon) => {
      const distanceM = nearbySearchActive ? coupon.distanceM ?? Number.POSITIVE_INFINITY : distanceForCoupon(coupon, couponSortOrigin);
      return { ...coupon, distanceM, sortDistanceM: distanceM };
    });
    const areaFiltered = nearbySearchActive ? categorized : categorized.filter((coupon) => consumerCouponBrowseTargetMatchesRegion(coupon.regionTarget, coupon.targetRegionCodes ?? [], selectedCodes));
    const nearby = areaFiltered.filter((coupon) => (coupon.sortDistanceM ?? Number.POSITIVE_INFINITY) <= DEFAULT_SEARCH_RADIUS_METERS); const radiusFiltered = distanceEnabled ? nearby : areaFiltered; const locationAwareList = areaFiltered; let list = [...locationAwareList].sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0)); list = sortHomeCoupons(list, sortTab, new Date(sortClockMs)); if (feedTab === "정회원 전용관") list = list.filter(isVipOnlyCoupon); if (searchQuery.trim()) { const query = searchQuery.trim().toLowerCase(); list = list.filter((coupon) => `${coupon.store} ${coupon.title} ${coupon.category} ${coupon.address}`.toLowerCase().includes(query)); } const claimedCouponIds = new Set([...issuedCoupons, ...sharedWalletRecords].map((record) => String(record.coupon.bridgeCouponId ?? record.coupon.id))); list = list.filter((coupon) => !claimedCouponIds.has(String(coupon.bridgeCouponId ?? coupon.id)) || recentlyClaimedCouponIds.includes(coupon.id)); return list; }, [category, foodMode, golfDirectMode, generalCategoryMode, foodSubcategory, foodDetailMode, foodThirdSubcategory, feedTab, sortTab, apiLoaded, remoteCoupons, sharedRemoteCoupons, sharedCoupons.isVerifiedAdult, previewDemo.active, centralPreviewFeedEnabled, nearbySearchActive, nearbySearchCoupons, userPosition, couponSortOrigin, sortClockMs, distanceEnabled, searchQuery, couponBrowseRegionCodes, couponBrowseIsExplicit, issuedCoupons, recentlyClaimedCouponIds]);  const couponFeedEmptyState = homeCouponFeedEmptyState({ centralPreviewConfigured: centralPreviewFeedEnabled, error: sharedCoupons.error, sortTab });
  const selectedCouponRecommendations = useMemo(() => {
    if (!selected || selectedSource !== "home") return [];
    const candidates = visible.map((coupon) => ({ ...coupon, remaining: stockByCouponId[coupon.id] ?? coupon.remaining }));
    return getCouponRecommendations(selected, candidates, 5, couponBrowseRegionCodes);
  }, [selected, selectedSource, visible, stockByCouponId, couponBrowseRegionCodes]);

  useEffect(() => {
    if (sharedCoupons.isVerifiedAdult || (catalogCategoryFilter !== "주류/유흥" && catalogCategoryFilter !== "숙박")) return;
    setCatalogCategoryFilter("전체"); setCategory(null); setFoodMode(false); setFoodDetailMode(false); setGeneralCategoryMode(null); setFoodSubcategory(null); setFoodThirdSubcategory("전체");
  }, [catalogCategoryFilter, sharedCoupons.isVerifiedAdult]);
  const effectiveCatalogCategoryFilter = safeCouponCatalogCategory(catalogCategoryFilter, sharedCoupons.isVerifiedAdult);
  const catalogVisible = useMemo(() => filterCouponCatalog(visible, effectiveCatalogCategoryFilter, sharedCoupons.isVerifiedAdult), [visible, effectiveCatalogCategoryFilter, sharedCoupons.isVerifiedAdult]);

  const resetNearbyCouponSearch = () => {
    setNearbySearchActive(false);
    setNearbySearchCoupons([]);
    setNearbySearchLoading(false);
  };

  const openManualLocationPicker = () => {
    nearbySearchRequestId.current += 1;
    resetNearbyCouponSearch();
    setLocationOpen(true);
  };

  const selectCouponSort = (next: CouponSortTab) => {
    if (next !== "거리") {
      distanceSortRequestId.current += 1;
      setSortTab(next);
      return;
    }
    if (!navigator.geolocation) {
      showHeaderToast("거리순 정렬을 위해 현재 위치를 확인할 수 없습니다.");
      return;
    }
    const requestId = ++distanceSortRequestId.current;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== distanceSortRequestId.current) return;
        const point = parseCurrentLocationPoint(position.coords.latitude, position.coords.longitude);
        if (!point) {
          showHeaderToast("현재 위치 좌표를 확인하지 못했습니다. 다시 시도해 주세요.");
          return;
        }
        setCouponSortOrigin(point);
        setSortTab("거리");
        showHeaderToast("소비자의 현재 위치에서 가까운 쿠폰부터 표시합니다.");
      },
      (error) => {
        if (requestId !== distanceSortRequestId.current) return;
        const message = error.code === 1
          ? "위치 권한이 거부되었습니다. 브라우저 설정을 확인해 주세요."
          : error.code === 2
            ? "현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.";
        showHeaderToast(message);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  const searchCouponsNearCurrentLocation = () => {
    const requestId = ++nearbySearchRequestId.current;
    setNearbySearchActive(true);
    setNearbySearchCoupons([]);
    setNearbySearchLoading(false);
    if (!navigator.geolocation) {
      resetNearbyCouponSearch();
      showHeaderToast("이 브라우저에서는 현 위치를 확인할 수 없습니다. 선택한 동네 쿠폰을 표시합니다.");
      return;
    }
    setNearbySearchLoading(true);
    showHeaderToast("현 위치를 확인하고 5km 이내 쿠폰을 검색하고 있습니다.");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (requestId !== nearbySearchRequestId.current) return;
        const point = parseCurrentLocationPoint(position.coords.latitude, position.coords.longitude);
        if (!point) {
          resetNearbyCouponSearch();
          showHeaderToast("현 위치 좌표를 확인하지 못했습니다. 선택한 동네 쿠폰을 표시합니다.");
          return;
        }
        try {
          const rows = await sharedCoupons.nearbyFeed(point);
          if (requestId !== nearbySearchRequestId.current) return;
          setCouponSortOrigin(point);
          const coupons = rows.map((row) => {
            const coupon = mapApiCoupon(row);
            const storePoint = registeredPointForCoupon(coupon);
            return { ...coupon, distanceM: storePoint ? haversineDistanceMeters(point, storePoint) : Number.POSITIVE_INFINITY };
          });
          setNearbySearchCoupons(coupons);
          showHeaderToast(coupons.length > 0 ? `현 위치 5km 이내 쿠폰 ${coupons.length}개를 찾았습니다.` : "현 위치 5km 이내 쿠폰이 없습니다.");
        } catch {
          if (requestId !== nearbySearchRequestId.current) return;
          resetNearbyCouponSearch();
          showHeaderToast("현 위치 주변 쿠폰을 불러오지 못했습니다. 선택한 동네 쿠폰을 표시합니다.");
        } finally {
          if (requestId === nearbySearchRequestId.current) setNearbySearchLoading(false);
        }
      },
      (error) => {
        if (requestId !== nearbySearchRequestId.current) return;
        resetNearbyCouponSearch();
        const message = error.code === 1
          ? "위치 권한이 거부되었습니다. 선택한 동네 쿠폰을 표시합니다."
          : error.code === 3
            ? "현 위치 확인 시간이 초과되었습니다. 선택한 동네 쿠폰을 표시합니다."
            : "현 위치를 확인할 수 없습니다. 선택한 동네 쿠폰을 표시합니다.";
        showHeaderToast(message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };
  const completeSalesPartnerAfterSubscription = () => {
    window.localStorage.removeItem("dangam_partner_pending_application");
    setPartnerPerformancePaid(true);
    window.localStorage.setItem("dangam_local_sales_partner_status", "ACTIVE");
    window.localStorage.setItem("dangam_partner_type", "SALES");
    window.localStorage.setItem(SALES_PARTNER_CODE_STORAGE_KEY, SALES_PARTNER_CODE);
    window.dispatchEvent(new CustomEvent(PARTNER_IDENTIFIERS_CHANGED_EVENT));
    setNav("my");
    window.dispatchEvent(new Event("dangam:settings-root-request"));
    showHeaderToast("정회원 구독이 확인되어 영업 파트너 신청이 완료되었습니다.");
  };
  useEffect(() => {
    if (!membershipStatus.active) return;
    let pending: Partial<PartnerApplicationData> | null = null;
    try { pending = JSON.parse(window.localStorage.getItem("dangam_partner_pending_application") ?? "null") as Partial<PartnerApplicationData> | null; } catch { return; }
    if (!pending) return;
    if (pending.isPartnerApplication) completeSalesPartnerAfterSubscription();
    else {
      window.localStorage.removeItem("dangam_partner_pending_application");
      showHeaderToast("정회원 멤버십 구독이 시작되었습니다.");
    }
  }, [membershipStatus.active]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase(); const isMeetingSearch = nav === "meetings"; const meetingSearchSuggestions = ["반려동물", "반려동물/산책", "번개", "밥/술 번개", "카페/소통", "러닝/운동", "골프/스크린"].map((label) => ({ label, query: label, type: "모임" })); const matchedSearchSuggestions = (isMeetingSearch ? meetingSearchSuggestions : SEARCH_SUGGESTIONS).filter((item) => `${item.label} ${item.query}`.toLowerCase().includes(normalizedSearchQuery)); return <div className="device-stage"><div className="app-frame"> {headerToast && <div className="header-action-toast" role="status">{headerToast}</div>}{!partnerGuideOpen && <header className={`app-header compact-dangam-header ${tinkerbellStatus ? "header-impact" : ""} ${tinkerbellStatus === "feed_opened" ? "expiry-mode-header" : ""}`}><div className="header-leading">{nav === "meetings" ? <button type="button" className="header-town-button community-town-button" onClick={() => { communityLocationActionsRef.current?.chooseRegion(); setLocationOpen(true); }} aria-label="동네 선택 변경"><span className="header-town-line"><MapPin size={17} /><strong className="header-town-summary">동네 선택</strong><ChevronDown size={16} /></span></button> : nav === "experience" ? <button type="button" className="header-town-button experience-target-button" onClick={() => setLocationOpen(true)} aria-label="체험단 타겟 검색 지역 선택"><span className="header-town-line"><strong>타겟 검색</strong><ChevronDown size={16} /></span></button> : <button type="button" className="header-town-button" onClick={openManualLocationPicker} aria-label="현재 동네 변경"><span className="header-town-line"><MapPin size={17} /><strong className="header-town-summary">{couponBrowseDongs.length > 0 ? formatCompactNeighborhoodLabel(couponBrowseDongs) : "동네 선택"}</strong><ChevronDown size={16} /></span></button>}</div><span className="header-usage-wrap">{(nav === "home" || nav === "coupons") ? <button type="button" className="header-current-location-button" onClick={searchCouponsNearCurrentLocation} aria-label="GPS로 현 위치 5km 이내 쿠폰 검색" aria-busy={nearbySearchLoading}><MapPin size={15} /><span>{nearbySearchLoading ? "위치 확인 중…" : "현 위치"}</span></button> : nav === "meetings" && !communityChatMeeting && !communityChatListOpen ? <button type="button" className="header-current-location-button" onClick={() => communityLocationActionsRef.current?.searchCurrentLocation()} aria-label="현 위치에서 커뮤니티 5km 탐색" aria-busy={communityLocationBusy} disabled={communityLocationBusy}><MapPin size={15} /><span>{communityLocationBusy ? "위치 확인 중…" : "현 위치"}</span></button> : nav === "experience" ? <span className="header-experience-title">체험단 지원</span> : null}</span><span className="header-landing-gap" aria-hidden="false">{nav === "home" && tinkerbellStatus === "landed" && !locationOpen && <button type="button" className="expiry-tinkerbell-landed" aria-label="안착한 팅커벨을 눌러 마감 특가 다시 보기" onClick={openExpiryFeed}><img src="/tinkerbell-gift-fairy.webp" alt="팅커벨" /><span>✦</span></button>}</span><div className="header-right compact-header-actions"><button type="button" className="header-icon-button" aria-label="검색창 열기" onClick={() => setHeaderSearchOpen((current) => !current)}><Search size={20} /></button><button className={`header-bell header-icon-button ${isNotificationEnabled ? "enabled" : "disabled"}`} aria-label={isNotificationEnabled ? `알림 내역 열기${appUnreadCount > 0 ? `, 읽지 않은 알림 ${appUnreadCount}개` : ""}` : `쿠폰 알림은 꺼져 있습니다. 필수 알림함 열기${appUnreadCount > 0 ? `, 읽지 않은 알림 ${appUnreadCount}개` : ""}`} onClick={() => { playConsumerNotificationSound(); setNotificationsOpen(true); }}>{isNotificationEnabled ? <Bell size={20} /> : <BellOff size={20} />}{isNotificationEnabled && <i className="header-preference-dot" />}{appUnreadCount > 0 && <span className="header-unread-count" aria-hidden="true">{appUnreadCount}</span>}</button></div>{headerSearchOpen && <><button type="button" className="header-search-backdrop" aria-label="검색창 닫기" onClick={() => setHeaderSearchOpen(false)} /><div className="header-inline-search"><div className="header-search-input-row"><Search size={18} aria-hidden="true" /><input autoFocus type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") rememberSearch(searchQuery); }} placeholder={isMeetingSearch ? "찾고 싶은 모임을 검색해보세요" : "원하는 매장이나 할인 쿠폰을 검색해보세요"} aria-label={isMeetingSearch ? "모임 검색" : "원하는 매장이나 할인 쿠폰 검색"} />{searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="검색어 지우기"><X size={18} /></button>}</div><div className="header-search-results">{normalizedSearchQuery ? (matchedSearchSuggestions.length ? matchedSearchSuggestions.map((item) => <button type="button" className="search-suggestion-item" key={`${item.type}-${item.label}`} onClick={() => chooseSearch(item.query)}><span><strong>{item.label}</strong><small>{item.type}</small></span><ChevronRight size={16} /></button>) : <p className="search-empty">일치하는 추천 검색어가 없어요. 입력한 단어로 바로 검색합니다.</p>) : <><div className="search-section-title">인기 검색어</div><div className="popular-search-chips">{POPULAR_SEARCHES.map((item) => <button type="button" key={item} onClick={() => chooseSearch(item)}>{item}</button>)}</div><div className="search-section-heading"><strong>최근 검색어</strong>{recentSearches.length > 0 && <button type="button" onClick={clearRecentSearches}>전체 삭제</button>}</div>{recentSearches.length ? <div className="recent-search-list">{recentSearches.map((item) => <button type="button" key={item} onClick={() => chooseSearch(item)}>{item}</button>)}</div> : <p className="search-empty">최근 검색어가 없어요.</p>}</>}</div></div></>}</header>}<main className={`app-main ${nav === "meetings" && communityChatListOpen ? "is-community-chat-list" : ""}`}>{nav === "home" && (tinkerbellStatus === "idle" || tinkerbellStatus === "flying") && !locationOpen && <>
          <div className={`expiry-tinkerbell-fab ${tinkerbellStatus === "flying" ? "is-flying" : ""}`}>
            <button type="button" className="expiry-tinkerbell-hit-area" onClick={openExpiryFeed} aria-label="마감 특가 혜택 둘러보기">
              <span className="expiry-tinkerbell-sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>·</i></span>
              <span className="expiry-tinkerbell-trail" aria-hidden="true"><i>✦</i><i>✧</i><i>✶</i><i>✦</i><i>✧</i><i>✶</i><i>✦</i><i>✧</i><i>✶</i><i>✦</i><i>✧</i><i>✶</i><i>✦</i><i>✧</i><i>✶</i><i>✦</i></span>
              <span className="expiry-tinkerbell-character" aria-hidden="true"><img src="/expiry-fairy-silhouette.png" alt="" /></span>
              <span className="expiry-tinkerbell-copy"><strong>마감특가</strong></span>
            </button>
            <button type="button" className="expiry-tinkerbell-dismiss" aria-label="마감 특가 팅커벨 닫기" onClick={dismissTinkerbell}>×</button>
          </div>
          {tinkerbellStatus === "flying" && <span className="expiry-fab-impact-burst" aria-hidden="true">✦ ✧ ✨</span>}
        </>}{nav === "home" && tinkerbellStatus !== "feed_opened" && <><TargetedCouponHomeSlot api={sharedApi} /><CouponCatalogCategoryFilter isVerifiedAdult={sharedCoupons.isVerifiedAdult} value={effectiveCatalogCategoryFilter} onChange={(value) => { setCatalogCategoryFilter(value); setCategory(value === "전체" ? null : value); setFoodMode(false); setFoodDetailMode(false); setGeneralCategoryMode(null); setFoodSubcategory(null); setFoodThirdSubcategory("전체"); }} /><div className={`home-subcategory-row ${category ? "open" : ""}`} aria-label="세부 카테고리" aria-hidden={!category}>{(category ? homeSubcategoriesByCategory[category] ?? [] : []).map((subcategory) => <button type="button" key={subcategory} className={foodSubcategory === subcategory ? "active" : ""} aria-pressed={foodSubcategory === subcategory} onClick={() => setFoodSubcategory(subcategory)}>{subcategory}</button>)}</div><div className="coupon-sort-bar" role="tablist" aria-label="쿠폰 정렬"><button type="button" role="tab" aria-selected={sortTab === "거리"} className={sortTab === "거리" ? "active" : ""} onClick={() => selectCouponSort("거리")}>거리 순</button><button type="button" role="tab" aria-selected={sortTab === "할인"} className={sortTab === "할인" ? "active" : ""} onClick={() => setSortTab("할인")}>할인 순</button><button type="button" role="tab" aria-selected={sortTab === "인기"} className={sortTab === "인기" ? "active" : ""} onClick={() => setSortTab("인기")}>인기 순</button><button type="button" role="tab" aria-selected={sortTab === "마감"} className={sortTab === "마감" ? "active" : ""} onClick={() => selectCouponSort("마감")}>마감 순</button></div><div className="coupon-feed">{catalogVisible.map((coupon) => { const liveCoupon = { ...coupon, remaining: stockByCouponId[coupon.id] ?? coupon.remaining }; return <div key={coupon.id} className={`coupon-feed-item ${recentlyClaimedCouponIds.includes(coupon.id) ? "is-claiming" : ""}`}><CouponCard coupon={liveCoupon} isPremium={isServerPremiumMember} isFavorite={favoriteCouponIds.includes(liveCoupon.id)} onToggleFavorite={() => toggleFavoriteCoupon(liveCoupon.id, liveCoupon.store)} issued={issuedCoupons.some((record) => record.coupon.id === coupon.id) || sharedWalletRecords.some((record) => String(record.coupon.bridgeCouponId ?? record.coupon.id) === String(coupon.bridgeCouponId ?? coupon.id))} onIssue={() => handleCouponDownload(liveCoupon)} onOpenMap={setStoreMap} onOpenMedia={() => { setSelected(null); setSelectedSource("home"); setMediaViewer(couponMediaViewerItem(liveCoupon, { actionLabel: liveCoupon.remaining > 0 ? "쿠폰 받기" : "마감", onAction: () => { if (liveCoupon.remaining > 0) issueCoupon(liveCoupon); } })); }} onSelect={() => { setSelectedSource("home"); setSelected(liveCoupon); }} /></div>; })}{catalogVisible.length === 0 && <div className="empty-state"><Ticket size={24} /><b>{couponFeedEmptyState.title}</b><span>{couponFeedEmptyState.description}</span></div>}</div></>}{nav === "home" && tinkerbellStatus === "feed_opened" && <ExpiryFeed dong={couponBrowseDongs.length > 0 ? formatSelectedNeighborhoods(couponBrowseDongs) : "동네 선택"} onBack={goHome} onReserve={reserveExpiry} onOpenMap={setStoreMap} stockByDealId={stockByDealId} partnerDeals={specialExpiryDeals} includeSampleDeals={!couponBrowseIsExplicit || couponBrowseRegionCodes.length === 0} onOpenMedia={(coupon) => { setSelected(null); setSelectedSource("home"); setMediaViewer(couponMediaViewerItem(coupon, { actionLabel: "쿠폰 받기", onAction: () => { if (coupon.remaining > 0) issueCoupon(coupon); } })); }} />}{nav === "coupons" && <><CouponWallet issuedCoupons={issuedCoupons} sharedWalletRecords={sharedWalletRecords} returnedCoupons={[...returnedCoupons, ...sharedWalletHistoryRecords]} favoriteStores={favoriteStores} favoriteCouponIds={favoriteCouponIds} favoriteCampaigns={[...remoteCampaigns, ...campaigns].filter((campaign) => favoriteCampaignIds.includes(campaignFavoriteKey(campaign)))} onToggleFavoriteCampaign={handleFavoriteCampaignToggle} onBarcode={openCouponUsage} onReserve={openWalletReservation} onOpenReservationChat={(record) => openReservationChat(record.coupon, record.userCouponId ?? String(record.coupon.id), record.visitDate, record.pickupTime, record.partySize)} onIssue={(coupon, onSuccess) => downloadCoupon(coupon, onSuccess)} onRemoveFavorite={(coupon) => toggleFavoriteCoupon(coupon.id, coupon.store)} initialStatusRequest={couponWalletStatusRequest} onOpenChat={setExperienceChatApplication} onReturn={returnCoupon} onToast={showHeaderToast} onOpenMedia={(coupon) => { setSelected(null); setSelectedSource("wallet"); setMediaViewer(couponMediaViewerItem(coupon, { actionLabel: "쿠폰 상세 보기", isOwned: true, onAction: () => { setMediaViewer(null); setSelected(coupon); } })); }} applications={campaignApplications} onUpdateApplication={updateCampaignApplication} onCancelApplication={cancelCampaignApplication} historyRequest={historyRequest} deletedHistoryKeys={deletedHistoryKeys} onDeleteHistory={deleteHistoryKeys} onOpenDetail={(coupon) => { setReviewFocusClaimKey(null); setSelectedSource("wallet"); setSelected(coupon); }} onOpenReview={(coupon, claimKey) => { setReviewFocusClaimKey(claimKey); setSelectedSource("wallet"); setSelected(coupon); }} /></>}{nav === "meetings" && (communityChatMeeting ? null : communityChatListOpen ? <MeetingChatList key={`chat-list:${chatListRouteVersion}`} currentUserId={dashboardClientUserId} joinedMeetings={joinedMeetings} meetingSearchQuery={searchQuery} activeSubtab={communityChatSubtab} onSubtabChange={setCommunityChatSubtab} pendingMarketplaceListing={pendingMarketplaceListing} onMarketplaceListingHandled={() => setPendingMarketplaceListing(null)} onBack={() => { setCommunityChatListOpen(false); setCommunityChatMeeting(null); setCommunityChatReturnMeeting(null); setCommunityChatReturnParticipation(null); setNav("meetings"); }} onOpen={(meeting) => { setCommunityChatSubtab("meetings"); setCommunityChatListOpen(false); setCommunityChatReturnMeeting(null); setCommunityChatReturnParticipation(null); setCommunityChatMeeting(meeting); }} /> : <CommunitySection regionCodes={communityBrowseRegionCodes} regionNames={communityBrowseDongs} currentUserId={dashboardClientUserId} onStartChat={startMarketplaceChat} onToast={showHeaderToast} onRegisterLocationActions={registerCommunityLocationActions} onLocationBusyChange={setCommunityLocationBusy}>
  {({ currentLocationRequested, currentLocationPoint }) => <MeetingView returnToMeetingDetail={communityChatReturnMeeting} returnToMeetingParticipation={communityChatReturnParticipation} onReturnToMeetingDetailHandled={() => { setCommunityChatReturnMeeting(null); setCommunityChatReturnParticipation(null); }} userPosition={currentLocationRequested ? currentLocationPoint : null} sortByDistance={distanceEnabled} onOpenChatList={() => { setCommunityChatSubtab("meetings"); setCommunityChatListOpen(true); setCommunityChatReturnMeeting(null); setCommunityChatReturnParticipation(null); setCommunityChatMeeting(null); }} onJoinMeeting={registerJoinedMeeting} onOpenChat={openJoinedMeetingChat} onMeetingReleased={(meetingId) => { setJoinedMeetings((current) => current.filter((item) => item.id !== meetingId)); try { window.localStorage.removeItem(`dangam_meeting_joined_${dashboardClientUserId}_${meetingId}`); } catch { /* 해제 후 가입 표시는 부모 화면에서 제거합니다. */ } setCommunityChatMeeting((current) => current?.id === meetingId ? null : current); setCommunityChatReturnMeeting((current) => current?.id === meetingId ? null : current); setCommunityChatReturnParticipation(null); setCommunityChatListOpen(false); setCommunityChatSubtab("meetings"); setNav("meetings"); }} onToast={showHeaderToast} meetingSearchQuery={searchQuery} browseRegionCodes={communityBrowseRegionCodes} currentLocationRequested={currentLocationRequested} currentLocationPoint={currentLocationPoint} />}
</CommunitySection>)}{nav === "experience" && <ExperienceView applications={campaignApplications} campaigns={[...remoteCampaigns, ...campaigns]} favoriteCampaignIds={favoriteCampaignIds} onToggleFavoriteCampaign={handleFavoriteCampaignToggle} onSubmit={saveCampaignApplication} onViewHistory={openCampaignHistory} isSubscriber={isServerPremiumMember} targetDongs={experienceTargetDongs} targetRegionCodes={experienceTargetRegionCodes} isVerifiedAdult={sharedCoupons.isVerifiedAdult} onStartMembership={() => {}} onOpenMap={setStoreMap} onToast={showHeaderToast} />}{nav === "my" && <MyView onOpenWithdrawal={() => setWithdrawalOpen(true)} onOpenLogout={() => setLogoutOpen(true)} onToast={showHeaderToast} onExitSettings={() => setNav("my")} userTier={isServerPremiumMember ? "PREMIUM" : "FREE"} nextBillingDate={membershipNextBillingDate} onStartMembership={() => { if (previewDemo.active) { void consumerApi.recordPreviewSubscriptionPayment(newDashboardEventId()).then(status => { setPreviewSubscription(status); showHeaderToast("월 10,000원 Preview Mock 결제가 확인되었습니다."); }).catch(error => showHeaderToast(error instanceof Error ? error.message : "Mock 결제를 처리하지 못했습니다.")); return; } setMembershipCheckoutOpen(true); }} onSimulateMembershipFailure={() => { if (!previewDemo.active) return; void consumerApi.recordPreviewSubscriptionFailure(newDashboardEventId()).then(status => { setPreviewSubscription(status); showHeaderToast("결제 실패를 기록했고 구독 상태를 갱신했습니다."); }).catch(error => showHeaderToast(error instanceof Error ? error.message : "결제 실패 시뮬레이션을 처리하지 못했습니다.")); }} onOpenSubscriptionManagement={async () => { if (previewDemo.active) { showHeaderToast("미리보기에서는 실제 구독이 변경되지 않습니다."); return; } await cancelMembership.mutateAsync(); await membershipStatusQuery.refetch(); showHeaderToast("구독 해지가 예약되었습니다. 이용 기간은 유지됩니다."); }} isCancelingMembership={cancelMembership.isPending} cancelAtPeriodEnd={membershipStatus.cancelAtPeriodEnd} openMembershipOnMount={membershipRouteRequest} onMembershipOpenHandled={() => setMembershipRouteRequest(false)} onPartnerPageChange={setPartnerGuideOpen} appNotifications={appNotifications} onMarkAppNotificationRead={markAppNotificationRead} onOpenSupport={() => setSupportOpen(true)} onSubmitDashboardPartner={async (data) => {
    if (previewDemo.active) {
      await consumerApi.submitPreviewPartnerApplication({ applicantName: data.applicantName, contactPhone: data.phone, preferredRegion: data.preferredRegion || undefined, bank: data.bank, accountNumber: data.accountNumber, idempotencyKey: newDashboardEventId() });
      return;
    }
    window.localStorage.setItem("dangam_partner_subscription_type", data.isRecurringSubscription ? "RECURRING" : "ONE_TIME");
    await submitDashboardPartner.mutateAsync({ eventId: newDashboardEventId(), clientUserId: dashboardClientUserId, displayName: data.applicantName, ...data });
  }} onRequestPartnerSubscription={(data) => { if (previewDemo.active) { showHeaderToast("미리보기에서는 파트너 신청 내용이나 결제가 저장되지 않습니다."); return; } window.localStorage.setItem("dangam_partner_pending_application", JSON.stringify(data)); window.localStorage.setItem("dangam_partner_subscription_type", "RECURRING"); void submitDashboardPartner.mutateAsync({ eventId: newDashboardEventId(), clientUserId: dashboardClientUserId, displayName: data.applicantName, ...data }).catch((error) => console.warn("[대시보드 파트너 신청 전송 실패]", error)); setMembershipCheckoutOpen(true); }} onSubmitDashboardSettlement={(label, data) => { if (previewDemo.active) { showHeaderToast("미리보기에서는 정산 계좌 정보가 저장되지 않습니다."); return; } void submitDashboardSettlement.mutateAsync({ eventId: newDashboardEventId(), clientUserId: dashboardClientUserId, displayName: "민", ...data }).catch((error) => console.warn("[대시보드 정산계좌 전송 실패]", error)); }} />}<div className="bottom-pad" />{mediaViewer && <MediaViewer item={mediaViewer} onClose={closeCouponMediaViewer} onOpenMap={setStoreMap} onToast={showHeaderToast} />} {storeMap && <StoreMapModal item={storeMap} onClose={() => setStoreMap(null)} />} {communityChatMeeting && joinedMeetings.some((item) => item.id === communityChatMeeting.id) && <MeetingGroupChat key={`community:${dashboardClientUserId}:${communityChatMeeting.id}`} meeting={communityChatMeeting} participation={{ ...parseMeetingCapacity(communityChatMeeting), currentMembers: Math.max(1, parseMeetingCapacity(communityChatMeeting).currentMembers), isJoined: true }} onToast={showHeaderToast} onMeetingSchedulesChange={(schedules) => { setCommunityChatMeeting((current) => current?.id === communityChatMeeting.id ? { ...current, schedules } : current); setJoinedMeetings((current) => current.map((item) => item.id === communityChatMeeting.id ? { ...item, schedules } : item)); window.dispatchEvent(new CustomEvent("dangam:meeting-schedules-updated", { detail: { meetingId: communityChatMeeting.id, schedules } })); }} onLeave={(meetingId, roomId, roomType, serverRoomId) => { const leavingMeeting = communityChatMeeting?.id === meetingId ? communityChatMeeting : joinedMeetings.find((item) => item.id === meetingId); if (leavingMeeting) { const archivedType = roomType === "review" ? "review" : "meet"; const archivedRoomId = String(roomId ?? meetingId); const messages = readMeetingChatMessages(leavingMeeting, dashboardClientUserId, archivedRoomId, archivedType); const lastMessage = messages[messages.length - 1]; const now = Date.now(); upsertArchivedCommunityChat({ roomId: archivedRoomId, serverRoomId: serverRoomId ?? undefined, meetingId, roomType: archivedType, title: leavingMeeting.title, thumbnailUrl: meetingThumbnailFor(leavingMeeting), category: leavingMeeting.category, lastMessage: lastMessage?.image ? "사진을 보냈어요." : lastMessage?.text ?? "", lastActivityAt: readMeetingChatActivity()[String(meetingId)] ?? now, leftAt: now }, dashboardClientUserId); } removeMeetingMemberFromScheduleState(meetingId, dashboardClientUserId); setJoinedMeetings((current) => current.filter((item) => item.id !== meetingId)); window.localStorage.removeItem(`dangam_meeting_joined_${dashboardClientUserId}_${meetingId}`); window.dispatchEvent(new CustomEvent(MEETING_MEMBERSHIP_CHANGED_EVENT, { detail: { meetingId, userId: dashboardClientUserId } })); setCommunityChatMeeting(null); setCommunityChatReturnMeeting(null); setCommunityChatReturnParticipation(null); setCommunityChatListOpen(false); setNav("meetings"); }} onBack={() => { const returnToDetail = Boolean(communityChatReturnMeeting); setCommunityChatMeeting(null); setCommunityChatListOpen(!returnToDetail); }} />} {experienceChatApplication && <MeetingGroupChat key={`experience:${dashboardClientUserId}:${experienceChatApplication.centralApplicationId ?? experienceChatApplication.id}`} roomId={experienceChatApplication.centralApplicationId ?? experienceChatApplication.id} reviewMission={experienceChatApplication.benefit} reviewMissionStatus={experienceChatApplication.status === "SELECTED" ? "체험 진행" : experienceChatApplication.status === "NOT_SELECTED" ? "미선정" : "선정 대기"} remoteTrialApplicationId={experienceChatApplication.centralApplicationId} meeting={{ id: -2000000000 - experienceChatApplication.campaignId, title: `${experienceChatApplication.store} · ${experienceChatApplication.title}`, place: experienceChatApplication.store, address: `${experienceChatApplication.store} 사업자 문의`, schedule: `희망 방문 ${experienceChatApplication.visitDate} ${experienceChatApplication.visitTime}`, members: "2/2", benefit: experienceChatApplication.benefit, icon: "1:1", tone: "orange", image: experienceChatApplication.image, manager: "사업자", organizerName: "사업자", maxMembers: 2, isExperienceDirectChat: true, category: "카페/소통" }} participation={{ currentMembers: 2, maxMembers: 2, isJoined: true }} onToast={showHeaderToast} onBack={() => setExperienceChatApplication(null)} />} {reservationChatMeeting && <MeetingGroupChat key={`reservation:${dashboardClientUserId}:${reservationChatMeeting.id}`} meeting={reservationChatMeeting} participation={{ currentMembers: 2, maxMembers: 2, isJoined: true }} onToast={showHeaderToast} onBack={() => setReservationChatMeeting(null)} />} {benefitGuideOpen && <BenefitGuideModal onClose={() => setBenefitGuideOpen(false)} />}</main><nav className="bottom-nav"><button className={nav === "home" ? "active" : ""} onClick={() => { goHome(); }}><span className="bottom-nav-icon"><HomeIcon size={20} /></span><span>홈</span></button><button className={nav === "coupons" ? "active" : ""} onClick={() => { openCoupons(); }}><span className="bottom-nav-icon"><Ticket size={20} />{couponBadgeCount > 0 && <i aria-label={`${couponBadgeCount}개의 새 쿠폰`}>{couponBadgeCount}</i>}</span><span>쿠폰함</span></button><button className={nav === "experience" ? "active" : ""} onClick={() => { setNav("experience"); }}><span className="bottom-nav-icon"><Gift size={20} />{experienceUnread && campaignApplications.some((application) => application.status !== "NOT_SELECTED") && <i aria-label="읽지 않은 체험단 알림 1개">1</i>}</span><span>체험단</span></button><button className={nav === "meetings" && !communityChatListOpen && !communityChatMeeting ? "active" : ""} onClick={() => { setCommunityChatListOpen(false); setCommunityChatMeeting(null); setNav("meetings"); }}><span className="bottom-nav-icon"><Users size={20} /></span><span>커뮤니티</span></button><button className={communityChatListOpen || Boolean(communityChatMeeting) ? "active" : ""} onClick={() => { window.history.replaceState(window.history.state, "", "/community/chat-list"); setNav("meetings"); setCommunityChatSubtab("marketplace"); setPendingMarketplaceListing(null); setCommunityChatMeeting(null); setCommunityChatReturnMeeting(null); setCommunityChatReturnParticipation(null); setChatListRouteVersion((version) => version + 1); setCommunityChatListOpen(true); }}><span className="bottom-nav-icon"><MessageCircle size={20} />{totalChatUnread > 0 && <i aria-label={`${totalChatUnread}개의 새 채팅`}>{totalChatUnread > 99 ? "99+" : totalChatUnread}</i>}</span><span>채팅</span></button><button type="button" className={`bottom-nav-settings ${nav === "my" ? "active" : ""}`} aria-label="내 정보 및 설정 열기" onClick={() => { setNav("my"); window.dispatchEvent(new Event("dangam:settings-root-request")); }}><span className="bottom-nav-icon"><Settings size={20} /></span></button></nav>{supportOpen && <SupportSheet onClose={() => setSupportOpen(false)} onSubmit={submitConsumerInquiry} />}{policyOpen && <PolicySheet onClose={() => setPolicyOpen(false)} />}{locationOpen && createPortal(<LocationSheet
        initialDongs={(nav === "home" || nav === "coupons") ? couponBrowseDongs : nav === "meetings" ? communityBrowseDongs : experienceTargetDongs ?? []}
        initialRegionCodes={(nav === "home" || nav === "coupons") ? couponBrowseRegionCodes : nav === "meetings" ? communityBrowseRegionCodes : experienceTargetRegionCodes ?? []}
        storageKey={(nav === "home" || nav === "coupons") ? "dangam_coupon_browse_dongs" : nav === "meetings" ? "dangam_community_browse_dongs" : false}
        labelStorageKey={(nav === "home" || nav === "coupons") ? "dangam_coupon_browse_label" : nav === "meetings" ? "dangam_community_browse_label" : false}
        summaryHeading="선택한 동네"
        maxSelections={(nav === "home" || nav === "coupons" || nav === "meetings") ? 3 : 1}
        consumerBrowseSelection={nav === "home" || nav === "coupons" || nav === "meetings"}
        emitRegionEvents={!(nav === "home" || nav === "coupons" || nav === "meetings")}
        allowEmptySelection={nav === "home" || nav === "coupons"}
        onClose={() => setLocationOpen(false)}
        onApply={(dongs, _label, _detailAddress, regionCodes) => {
          const isCouponBrowseSelection = nav === "home" || nav === "coupons";
          const isCommunityBrowseSelection = nav === "meetings";
          if (isCouponBrowseSelection) {
            const browseCodes = canonicalConsumerBrowseRegionCodes(regionCodes ?? []);
            if (browseCodes === null) { showHeaderToast("같은 구의 동네를 최대 3곳까지 선택하거나 구 전체를 선택해 주세요."); return; }
            const uniqueRegionCodes = browseCodes;
            const uniqueDongs = browseCodes.flatMap((code) => { const region = findAdminRegionByCode(code); return region ? [region.dong] : []; });
            const browseLabel = formatConsumerBrowseRegionLabel(browseCodes);
            setCouponBrowseDongs(uniqueDongs); setCouponBrowseRegionCodes(uniqueRegionCodes);
            window.localStorage.setItem("dangam_coupon_browse_region_codes", JSON.stringify(uniqueRegionCodes));
            setCouponBrowseLabel(browseLabel); setCouponBrowseIsExplicit(uniqueRegionCodes.length > 0);
            window.localStorage.setItem("dangam_coupon_browse_dongs", JSON.stringify(uniqueDongs));
            window.localStorage.setItem("dangam_coupon_browse_label", browseLabel);
            showHeaderToast(`${browseLabel} 쿠폰을 찾아볼게요.`);
          } else if (isCommunityBrowseSelection) {
            const browseCodes = canonicalConsumerBrowseRegionCodes(regionCodes ?? []);
            if (browseCodes === null) { showHeaderToast("커뮤니티는 같은 구의 동네 최대 3곳 또는 구 전체를 선택해 주세요."); return; }
            const uniqueRegionCodes = browseCodes;
            const uniqueDongs = browseCodes.flatMap((code) => { const region = findAdminRegionByCode(code); return region ? [region.dong] : []; });
            const browseLabel = formatConsumerBrowseRegionLabel(browseCodes);
            setCommunityBrowseDongs(uniqueDongs); setCommunityBrowseRegionCodes(uniqueRegionCodes);
            window.localStorage.setItem("dangam_community_browse_region_codes", JSON.stringify(uniqueRegionCodes));
            window.localStorage.setItem("dangam_community_browse_label", browseLabel);
            window.localStorage.setItem("dangam_community_browse_dongs", JSON.stringify(uniqueDongs));
            showHeaderToast(`${browseLabel} 모임·중고장터를 찾아볼게요.`);
          } else {
            const requestedCodes = canonicalRegionCodes(regionCodes ?? []);
            if (requestedCodes.length > 1 || new Set(dongs.filter(Boolean)).size > 1) { showHeaderToast("동네는 한 곳만 선택할 수 있어요."); return; }
            const uniqueDongs = Array.from(new Set(dongs.filter(Boolean))).slice(0, 1);
            const uniqueRegionCodes = canonicalManualRegionCodes(regionCodes ?? []);
            if (nav === "experience") { setExperienceTargetDongs(uniqueDongs); setExperienceTargetRegionCodes(uniqueRegionCodes); }
          }
          setLocationOpen(false);
        }}
      />, document.body)}{notificationsOpen && <NotificationSheet api={sharedApi} isPreviewDemo={previewDemo.active} notifications={appNotifications} onMarkRead={markAppNotificationRead} onCouponPreferenceChanged={updateCouponNotificationBadge} onClose={() => setNotificationsOpen(false)} />}{consumerNotificationSettingsOpen && <ConsumerNotificationModal settings={consumerNotificationSettings} onChange={updateConsumerNotification} onToast={showHeaderToast} onClose={() => setConsumerNotificationSettingsOpen(false)} />}{visitCoupon && <VisitDateSheet coupon={visitCoupon} schedule={scheduleByCouponId[visitCoupon.id] ?? visitCoupon.schedule ?? scheduleForStore(visitCoupon.store)} onClose={() => { setVisitCoupon(null); setReservationRecordKey(null); }} onConfirm={(visitDate, dateKey, pickupTime, partySize, phoneShareAgreed) => reservationRecordKey ? updateWalletReservation(visitDate, dateKey, pickupTime, partySize, `${dateKey.replaceAll("-", ".")} ${pickupTime} 예약 완료`, phoneShareAgreed) : confirmCouponIssue(visitCoupon, visitDate, dateKey, pickupTime, partySize, phoneShareAgreed)} onSave={(visitDate, dateKey, pickupTime, partySize) => reservationRecordKey ? updateWalletReservation(visitDate, dateKey, pickupTime, partySize, "예약 일정이 저장되었습니다.") : saveCouponToWallet(visitCoupon, visitDate, dateKey, pickupTime, partySize)} />}{barcodeRecord && <CouponUsagePinSheet record={barcodeRecord} onClose={() => setBarcodeRecord(null)} onSuccess={() => { setNav("coupons"); setCouponWalletStatusRequest((value) => value + 1); }} onComplete={(storePin) => completeCouponRedemption(barcodeRecord, storePin)} />}{alreadyUsedRecord && <CouponAlreadyUsedSheet record={alreadyUsedRecord} onClose={() => setAlreadyUsedRecord(null)} />}{partnerRecruitmentOpen && <PartnerRecruitmentSheet onClose={() => setPartnerRecruitmentOpen(false)} onStudentStart={() => { setPartnerRecruitmentOpen(false); setStudentConsentOpen(true); }} />}{studentConsentOpen && <StudentPartnerConsentSheet onClose={() => setStudentConsentOpen(false)} onSubmit={(name, phone) => { if (previewDemo.active) { setStudentConsentOpen(false); showHeaderToast("미리보기에서는 파트너 신청자 정보가 저장되지 않습니다."); return; } window.localStorage.setItem("dangam_student_partner_consent", JSON.stringify({ name, phone, agreedAt: new Date().toISOString(), policyVersion: "2026-10" })); window.localStorage.setItem("dangam_partner_type", "STUDENT"); window.localStorage.removeItem("dangam_local_sales_partner_status"); window.localStorage.removeItem(SALES_PARTNER_CODE_STORAGE_KEY); window.localStorage.setItem("dangam_student_partner_code", STUDENT_PARTNER_CODE); setStudentConsentOpen(false); setStudentInviteOpen(true); showHeaderToast("동의가 완료되었습니다. 학생 추천코드를 발급했습니다."); }} />}{studentInviteOpen && <StudentPartnerInviteSheet onClose={() => setStudentInviteOpen(false)} onOpenCoupons={openCoupons} onToast={showHeaderToast} />}  {membershipOpen && createPortal(<CouponMembershipGateSheet onClose={() => setMembershipOpen(false)} onStart={() => { setMembershipOpen(false); setNav("my"); setMembershipRouteRequest(true); }} />, document.body)}{membershipCheckoutOpen && !previewDemo.active && <MembershipCheckoutSheet onClose={() => setMembershipCheckoutOpen(false)} onToast={showHeaderToast} startCheckout={() => startMembershipCheckout.mutateAsync({ autoRenewalConsent: true, returnOrigin: window.location.origin, callbackBaseUrl: membershipCallbackBaseUrl() })} />}{logoutOpen && <LogoutModal onClose={() => setLogoutOpen(false)} onConfirm={() => { if (previewDemo.active) { setLogoutOpen(false); showHeaderToast("미리보기에서는 로그인 세션을 변경하지 않습니다."); return; } window.sessionStorage.clear(); ["dangam_auth_token", "dangam_session", "dangam_user_tier", "dangam_next_billing_date"].forEach((key) => window.localStorage.removeItem(key)); setLogoutOpen(false); goHome(); showHeaderToast("안전하게 로그아웃되었습니다."); }} />}{withdrawalOpen && <WithdrawalModal onClose={() => setWithdrawalOpen(false)} onConfirm={() => { if (previewDemo.active) { setWithdrawalOpen(false); showHeaderToast("미리보기에서는 저장된 데이터가 삭제되지 않습니다."); return; } Object.keys(window.localStorage).filter((key) => key.startsWith("dangam_")).forEach((key) => window.localStorage.removeItem(key)); setWithdrawalOpen(false); goHome(); showHeaderToast("회원 탈퇴가 완료되었습니다."); }} />}{selected && <DetailSheet key={selected.id} coupon={selected} source={selectedSource} reviewClaimKey={selected ? verifiedReviewClaimForCoupon(selected, reviewFocusClaimKey) : null} reviewEligible={Boolean(selected && verifiedReviewClaimForCoupon(selected, reviewFocusClaimKey))} loadCouponReviews={sharedCoupons.couponReviews} onSubmitCouponReview={async (claimId, input) => { const review = await sharedCoupons.submitCouponReview(claimId, input); await sharedCoupons.refresh(); return review; }} initialFocusReview={Boolean(reviewFocusClaimKey)} recommendations={selectedSource === "home" ? selectedCouponRecommendations : []} onSelectRecommendation={(nextCoupon) => { setReviewFocusClaimKey(null); setSelectedSource("home"); setSelected(nextCoupon); }} onOpenMap={setStoreMap} isIssued={issuedCoupons.some((record) => record.coupon.id === selected.id) || sharedWalletRecords.some((record) => String(record.coupon.bridgeCouponId ?? record.coupon.id) === String(selected.bridgeCouponId ?? selected.id))} isFavorite={favoriteCouponIds.includes(selected.id)} onToggleFavorite={() => toggleFavoriteCoupon(selected.id, selected.store)} onClose={() => { setSelected(null); setReviewFocusClaimKey(null); }} onIssue={() => { if (issuedCoupons.some((record) => record.coupon.id === selected.id) || sharedWalletRecords.some((record) => String(record.coupon.bridgeCouponId ?? record.coupon.id) === String(selected.bridgeCouponId ?? selected.id))) { setSelected(null); openCoupons(); } else { issueCoupon(selected); } }} onRedeem={() => openCouponRedemption(selected)} onReserve={() => { setSelected(null); const record = issuedCoupons.find((item) => item.coupon.id === selected.id); if (record) openWalletReservation(record); }} onSave={(day, time, people) => saveOrderCoupon(selected, day, time, people)} onOrderComplete={() => { const remaining = stockByCouponId[selected.id] ?? selected.remaining; if (remaining > 0) { setStockByCouponId((current) => ({ ...current, [selected.id]: remaining - 1 })); addUnreadCoupon(); showHeaderToast(`쿠폰 예약 완료! ${selected.store} 쿠폰이 쿠폰함에 추가되었습니다.`); } }} />}{redeem && <RedeemSheet coupon={redeem} userCouponId={issuedCoupons.find((record) => record.coupon.id === redeem.id)?.userCouponId} onClose={() => setRedeem(null)} onComplete={completeCouponRedemption} />}</div></div>; }

export default Home;
