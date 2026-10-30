import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, MessageCircle, MoreVertical, Package, Plus, Star, X } from "lucide-react";
import { findAdminRegionByCode, formatConsumerBrowseRegionLabel } from "@tinkerbell/region-picker";
import { filterByRegionCodes } from "../../lib/community-region";
import { filterCommunityRecordsByLocation, type CommunityLocationMode } from "../../lib/community-location";
import { formatMarketplacePrice, parseMarketplacePriceInput } from "../../lib/marketplace-price";
import { parseCurrentLocationPoint, type Wgs84Point } from "../../../../shared/current-location-search";
import { trpc } from "@/lib/trpc";
import { consumerApi } from "@/lib/consumer-api";
import { normalizePreviewDate, previewActivitySourceKey, syncPreviewActivitySnapshot } from "@/lib/consumer-activity-preview-sync";
import { isConsumerPreviewDemo } from "@/lib/preview-demo";
import { createDemoMarketplaceListings, getDemoMarketplaceImageUrl } from "./marketplace-demo-data";
import "./CommunityMarketplace.css";
import "./CommunityHandoff.css";
import { getMarketplacePhotoIndex, getMarketplaceSwipeDirection } from "./marketplace-gallery";
import { getMarketplaceRecommendations } from "../../lib/marketplace-recommendations";
import {
  canManageMarketplaceListing,
  MARKETPLACE_STATUS_CHANGED_EVENT,
  isMarketplaceListingStatus,
  readMarketplaceStatusUpdates,
  saveMarketplaceStatusUpdate,
  type MarketplaceListingStatus,
} from "./marketplace-status";

type ListingStatus = MarketplaceListingStatus;
type MarketplaceTab = "meetings" | "marketplace";

export type MarketplaceListing = {
  id: number;
  title: string;
  category: string;
  price: number | null;
  description: string;
  regionCode: string;
  regionLabel: string;
  createdLabel: string;
  createdAt?: number;
  updatedAt?: number;
  distanceM?: number;
  sellerId: string;
  sellerNickname: string;
  favoriteCount: number;
  chatCount: number;
  status: ListingStatus;
  tone: string;
  photoDataUrls?: string[];
  photoDataUrl?: string; // legacy local-storage field; normalized into photoDataUrls on read
  photoUrls?: string[];
  listingId?: string;
  viewerIsSeller?: boolean;
};

type CommunityLocationContext = {
  currentLocationRequested: boolean;
  currentLocationPoint: Wgs84Point | null;
};

export type CommunityLocationActions = {
  searchCurrentLocation: () => void;
  chooseRegion: () => void;
};

type CommunitySectionProps = {
  children: ReactNode | ((context: CommunityLocationContext) => ReactNode);
  regionCodes: string[];
  regionNames: string[];
  currentUserId: string;
  onStartChat: (listing: MarketplaceListing) => void;
  onToast?: (message: string) => void;
  onRegisterLocationActions: (actions: CommunityLocationActions | null) => void;
  onLocationBusyChange: (busy: boolean) => void;
};

type MarketplaceProps = Omit<CommunitySectionProps, "children" | "onRegisterLocationActions" | "onLocationBusyChange"> & {
  regionCode: string;
  regionName: string;
  currentLocationRequested: boolean;
  currentLocationPoint: Wgs84Point | null;
};

const LISTING_STORAGE_KEY = "dangam_marketplace_listings_v1";
const MAX_LISTING_PHOTOS = 6;
const MAX_INPUT_PHOTO_BYTES = 2 * 1024 * 1024;
const CATEGORIES = ["디지털기기", "가구/인테리어", "유아동", "생활가전", "스포츠/레저", "도서/취미", "기타"];
const isDurablePhotoUrl = (value: unknown): value is string => typeof value === "string"
  && (/^https:\/\//i.test(value) || (value.startsWith("/manus-storage/") && !value.split("/").includes("..")));
const PROVINCE_SHORT_NAMES: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전북특별자치도: "전북",
  전라북도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};

function formatMarketplaceRegion(code: string, fallbackName: string): string {
  const region = code ? findAdminRegionByCode(code) : undefined;
  if (!region) return fallbackName || "우리 동네";
  const province = PROVINCE_SHORT_NAMES[region.province] ?? region.province;
  return [province, region.district, region.dong].filter(Boolean).join(" ");
}

function isMarketplaceListing(value: unknown): value is MarketplaceListing {
  if (!value || typeof value !== "object") return false;
  const listing = value as Partial<MarketplaceListing>;
  return typeof listing.id === "number"
    && typeof listing.title === "string"
    && typeof listing.regionCode === "string"
    && typeof listing.sellerId === "string"
    && (typeof listing.price === "number" || listing.price === null);
}

function readSavedListings(): MarketplaceListing[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(LISTING_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter(isMarketplaceListing).map(normalizeListingPhotos) : [];
  } catch {
    return [];
  }
}

function removeEmojiText(value: string): string {
  return value
    .replace(/(?:[#*0-9]\uFE0F?\u20E3)|[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, "")
    .replace(/[ \t]{2,}/g, " ");
}

function priceLabel(price: number | null): string {
  return price === null || price === 0 ? "나눔" : `${new Intl.NumberFormat("ko-KR").format(price)}원`;
}

function getListingPhotos(listing: MarketplaceListing): string[] {
  const serverPhotos = Array.isArray(listing.photoUrls)
    ? listing.photoUrls.filter(isDurablePhotoUrl)
    : [];
  if (serverPhotos.length) return serverPhotos.slice(0, MAX_LISTING_PHOTOS);
  const photos = Array.isArray(listing.photoDataUrls)
    ? listing.photoDataUrls.filter((photo): photo is string => typeof photo === "string" && photo.startsWith("data:image/"))
    : [];
  if (photos.length) return photos.slice(0, MAX_LISTING_PHOTOS);
  return listing.photoDataUrl?.startsWith("data:image/") ? [listing.photoDataUrl] : [];
}

function getListingDisplayPhotos(listing: MarketplaceListing): string[] {
  const uploadedPhotos = getListingPhotos(listing);
  if (uploadedPhotos.length > 0) return uploadedPhotos;
  const demoPhotoUrl = getDemoMarketplaceImageUrl(listing.id);
  return demoPhotoUrl ? [demoPhotoUrl] : [];
}

function normalizeListingPhotos(listing: MarketplaceListing): MarketplaceListing {
  const { photoDataUrl: _legacyPhoto, ...rest } = listing;
  const photoDataUrls = Array.isArray(listing.photoDataUrls)
    ? listing.photoDataUrls.filter((photo): photo is string => typeof photo === "string" && photo.startsWith("data:image/")).slice(0, MAX_LISTING_PHOTOS)
    : listing.photoDataUrl?.startsWith("data:image/") ? [listing.photoDataUrl] : [];
  const createdAt = typeof listing.createdAt === "number" && Number.isFinite(listing.createdAt)
    ? listing.createdAt
    : listing.id > 1_000_000_000_000 ? listing.id : 0;
  const updatedAt = typeof listing.updatedAt === "number" && Number.isFinite(listing.updatedAt)
    ? listing.updatedAt
    : undefined;
  return {
    ...rest,
    title: removeEmojiText(listing.title),
    description: removeEmojiText(listing.description),
    sellerNickname: removeEmojiText(listing.sellerNickname),
    createdAt,
    ...(updatedAt === undefined ? {} : { updatedAt }),
    photoDataUrls,
    photoUrls: Array.isArray(listing.photoUrls) ? listing.photoUrls.filter(isDurablePhotoUrl).slice(0, MAX_LISTING_PHOTOS) : [],
  };
}

function canManageListing(listing: MarketplaceListing, currentUserId: string): boolean {
  return canManageMarketplaceListing(listing.sellerId, currentUserId);
}

function ListingImage({ listing, compact = false }: { listing: MarketplaceListing; compact?: boolean }) {
  const representativePhoto = getListingDisplayPhotos(listing)[0];
  return (
    <div
      className={`marketplace-thumb marketplace-thumb-${listing.tone} ${compact ? "compact" : ""}`}
      aria-label={`${listing.title} 대표 이미지`}
    >
      {representativePhoto ? <img src={representativePhoto} alt="" /> : <Package size={compact ? 34 : 48} aria-hidden="true" />}
    </div>
  );
}

function ListingGallery({
  listing,
  index,
  onIndexChange,
}: {
  listing: MarketplaceListing;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const photos = getListingDisplayPhotos(listing);
  const touchStartXRef = useRef<number | null>(null);

  const move = (direction: "previous" | "next") => {
    if (photos.length < 2) return;
    onIndexChange(getMarketplacePhotoIndex(index, direction, photos.length));
  };

  const finishSwipe = (endX: number | undefined) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null || endX === undefined || photos.length < 2) return;
    const direction = getMarketplaceSwipeDirection(startX, endX);
    if (direction) move(direction);
  };

  return (
    <div className="marketplace-photo-gallery">
      <div
        className="marketplace-photo-gallery-track"
        style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        onTouchStart={(event) => { touchStartXRef.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX)}
        onTouchCancel={() => { touchStartXRef.current = null; }}
        aria-label="상품 사진 갤러리"
        aria-roledescription="carousel"
      >
        {photos.length ? photos.map((photo, photoIndex) => (
          <div className="marketplace-photo-gallery-slide" key={`${listing.id}-photo-${photoIndex}`}>
            <img src={photo} alt={`${listing.title} 사진 ${photoIndex + 1}`} />
          </div>
        )) : (
          <div className="marketplace-photo-gallery-slide marketplace-photo-gallery-placeholder" aria-label="등록된 사진 없음">
            <Package size={60} aria-hidden="true" />
          </div>
        )}
      </div>
      <button
        type="button"
        className="marketplace-gallery-arrow previous"
        onClick={() => move("previous")}
        disabled={index <= 0 || photos.length < 2}
        aria-label="이전 사진"
      ><ChevronLeft size={22} /></button>
      <button
        type="button"
        className="marketplace-gallery-arrow next"
        onClick={() => move("next")}
        disabled={index >= photos.length - 1 || photos.length < 2}
        aria-label="다음 사진"
      ><ChevronRight size={22} /></button>
      {photos.length > 0 && <span className="marketplace-gallery-indicator" aria-live="polite">{Math.min(index + 1, photos.length)}/{photos.length}</span>}
    </div>
  );
}

function favoriteStorageKey(userId: string): string {
  return `dangam_marketplace_favorites_v1_${encodeURIComponent(userId || "guest")}`;
}

function readFavoriteIds(userId: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(favoriteStorageKey(userId)) ?? "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is number => Number.isInteger(id) && id > 0))] : [];
  } catch {
    return [];
  }
}

function compressPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("사진을 열지 못했습니다."));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        let width = Math.max(1, Math.round(image.naturalWidth * scale));
        let height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("사진을 처리할 수 없습니다."));
          return;
        }
        const encode = (quality: number) => {
          canvas.width = width;
          canvas.height = height;
          context.fillStyle = "#fff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          return canvas.toDataURL("image/jpeg", quality);
        };
        let result = encode(0.72);
        if (result.length > 280_000) result = encode(0.56);
        if (result.length > 280_000) {
          const downscale = Math.min(1, 900 / Math.max(width, height));
          width = Math.max(1, Math.round(width * downscale));
          height = Math.max(1, Math.round(height * downscale));
          result = encode(0.5);
        }
        resolve(result);
      };
      image.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.readAsDataURL(file);
  });
}

export function CommunitySection({ children, regionCodes, regionNames, currentUserId, onStartChat, onToast, onRegisterLocationActions, onLocationBusyChange }: CommunitySectionProps) {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("meetings");
  const [locationMode, setLocationMode] = useState<CommunityLocationMode>("region");
  const [currentLocationPoint, setCurrentLocationPoint] = useState<Wgs84Point | null>(null);
  const onToastRef = useRef(onToast);
  const regionCode = regionCodes.find(Boolean) ?? "";
  const regionName = regionNames.find(Boolean) ?? "우리 동네";

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    setLocationMode("region");
    setCurrentLocationPoint(null);
    onLocationBusyChange(false);
  }, [regionCodes, onLocationBusyChange]);

  const chooseRegion = useCallback(() => {
    setLocationMode("region");
    setCurrentLocationPoint(null);
    onLocationBusyChange(false);
  }, [onLocationBusyChange]);

  const searchCurrentLocation = useCallback(() => {
    setLocationMode("current");
    setCurrentLocationPoint(null);
    onLocationBusyChange(true);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onLocationBusyChange(false);
      onToastRef.current?.("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = parseCurrentLocationPoint(coords.latitude, coords.longitude);
        onLocationBusyChange(false);
        if (!point) {
          onToastRef.current?.("유효한 위치 좌표를 확인하지 못했습니다. 다시 시도해 주세요.");
          return;
        }
        setCurrentLocationPoint(point);
      },
      (error) => {
        onLocationBusyChange(false);
        onToastRef.current?.(error.code === error.PERMISSION_DENIED ? "위치 권한을 허용해야 현 위치를 검색할 수 있습니다." : "현재 위치를 확인하지 못했습니다. 다시 시도해 주세요.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, [onLocationBusyChange]);

  useEffect(() => {
    onRegisterLocationActions({ searchCurrentLocation, chooseRegion });
    return () => {
      onRegisterLocationActions(null);
      onLocationBusyChange(false);
    };
  }, [chooseRegion, onLocationBusyChange, onRegisterLocationActions, searchCurrentLocation]);

  const locationContext = { currentLocationRequested: locationMode === "current", currentLocationPoint };
  const communityContent = typeof children === "function" ? children(locationContext) : children;
  return (
    <section className="community-section">
      <div className="community-subtabs" role="tablist" aria-label="커뮤니티 메뉴">
        <button type="button" role="tab" aria-selected={activeTab === "meetings"} className={activeTab === "meetings" ? "active" : ""} onClick={() => setActiveTab("meetings")}>동네 모임</button>
        <button type="button" role="tab" aria-selected={activeTab === "marketplace"} className={activeTab === "marketplace" ? "active" : ""} onClick={() => setActiveTab("marketplace")}>동네 중고장터</button>
      </div>
      <div className="community-subtab-panel" role="tabpanel" hidden={activeTab !== "meetings"}>{communityContent}</div>
      <div className="community-subtab-panel" role="tabpanel" hidden={activeTab !== "marketplace"}>
        <CommunityMarketplace regionCode={regionCode} regionName={regionName} regionCodes={regionCodes} regionNames={regionNames} currentUserId={currentUserId} onStartChat={onStartChat} onToast={onToast} currentLocationRequested={locationContext.currentLocationRequested} currentLocationPoint={currentLocationPoint} />
      </div>
    </section>
  );
}
function CommunityMarketplace({ regionCode, regionName, regionCodes, currentUserId, onStartChat, onToast, currentLocationRequested, currentLocationPoint }: MarketplaceProps) {
  const manualBrowseRegionCodes = useMemo(() => regionCodes.length > 0 ? regionCodes : regionCode ? [regionCode] : [], [regionCodes, regionCode]);
  const currentRegionLabel = useMemo(() => manualBrowseRegionCodes.length > 0 ? formatConsumerBrowseRegionLabel(manualBrowseRegionCodes) : formatMarketplaceRegion(regionCode, regionName), [manualBrowseRegionCodes, regionCode, regionName]);
  const serverListingsQuery = trpc.marketplace.listListings.useQuery(
    { regionCodes: manualBrowseRegionCodes, clientUserId: currentUserId },
    { enabled: !currentLocationRequested && manualBrowseRegionCodes.length > 0, refetchInterval: 3_000, retry: false },
  );
  const uploadMarketplaceMedia = trpc.media.upload.useMutation();
  const publishMarketplaceListing = trpc.marketplace.publishListing.useMutation();
  const changeMarketplaceStatus = trpc.marketplace.changeStatus.useMutation();
  const deleteMarketplaceListing = trpc.marketplace.deleteListing.useMutation();
  const [savedListings, setSavedListings] = useState<MarketplaceListing[]>(readSavedListings);
  const [optimisticallyDeletedListingIds, setOptimisticallyDeletedListingIds] = useState<Set<number>>(() => new Set());
  const [favoriteState, setFavoriteState] = useState(() => ({ userId: currentUserId, ids: readFavoriteIds(currentUserId) }));
  const [listingStatusOverrides, setListingStatusOverrides] = useState(readMarketplaceStatusUpdates);
  const favoriteIds = favoriteState.userId === currentUserId ? favoriteState.ids : readFavoriteIds(currentUserId);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [listingMenuOpen, setListingMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingListing, setDeletingListing] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const listingMenuRef = useRef<HTMLDivElement>(null);
  const listingMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const deleteCancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { setStatusMenuOpen(false); setListingMenuOpen(false); }, [selectedListing?.id]);
  useEffect(() => {
    if (!statusMenuOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      const control = statusMenuRef.current;
      if (control && !control.contains(event.target as Node)) setStatusMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatusMenuOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [statusMenuOpen]);
  useEffect(() => {
    if (!listingMenuOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (listingMenuRef.current && !listingMenuRef.current.contains(event.target as Node)) setListingMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setListingMenuOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [listingMenuOpen]);
  useEffect(() => {
    if (!deleteConfirmOpen) {
      const returnFocus = deleteDialogReturnFocusRef.current;
      if (returnFocus?.isConnected) returnFocus.focus();
      deleteDialogReturnFocusRef.current = null;
      return;
    }
    deleteCancelButtonRef.current?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletingListing) {
        event.preventDefault();
        setDeleteConfirmOpen(false);
        setDeleteError("");
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = deleteDialogRef.current;
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")) : [];
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeys);
    return () => document.removeEventListener("keydown", handleDialogKeys);
  }, [deleteConfirmOpen, deletingListing]);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewModeration, setPreviewModeration] = useState<Awaited<ReturnType<typeof consumerApi.getPreviewCommunityModeration>> | null>(null);
  const previewMockMode = import.meta.env.DEV && isConsumerPreviewDemo();
  const communityActionBlocked = previewMockMode && (!previewModeration || previewModeration.currentAccountSanction === "restricted" || previewModeration.currentAccountSanction === "locked");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState<number | null>(null);
  const [isGiveaway, setIsGiveaway] = useState(false);
  const [description, setDescription] = useState("");
  const [photoDataUrls, setPhotoDataUrls] = useState<string[]>([]);
  const [retainedPhotoUrls, setRetainedPhotoUrls] = useState<string[]>([]);
  const [representativePhotoIndex, setRepresentativePhotoIndex] = useState(0);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [formError, setFormError] = useState("");
  const attemptedListingSyncRef = useRef(new Set<string>());
  const remoteListings = useMemo(
    () => (serverListingsQuery.data ?? []).map((listing) => normalizeListingPhotos(listing as MarketplaceListing)),
    [serverListingsQuery.data],
  );
  const selectedListingId = selectedListing?.id ?? null;

  useEffect(() => {
    if (selectedListingId === null) return;
    const latestRemote = remoteListings.find((listing) => listing.id === selectedListingId);
    const statusOverride = listingStatusOverrides[String(selectedListingId)];
    setSelectedListing((current) => {
      if (!current || current.id !== selectedListingId) return current;
      let latest = latestRemote ? { ...current, ...latestRemote } : current;
      const baseUpdatedAt = latest.updatedAt ?? latest.createdAt ?? 0;
      if (statusOverride && statusOverride.updatedAt >= baseUpdatedAt) {
        latest = { ...latest, status: statusOverride.status, updatedAt: statusOverride.updatedAt };
      }
      return latest;
    });
  }, [listingStatusOverrides, remoteListings, selectedListingId]);

  const persistListingToServer = useCallback(async (listing: MarketplaceListing) => {
    const photoUrls: string[] = (listing.photoUrls ?? []).filter(isDurablePhotoUrl).slice(0, MAX_LISTING_PHOTOS);
    for (const [index, dataBase64] of (listing.photoDataUrls ?? []).entries()) {
      if (photoUrls.length >= MAX_LISTING_PHOTOS) break;
      const encoded = dataBase64.split(",", 2)[1] ?? "";
      const sizeBytes = Math.floor(encoded.length * 3 / 4);
      const uploaded = await uploadMarketplaceMedia.mutateAsync({
        originalName: `marketplace-${listing.id}-${index + 1}.jpg`,
        mimeType: dataBase64.match(/^data:([^;]+);base64,/)?.[1] ?? "image/jpeg",
        sizeBytes: Math.max(1, sizeBytes),
        dataBase64,
      });
      photoUrls.push(uploaded.url);
    }
    const result = await publishMarketplaceListing.mutateAsync({
      clientUserId: currentUserId,
      sellerName: listing.sellerNickname,
      listing: {
        listingId: String(listing.id),
        title: listing.title,
        category: listing.category,
        price: listing.price,
        description: listing.description,
        regionCode: listing.regionCode,
        regionLabel: listing.regionLabel,
        photoUrls,
      },
    });
    return result;
  }, [currentUserId, publishMarketplaceListing.mutateAsync, uploadMarketplaceMedia.mutateAsync]);

  useEffect(() => {
    if (!serverListingsQuery.isSuccess) return;
    const knownIds = new Set(remoteListings.map((listing) => String(listing.id)));
    for (const listing of savedListings) {
      const id = String(listing.id);
      if (listing.sellerId !== currentUserId || knownIds.has(id) || attemptedListingSyncRef.current.has(id)) continue;
      attemptedListingSyncRef.current.add(id);
      void persistListingToServer(listing).then(() => serverListingsQuery.refetch()).catch(() => {
        // Keep the local listing intact; the server remains authoritative once sync succeeds.
      });
    }
  }, [currentUserId, persistListingToServer, remoteListings, savedListings, serverListingsQuery.isSuccess, serverListingsQuery.refetch]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LISTING_STORAGE_KEY, JSON.stringify(savedListings));
    } catch {
      console.warn("[중고장터] 로컬 저장에 실패했습니다.");
    }
  }, [savedListings]);

  useEffect(() => {
    if (favoriteState.userId !== currentUserId) {
      setFavoriteState({ userId: currentUserId, ids: readFavoriteIds(currentUserId) });
      return;
    }
    try {
      window.localStorage.setItem(favoriteStorageKey(currentUserId), JSON.stringify(favoriteState.ids));
    } catch {
      console.warn("[중고장터] 찜 상태 저장에 실패했습니다.");
    }
  }, [currentUserId, favoriteState]);

  useEffect(() => {
    const refresh = () => {
      const updates = readMarketplaceStatusUpdates();
      setListingStatusOverrides(updates);
      setSelectedListing((current) => {
        if (!current) return current;
        const update = updates[String(current.id)];
        if (!update || update.updatedAt < (current.updatedAt ?? current.createdAt ?? 0)) return current;
        return { ...current, status: update.status, updatedAt: update.updatedAt };
      });
    };
    const handleStatusChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ listingId: number; status: unknown; updatedAt: number }>).detail;
      const listingId = detail?.listingId;
      const status = detail?.status;
      const updatedAt = detail?.updatedAt;
      if (!detail || !Number.isSafeInteger(listingId) || !isMarketplaceListingStatus(status) || !Number.isFinite(updatedAt)) {
        refresh();
        return;
      }
      setListingStatusOverrides((current) => ({
        ...current,
        [String(listingId)]: { status, updatedAt },
      }));
      setSelectedListing((current) => current?.id === listingId ? { ...current, status, updatedAt } : current);
    };
    window.addEventListener(MARKETPLACE_STATUS_CHANGED_EVENT, handleStatusChanged);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MARKETPLACE_STATUS_CHANGED_EVENT, handleStatusChanged);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!previewMockMode) { setPreviewModeration(null); return; }
    let mounted = true;
    const refresh = () => {
      void consumerApi.getPreviewCommunityModeration().then(value => { if (mounted) setPreviewModeration(value); }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [previewMockMode]);

  useEffect(() => {
    setSelectedListing(null);
    setDetailPhotoIndex(0);
  }, [currentLocationPoint, currentLocationRequested, manualBrowseRegionCodes]);

  const listings = useMemo(() => {
    const seeded = import.meta.env.DEV ? createDemoMarketplaceListings(regionCode, currentRegionLabel) : [];
    const local = import.meta.env.DEV ? (currentLocationRequested ? savedListings : filterByRegionCodes(savedListings, manualBrowseRegionCodes)) : [];
    const unique = new Map<number, MarketplaceListing>();
    for (const listing of [...remoteListings, ...local, ...seeded]) {
      if (optimisticallyDeletedListingIds.has(listing.id)) continue;
      if (!unique.has(listing.id)) unique.set(listing.id, listing);
    }
    return [...unique.values()]
      .map((listing) => {
        const statusUpdate = listingStatusOverrides[String(listing.id)];
        return {
          ...listing,
          regionLabel: currentLocationRequested || manualBrowseRegionCodes.length > 1 ? listing.regionLabel : currentRegionLabel,
          ...(statusUpdate && statusUpdate.updatedAt >= (listing.updatedAt ?? listing.createdAt ?? 0)
            ? { status: statusUpdate.status, updatedAt: statusUpdate.updatedAt }
            : {}),
        };
      })
      .filter(listing => !previewModeration?.hiddenMarketplaceSourceKeys.includes(previewActivitySourceKey(`listing-${listing.listingId ?? listing.id}`)))
      .sort((a, b) => {
        const aCompleted = a.status === "거래완료";
        const bCompleted = b.status === "거래완료";
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
        return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
      });
  }, [currentLocationRequested, currentRegionLabel, listingStatusOverrides, manualBrowseRegionCodes, optimisticallyDeletedListingIds, previewModeration?.hiddenMarketplaceSourceKeys, regionCode, remoteListings, savedListings]);

  const communityBrowseListings = useMemo(
    () => filterCommunityRecordsByLocation(listings, currentLocationRequested ? "current" : "region", currentLocationPoint),
    [currentLocationPoint, currentLocationRequested, listings],
  );

  useEffect(() => {
    if (currentLocationRequested) return;
    const snapshot = communityBrowseListings.slice(0, 1000).map(listing => ({
      sourceKey: previewActivitySourceKey(`listing-${listing.listingId ?? listing.id}`),
      title: listing.title || "중고 상품", category: listing.category || "기타",
      sellerLabel: listing.sellerNickname || "Preview 판매자",
      ...(findAdminRegionByCode(listing.regionCode) ? { regionCode: listing.regionCode } : {}),
      priceKrw: listing.price === null ? null : Math.max(0, Math.round(listing.price)),
      status: listing.status === "거래완료" ? "sold" as const : listing.status === "예약중" ? "reserved" as const : "for_sale" as const,
      createdAt: normalizePreviewDate(listing.createdAt), updatedAt: normalizePreviewDate(listing.updatedAt ?? listing.createdAt),
      chatCount: Math.max(0, Math.trunc(listing.chatCount ?? 0)),
    }));
    void syncPreviewActivitySnapshot({ marketplace: snapshot });
  }, [communityBrowseListings, currentLocationRequested]);

  const favoriteListings = useMemo(
    () => communityBrowseListings.filter((listing) => favoriteIds.includes(listing.id)),
    [communityBrowseListings, favoriteIds],
  );
  const categoryFilters = useMemo(
    () => ["전체", ...Array.from(new Set([...CATEGORIES, ...communityBrowseListings.map((listing) => listing.category)]))],
    [communityBrowseListings],
  );
  const filteredListings = useMemo(
    () => categoryFilter === "전체" ? communityBrowseListings : communityBrowseListings.filter((listing) => listing.category === categoryFilter),
    [categoryFilter, communityBrowseListings],
  );
  const similarListings = useMemo(
    () => getMarketplaceRecommendations(selectedListing, communityBrowseListings, 5, currentUserId),
    [communityBrowseListings, currentUserId, selectedListing],
  );

  const toggleFavorite = (listing: MarketplaceListing) => {
    setFavoriteState(current => {
      const currentIds = current.userId === currentUserId ? current.ids : readFavoriteIds(currentUserId);
      const nextIds = currentIds.includes(listing.id)
        ? currentIds.filter(id => id !== listing.id)
        : [...currentIds, listing.id];
      return { userId: currentUserId, ids: nextIds };
    });
  };

  const openListingDetail = (listing: MarketplaceListing) => {
    setDetailPhotoIndex(0);
    if (detailScrollRef.current) detailScrollRef.current.scrollTop = 0;
    setSelectedListing(listing);
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files ?? []);
    input.value = "";
    if (!selectedFiles.length) return;

    const remaining = MAX_LISTING_PHOTOS - photoDataUrls.length - retainedPhotoUrls.length;
    if (remaining <= 0) {
      setFormError("사진은 최대 6장까지 등록할 수 있습니다.");
      return;
    }
    const files = selectedFiles.slice(0, remaining);
    let nextError = selectedFiles.length > remaining ? "사진은 최대 6장까지 등록할 수 있습니다." : "";
    const validFiles: File[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        nextError = "이미지 파일만 등록할 수 있습니다.";
        continue;
      }
      if (file.size > MAX_INPUT_PHOTO_BYTES) {
        nextError = "각 사진은 2MB 이하로 선택해 주세요.";
        continue;
      }
      validFiles.push(file);
    }
    if (!validFiles.length) {
      setFormError(nextError || "이미지 파일을 선택해 주세요.");
      return;
    }

    setPhotoProcessing(true);
    try {
      const compressed = await Promise.all(validFiles.map(compressPhotoFile));
      setPhotoDataUrls(current => [...current, ...compressed].slice(0, MAX_LISTING_PHOTOS));
      setFormError(nextError);
    } catch {
      setFormError("사진을 불러오지 못했습니다. 다시 선택해 주세요.");
    } finally {
      setPhotoProcessing(false);
    }
  };

  const removePhoto = (photoIndex: number) => {
    setPhotoDataUrls(current => current.filter((_, index) => index !== photoIndex));
    setRepresentativePhotoIndex(current => {
      if (current === photoIndex) return 0;
      return current > photoIndex ? current - 1 : current;
    });
    setFormError("");
  };

  const resetForm = () => {
    setTitle("");
    setCategory(CATEGORIES[0]);
    setPrice(null);
    setIsGiveaway(false);
    setDescription("");
    setPhotoDataUrls([]);
    setRetainedPhotoUrls([]);
    setRepresentativePhotoIndex(0);
    setPhotoProcessing(false);
    setFormError("");
    setEditingListing(null);
  };

  const submitListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (communityActionBlocked) {
      setFormError("관리자 조치 또는 계정 상태 확인 전에는 매물을 등록하거나 수정할 수 없습니다.");
      return;
    }
    if (photoProcessing) return;
    const numericPrice = price ?? 0;
    if (!title.trim()) {
      setFormError("상품명을 입력해 주세요.");
      return;
    }
    if (!isGiveaway && (price === null || !Number.isFinite(price) || price <= 0)) {
      setFormError("판매 가격을 입력하거나 나눔을 선택해 주세요.");
      return;
    }
    if (!import.meta.env.DEV && !serverListingsQuery.isSuccess) {
      setFormError("중고 상품 서버 연결을 확인한 뒤 다시 등록해 주세요.");
      return;
    }
    const primaryIndex = Math.max(0, Math.min(representativePhotoIndex, photoDataUrls.length - 1));
    const orderedPhotoDataUrls = photoDataUrls.length
      ? [photoDataUrls[primaryIndex], ...photoDataUrls.filter((_, index) => index !== primaryIndex)]
      : [];
    const now = Date.now();
    const listing: MarketplaceListing = editingListing ? {
      ...editingListing,
      title: title.trim(),
      category,
      price: isGiveaway ? 0 : numericPrice,
      description: description.trim() || "동네 이웃과 편하게 거래해요.",
      updatedAt: now,
      photoDataUrls: orderedPhotoDataUrls,
      photoUrls: retainedPhotoUrls,
    } : {
      id: now,
      title: title.trim(),
      category,
      price: isGiveaway ? 0 : numericPrice,
      description: description.trim() || "동네 이웃과 편하게 거래해요.",
      regionCode,
      regionLabel: currentRegionLabel,
      createdLabel: "방금 전",
      createdAt: now,
      sellerId: currentUserId,
      sellerNickname: "나",
      favoriteCount: 0,
      chatCount: 0,
      status: "판매중",
      tone: "peach",
      ...(orderedPhotoDataUrls.length ? { photoDataUrls: orderedPhotoDataUrls } : {}),
    };
    if (!import.meta.env.DEV) {
      try {
        await persistListingToServer(listing);
      } catch {
        setFormError("상품을 서버에 저장하지 못했습니다. 입력 내용은 그대로 두었으니 다시 시도해 주세요.");
        return;
      }
    }
    const wasEditing = Boolean(editingListing);
    setSavedListings((current) => wasEditing
      ? current.map((saved) => saved.id === listing.id ? listing : saved)
      : [listing, ...current]);
    setCreateOpen(false);
    resetForm();
    if (serverListingsQuery.isSuccess) {
      try {
        if (import.meta.env.DEV) await persistListingToServer(listing);
        await serverListingsQuery.refetch();
        onToast?.(wasEditing ? "상품이 수정되었습니다." : "상품이 서버에 등록되어 동네 이웃에게 표시됩니다.");
      } catch {
        onToast?.("상품은 이 기기에 저장되었습니다. 서버 연결이 복구되면 다시 동기화할 수 있습니다.");
      }
    } else {
      onToast?.(wasEditing ? "상품이 수정되었습니다." : "상품이 이 기기에 저장되었습니다.");
    }
  };

  const changeListingStatus = (status: ListingStatus) => {
    if (!selectedListing || !canManageListing(selectedListing, currentUserId) || selectedListing.status === status) return;
    const listing = selectedListing;
    const hasServerRecord = Boolean(listing.listingId && serverListingsQuery.isSuccess);
    if (!hasServerRecord && !import.meta.env.DEV) return;

    const updatedAt = Date.now();
    saveMarketplaceStatusUpdate(listing.id, status, updatedAt);
    setListingStatusOverrides((current) => ({ ...current, [String(listing.id)]: { status, updatedAt } }));
    setSelectedListing((current) => current?.id === listing.id ? { ...current, status, updatedAt } : current);

    if (hasServerRecord && listing.listingId) {
      void changeMarketplaceStatus.mutateAsync({ listingId: listing.listingId, clientUserId: currentUserId, status })
        .then(() => { void serverListingsQuery.refetch(); })
        .catch(() => {
          const rollbackAt = Date.now();
          saveMarketplaceStatusUpdate(listing.id, listing.status, rollbackAt);
          setSelectedListing((current) => current?.id === listing.id ? { ...current, status: listing.status, updatedAt: rollbackAt } : current);
          onToast?.("거래 상태를 서버에 저장하지 못했습니다.");
        });
    }
  };

  const startEditingListing = () => {
    const listing = selectedListing;
    if (communityActionBlocked) {
      onToast?.("관리자 조치로 매물 수정이 제한되어 있습니다.");
      return;
    }
    if (!listing || !canManageListing(listing, currentUserId)) return;
    setEditingListing(listing);
    setTitle(listing.title);
    setCategory(CATEGORIES.includes(listing.category) ? listing.category : "기타");
    setPrice(listing.price);
    setIsGiveaway(listing.price === null || listing.price === 0);
    setDescription(listing.description);
    setPhotoDataUrls((listing.photoDataUrls ?? []).filter((photo) => photo.startsWith("data:image/")).slice(0, MAX_LISTING_PHOTOS));
    setRetainedPhotoUrls((listing.photoUrls ?? []).filter(isDurablePhotoUrl).slice(0, MAX_LISTING_PHOTOS));
    setRepresentativePhotoIndex(0);
    setFormError("");
    setListingMenuOpen(false);
    setSelectedListing(null);
    setCreateOpen(true);
  };

  const confirmDeleteListing = async () => {
    const listing = selectedListing;
    if (!listing || !canManageListing(listing, currentUserId) || deletingListing) return;
    setDeletingListing(true);
    setDeleteError("");
    try {
      if (listing.listingId) {
        await deleteMarketplaceListing.mutateAsync({ listingId: listing.listingId, clientUserId: currentUserId });
      } else if (!import.meta.env.DEV) {
        throw new Error("게시글을 삭제할 수 없습니다.");
      }
      setOptimisticallyDeletedListingIds((current) => new Set(current).add(listing.id));
      setSavedListings((current) => current.filter((saved) => saved.id !== listing.id));
      setFavoriteState((current) => ({ ...current, ids: current.ids.filter((id) => id !== listing.id) }));
      setDeleteConfirmOpen(false);
      setSelectedListing(null);
      setDetailPhotoIndex(0);
      onToast?.("삭제되었습니다");
      if (listing.listingId) void serverListingsQuery.refetch();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "게시글을 삭제하지 못했습니다.");
    } finally {
      setDeletingListing(false);
    }
  };

  const startChat = (listing: MarketplaceListing) => {
    if (communityActionBlocked) {
      onToast?.("관리자 조치로 거래 문의가 제한되어 있습니다.");
      return;
    }
    if (canManageListing(listing, currentUserId)) {
      onToast?.("내가 등록한 상품에는 거래 문의를 보낼 수 없어요.");
      return;
    }
    setSelectedListing(null);
    onStartChat(listing);
  };

  return (
    <div className="marketplace-page community-marketplace">
      {previewMockMode && (!previewModeration || previewModeration.currentAccountSanction !== "clear") && <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[15px] font-bold leading-6 text-amber-950">{!previewModeration ? "Preview 계정 조치 상태를 확인 중입니다. 확인 전에는 새 매물 등록과 거래 문의가 제한됩니다." : previewModeration.currentAccountSanction === "warning" ? "커뮤니티 이용 경고가 등록되어 있습니다. 커뮤니티 이용 수칙을 확인해 주세요." : previewModeration.currentAccountSanction === "restricted" ? "관리자 조치로 새 매물 등록과 거래 문의가 일시 제한되어 있습니다." : previewModeration.currentAccountSanction === "locked" ? "관리자 조치로 커뮤니티 활동이 잠겨 있습니다. 기간 만료 또는 관리자 해제 후 이용할 수 있습니다." : ""}</div>}
      <section className="marketplace-favorites" aria-label="내가 찜한 상품">
        <div className="marketplace-favorites-heading"><h3>내가 찜한 상품</h3>{favoriteListings.length > 0 && <span>{favoriteListings.length}개</span>}</div>
        {favoriteListings.length === 0 ? (
          <p className="marketplace-favorites-empty"><Star size={15} aria-hidden="true" /> 상품 카드의 별표를 눌러 찜해 보세요.</p>
        ) : (
          <div className="marketplace-favorites-scroll" aria-live="polite">
            {favoriteListings.map((listing) => (
              <button
                type="button"
                className="marketplace-favorite-item"
                key={listing.id}
                aria-label={`${listing.title} 상세 보기`}
                onClick={() => openListingDetail(listing)}
              >
                <ListingImage listing={listing} compact />
                <span>{listing.title}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="marketplace-category-row" role="tablist" aria-label="중고장터 카테고리">
        {categoryFilters.map((item) => (
          <button type="button" role="tab" aria-selected={categoryFilter === item} className={categoryFilter === item ? "active" : ""} key={item} onClick={() => setCategoryFilter(item)}>{item}</button>
        ))}
      </div>
      <div className="marketplace-feed" aria-label="중고 상품 목록">
        {filteredListings.length === 0 ? <p className="marketplace-feed-empty">{currentLocationRequested ? "현 위치 5km 이내에 위치 정보가 등록된 장터 상품이 없습니다. 장터 상품은 위치 정보가 없을 수 있으니 동네를 직접 선택해 다시 찾아보세요." : "선택한 카테고리에 상품이 없습니다."}</p> : filteredListings.map((listing) => {
          const isFavorite = favoriteIds.includes(listing.id);
          return (
            <article className={`marketplace-listing ${listing.status === "거래완료" ? "is-completed" : ""}`} key={listing.id}>
              <button type="button" className="marketplace-listing-open" aria-label={`${listing.title} 상품 상세 보기`} onClick={() => openListingDetail(listing)}>
                <ListingImage listing={listing} compact />
                <span className="marketplace-listing-copy">
                  <span className="marketplace-listing-title-row"><strong>{listing.title}</strong></span>
                  <span className="marketplace-listing-meta">{listing.regionLabel} <i>·</i> {listing.createdLabel}</span>
                  <span className="marketplace-listing-price-row">
                    <b className={`marketplace-price ${listing.price === null || listing.price === 0 ? "giveaway" : ""}`}>{priceLabel(listing.price)}</b>
                    <em className={`marketplace-status marketplace-status-${listing.status === "판매중" ? "selling" : listing.status === "예약중" ? "reserved" : "done"}`}>{listing.status}</em>
                  </span>
                  <span className="marketplace-listing-stats"><span><MessageCircle size={14} /> {listing.chatCount}</span></span>
                </span>
              </button>
              <button type="button" className={`marketplace-listing-favorite ${isFavorite ? "active" : ""}`} aria-label={isFavorite ? `${listing.title} 찜 해제` : `${listing.title} 찜하기`} aria-pressed={isFavorite} onClick={(event) => { event.stopPropagation(); toggleFavorite(listing); }}>
                <Star size={18} fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
                <span>{listing.favoriteCount + (isFavorite ? 1 : 0)}</span>
              </button>
            </article>
          );
        })}
      </div>
      <button type="button" className="marketplace-fab" onClick={() => { if (communityActionBlocked) { onToast?.("관리자 조치로 매물 등록이 제한되어 있습니다."); return; } resetForm(); setCreateOpen(true); }} aria-label="중고 상품 판매하기" disabled={communityActionBlocked}><Plus size={19} strokeWidth={2.8} /><span>판매하기</span></button>

      {selectedListing && (
        <div className="marketplace-overlay marketplace-detail-overlay" onClick={() => setSelectedListing(null)}>
          <section className="marketplace-sheet marketplace-detail-sheet" role="dialog" aria-modal="true" aria-label="상품 상세" onClick={(event) => event.stopPropagation()}>
            <div className="marketplace-detail-scroll" ref={detailScrollRef}>
              <div className="marketplace-detail-hero">
                <ListingGallery listing={selectedListing} index={detailPhotoIndex} onIndexChange={setDetailPhotoIndex} />
                <button type="button" className="marketplace-detail-back" onClick={() => setSelectedListing(null)} aria-label="상품 상세 닫기"><X size={22} /></button>
                {canManageListing(selectedListing, currentUserId) && (
                  <div className="marketplace-detail-menu-anchor" ref={listingMenuRef}>
                    <button type="button" className="marketplace-detail-menu-trigger" ref={listingMenuTriggerRef} aria-label="게시글 관리 메뉴" aria-haspopup="menu" aria-expanded={listingMenuOpen} onClick={() => setListingMenuOpen((open) => !open)}><MoreVertical size={20} aria-hidden="true" /></button>
                    {listingMenuOpen && (
                      <div className="marketplace-detail-menu" role="menu" aria-label="게시글 관리">
                        <button type="button" role="menuitem" onClick={startEditingListing}>수정하기</button>
                        <button type="button" role="menuitem" className="danger" onClick={() => { deleteDialogReturnFocusRef.current = listingMenuTriggerRef.current; setListingMenuOpen(false); setDeleteError(""); setDeleteConfirmOpen(true); }}>삭제하기</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="marketplace-detail-content">
                <div className="marketplace-status-line">
                  <span>{selectedListing.regionLabel} <i>·</i> {selectedListing.createdLabel}</span>
                  <div className="marketplace-status-control" ref={statusMenuRef}>
                    <b className={`marketplace-status marketplace-status-${selectedListing.status === "판매중" ? "selling" : selectedListing.status === "예약중" ? "reserved" : "done"}`}>{selectedListing.status}</b>
                    {canManageListing(selectedListing, currentUserId) && (
                      <button
                        type="button"
                        className="marketplace-status-menu-trigger"
                        aria-label="판매 상태 변경"
                        aria-haspopup="menu"
                        aria-expanded={statusMenuOpen}
                        onClick={() => setStatusMenuOpen((open) => !open)}
                      ><ChevronDown size={16} aria-hidden="true" /></button>
                    )}
                    {statusMenuOpen && canManageListing(selectedListing, currentUserId) && (
                      <div className="marketplace-status-dropdown" role="menu" aria-label="거래 상태 선택">
                        {(["판매중", "예약중", "거래완료"] as ListingStatus[]).map((status) => (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={selectedListing.status === status}
                            className={`marketplace-status-dropdown-option marketplace-status-dropdown-${status === "판매중" ? "selling" : status === "예약중" ? "reserved" : "done"}`}
                            key={status}
                            onClick={() => { changeListingStatus(status); setStatusMenuOpen(false); }}
                          >{status}{selectedListing.status === status && <Check size={14} aria-hidden="true" />}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {!canManageListing(selectedListing, currentUserId) && (
                  <div className="marketplace-detail-actions marketplace-detail-actions-inline">
                    <button type="button" className={`marketplace-star-button ${favoriteIds.includes(selectedListing.id) ? "active" : ""}`} aria-label={favoriteIds.includes(selectedListing.id) ? `${selectedListing.title} 찜 해제` : `${selectedListing.title} 찜하기`} aria-pressed={favoriteIds.includes(selectedListing.id)} onClick={() => toggleFavorite(selectedListing)}><Star size={20} fill={favoriteIds.includes(selectedListing.id) ? "currentColor" : "none"} aria-hidden="true" /><span>{selectedListing.favoriteCount + (favoriteIds.includes(selectedListing.id) ? 1 : 0)}</span></button>
                    <button type="button" className="marketplace-chat-button" aria-label={selectedListing.status === "거래완료" ? "거래가 완료된 상품" : `${selectedListing.title} 판매자와 채팅하기`} disabled={selectedListing.status === "거래완료"} onClick={() => startChat(selectedListing)}>
                      <MessageCircle size={18} aria-hidden="true" />
                      {selectedListing.status === "거래완료" ? "거래가 완료됐어요" : "채팅하기"}
                    </button>
                  </div>
                )}
                <div className="marketplace-detail-title"><h2>{selectedListing.title}</h2><strong className={selectedListing.price === null || selectedListing.price === 0 ? "giveaway" : ""}>{priceLabel(selectedListing.price)}</strong></div>
                <div className="marketplace-detail-description"><p>{selectedListing.description}</p><span>관심 {selectedListing.favoriteCount + (favoriteIds.includes(selectedListing.id) ? 1 : 0)} · 채팅 {selectedListing.chatCount}</span></div>
                <section className="marketplace-similar-section" aria-label="비슷한 상품">
                  <div className="marketplace-similar-heading">
                    <h3>비슷한 상품</h3>
                    {similarListings.length > 0 && <span>{similarListings.length}개</span>}
                  </div>
                  {similarListings.length === 0 ? (
                    <p className="marketplace-similar-empty">이 동네에 비슷한 상품이 아직 없어요.</p>
                  ) : (
                    <div className="marketplace-similar-scroll" aria-label="비슷한 상품 목록">
                      {similarListings.map((listing) => {
                        const photo = getListingDisplayPhotos(listing)[0];
                        return (
                          <button
                            type="button"
                            className="marketplace-similar-card"
                            key={listing.id}
                            aria-label={`${listing.title} 상품 상세 보기`}
                            onClick={() => openListingDetail(listing)}
                          >
                            <span className="marketplace-similar-image">
                              {photo ? <img src={photo} alt="" loading="lazy" /> : <Package size={28} aria-hidden="true" />}
                            </span>
                            <span className="marketplace-similar-title">{listing.title}</span>
                            <strong>{priceLabel(listing.price)}</strong>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
      )}

      {deleteConfirmOpen && selectedListing && (
        <div className="marketplace-delete-confirm-overlay" role="presentation" onClick={() => { if (!deletingListing) { setDeleteConfirmOpen(false); setDeleteError(""); } }}>
          <section className="marketplace-delete-confirm" ref={deleteDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="marketplace-delete-title" aria-describedby="marketplace-delete-description" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <h2 id="marketplace-delete-title">게시글을 삭제하시겠습니까?</h2>
            <p id="marketplace-delete-description">이 게시글과 연결된 거래 채팅도 함께 삭제됩니다.</p>
            {deleteError && <p className="marketplace-delete-error" role="alert">{deleteError}</p>}
            <div className="marketplace-delete-actions">
              <button type="button" ref={deleteCancelButtonRef} onClick={() => { setDeleteConfirmOpen(false); setDeleteError(""); }} disabled={deletingListing}>취소</button>
              <button type="button" className="confirm" onClick={() => void confirmDeleteListing()} disabled={deletingListing}>{deletingListing ? "삭제 중" : "삭제하기"}</button>
            </div>
          </section>
        </div>
      )}

      {createOpen && (
        <div className="marketplace-overlay marketplace-create-overlay" onClick={() => { if (photoProcessing) return; setCreateOpen(false); resetForm(); }}>
          <section className="marketplace-sheet marketplace-create-sheet" role="dialog" aria-modal="true" aria-label={editingListing ? "중고거래 글 수정" : "중고거래 글쓰기"} onClick={(event) => event.stopPropagation()}>
            <header className="marketplace-sheet-header marketplace-create-header"><div><strong>{editingListing ? "중고거래 글 수정" : "중고거래 글쓰기"}</strong><span>{currentRegionLabel}</span></div><button type="button" onClick={() => { if (photoProcessing) return; setCreateOpen(false); resetForm(); }} aria-label="등록 닫기" disabled={photoProcessing}><X size={20} /></button></header>
            <form className="marketplace-create-form" onSubmit={submitListing}>
              <div className="marketplace-create-fields">
                <div className="marketplace-photo-manager">
                  <label className={`marketplace-photo-upload ${photoDataUrls.length + retainedPhotoUrls.length >= MAX_LISTING_PHOTOS ? "disabled" : ""}`}>
                    <Camera size={24} aria-hidden="true" />
                    <strong>사진 추가 ({photoDataUrls.length + retainedPhotoUrls.length}/6)</strong>
                    <span>{photoProcessing ? "사진 처리 중" : "최대 6장 · 원하는 대표 사진 선택"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={photoProcessing || photoDataUrls.length + retainedPhotoUrls.length >= MAX_LISTING_PHOTOS}
                      onChange={handlePhotoChange}
                      aria-label="상품 사진 여러 장 선택"
                    />
                  </label>
                  {(photoDataUrls.length + retainedPhotoUrls.length) > 0 && (
                    <div className="marketplace-photo-preview-list" aria-label="등록할 사진 미리보기">
                      {retainedPhotoUrls.map((photo, photoIndex) => (
                        <div className="marketplace-photo-preview" key={`existing-${photo}`}>
                          <img src={photo} alt={`기존 상품 사진 ${photoIndex + 1}`} />
                          <span className="marketplace-photo-primary-label">기존</span>
                          <button type="button" className="marketplace-photo-delete" onClick={() => setRetainedPhotoUrls((current) => current.filter((_, index) => index !== photoIndex))} aria-label={`기존 사진 ${photoIndex + 1} 삭제`}><X size={14} /></button>
                        </div>
                      ))}
                      {photoDataUrls.map((photo, photoIndex) => {
                        const isRepresentative = photoIndex === representativePhotoIndex;
                        return (
                          <div
                            className={`marketplace-photo-preview ${isRepresentative ? "is-representative" : ""}`}
                            key={`${photoIndex}-${photo.slice(-24)}`}
                          >
                            <button
                              type="button"
                              className="marketplace-photo-preview-select"
                              onClick={() => setRepresentativePhotoIndex(photoIndex)}
                              aria-pressed={isRepresentative}
                              aria-label={`사진 ${photoIndex + 1}을 대표 사진으로 선택`}
                            >
                              <img src={photo} alt={`등록할 상품 사진 ${photoIndex + 1}`} />
                            </button>
                            {isRepresentative && <span className="marketplace-photo-primary-label">대표</span>}
                            <button
                              type="button"
                              className="marketplace-photo-delete"
                              onClick={() => removePhoto(photoIndex)}
                              aria-label={`사진 ${photoIndex + 1} 삭제`}
                            >
                              <X size={14} />
                            </button>
                            <button
                              type="button"
                              className="marketplace-photo-make-primary"
                              onClick={() => setRepresentativePhotoIndex(photoIndex)}
                              aria-pressed={isRepresentative}
                              disabled={isRepresentative}
                            >
                              {isRepresentative ? "대표 사진" : "대표 선택"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <label className="marketplace-form-field"><span>상품명</span><input value={title} onChange={(event) => setTitle(removeEmojiText(event.target.value))} placeholder="어떤 물건을 판매하나요?" maxLength={40} /></label>
                <label className="marketplace-form-field"><span>카테고리</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <div className="marketplace-form-field"><span>가격</span><div className="marketplace-price-input-row"><input type="text" inputMode="numeric" value={isGiveaway ? "무료 나눔" : formatMarketplacePrice(price)} onChange={(event) => setPrice(parseMarketplacePriceInput(event.target.value))} placeholder="가격을 입력해 주세요" disabled={isGiveaway} aria-label="가격 입력" />{!isGiveaway && <span aria-hidden="true">원</span>}</div><label className="marketplace-giveaway-check"><input type="checkbox" checked={isGiveaway} onChange={(event) => { const checked = event.target.checked; setIsGiveaway(checked); setPrice(checked ? 0 : null); setFormError(""); }} /><span>무료 나눔으로 올리기</span></label></div>
                <label className="marketplace-form-field"><span>자세한 설명</span><textarea value={description} onChange={(event) => setDescription(removeEmojiText(event.target.value))} placeholder="상품 상태와 거래 방법을 적어주세요." rows={3} maxLength={500} /></label>
                {formError && <p className="marketplace-form-error" role="alert">{formError}</p>}
              </div>
              <footer className="marketplace-create-footer"><button type="submit" className="marketplace-submit-button" disabled={photoProcessing}>{editingListing ? "수정 완료" : "동네에 올리기"}</button></footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
