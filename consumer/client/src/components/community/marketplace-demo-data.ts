import { COMMUNITY_REGION_CODES } from "../../lib/community-region";
import type { MarketplaceListing } from "./CommunityMarketplace";

type DemoListingSeed = Omit<MarketplaceListing, "regionLabel" | "createdAt" | "createdLabel"> & {
  createdLabel: string;
  minutesAgo: number;
};

// Static Unsplash photos for demo-only display; these paths are never saved as user uploads.
const DEMO_LISTING_IMAGE_PATHS: Readonly<Record<number, string>> = {
  74001: "/assets/marketplace-demo/hybrid-bicycle.webp",
  74002: "/assets/marketplace-demo/air-fryer.webp",
  74003: "/assets/marketplace-demo/picture-books-toys.webp",
  74004: "/assets/marketplace-demo/camping-chairs.webp",
  74005: "/assets/marketplace-demo/wooden-nightstand.webp",
  75001: "/assets/marketplace-demo/qhd-monitor.webp",
  75002: "/assets/marketplace-demo/office-chair.webp",
  75003: "/assets/marketplace-demo/pour-over-set.webp",
  75004: "/assets/marketplace-demo/carry-on-suitcase.webp",
  75005: "/assets/marketplace-demo/portable-speaker.webp",
};

export function getDemoMarketplaceImageUrl(listingId: number): string | undefined {
  return DEMO_LISTING_IMAGE_PATHS[listingId];
}

const SANBON_LISTINGS: DemoListingSeed[] = [
  {
    id: 74001,
    title: "출퇴근용 하이브리드 자전거",
    category: "스포츠/레저",
    price: 78000,
    description: "가볍게 타기 좋은 하이브리드 자전거예요. 최근 점검했고 변속과 브레이크 모두 잘 작동합니다. 직접 보고 가져가셔도 좋아요.",
    regionCode: COMMUNITY_REGION_CODES.sanbon1Dong,
    sellerId: "neighbor-bike",
    sellerNickname: "자전거타는 민수",
    favoriteCount: 8,
    chatCount: 2,
    status: "판매중",
    tone: "sky",
    createdLabel: "12분 전",
    minutesAgo: 12,
  },
  {
    id: 74002,
    title: "깨끗하게 사용한 에어프라이어",
    category: "생활가전",
    price: 25000,
    description: "2인 가구에서 사용했어요. 내부 세척해 두었고 구성품도 모두 있습니다. 산본역 근처에서 직거래 원해요.",
    regionCode: COMMUNITY_REGION_CODES.sanbon1Dong,
    sellerId: "neighbor-home",
    sellerNickname: "소소한집",
    favoriteCount: 5,
    chatCount: 1,
    status: "판매중",
    tone: "peach",
    createdLabel: "35분 전",
    minutesAgo: 35,
  },
  {
    id: 74003,
    title: "유아 그림책과 장난감 나눔",
    category: "유아동",
    price: null,
    description: "아이와 함께 잘 본 그림책과 깨끗한 장난감이에요. 필요한 분께 한 번에 나눔합니다. 약속 시간 잘 지켜주실 분께 드릴게요.",
    regionCode: COMMUNITY_REGION_CODES.sanbon1Dong,
    sellerId: "neighbor-family",
    sellerNickname: "단풍맘",
    favoriteCount: 11,
    chatCount: 4,
    status: "판매중",
    tone: "lavender",
    createdLabel: "1시간 전",
    minutesAgo: 60,
  },
  {
    id: 74004,
    title: "캠핑 접이식 의자 2개",
    category: "스포츠/레저",
    price: 18000,
    description: "가볍고 접어서 보관하기 좋은 캠핑 의자 두 개입니다. 사용감은 조금 있지만 튼튼해요. 한꺼번에 판매합니다.",
    regionCode: COMMUNITY_REGION_CODES.sanbon1Dong,
    sellerId: "neighbor-camp",
    sellerNickname: "주말엔캠핑",
    favoriteCount: 3,
    chatCount: 1,
    status: "판매중",
    tone: "mint",
    createdLabel: "2시간 전",
    minutesAgo: 120,
  },
  {
    id: 74005,
    title: "원목 협탁 거의 새 상품",
    category: "가구/인테리어",
    price: 12000,
    description: "방 정리하면서 내놓아요. 흔들림 없고 상판 상태도 깨끗합니다. 승용차에 실릴 정도 크기예요.",
    regionCode: COMMUNITY_REGION_CODES.sanbon1Dong,
    sellerId: "neighbor-wood",
    sellerNickname: "나무와햇살",
    favoriteCount: 6,
    chatCount: 0,
    status: "예약중",
    tone: "sand",
    createdLabel: "오늘 오전",
    minutesAgo: 180,
  },
];

const YEOKSAM_LISTINGS: DemoListingSeed[] = [
  {
    id: 75001,
    title: "27인치 QHD 모니터",
    category: "디지털기기",
    price: 115000,
    description: "재택근무용으로 사용한 모니터입니다. 화면 이상 없고 받침대와 전원 케이블 함께 드립니다.",
    regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong,
    sellerId: "yeoksam-display",
    sellerNickname: "테헤란로직장인",
    favoriteCount: 7,
    chatCount: 3,
    status: "판매중",
    tone: "sky",
    createdLabel: "8분 전",
    minutesAgo: 8,
  },
  {
    id: 75002,
    title: "원목 높이조절 책상 의자",
    category: "가구/인테리어",
    price: 42000,
    description: "사무실 정리로 판매합니다. 높이 조절과 바퀴 모두 정상 작동하며 역삼역 인근 직거래 가능합니다.",
    regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong,
    sellerId: "yeoksam-office",
    sellerNickname: "오피스정리중",
    favoriteCount: 4,
    chatCount: 1,
    status: "판매중",
    tone: "sand",
    createdLabel: "22분 전",
    minutesAgo: 22,
  },
  {
    id: 75003,
    title: "드립 커피 도구 세트",
    category: "도서/취미",
    price: 16000,
    description: "드리퍼와 서버, 계량스푼 세트입니다. 사용 횟수가 많지 않고 깨끗하게 세척해 두었습니다.",
    regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong,
    sellerId: "yeoksam-coffee",
    sellerNickname: "작은커피방",
    favoriteCount: 9,
    chatCount: 2,
    status: "판매중",
    tone: "peach",
    createdLabel: "50분 전",
    minutesAgo: 50,
  },
  {
    id: 75004,
    title: "기내용 캐리어 20인치",
    category: "기타",
    price: 28000,
    description: "출장 때 몇 번 사용한 캐리어입니다. 잠금장치와 바퀴 상태 양호하고 내부도 깨끗합니다.",
    regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong,
    sellerId: "yeoksam-travel",
    sellerNickname: "출장많은사람",
    favoriteCount: 2,
    chatCount: 0,
    status: "판매중",
    tone: "lavender",
    createdLabel: "1시간 전",
    minutesAgo: 60,
  },
  {
    id: 75005,
    title: "블루투스 스피커 소형",
    category: "디지털기기",
    price: 19000,
    description: "작은 크기지만 음량이 충분한 스피커입니다. 충전 케이블 포함이며 외관에 큰 흠집은 없습니다.",
    regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong,
    sellerId: "yeoksam-audio",
    sellerNickname: "퇴근후음악",
    favoriteCount: 5,
    chatCount: 1,
    status: "예약중",
    tone: "mint",
    createdLabel: "오늘 오전",
    minutesAgo: 110,
  },
];

export function createDemoMarketplaceListings(
  regionCode: string,
  regionLabel: string,
  now = Date.now(),
): MarketplaceListing[] {
  const seeds = regionCode === COMMUNITY_REGION_CODES.sanbon1Dong
    ? SANBON_LISTINGS
    : regionCode === COMMUNITY_REGION_CODES.yeoksam1Dong
      ? YEOKSAM_LISTINGS
      : [];

  return seeds.map(({ minutesAgo, ...listing }) => ({
    ...listing,
    regionLabel,
    createdAt: now - minutesAgo * 60_000,
  }));
}
