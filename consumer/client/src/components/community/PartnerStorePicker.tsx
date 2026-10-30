import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, X } from "lucide-react";
import { consumerApi } from "@/lib/consumer-api";
import type { ConsumerPartnerStoreDto } from "@shared/integration-contract";

export type PartnerStore = {
  storePublicId: string;
  name: string;
  category: string;
  area: string;
  distance?: string;
  address: string;
  benefit: string;
  image?: string;
};

type CategoryFilter = "전체" | "식당" | "카페" | "골프";

export type PartnerStorePickerProps = {
  selectedCategory?: string;
  selectedAreas?: string[];
  onSelect: (store: PartnerStore) => void;
  onClose: () => void;
  onClear?: () => void;
  overlayPriority?: boolean;
};

const filters: CategoryFilter[] = ["전체", "식당", "카페", "골프"];

function matchesFilter(store: ConsumerPartnerStoreDto, filter: CategoryFilter) {
  if (filter === "전체") return true;
  const category = `${store.category} ${store.name}`.toLocaleLowerCase();
  if (filter === "식당") return /식당|음식|맛집|주점|restaurant|food/.test(category);
  if (filter === "카페") return /카페|커피|디저트|베이커리|cafe|coffee/.test(category);
  return /골프|스크린|golf/.test(category);
}

function preferredCategory(store: ConsumerPartnerStoreDto, selectedCategory?: string) {
  if (!selectedCategory) return false;
  const category = `${store.category} ${store.name}`.toLocaleLowerCase();
  if (/골프/.test(selectedCategory)) return /골프|스크린|golf/.test(category);
  if (/카페/.test(selectedCategory)) return /카페|커피|디저트|베이커리|cafe|coffee/.test(category);
  if (/식당|음식|맛집/.test(selectedCategory)) return /식당|음식|맛집|주점|restaurant|food/.test(category);
  return false;
}

function formatStore(store: ConsumerPartnerStoreDto): PartnerStore {
  return {
    storePublicId: store.storePublicId,
    name: store.name,
    category: store.category,
    area: store.area,
    address: store.address,
    benefit: store.benefit,
  };
}

export function formatPartnerStoreAddress(store: PartnerStore) {
  return store.address;
}

export function PartnerStorePicker({
  selectedCategory,
  selectedAreas = [],
  onSelect,
  onClose,
  onClear,
  overlayPriority = false,
}: PartnerStorePickerProps) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("전체");
  const storesQuery = useQuery({
    queryKey: ["consumer-partner-store-catalog"],
    queryFn: consumerApi.listPartnerStores,
    staleTime: 15_000,
    retry: false,
  });
  const stores = storesQuery.data ?? [];
  const filteredStores = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...stores]
      .filter((store) => matchesFilter(store, activeFilter))
      .filter((store) => !normalizedQuery || [store.name, store.category, store.area, store.address, store.benefit].join(" ").toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const areaA = selectedAreas.some((area) => `${a.area} ${a.address}`.includes(area)) ? 1 : 0;
        const areaB = selectedAreas.some((area) => `${b.area} ${b.address}`.includes(area)) ? 1 : 0;
        if (areaA !== areaB) return areaB - areaA;
        const categoryA = preferredCategory(a, selectedCategory) ? 1 : 0;
        const categoryB = preferredCategory(b, selectedCategory) ? 1 : 0;
        if (categoryA !== categoryB) return categoryB - categoryA;
        return a.name.localeCompare(b.name, "ko");
      });
  }, [activeFilter, query, selectedAreas, selectedCategory, stores]);

  return (
    <div className={`meeting-schedule-partner-overlay${overlayPriority ? " marketplace-chat-partner-picker-overlay" : ""}`} role="dialog" aria-modal="true" aria-label="팅커벨 제휴 매장">
      <header className="meeting-schedule-partner-header">
        <h2>팅커벨 제휴 매장</h2>
        <button type="button" onClick={onClose} aria-label="제휴 매장 선택 닫기"><X size={20} /></button>
      </header>
      <div className="meeting-schedule-partner-search">
        <Search size={17} aria-hidden="true" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="예: 매장명 또는 동네 이름 검색" aria-label="제휴 매장 검색" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기"><X size={15} /></button>}
      </div>
      <div className="meeting-schedule-partner-filters" role="tablist" aria-label="제휴 매장 분류">
        {filters.map((filter) => (
          <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} className={activeFilter === filter ? "active" : ""} onClick={() => setActiveFilter(filter)}>{filter}</button>
        ))}
      </div>
      <div className="meeting-schedule-partner-list">
        {storesQuery.isLoading ? (
          <p className="meeting-schedule-partner-empty">상시 광고 중인 제휴 매장을 불러오는 중입니다.</p>
        ) : storesQuery.isError ? (
          <div className="meeting-schedule-partner-empty-state"><p>제휴 매장 목록을 불러오지 못했어요.</p><button type="button" onClick={() => void storesQuery.refetch()}>다시 불러오기</button></div>
        ) : stores.length === 0 ? (
          <p className="meeting-schedule-partner-empty">현재 상시 광고 중인 제휴 매장이 없습니다.</p>
        ) : filteredStores.length === 0 ? (
          <p className="meeting-schedule-partner-empty">검색 조건에 맞는 매장이 없습니다.</p>
        ) : filteredStores.map((item) => {
          const store = formatStore(item);
          return (
            <button type="button" className="meeting-schedule-partner-item" key={store.storePublicId} onClick={() => onSelect(store)}>
              <span className="meeting-schedule-partner-placeholder" aria-hidden="true">{store.category}</span>
              <span><strong>{store.name}</strong><small>{store.category} · {store.area} · {store.address}</small><em>{store.benefit}</em></span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {onClear && <button type="button" className="meeting-schedule-partner-clear" onClick={onClear}>제휴 매장 없이 진행하기</button>}
    </div>
  );
}
