import { ChevronRight, MapPin, X } from "lucide-react";
import { useState } from "react";
import { RegionPicker } from "./RegionPicker";
import {
  findAdminRegionByCode,
  findAdminRegionCode,
  getAdminRegions,
  getAdminDistricts,
  getAdminProvinces,
  canonicalConsumerBrowseRegionCodes,
  formatConsumerBrowseRegionLabel,
  isConsumerBrowseDistrictSelection,
  resolveLegacyRegionCodes,
  roadNamesForRegion,
  searchAdminRegions,
} from "./regions";
import type { AdminRegion } from "./regions";
import "./region-picker.css";
import { RegionSelectionSheetShell } from "./RegionSelectionSheetShell";

type RecentRegion = Pick<AdminRegion, "code" | "province" | "district" | "dong">;

export type RegionSelectionSheetProps = {
  onClose: () => void;
  onApply: (dongs: string[], label?: string, detailAddress?: string, regionCodes?: string[]) => void;
  addressOnly?: boolean;
  maxSelections?: number;
  initialDongs?: string[];
  initialRegionCodes?: string[];
  storageKey?: string | false;
  title?: string;
  description?: string;
  summaryHeading?: string;
  applyLabel?: string;
  searchPlaceholder?: string;
  labelStorageKey?: string | false;
  recentSearchesStorageKey?: string | false;
  emitRegionEvents?: boolean;
  searchSelectionMode?: "replace" | "add";
  allowEmptySelection?: boolean;
  consumerBrowseSelection?: boolean;
};

const DEFAULT_REGION_CODE = findAdminRegionCode("서울특별시", "강남구", "역삼1동") ?? "1168064000";

function formatSelectedNeighborhoods(dongs: string[]) {
  const uniqueDongs = Array.from(new Set(dongs.filter(Boolean)));
  if (uniqueDongs.length <= 1) return uniqueDongs[0] ?? "동네 선택";
  return `${uniqueDongs[0]} 외 ${uniqueDongs.length - 1}곳`;
}

function readJson(storageKey: string | false, storage: "localStorage" = "localStorage") {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    return window[storage].getItem(storageKey);
  } catch {
    return null;
  }
}

export function RegionSelectionSheet({
  onClose,
  onApply,
  addressOnly = false,
  maxSelections,
  initialDongs = [],
  initialRegionCodes = [],
  storageKey = "dangam_selected_dongs",
  title,
  description,
  summaryHeading = "현재 내 동네",
  applyLabel,
  searchPlaceholder = "동네명 또는 도로명으로 검색 (예: 산본1동, 산본로)",
  labelStorageKey: customLabelStorageKey,
  recentSearchesStorageKey: customRecentStorageKey,
  emitRegionEvents,
  searchSelectionMode = "replace",
  allowEmptySelection = false,
  consumerBrowseSelection = false,
}: RegionSelectionSheetProps) {
  const codeStorageKey = typeof storageKey === "string" ? storageKey.replace(/_dongs$/, "_region_codes") : "";
  const effectiveLabelStorageKey = customLabelStorageKey !== undefined
    ? customLabelStorageKey
    : typeof storageKey !== "string"
      ? false
      : storageKey === "dangam_coupon_browse_dongs"
        ? "dangam_coupon_browse_label"
        : storageKey === "dangam_community_browse_dongs"
          ? "dangam_community_browse_label"
          : "dangam_consumer_address_display";
  const recentSearchesStorageKey = customRecentStorageKey !== undefined
    ? customRecentStorageKey
    : typeof storageKey === "string" ? "dangam_recent_location_searches" : false;
  const shouldEmitRegionEvents = emitRegionEvents ?? typeof storageKey === "string";
  const legacyLabel = readJson(effectiveLabelStorageKey);
  const labelProvince = legacyLabel ? getAdminProvinces().find((name) => legacyLabel.includes(name)) : undefined;
  const labelDistrict = legacyLabel && labelProvince
    ? getAdminDistricts(labelProvince).find((name) => name && legacyLabel.includes(name))
    : undefined;
  const labelMatch = legacyLabel
    ? searchAdminRegions(legacyLabel, {
      ...(labelProvince ? { province: labelProvince } : {}),
      ...(labelDistrict ? { district: labelDistrict } : {}),
      limit: 20,
    }).find((region) => initialDongs.includes(region.dong))
    : undefined;
  const regionContext = labelMatch
    ? { province: labelMatch.province, district: labelMatch.district }
    : { ...(labelProvince ? { province: labelProvince } : {}), ...(labelDistrict ? { district: labelDistrict } : {}) };
  const savedCodeJson = readJson(codeStorageKey);
  let storedCodes: string[] = [];
  if (savedCodeJson !== null) {
    try {
      const parsed = JSON.parse(savedCodeJson) as unknown;
      storedCodes = Array.isArray(parsed)
        ? parsed.filter((code): code is string => typeof code === "string" && !!findAdminRegionByCode(code))
        : [];
    } catch {
      storedCodes = [];
    }
  }
  const propCodes = initialRegionCodes.filter((code) => !!findAdminRegionByCode(code));
  const legacyCodes = resolveLegacyRegionCodes(initialDongs, regionContext);
  const candidateInitialCodes = propCodes.length ? propCodes : storedCodes.length ? storedCodes : legacyCodes;
  const initialCodes = consumerBrowseSelection
    ? canonicalConsumerBrowseRegionCodes(candidateInitialCodes) ?? []
    : Array.from(new Set(candidateInitialCodes)).slice(maxSelections && maxSelections > 0 ? -Math.floor(maxSelections) : 0);
  const startingCodes = initialCodes.length ? initialCodes : (allowEmptySelection || initialDongs.length > 0) ? [] : [DEFAULT_REGION_CODE];
  const startingRegion = startingCodes.map((code) => findAdminRegionByCode(code)).find(Boolean)
    ?? findAdminRegionByCode(DEFAULT_REGION_CODE)!;
  const [province, setProvince] = useState(startingRegion.province);
  const [district, setDistrict] = useState(startingRegion.district || "__no_district__");
  const [selectedRegionCodes, setSelectedRegionCodes] = useState<string[]>(startingCodes);
  const [selectionLimitMessage, setSelectionLimitMessage] = useState("");
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"전체" | "시·도" | "현재 구">("전체");
  const [detailAddress, setDetailAddress] = useState(() => addressOnly ? readJson("dangam_consumer_detail_address") ?? "" : "");
  const [recentSearches, setRecentSearches] = useState<RecentRegion[]>(() => {
    try {
      const raw = readJson(recentSearchesStorageKey);
      const parsed = raw ? JSON.parse(raw) as Array<Record<string, unknown>> : [];
      return parsed.flatMap((item) => {
        const direct = typeof item.code === "string" ? findAdminRegionByCode(item.code) : undefined;
        const names = typeof item.dong === "string" ? [item.dong] : typeof item.town === "string" ? [item.town] : [];
        const codes = direct ? [direct.code] : resolveLegacyRegionCodes(names, {
          province: typeof item.province === "string" ? item.province : typeof item.provinceName === "string" ? item.provinceName : undefined,
          district: typeof item.district === "string" ? item.district : typeof item.districtName === "string" ? item.districtName : undefined,
        });
        return codes.flatMap((code) => {
          const region = findAdminRegionByCode(code);
          return region ? [{ code, province: region.province, district: region.district, dong: region.dong }] : [];
        });
      }).filter((item, index, rows) => rows.findIndex((candidate) => candidate.code === item.code) === index).slice(0, 6);
    } catch {
      return [];
    }
  });
  const selectedRegions = selectedRegionCodes.flatMap((code) => {
    const region = findAdminRegionByCode(code);
    return region ? [region] : [];
  });
  const selectedTowns = Array.from(new Set(selectedRegions.map((region) => region.dong)));
  const districtWholeSelected = consumerBrowseSelection && isConsumerBrowseDistrictSelection(selectedRegionCodes);
  const districtCodes = consumerBrowseSelection
    ? getAdminRegions(province, district === "__no_district__" ? "" : district).map((region) => region.code)
    : [];
  const currentRegion = selectedRegions.find((region) => region.province === province && region.district === (district === "__no_district__" ? "" : district))
    ?? searchAdminRegions("", { province, district: district === "__no_district__" ? "" : district, limit: 1 })[0];
  const currentTown = currentRegion?.dong ?? "";
  const normalizedQuery = query.trim();
  const nationwideSearchResults = normalizedQuery && !addressOnly
    ? searchAdminRegions(normalizedQuery, {
      ...(searchScope === "시·도" ? { province } : {}),
      ...(searchScope === "현재 구" ? { province, district: district === "__no_district__" ? "" : district } : {}),
      limit: 40,
    }).map((region) => ({
      ...region,
      roads: roadNamesForRegion(region),
      distanceLabel: region.province === province && region.district === (district === "__no_district__" ? "" : district)
        ? "현재 구"
        : region.province === province ? "같은 시·도" : "행정동",
    }))
    : [];

  const pushRecentSearch = (region: RecentRegion) => {
    const next = [region, ...recentSearches.filter((item) => item.code !== region.code)].slice(0, 6);
    setRecentSearches(next);
    if (recentSearchesStorageKey) {
      try { window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(next)); } catch { /* storage is optional */ }
    }
  };
  const selectSearchResult = (region: RecentRegion) => {
    setProvince(region.province);
    setDistrict(region.district || "__no_district__");
    if (consumerBrowseSelection) {
      const current = selectedRegionCodes;
      const currentRegion = current.map((code) => findAdminRegionByCode(code)).find(Boolean);
      const sameDistrict = currentRegion?.province === region.province && currentRegion.district === region.district;
      const next = !sameDistrict || isConsumerBrowseDistrictSelection(current)
        ? [region.code]
        : current.includes(region.code)
          ? current.filter((code) => code !== region.code)
          : [...current, region.code];
      const canonical = canonicalConsumerBrowseRegionCodes(next);
      if (canonical === null) {
        setSelectionLimitMessage("같은 구에서는 동네를 최대 3곳까지 선택할 수 있어요.");
      } else {
        setSelectedRegionCodes(canonical);
        setSelectionLimitMessage("");
      }
    } else {
      setSelectedRegionCodes((current) => {
      const next = searchSelectionMode === "add"
        ? current.includes(region.code) ? current.filter((code) => code !== region.code) : [...current, region.code]
        : [region.code];
      return Array.from(new Set(next)).slice(maxSelections && maxSelections > 0 ? -Math.floor(maxSelections) : 0);
      });
    }
    setQuery("");
    setSearchScope("전체");
    pushRecentSearch(region);
  };
  const selectProvince = (nextProvince: string) => {
    setProvince(nextProvince);
    const first = searchAdminRegions("", { province: nextProvince, limit: 1 })[0];
    setDistrict(first?.district || "__no_district__");
    if (consumerBrowseSelection) {
      setSelectedRegionCodes([]);
      setSelectionLimitMessage("");
    }
  };
  const selectDistrict = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    if (consumerBrowseSelection) {
      setSelectedRegionCodes([]);
      setSelectionLimitMessage("");
    }
  };
  const handleSelectedCodesChange = (codes: string[]) => {
    if (!consumerBrowseSelection) {
      setSelectedRegionCodes(Array.from(new Set(codes)).slice(maxSelections && maxSelections > 0 ? -Math.floor(maxSelections) : 0));
      return;
    }
    const canonical = canonicalConsumerBrowseRegionCodes(codes);
    if (canonical === null) {
      setSelectionLimitMessage("같은 구에서는 동네를 최대 3곳까지 선택할 수 있어요.");
      return;
    }
    setSelectedRegionCodes(canonical);
    setSelectionLimitMessage("");
  };
  const toggleDistrictWhole = () => {
    setSelectedRegionCodes(districtWholeSelected ? [] : canonicalConsumerBrowseRegionCodes(districtCodes) ?? []);
    setSelectionLimitMessage("");
  };
  const selectedLabel = consumerBrowseSelection
    ? formatConsumerBrowseRegionLabel(selectedRegionCodes)
    : selectedRegions[0]
    ? `${selectedRegions[0].province} ${selectedRegions[0].district} ${selectedRegions[0].dong}`.trim()
    : selectedRegionCodes.length === 0 ? "동네 선택 없음" : `${province} ${district === "__no_district__" ? "" : district} ${currentTown}`.trim();
  const selectionCountLabel = consumerBrowseSelection
    ? districtWholeSelected ? `${district} 전체 선택` : selectedRegionCodes.length ? `${selectedRegionCodes.length}/3곳 선택` : "최대 3곳 또는 구 전체"
    : `${selectedRegionCodes.length}곳 선택`;
  const sheetTitle = title ?? (addressOnly ? "주소 관리" : "동네를 바꿔볼까요?");
  const idPrefix = typeof storageKey === "string" ? `region-${storageKey}` : "region-target";

  const applySelection = () => {
    const regionNames = Array.from(new Set(selectedRegions.map((region) => region.dong)));
    onApply(regionNames, selectedLabel, addressOnly ? detailAddress.trim() : undefined, selectedRegionCodes);
    if (typeof storageKey === "string") {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(regionNames));
        window.localStorage.setItem(codeStorageKey, JSON.stringify(selectedRegionCodes));
      } catch { /* storage is optional */ }
      if (shouldEmitRegionEvents) {
        window.dispatchEvent(new CustomEvent("dangam:region-codes-updated", { detail: selectedRegionCodes }));
        if (storageKey === "dangam_selected_dongs") window.dispatchEvent(new CustomEvent("dangam:selected-dongs-updated", { detail: regionNames }));
      }
    }
    if (addressOnly && typeof storageKey === "string") {
      try { window.localStorage.setItem("dangam_consumer_detail_address", detailAddress.trim()); } catch { /* storage is optional */ }
    }
    onClose();
  };

  return (
    <RegionSelectionSheetShell
      title={sheetTitle}
      description={description}
      ariaLabel={sheetTitle}
      onClose={onClose}
      footer={(
        <button className="wide-dark location-apply-button" type="button" disabled={!allowEmptySelection && selectedRegionCodes.length === 0} onClick={applySelection}>
          <MapPin size={15} />
          {applyLabel ?? (addressOnly ? "완료" : allowEmptySelection && selectedRegionCodes.length === 0 ? "동네 선택 없이 둘러보기" : consumerBrowseSelection && districtWholeSelected ? `설정 완료 (${district} 전체)` : `설정 완료 (총 ${selectedRegionCodes.length}곳)`)}
        </button>
      )}
    >
      {!addressOnly && normalizedQuery ? (
        <section className="location-autocomplete-section" aria-label="전국 동네 검색 결과">
          <div className="location-search-scope-tabs" role="tablist" aria-label="검색 범위">
            <button type="button" role="tab" aria-selected={searchScope === "전체"} className={searchScope === "전체" ? "active" : ""} onClick={() => setSearchScope("전체")}>전체</button>
            <button type="button" role="tab" aria-selected={searchScope === "시·도"} className={searchScope === "시·도" ? "active" : ""} onClick={() => setSearchScope("시·도")}>{province}</button>
            <button type="button" role="tab" aria-selected={searchScope === "현재 구"} className={searchScope === "현재 구" ? "active" : ""} onClick={() => setSearchScope("현재 구")}>{district === "__no_district__" ? "현재 구" : district}</button>
          </div>
          <div className="location-autocomplete-heading"><strong>{searchScope === "전체" ? "전국" : searchScope} 행정동 검색 결과</strong><span>{nationwideSearchResults.length}곳</span></div>
          <div className="location-autocomplete-results">
            {nationwideSearchResults.map((result) => (
              <button type="button" className="location-autocomplete-item" key={result.code} aria-pressed={selectedRegionCodes.includes(result.code)} onClick={() => selectSearchResult(result)}>
                <MapPin size={17} aria-hidden="true" />
                <span><strong>{result.dong}</strong><small>{result.province} · {result.district}{result.roads.length > 0 ? ` · ${result.roads.slice(0, 2).join(" · ")} 일대` : ""}</small></span>
                <em>{selectedRegionCodes.includes(result.code) ? "선택됨" : result.distanceLabel}</em>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          {nationwideSearchResults.length === 0 ? <p className="location-empty">일치하는 행정동이 없어요. 시·도, 구, 동 이름으로 다시 검색해 보세요.</p> : null}
        </section>
      ) : null}
      <div className="location-fixed-controls">
        <RegionPicker
          idPrefix={idPrefix}
          province={province}
          district={district}
          maxSelections={consumerBrowseSelection ? 3 : maxSelections}
          selectedCodes={selectedRegionCodes}
          onProvinceChange={selectProvince}
          onDistrictChange={selectDistrict}
          onSelectedCodesChange={handleSelectedCodesChange}
          searchQuery={query}
          onSearchQueryChange={setQuery}
          searchEnabled={!addressOnly}
          searchPlaceholder={searchPlaceholder}
          consumerBrowseSelectionMode={consumerBrowseSelection}
          selectionLimitMessage={selectionLimitMessage}
          showDistrictWhole={consumerBrowseSelection}
          districtWholeSelected={districtWholeSelected}
          onDistrictWholeToggle={toggleDistrictWhole}
        />
        {addressOnly ? (
          <label className="address-town-select">
            <span>상세 주소</span>
            <input value={detailAddress} onChange={(event) => setDetailAddress(event.target.value)} placeholder="도로명, 건물명, 동·호수 입력" aria-label="상세 주소" />
          </label>
        ) : null}
      </div>
      {!addressOnly ? (
        <section className="location-neighborhood-section">
          <h3>{summaryHeading} <span>{selectionCountLabel}</span></h3>
          <div className="location-current-summary-chip">
            <MapPin size={15} aria-hidden="true" />
            <strong>{selectedRegionCodes.length === 0 ? "동네 선택 없음" : consumerBrowseSelection ? formatConsumerBrowseRegionLabel(selectedRegionCodes) : formatSelectedNeighborhoods(selectedTowns)}</strong>
            <ChevronRight size={15} aria-hidden="true" />
          </div>
          {allowEmptySelection && selectedRegionCodes.length > 0 ? <button type="button" className="location-clear-selection" onClick={() => setSelectedRegionCodes([])}>동네 선택 해제</button> : null}
        </section>
      ) : null}
      {!addressOnly && !normalizedQuery && recentSearches.length > 0 ? (
        <section className="location-recent-section">
          <div className="location-autocomplete-heading">
            <strong>최근 검색한 동네</strong>
            <button type="button" onClick={() => {
              setRecentSearches([]);
              if (recentSearchesStorageKey) {
                try { window.localStorage.removeItem(recentSearchesStorageKey); } catch { /* storage is optional */ }
              }
            }}>전체 삭제</button>
          </div>
          <div className="location-recent-chips">
            {recentSearches.map((recent) => (
              <button type="button" key={recent.code} onClick={() => selectSearchResult(recent)}>
                <span>{recent.dong}</span>
                <small>{recent.district}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </RegionSelectionSheetShell>
  );
}
