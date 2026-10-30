import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronDown, Flag, MessageCircle, Package, Pencil, Plus, Send, ShieldBan, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isConsumerPreviewDemo } from "@/lib/preview-demo";
import { normalizePreviewDate, previewActivitySourceKey, submitPreviewReportSnapshot } from "@/lib/consumer-activity-preview-sync";
import type { MarketplaceListing } from "./CommunityMarketplace";
import type { PartnerStore } from "./PartnerStorePicker";
import { getDemoMarketplaceImageUrl } from "./marketplace-demo-data";
import { ChatRoomLayout } from "../chat/ChatRoomLayout";
import "./MarketplaceChatPanel.css";
import { canManageMarketplaceListing, MARKETPLACE_STATUS_CHANGED_EVENT, readMarketplaceStatusUpdates, saveMarketplaceStatusUpdate, type MarketplaceListingStatus } from "./marketplace-status";
import { isScopedChatStateFor, resolveScopedChatState, updateScopedChatState, type ScopedChatState } from "./marketplace-chat-state";
import { chatRoomDataScope } from "@/lib/chat-room-scope";
import { markMarketplaceChatRoomDeleted, readDeletedMarketplaceChatRooms, removeMarketplaceChatRoomData } from "@/lib/completed-chat-archive";
import type { ArchivedCommunityChat } from "@/lib/completed-chat-archive";

export type CommunityChatSubtab = "meetings" | "marketplace" | "completed";

type DirectMessage = {
  id: string;
  sender: "buyer" | "seller" | "system";
  senderId?: string;
  text: string;
  image?: string;
  createdAt: number;
  readByOther?: boolean;
};

type DirectRoom = {
  id: string;
  listing: MarketplaceListing;
  messages: DirectMessage[];
  updatedAt: number;
  viewerRole?: "buyer" | "seller";
  buyerName?: string;
  sellerName?: string;
  lastMessage?: string;
  unreadCount?: number | null;
  messageCount?: number | null;
  blockedByMe?: boolean;
  blockedByOther?: boolean;
  serverBacked?: boolean;
};

type MarketplaceChatPanelProps = {
  currentUserId: string;
  pendingListing: MarketplaceListing | null;
  onPendingListingHandled: () => void;
  onBackToList: () => void;
  completedOnly?: boolean;
  archivedChatRooms?: ArchivedCommunityChat[];
  onDeleteArchivedChatRoom?: (room: ArchivedCommunityChat) => Promise<void> | void;
  renderMeetingDateTimePicker: (value: string, onChange: (value: string) => void) => ReactNode;
  renderMeetingPartnerPicker: (onSelect: (store: MarketplaceScheduleStore) => void, onClose: () => void) => ReactNode;
};

type CompletedDeleteTarget = { kind: "marketplace"; room: DirectRoom } | { kind: "community"; room: ArchivedCommunityChat };

type MarketplaceScheduleStore = PartnerStore;

function removeEmoji(value: string): string {
  return value
    .replace(/(?:[#*0-9]\uFE0F?\u20E3)|[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function directRoomId(currentUserId: string, listing: MarketplaceListing): string {
  return `marketplace:${currentUserId}:${listing.sellerId}:${listing.id}`;
}

function localDisplayName(): string {
  try {
    const profile = JSON.parse(window.localStorage.getItem("dangam_user_profile") ?? "{}") as { nickname?: unknown };
    return typeof profile.nickname === "string" ? removeEmoji(profile.nickname).slice(0, 120) || "이웃" : "이웃";
  } catch {
    return "이웃";
  }
}

function readRooms(storageKey: string): DirectRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is DirectRoom => {
      if (!value || typeof value !== "object") return false;
      const room = value as Partial<DirectRoom>;
      return typeof room.id === "string"
        && Boolean(room.listing && typeof room.listing === "object")
        && typeof room.listing?.title === "string"
        && typeof room.listing?.sellerId === "string"
        && Array.isArray(room.messages)
        && typeof room.updatedAt === "number";
    });
  } catch {
    return [];
  }
}


function moneyLabel(price: number | null): string {
  return price === null ? "나눔" : `${new Intl.NumberFormat("ko-KR").format(price)}원`;
}

function compactTime(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return "방금 전";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  return new Date(timestamp).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function defaultLocalDateTime(): string {
  const local = new Date(Date.now() + 60 * 60 * 1000);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function marketplaceNicknameKey(userId: string, roomId: string): string {
  return `dangam_chat_nickname_${chatRoomDataScope("used", roomId)}:${encodeURIComponent(userId)}`;
}

function readMarketplaceChatNickname(userId: string, roomId: string | null): string {
  if (!roomId) return localDisplayName();
  try {
    const nickname = window.localStorage.getItem(marketplaceNicknameKey(userId, roomId));
    return nickname?.trim().slice(0, 24) || localDisplayName();
  } catch {
    return localDisplayName();
  }
}

function statusClass(status: MarketplaceListing["status"]): string {
  if (status === "판매중") return "selling";
  if (status === "예약중") return "reserved";
  return "done";
}

function ListingVisual({ listing, compact = false }: { listing: MarketplaceListing; compact?: boolean }) {
  const title = removeEmoji(listing.title) || "중고 상품";
  const representativePhoto = listing.photoUrls?.[0] ?? listing.photoDataUrls?.[0] ?? listing.photoDataUrl ?? getDemoMarketplaceImageUrl(listing.id);
  return (
    <span className={`marketplace-chat-product-visual ${compact ? "compact" : ""}`} aria-label={`${title} 상품 사진`}>
      {representativePhoto ? <img src={representativePhoto} alt="" /> : <Package size={compact ? 22 : 25} aria-hidden="true" />}
    </span>
  );
}

function persistedRoom(room: DirectRoom): DirectRoom {
  const listing = { ...room.listing };
  const representativePhoto = listing.photoDataUrls?.[0] ?? listing.photoDataUrl;
  listing.photoDataUrls = representativePhoto && representativePhoto.length <= 350_000 ? [representativePhoto] : [];
  delete listing.photoDataUrl;
  return { ...room, listing };
}

function syncRoomStatuses(rooms: DirectRoom[]): DirectRoom[] {
  const updates = readMarketplaceStatusUpdates();
  return rooms.map((room) => {
    const update = updates[String(room.listing.id)];
    if (!update) return room;
    return {
      ...room,
      listing: { ...room.listing, status: update.status, updatedAt: update.updatedAt },
      updatedAt: Math.max(room.updatedAt, update.updatedAt),
    };
  });
}

async function compressChatPhoto(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error("사진은 12MB 이하로 선택해 주세요.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("사진을 열지 못했습니다."));
    element.src = source;
  });
  const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사진을 처리하지 못했습니다.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let compressed = canvas.toDataURL("image/jpeg", quality);
  while (compressed.length > 320_000 && quality > 0.42) {
    quality = Math.max(0.42, quality - 0.08);
    compressed = canvas.toDataURL("image/jpeg", quality);
  }
  if (compressed.length > 360_000) throw new Error("사진 용량을 줄이지 못했습니다. 다른 사진을 선택해 주세요.");
  return compressed;
}

export function MarketplaceChatPanel({ currentUserId, pendingListing, onPendingListingHandled, onBackToList, completedOnly = false, archivedChatRooms = [], onDeleteArchivedChatRoom, renderMeetingDateTimePicker, renderMeetingPartnerPicker }: MarketplaceChatPanelProps) {
  const userKey = encodeURIComponent(currentUserId || "guest");
  const storageKey = `dangam_marketplace_direct_rooms_v1_${userKey}`;
  const activeStorageKey = `${storageKey}_active`;
  const serverRoomsQuery = trpc.marketplace.listRooms.useQuery(
    { clientUserId: currentUserId },
    { refetchInterval: 3_000, retry: false, refetchOnWindowFocus: true },
  );
  const openChatMutation = trpc.marketplace.openChat.useMutation();
  const sendMessageMutation = trpc.marketplace.sendMessage.useMutation();
  const markReadMutation = trpc.marketplace.markRead.useMutation();
  const changeStatusMutation = trpc.marketplace.changeStatus.useMutation();
  const blockUserMutation = trpc.marketplace.blockUser.useMutation();
  const reportUserMutation = trpc.marketplace.reportUser.useMutation();
  const uploadChatPhoto = trpc.media.upload.useMutation();
  const [roomState, setRoomState] = useState<ScopedChatState<DirectRoom[]>>(() => ({
    scope: storageKey,
    value: syncRoomStatuses(readRooms(storageKey)),
  }));
  const [deletedRoomState, setDeletedRoomState] = useState<ScopedChatState<string[]>>(() => ({
    scope: userKey,
    value: readDeletedMarketplaceChatRooms(currentUserId),
  }));
  const deletedRoomIds = resolveScopedChatState(deletedRoomState, userKey, () => readDeletedMarketplaceChatRooms(currentUserId));
  const deletedRoomSet = useMemo(() => new Set(deletedRoomIds), [deletedRoomIds]);
  const [listingStatusOverrides, setListingStatusOverrides] = useState(readMarketplaceStatusUpdates);
  const localRooms = resolveScopedChatState(roomState, storageKey, () => syncRoomStatuses(readRooms(storageKey)));
  const remoteRooms: DirectRoom[] = useMemo(() => (serverRoomsQuery.data ?? []).filter((room) => !deletedRoomSet.has(room.id)).map((room) => ({
    id: room.id,
    listing: room.listing as MarketplaceListing,
    messages: [],
    messageCount: typeof (room as typeof room & { messageCount?: unknown }).messageCount === "number" ? (room as typeof room & { messageCount: number }).messageCount : null,
    updatedAt: room.lastMessageAt,
    viewerRole: room.viewerRole,
    buyerName: room.buyerName,
    sellerName: room.sellerName,
    unreadCount: room.unreadCount,
    lastMessage: room.lastMessage,
    blockedByMe: room.blockedByMe,
    blockedByOther: room.blockedByOther,
    serverBacked: true,
  })), [deletedRoomSet, serverRoomsQuery.data]);
  const rooms = useMemo(() => import.meta.env.DEV
    ? [...remoteRooms, ...localRooms.filter((local) => !deletedRoomSet.has(local.id) && !remoteRooms.some((remote) => remote.id === local.id))]
    : remoteRooms, [deletedRoomSet, localRooms, remoteRooms]);
  useEffect(() => {
    if (!import.meta.env.DEV || !isConsumerPreviewDemo()) return;
    const metadata = rooms.slice(0, 1000).map(room => ({
      sourceKey: previewActivitySourceKey(`marketplace-${room.id}`), roomType: "marketplace" as const,
      participantCount: 2, messageCount: room.messageCount ?? (room.serverBacked ? null : room.messages.length),
      unreadCount: room.unreadCount == null ? null : Math.max(0, room.unreadCount), lastActivityAt: normalizePreviewDate(room.updatedAt),
    }));
    try { window.localStorage.setItem(`dangam_preview_marketplace_chat_activity_v1_${userKey}`, JSON.stringify(metadata)); } catch { /* Admin 전송은 Preview 동기화 경로에서만 수행합니다. */ }
  }, [rooms, userKey]);
  const updateRooms = useCallback((update: (current: DirectRoom[]) => DirectRoom[]) => {
    setRoomState((current) => updateScopedChatState(
      current,
      storageKey,
      () => syncRoomStatuses(readRooms(storageKey)),
      update,
    ));
  }, [storageKey]);
  const [activeRoomState, setActiveRoomState] = useState<ScopedChatState<string | null>>(() => ({
    scope: activeStorageKey,
    value: null,
  }));
  const activeRoomId = resolveScopedChatState(activeRoomState, activeStorageKey, () => null);
  const setActiveRoomId = useCallback((roomId: string | null) => {
    setActiveRoomState({ scope: activeStorageKey, value: roomId });
  }, [activeStorageKey]);
  const [draftState, setDraftState] = useState<ScopedChatState<string>>(() => ({ scope: userKey, value: "" }));
  const draft = resolveScopedChatState(draftState, userKey, () => "");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleStartAt, setScheduleStartAt] = useState(defaultLocalDateTime);
  const [schedulePlace, setSchedulePlace] = useState("");
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleMaxMembers, setScheduleMaxMembers] = useState("8");
  const [selectedPartnerStore, setSelectedPartnerStore] = useState<MarketplaceScheduleStore | null>(null);
  const [partnerStorePickerOpen, setPartnerStorePickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompletedDeleteTarget | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameState, setNicknameState] = useState<ScopedChatState<string>>({ scope: "", value: "" });
  const nicknameScope = `${userKey}:${chatRoomDataScope("used", activeRoomId ?? "none")}`;
  const chatNickname = resolveScopedChatState(nicknameState, nicknameScope, () => readMarketplaceChatNickname(currentUserId, activeRoomId));
  const [attachmentError, setAttachmentError] = useState("");
  const [apiError, setApiError] = useState("");
  const setDraft = useCallback((value: string) => {
    setDraftState({ scope: userKey, value });
  }, [userKey]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const currentScopeRef = useRef(userKey);
  currentScopeRef.current = userKey;
  const processedListingRef = useRef<string | null>(null);
  const activeServerRoom = activeRoomId ? remoteRooms.find((room) => room.id === activeRoomId) ?? null : null;
  const serverMessagesQuery = trpc.marketplace.listMessages.useQuery(
    { roomKey: activeRoomId ?? "", clientUserId: currentUserId, limit: 100 },
    { enabled: Boolean(activeServerRoom && activeRoomId), refetchInterval: 2_000, retry: false, refetchOnWindowFocus: true },
  );
  const serverMessages: DirectMessage[] = useMemo(() => (serverMessagesQuery.data ?? []).map((message) => ({
    id: message.id,
    sender: message.sender === "system" ? "system" : message.sender === "seller" ? "seller" : "buyer",
    senderId: message.senderId,
    text: message.text,
    image: message.image,
    createdAt: message.createdAt,
    readByOther: message.readByOther,
  })), [serverMessagesQuery.data]);

  useEffect(() => {
    if (!isScopedChatStateFor(roomState, storageKey)) {
      setRoomState({ scope: storageKey, value: syncRoomStatuses(readRooms(storageKey)) });
    }
  }, [roomState.scope, storageKey]);

  useEffect(() => {
    if (!isScopedChatStateFor(roomState, storageKey)) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(roomState.value.map(persistedRoom)));
    } catch (error) {
      console.warn("[중고거래 채팅 저장 실패]", error);
    }
  }, [roomState, storageKey]);

  useEffect(() => {
    if (!isScopedChatStateFor(activeRoomState, activeStorageKey)) {
      setActiveRoomState({ scope: activeStorageKey, value: null });
    }
  }, [activeRoomState.scope, activeStorageKey]);

  useEffect(() => {
    setHeaderMenuOpen(false);
    setStatusMenuOpen(false);
    setActionDrawerOpen(false);
    setScheduleDialogOpen(false);
    setPartnerStorePickerOpen(false);
    setNicknameDialogOpen(false);
    setAttachmentError("");
  }, [storageKey, activeRoomId]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) setStatusMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatusMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [statusMenuOpen]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".chat-room-layout-more")) return;
      if (headerMenuRef.current && !headerMenuRef.current.contains(target)) setHeaderMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHeaderMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    if (!isScopedChatStateFor(activeRoomState, activeStorageKey)) return;
    try {
      if (activeRoomId) window.localStorage.setItem(activeStorageKey, activeRoomId);
      else window.localStorage.removeItem(activeStorageKey);
    } catch {
      // The open conversation remains usable for this session if storage is unavailable.
    }
  }, [activeRoomId, activeRoomState, activeStorageKey]);

  useEffect(() => {
    const refreshStatuses = () => {
      setListingStatusOverrides(readMarketplaceStatusUpdates());
      updateRooms((current) => syncRoomStatuses(current));
    };
    window.addEventListener(MARKETPLACE_STATUS_CHANGED_EVENT, refreshStatuses);
    window.addEventListener("storage", refreshStatuses);
    return () => {
      window.removeEventListener(MARKETPLACE_STATUS_CHANGED_EVENT, refreshStatuses);
      window.removeEventListener("storage", refreshStatuses);
    };
  }, [updateRooms]);

  useEffect(() => {
    if (!pendingListing) { processedListingRef.current = null; return; }
    if (serverRoomsQuery.isLoading && !serverRoomsQuery.isError) return;
    const token = `${currentUserId}:${pendingListing.id}`;
    if (processedListingRef.current === token) return;
    processedListingRef.current = token;
    const startMockRoom = () => {
      const roomId = directRoomId(currentUserId, pendingListing);
      const now = Date.now();
      updateRooms((current) => {
        const existing = current.find((room) => room.id === roomId);
        if (existing) return [{ ...existing, listing: { ...existing.listing, ...pendingListing }, updatedAt: now }, ...current.filter((room) => room.id !== roomId)];
        const title = removeEmoji(pendingListing.title) || "상품";
        const firstMessage: DirectMessage = { id: `${roomId}:started:${now}`, sender: "system", text: `${title} 거래 대화가 시작되었습니다. 판매자에게 궁금한 점을 남겨보세요.`, createdAt: now };
        return [{ id: roomId, listing: pendingListing, messages: [firstMessage], updatedAt: now, viewerRole: "buyer" }, ...current];
      });
      setActiveRoomId(roomId);
    };
    const open = async () => {
      if (serverRoomsQuery.isSuccess) {
        try {
          const result = await openChatMutation.mutateAsync({ listingId: String(pendingListing.id), clientUserId: currentUserId, buyerName: localDisplayName() });
          await serverRoomsQuery.refetch();
          setApiError("");
          setActiveRoomId(result.id);
        } catch (error) {
          if (import.meta.env.DEV) startMockRoom();
          else setApiError(error instanceof Error ? error.message : "거래 대화방을 열지 못했습니다.");
        }
      } else if (import.meta.env.DEV) {
        startMockRoom();
      } else {
        setApiError("거래 채팅 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }
      onPendingListingHandled();
    };
    void open();
  }, [currentUserId, onPendingListingHandled, openChatMutation.mutateAsync, pendingListing, serverRoomsQuery.isError, serverRoomsQuery.isLoading, serverRoomsQuery.isSuccess, serverRoomsQuery.refetch, updateRooms]);

  const activeRoom = useMemo(() => {
    const room = rooms.find((item) => item.id === activeRoomId) ?? null;
    if (!room) return null;
    const statusOverride = listingStatusOverrides[String(room.listing.id)];
    const currentUpdatedAt = room.listing.updatedAt ?? room.updatedAt;
    const visibleRoom = statusOverride && statusOverride.updatedAt >= currentUpdatedAt
      ? { ...room, listing: { ...room.listing, status: statusOverride.status, updatedAt: statusOverride.updatedAt } }
      : room;
    if (!visibleRoom.serverBacked || !serverMessagesQuery.data) return visibleRoom;
    return { ...visibleRoom, messages: serverMessages };
  }, [activeRoomId, listingStatusOverrides, rooms, serverMessages, serverMessagesQuery.data, serverMessagesQuery.dataUpdatedAt]);
  const orderedRooms = useMemo(() => [...rooms].sort((a, b) => b.updatedAt - a.updatedAt), [rooms]);
  const visibleRooms = useMemo(() => orderedRooms.filter((room) => completedOnly ? room.listing.status === "거래완료" : room.listing.status !== "거래완료"), [completedOnly, orderedRooms]);

  useEffect(() => {
    if (!activeServerRoom?.id || !activeRoomId || !activeServerRoom.unreadCount || document.visibilityState === "hidden") return;
    void markReadMutation.mutateAsync({ roomKey: activeRoomId, clientUserId: currentUserId })
      .then(() => serverRoomsQuery.refetch())
      .catch(() => undefined);
  }, [activeRoomId, activeServerRoom?.id, activeServerRoom?.unreadCount, currentUserId, markReadMutation.mutateAsync, serverMessagesQuery.dataUpdatedAt, serverRoomsQuery.refetch]);

  useEffect(() => {
    if (!activeRoomId || !activeRoom) return;
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeRoomId, activeRoom?.messages.length]);

  const openRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setDraft("");
    setStatusMenuOpen(false);
    setHeaderMenuOpen(false);
    setAttachmentError("");
    setApiError("");
  };

  const sendTextMessage = async (rawText: string): Promise<boolean> => {
    const targetRoom = activeRoom;
    if (!targetRoom) return false;
    const text = removeEmoji(rawText);
    if (!text) return false;
    if (targetRoom.blockedByMe || targetRoom.blockedByOther) {
      setAttachmentError("차단된 사용자와는 메시지를 주고받을 수 없습니다.");
      return false;
    }
    const now = Date.now();
    if (targetRoom.serverBacked) {
      try {
        await sendMessageMutation.mutateAsync({ roomKey: targetRoom.id, clientUserId: currentUserId, clientMessageId: crypto.randomUUID(), text });
        setAttachmentError("");
        await Promise.all([serverMessagesQuery.refetch(), serverRoomsQuery.refetch()]);
        return true;
      } catch (error) {
        setAttachmentError(error instanceof Error ? error.message : "메시지를 서버에 저장하지 못했습니다.");
        return false;
      }
    }
    if (!import.meta.env.DEV) {
      setAttachmentError("서버에 연결된 거래 대화방에서만 메시지를 보낼 수 있습니다.");
      return false;
    }
    const sender = targetRoom.viewerRole ?? "buyer";
    const message: DirectMessage = {
      id: `${targetRoom.id}:${sender}:${now}`,
      sender,
      text,
      createdAt: now,
    };
    updateRooms(current => current.map(room => room.id === targetRoom.id
      ? { ...room, messages: [...room.messages, message], updatedAt: now }
      : room));
    setAttachmentError("");
    return true;
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await sendTextMessage(draft)) setDraft("");
  };

  const saveChatNickname = () => {
    const nickname = removeEmoji(nicknameDraft).slice(0, 24);
    if (!activeRoom || !nickname) {
      setAttachmentError("닉네임을 입력해 주세요.");
      return;
    }
    try {
      window.localStorage.setItem(marketplaceNicknameKey(currentUserId, activeRoom.id), nickname);
      setNicknameState({ scope: nicknameScope, value: nickname });
      setNicknameDialogOpen(false);
      setHeaderMenuOpen(false);
      setAttachmentError("채팅방 닉네임이 저장되었습니다.");
    } catch {
      setAttachmentError("닉네임을 저장하지 못했습니다.");
    }
  };

  const submitScheduleProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scheduleTitle.trim()) {
      setAttachmentError("일정 제목을 입력해 주세요.");
      return;
    }
    if (!scheduleStartAt || (!schedulePlace.trim() && !selectedPartnerStore)) {
      setAttachmentError("날짜와 만나는 장소를 입력해 주세요.");
      return;
    }
    const maxMembers = Number(scheduleMaxMembers);
    if (!Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > 20) {
      setAttachmentError("모집 인원은 1명부터 20명까지 입력해 주세요.");
      return;
    }
    const date = new Date(scheduleStartAt);
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now()) {
      setAttachmentError("올바른 날짜와 시간을 선택해 주세요.");
      return;
    }
    const place = removeEmoji(selectedPartnerStore ? `${selectedPartnerStore.name} · ${selectedPartnerStore.address}` : schedulePlace).slice(0, 120);
    const partnerDetails = selectedPartnerStore ? `\n제휴 매장: ${removeEmoji(selectedPartnerStore.name)} · ${removeEmoji(selectedPartnerStore.area)}\n제휴 혜택: ${removeEmoji(selectedPartnerStore.benefit)}` : "";
    const proposal = `거래 일정 제안 · ${removeEmoji(scheduleTitle).slice(0, 60)}\n희망 일시: ${date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}\n만나는 장소: ${place}\n모집 정원: ${maxMembers}명${partnerDetails}`;
    if (await sendTextMessage(proposal)) {
      setScheduleDialogOpen(false);
      setSchedulePlace("");
      setScheduleTitle("");
      setScheduleMaxMembers("8");
      setSelectedPartnerStore(null);
      setPartnerStorePickerOpen(false);
      setScheduleStartAt(defaultLocalDateTime());
    }
  };

  const attachPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!activeRoom || !file) return;
    if (!file.type.startsWith("image/")) {
      setAttachmentError("이미지 파일만 첨부할 수 있습니다.");
      return;
    }
    const uploadScope = userKey;
    const roomId = activeRoom.id;
    try {
      const image = await compressChatPhoto(file);
      if (currentScopeRef.current !== uploadScope) return;
      const now = Date.now();
      if (activeRoom.serverBacked) {
        const encoded = image.split(",", 2)[1] ?? "";
        const uploaded = await uploadChatPhoto.mutateAsync({
          originalName: `marketplace-chat-${now}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: Math.max(1, Math.floor(encoded.length * 3 / 4)),
          dataBase64: image,
        });
        await sendMessageMutation.mutateAsync({ roomKey: activeRoom.id, clientUserId: currentUserId, clientMessageId: crypto.randomUUID(), attachmentMediaId: uploaded.id });
        await Promise.all([serverMessagesQuery.refetch(), serverRoomsQuery.refetch()]);
        setAttachmentError("");
        setHeaderMenuOpen(false);
        return;
      }
      if (!import.meta.env.DEV) throw new Error("서버에 연결된 거래 대화방에서만 사진을 보낼 수 있습니다.");
      const sender = activeRoom.viewerRole ?? "buyer";
      const message: DirectMessage = { id: `${roomId}:${sender}-photo:${now}`, sender, text: "사진을 보냈어요.", image, createdAt: now };
      updateRooms(current => current.map(room => room.id === roomId
        ? { ...room, messages: [...room.messages, message], updatedAt: now }
        : room));
      setAttachmentError("");
      setHeaderMenuOpen(false);
    } catch (error) {
      if (currentScopeRef.current === uploadScope) {
        setAttachmentError(error instanceof Error ? error.message : "사진을 첨부하지 못했습니다.");
      }
    }
  };

  const canChangeActiveRoomStatus = activeRoom?.serverBacked
    ? activeRoom.viewerRole === "seller"
    : Boolean(activeRoom && canManageMarketplaceListing(activeRoom.listing.sellerId, currentUserId));

  const changeActiveRoomStatus = async (status: MarketplaceListingStatus) => {
    if (!activeRoom || !canChangeActiveRoomStatus || activeRoom.listing.status === status) return;
    if (activeRoom.serverBacked && !activeRoom.listing.listingId) {
      setAttachmentError("상품 정보를 확인하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    const previousStatus = activeRoom.listing.status;
    const updatedAt = Date.now();
    const notice: DirectMessage = {
      id: `${activeRoom.id}:system-status:${updatedAt}`,
      sender: "system",
      text: `거래 상태가 '${status}'${status === "거래완료" ? "로" : "으로"} 변경되었습니다.`,
      createdAt: updatedAt,
    };
    saveMarketplaceStatusUpdate(activeRoom.listing.id, status, updatedAt);
    setStatusMenuOpen(false);
    setHeaderMenuOpen(false);
    setAttachmentError("");
    if (activeRoom.serverBacked) {
      const listingId = activeRoom.listing.listingId;
      if (!listingId) return;
      try {
        await changeStatusMutation.mutateAsync({ listingId, clientUserId: currentUserId, status });
        await Promise.all([serverRoomsQuery.refetch(), serverMessagesQuery.refetch()]);
      } catch (error) {
        saveMarketplaceStatusUpdate(activeRoom.listing.id, previousStatus, Date.now());
        setAttachmentError(error instanceof Error ? error.message : "거래 상태를 서버에 저장하지 못했습니다.");
      }
    } else if (import.meta.env.DEV) {
      updateRooms((current) => current.map((room) => room.listing.id === activeRoom.listing.id
        ? {
          ...room,
          listing: { ...room.listing, status, updatedAt },
          messages: [...room.messages, { ...notice, id: `${room.id}:system-status:${updatedAt}` }],
          updatedAt,
        }
        : room));
    }
  };

  const toggleBlock = async () => {
    if (!activeRoom) return;
    const blocked = !activeRoom.blockedByMe;
    if (blocked && !window.confirm("이 사용자를 차단할까요? 차단하면 서로 메시지를 보낼 수 없습니다.")) return;
    if (!activeRoom.serverBacked) {
      if (!import.meta.env.DEV) {
        setAttachmentError("사용자 차단을 저장하지 못했습니다.");
        return;
      }
      updateRooms((current) => current.map((room) => room.id === activeRoom.id ? { ...room, blockedByMe: blocked } : room));
      setAttachmentError(blocked ? "사용자를 차단했습니다." : "차단을 해제했습니다.");
      setHeaderMenuOpen(false);
      return;
    }
    try {
      await blockUserMutation.mutateAsync({ roomKey: activeRoom.id, clientUserId: currentUserId, blocked });
      setAttachmentError("");
      setHeaderMenuOpen(false);
      await serverRoomsQuery.refetch();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "차단 설정을 저장하지 못했습니다.");
    }
  };

  const reportUser = async () => {
    if (!activeRoom) return;
    const details = window.prompt("신고 사유를 입력해 주세요.", "거래와 무관한 메시지");
    if (!details?.trim()) return;
    if (!activeRoom.serverBacked) {
      if (!import.meta.env.DEV) {
        setAttachmentError("신고를 접수하지 못했습니다.");
        return;
      }
      const reportKey = `dangam_marketplace_reports_v1_${userKey}`;
      let reports: Array<{ roomType: string; roomId: string; listingId: number; reason: string; createdAt: string }> = [];
      try { reports = JSON.parse(window.localStorage.getItem(reportKey) ?? "[]") as typeof reports; } catch { reports = []; }
      reports.unshift({ roomType: "used", roomId: activeRoom.id, listingId: activeRoom.listing.id, reason: removeEmoji(details).slice(0, 1000), createdAt: new Date().toISOString() });
      window.localStorage.setItem(reportKey, JSON.stringify(reports));
      setAttachmentError("신고가 접수되었습니다.");
      setHeaderMenuOpen(false);
      return;
    }
    try {
      await reportUserMutation.mutateAsync({ roomKey: activeRoom.id, clientUserId: currentUserId, reason: "USER_REPORT", details: removeEmoji(details).slice(0, 1000) });
      const reportDayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
      void submitPreviewReportSnapshot({
        sourceKey: previewActivitySourceKey(`marketplace-report-${activeRoom.id}-${reportDayKst}`),
        targetType: "marketplace", category: "other",
        targetSourceKey: previewActivitySourceKey(`listing-${activeRoom.listing.listingId ?? activeRoom.listing.id}`),
        targetLabel: activeRoom.listing.title,
      });
      setAttachmentError("신고가 접수되었습니다.");
      setHeaderMenuOpen(false);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "신고를 접수하지 못했습니다.");
    }
  };

  if (activeRoom) {
    const sellerName = removeEmoji(activeRoom.listing.sellerNickname) || "판매자";
    const viewerRole = activeRoom.viewerRole ?? "buyer";
    const otherName = viewerRole === "seller" ? removeEmoji(activeRoom.buyerName ?? "구매자") : sellerName;
    const conversationBlocked = Boolean(activeRoom.blockedByMe || activeRoom.blockedByOther);
    const productTitle = removeEmoji(activeRoom.listing.title) || "중고 상품";
    return (
        <ChatRoomLayout
          className="marketplace-chat-room-view"
          ariaLabel={`${otherName}님과의 거래 대화`}
          title={otherName}
          subtitle={`중고거래 · ${viewerRole === "seller" ? "구매자" : "상품 판매자"}`}
          onBack={() => { setActiveRoomId(null); setDraft(""); setStatusMenuOpen(false); setHeaderMenuOpen(false); setActionDrawerOpen(false); setScheduleDialogOpen(false); setNicknameDialogOpen(false); setAttachmentError(""); setApiError(""); onBackToList(); }}
          onMore={() => { setActionDrawerOpen(false); setHeaderMenuOpen((open) => !open); }}
          moreExpanded={headerMenuOpen}
          moreLabel="거래 대화 메뉴"
          headerMenu={headerMenuOpen && (
            <div className="marketplace-chat-more-menu" ref={headerMenuRef} role="menu" aria-label="거래 대화 관리">
              <button type="button" role="menuitem" onClick={() => { setHeaderMenuOpen(false); setNicknameDraft(chatNickname); setNicknameDialogOpen(true); }}><Pencil size={16} aria-hidden="true" />닉네임 변경</button>
              <button type="button" role="menuitem" onClick={() => void reportUser()}><Flag size={16} aria-hidden="true" />신고하기</button>
              <button type="button" role="menuitem" onClick={() => void toggleBlock()}><ShieldBan size={16} aria-hidden="true" />{activeRoom.blockedByMe ? "차단 해제" : "차단하기"}</button>
            </div>
          )}
          onMessagesClick={() => setActionDrawerOpen(false)}
          messagesClassName="marketplace-chat-messages"
          messagesLabel="대화 내용"
          banner={
            <div className="marketplace-chat-product-bar" aria-label={`${productTitle} 상품 정보`}>
              <ListingVisual listing={activeRoom.listing} compact />
              <span className="marketplace-chat-product-copy">
                <strong>{productTitle}</strong>
                <span className="marketplace-chat-product-price">
                  <b>{moneyLabel(activeRoom.listing.price)}</b>
                </span>
              </span>
              {canChangeActiveRoomStatus ? (
                <div className="marketplace-chat-status-popover-anchor" ref={statusMenuRef}>
                  <button type="button" className="marketplace-chat-status-change" aria-label={`거래 상태 변경: ${activeRoom.listing.status}`} aria-haspopup="menu" aria-expanded={statusMenuOpen} disabled={changeStatusMutation.isPending} onClick={() => setStatusMenuOpen((open) => !open)}>
                    <em className={`marketplace-chat-status ${statusClass(activeRoom.listing.status)}`}>{activeRoom.listing.status}</em>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {statusMenuOpen && (
                    <div className="marketplace-chat-status-dropdown" role="menu" aria-label="거래 상태 선택">
                      {(["판매중", "예약중", "거래완료"] as MarketplaceListingStatus[]).map((status) => (
                        <button type="button" role="menuitemradio" aria-checked={activeRoom.listing.status === status} key={status} disabled={changeStatusMutation.isPending} onClick={() => void changeActiveRoomStatus(status)}>{status}{activeRoom.listing.status === status && <Check size={14} aria-hidden="true" />}</button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="marketplace-chat-status-readonly" aria-label={`현재 거래 상태: ${activeRoom.listing.status}`}>
                  <em className={`marketplace-chat-status ${statusClass(activeRoom.listing.status)}`}>{activeRoom.listing.status}</em>
                </span>
              )}
            </div>
          }
          composer={
            <>
              {attachmentError && <p className="marketplace-chat-attachment-error" role="alert">{attachmentError}</p>}
        {conversationBlocked && <p className="marketplace-chat-attachment-error" role="status">{activeRoom.blockedByMe ? "차단한 사용자입니다. 차단을 해제하기 전까지 메시지를 보낼 수 없습니다." : "상대방이 대화 수신을 차단하여 메시지를 보낼 수 없습니다."}</p>}
                      <form className="marketplace-chat-composer" onSubmit={sendMessage}>
          <div className="marketplace-chat-attach-wrap">
              <button type="button" className="marketplace-chat-attach-button" aria-label="추가 기능" aria-expanded={actionDrawerOpen} disabled={conversationBlocked} onClick={() => { setActionDrawerOpen((open) => !open); setHeaderMenuOpen(false); }}><Plus size={19} /></button>
            <input ref={photoInputRef} className="marketplace-chat-file-input" type="file" accept="image/*" onChange={attachPhoto} aria-label="채팅 사진 선택" hidden />
          </div>
          <input ref={composerInputRef} value={draft} onChange={event => setDraft(removeEmoji(event.currentTarget.value))} aria-label="메시지 입력" placeholder={conversationBlocked ? "차단 상태에서는 메시지를 보낼 수 없습니다" : "메시지를 입력하세요"} disabled={conversationBlocked} />
          <button type="submit" aria-label="메시지 보내기" disabled={!removeEmoji(draft) || conversationBlocked || sendMessageMutation.isPending}><Send size={18} /></button>
          </form>
            </>
          }
          actionDrawer={actionDrawerOpen && (
            <div className="chat-room-action-options" role="group" aria-label="사진 및 일정 기능">
              <button type="button" disabled={conversationBlocked} onClick={() => { setActionDrawerOpen(false); photoInputRef.current?.click(); }}><Plus size={21} aria-hidden="true" /><span>사진 올리기</span></button>
              <button type="button" disabled={conversationBlocked} onClick={() => { setActionDrawerOpen(false); setScheduleTitle(""); setScheduleStartAt(defaultLocalDateTime()); setSchedulePlace(""); setScheduleMaxMembers("8"); setSelectedPartnerStore(null); setPartnerStorePickerOpen(false); setScheduleDialogOpen(true); }}><CalendarDays size={21} aria-hidden="true" /><span>일정 잡기</span></button>
            </div>
          )}
          overlays={
            <>
              {scheduleDialogOpen && <div className="marketplace-chat-modal-overlay" onClick={() => { setScheduleDialogOpen(false); setPartnerStorePickerOpen(false); }}><form className="marketplace-chat-modal marketplace-chat-schedule-modal" role="dialog" aria-modal="true" aria-label="거래 일정 제안" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submitScheduleProposal(event)}>
                <header className="marketplace-chat-schedule-header"><div><h2>거래 일정 잡기</h2><p>모임 일정 작성과 같은 달력으로 날짜와 장소를 제안합니다.</p></div><button type="button" className="marketplace-chat-modal-close" aria-label="일정 창 닫기" onClick={() => { setScheduleDialogOpen(false); setPartnerStorePickerOpen(false); }}><X size={19} /></button></header>
                <div className="meeting-chat-schedule-form marketplace-chat-schedule-form">
                  <label><span>일정 제목</span><input value={scheduleTitle} onChange={(event) => setScheduleTitle(removeEmoji(event.currentTarget.value).slice(0, 60))} maxLength={60} placeholder="예: 거래 약속" required /></label>
                  <label><span>날짜 및 시간</span>{renderMeetingDateTimePicker(scheduleStartAt, setScheduleStartAt)}</label>
                  <label><span>만나는 장소</span><input value={schedulePlace} onChange={(event) => { setSchedulePlace(removeEmoji(event.currentTarget.value).slice(0, 120)); setSelectedPartnerStore(null); }} maxLength={120} placeholder="예: 산본역 2번 출구" required /></label>
                  <label><span>정원 설정</span><input type="number" min="1" max="20" step="1" inputMode="numeric" value={scheduleMaxMembers} onChange={(event) => setScheduleMaxMembers(event.currentTarget.value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="최대 20명" aria-label="모집 정원" required /></label>
                  <section className="meeting-schedule-partner-field"><h3>팅커벨 제휴 매장 <small>(선택)</small></h3><p>제휴 매장을 선택하면 만나는 장소와 혜택을 제안에 함께 담습니다.</p>{selectedPartnerStore ? <div className="meeting-schedule-partner-selected">{selectedPartnerStore.image ? <img src={selectedPartnerStore.image} alt="" /> : <span className="meeting-schedule-partner-selected-placeholder" aria-hidden="true">{selectedPartnerStore.category}</span>}<div><strong>{selectedPartnerStore.name}</strong><small>{selectedPartnerStore.area} · {selectedPartnerStore.address}</small><em>{selectedPartnerStore.benefit}</em></div><div className="meeting-schedule-partner-selected-actions"><button type="button" onClick={() => setPartnerStorePickerOpen(true)}>변경</button><button type="button" onClick={() => { setSelectedPartnerStore(null); setSchedulePlace(""); }} aria-label="선택한 제휴 매장 취소"><X size={16} /></button></div></div> : <button type="button" className="meeting-schedule-partner-trigger" onClick={() => setPartnerStorePickerOpen((open) => !open)} aria-expanded={partnerStorePickerOpen}>+ 제휴 매장 찾고 혜택 받기</button>}{partnerStorePickerOpen && renderMeetingPartnerPicker((store) => { setSelectedPartnerStore(store); setSchedulePlace(`${store.name} · ${store.address}`); setPartnerStorePickerOpen(false); }, () => setPartnerStorePickerOpen(false))}</section>
                </div>
                <footer className="marketplace-chat-schedule-footer-bar"><button type="submit" className="marketplace-chat-modal-submit" disabled={!scheduleTitle.trim() || !scheduleStartAt || (!schedulePlace.trim() && !selectedPartnerStore) || !Number.isInteger(Number(scheduleMaxMembers)) || Number(scheduleMaxMembers) < 1 || Number(scheduleMaxMembers) > 20}>일정 제안 보내기</button></footer>
              </form></div>}
              {nicknameDialogOpen && <div className="marketplace-chat-modal-overlay" onClick={() => setNicknameDialogOpen(false)}><form className="marketplace-chat-modal marketplace-chat-nickname-modal" role="dialog" aria-modal="true" aria-label="채팅방 닉네임 변경" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); saveChatNickname(); }}><button type="button" className="marketplace-chat-modal-close" aria-label="닉네임 창 닫기" onClick={() => setNicknameDialogOpen(false)}><X size={19} /></button><h2>닉네임 변경</h2><p>이 거래 대화방에서 사용할 이름을 입력해 주세요.</p><label>닉네임<input value={nicknameDraft} onChange={(event) => setNicknameDraft(removeEmoji(event.currentTarget.value).slice(0, 24))} maxLength={24} required autoFocus /></label><button type="submit" className="marketplace-chat-modal-submit">저장</button></form></div>}
            </>
          }
        >
          {activeRoom.messages.map(message => message.sender === "system" ? (
            <p className="marketplace-chat-system-message" key={message.id}>{removeEmoji(message.text)}<time>{clockTime(message.createdAt)}</time></p>
          ) : (
            <article className={`marketplace-chat-message ${message.sender === viewerRole ? "mine" : "theirs"}`} key={message.id}>
              <span className="marketplace-chat-message-author">{message.sender === viewerRole ? chatNickname : otherName}</span>
              {message.image ? <img className="marketplace-chat-message-image" src={message.image} alt="채팅으로 보낸 사진" /> : <p>{removeEmoji(message.text)}</p>}
              <span className="marketplace-chat-message-meta"><time>{clockTime(message.createdAt)}</time>{message.sender === viewerRole && message.readByOther && <small>읽음</small>}</span>
            </article>
          ))}
          <div ref={messageEndRef} />
        </ChatRoomLayout>
      );
  }

  const confirmDeleteCompletedChat = async () => {
    if (!deleteTarget || deletePending) return;
    setDeletePending(true);
    try {
      if (deleteTarget.kind === "marketplace") {
        const room = rooms.find((item) => item.id === deleteTarget.room.id) ?? deleteTarget.room;
        const nextDeletedRoomIds = markMarketplaceChatRoomDeleted(room.id, currentUserId);
        setDeletedRoomState({ scope: userKey, value: nextDeletedRoomIds });
        removeMarketplaceChatRoomData(room.id, currentUserId);
        updateRooms((current) => current.filter((item) => item.id !== room.id));
        if (activeRoomId === room.id) setActiveRoomId(null);
      } else {
        if (!onDeleteArchivedChatRoom) throw new Error("완료된 대화를 삭제할 수 없습니다.");
        await onDeleteArchivedChatRoom(deleteTarget.room);
      }
      setAttachmentError("");
      setDeleteTarget(null);
    } catch {
      setAttachmentError("대화방을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <section className="marketplace-chat-panel marketplace-chat-list-view" aria-label={completedOnly ? "완료된 채팅 목록" : "중고거래 채팅 목록"}>
      <h2>{completedOnly ? "완료된 채팅" : "중고거래 대화"}</h2>
      <div className="marketplace-direct-room-list">
        {completedOnly && archivedChatRooms.map((room) => (
          <article className="marketplace-completed-room-card" key={room.id}>
            <span className="marketplace-completed-room-thumb">
              {room.thumbnailUrl ? <img src={room.thumbnailUrl} alt="" /> : <MessageCircle size={20} aria-hidden="true" />}
            </span>
            <span className="marketplace-direct-room-copy">
              <span className="marketplace-direct-room-heading"><strong>{removeEmoji(room.title)}</strong></span>
              <span className="marketplace-direct-room-preview">{removeEmoji(room.lastMessage) || "이전에 나간 대화방"}</span>
            </span>
            <span className="marketplace-direct-room-meta">
              <span className="marketplace-direct-room-meta-top"><time>{compactTime(room.lastActivityAt)}</time></span>
              <em className="marketplace-chat-status marketplace-chat-status-archived">{room.roomType === "review" ? "체험단" : "모임"}</em>
            </span>
            <button type="button" className="marketplace-completed-room-delete" onClick={() => setDeleteTarget({ kind: "community", room })} aria-label={`${removeEmoji(room.title)} 대화방 삭제`}>
              <Trash2 size={14} aria-hidden="true" /><span>삭제</span>
            </button>
          </article>
        ))}
        {visibleRooms.map((room) => {
          const roomName = room.viewerRole === "seller" ? removeEmoji(room.buyerName ?? "구매자") : removeEmoji(room.listing.sellerNickname) || "판매자";
          const lastMessage = room.messages[room.messages.length - 1];
          const lastActivityAt = lastMessage?.createdAt ?? room.updatedAt;
          const lastMessageText = room.lastMessage || lastMessage?.text || "대화를 시작해 보세요.";
          const title = removeEmoji(room.listing.title) || "중고 상품";
          const contents = (
            <>
              <ListingVisual listing={room.listing} compact />
              <span className="marketplace-direct-room-copy">
                <span className="marketplace-direct-room-heading"><strong>{roomName}</strong></span>
                <span className="marketplace-direct-room-preview">{removeEmoji(lastMessageText)}</span>
              </span>
              <span className="marketplace-direct-room-meta">
                <span className="marketplace-direct-room-meta-top">
                  <time>{compactTime(lastActivityAt)}</time>
                  {Boolean(room.unreadCount) && <span className="marketplace-unread-count" aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}>{room.unreadCount}</span>}
                </span>
                <em className={`marketplace-chat-status ${statusClass(room.listing.status)}`}>{room.listing.status}</em>
              </span>
            </>
          );
          return completedOnly ? (
            <article className="marketplace-completed-room-card" key={room.id}>
              <button type="button" className="marketplace-completed-room-open" onClick={() => openRoom(room.id)} aria-label={`${roomName}님과 ${title} 완료된 거래 대화 열기`}>
                {contents}
              </button>
              <button type="button" className="marketplace-completed-room-delete" onClick={() => setDeleteTarget({ kind: "marketplace", room })} aria-label={`${roomName}님과 ${title} 대화방 삭제`}>
                <Trash2 size={14} aria-hidden="true" /><span>삭제</span>
              </button>
            </article>
          ) : (
            <button type="button" className="marketplace-direct-room-card" key={room.id} onClick={() => openRoom(room.id)} aria-label={`${roomName}님과 ${title} 거래 대화 열기`}>
              {contents}
            </button>
          );
        })}
        {!visibleRooms.length && (!completedOnly || !archivedChatRooms.length) && (
          <div className="marketplace-chat-empty">
            <MessageCircle size={28} aria-hidden="true" />
            <strong>{completedOnly ? "완료된 채팅이 없습니다." : "진행 중인 거래 대화가 없습니다."}</strong>
            <span>{completedOnly ? "거래가 완료되거나 나간 대화방이 여기에 보관됩니다." : "상품 상세에서 거래 문의를 시작하면 대화가 여기에 표시됩니다."}</span>
          </div>
        )}
        {attachmentError && <p className="marketplace-chat-attachment-error" role="alert">{attachmentError}</p>}
      </div>
      {deleteTarget && (
        <div className="marketplace-chat-modal-overlay marketplace-completed-delete-overlay" role="presentation" onClick={() => !deletePending && setDeleteTarget(null)}>
          <section className="marketplace-chat-modal marketplace-completed-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="completed-chat-delete-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="completed-chat-delete-title">대화방 삭제</h3>
            <p>대화방을 완전히 삭제하시겠습니까? 삭제된 대화는 복구할 수 없습니다.</p>
            <div className="marketplace-completed-delete-actions">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deletePending}>취소</button>
              <button type="button" className="danger" onClick={() => void confirmDeleteCompletedChat()} disabled={deletePending}>{deletePending ? "삭제 중" : "삭제"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
