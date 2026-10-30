import React, { useMemo } from "react";
import { getAdminDistricts, getAdminProvinces, roadNamesForRegion, searchAdminRegions } from "./regions";
import "./region-picker.css";

export type RegionPickerProps = {
  province: string;
  district: string;
  selectedCodes: string[];
  onProvinceChange: (province: string) => void;
  onDistrictChange: (district: string) => void;
  onSelectedCodesChange: (codes: string[]) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  searchEnabled?: boolean;
  searchPlaceholder?: string;
  idPrefix?: string;
  maxSelections?: number;
  allowNationwide?: boolean;
  showDistrictWhole?: boolean;
  districtWholeSelected?: boolean;
  onDistrictWholeToggle?: () => void;
  disableDongSelection?: boolean;
  consumerBrowseSelectionMode?: boolean;
  selectionLimitMessage?: string;
};

const NO_DISTRICT = "__no_district__";

export function RegionPicker({
  province,
  district,
  selectedCodes,
  onProvinceChange,
  onDistrictChange,
  onSelectedCodesChange,
  searchQuery = "",
  onSearchQueryChange,
  searchEnabled = true,
  searchPlaceholder = "읍·면·동 이름 검색",
  idPrefix = "tink-region",
  maxSelections,
  allowNationwide = false,
  showDistrictWhole = false,
  districtWholeSelected = false,
  onDistrictWholeToggle,
  disableDongSelection = false,
  consumerBrowseSelectionMode = false,
  selectionLimitMessage,
}: RegionPickerProps) {
  const provinces = useMemo(() => getAdminProvinces(), []);
  const districts = useMemo(() => getAdminDistricts(province), [province]);
  const selectedDistrict = district === NO_DISTRICT ? "" : district;
  const districtOptions = districts.map((name) => ({ value: name || NO_DISTRICT, label: name || "시·군·구 없음" }));
  const rows = useMemo(
    () => searchAdminRegions(searchQuery, { province, district: selectedDistrict, limit: 600 }),
    [province, selectedDistrict, searchQuery],
  );
  const nationwide = allowNationwide && province === "전국";
  const provinceOptions = allowNationwide ? ["서울특별시", "전국", ...provinces.filter((name) => name !== "서울특별시")] : provinces;

  const toggleRegion = (code: string) => {
    if (disableDongSelection) return;
    if (consumerBrowseSelectionMode && districtWholeSelected) {
      onSelectedCodesChange([code]);
      return;
    }
    onSelectedCodesChange(selectedCodes.includes(code)
      ? selectedCodes.filter((item) => item !== code)
      : [code, ...selectedCodes.filter((item) => item !== code)]);
  };

  return (
    <div className="tb-region-picker">
      <div className="tb-region-picker__select-row">
        <label className="tb-region-picker__field" htmlFor={`${idPrefix}-province`}>
          <span>시·도</span>
          <select id={`${idPrefix}-province`} value={province} onChange={(event) => onProvinceChange(event.target.value)}>
            {provinceOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        {!nationwide && <label className="tb-region-picker__field" htmlFor={`${idPrefix}-district`}>
          <span>시·군·구</span>
          <select id={`${idPrefix}-district`} value={districtOptions.some((item) => item.value === district) ? district : selectedDistrict || districtOptions[0]?.value || ""} onChange={(event) => onDistrictChange(event.target.value)}>
            {districtOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>}
      </div>

      {nationwide ? (
        <div className="tb-region-picker__nationwide" role="status">
          <strong>전국 전체</strong>
          <span>전국을 선택하면 세부 동 선택 없이 하나의 지역으로 적용됩니다.</span>
        </div>
      ) : <>
        <div className="tb-region-picker__heading">
          <strong>{consumerBrowseSelectionMode ? "동네 선택" : "읍·면·동 선택"}</strong>
          <span>{consumerBrowseSelectionMode ? "최대 3곳 또는 구 전체 선택" : maxSelections === 1 ? "한 곳만 선택 가능" : "여러 곳 선택 가능"}</span>
        </div>
        {searchEnabled && <label className="tb-region-picker__search" htmlFor={`${idPrefix}-search`}>
          <span aria-hidden="true">⌕</span>
          <input
            id={`${idPrefix}-search`}
            type="search"
            inputMode="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="읍·면·동 검색"
          />
        </label>}
        <div className="tb-region-picker__tiles" role="group" aria-label="읍·면·동 선택">
          {showDistrictWhole && selectedDistrict && <button
            type="button"
            className={`tb-region-picker__tile tb-region-picker__district${districtWholeSelected ? " is-selected" : ""}`}
            aria-pressed={districtWholeSelected}
            onClick={onDistrictWholeToggle}
          >
            <span>{consumerBrowseSelectionMode ? "구 전체 선택" : `${selectedDistrict} 전체`}</span>
            <small>{districtWholeSelected ? "선택됨" : "전체 선택"}</small>
          </button>}
          {rows.map((region) => {
            const selected = selectedCodes.includes(region.code);
            const roads = roadNamesForRegion(region);
            const roadLabel = roads.length ? `${roads.join("·")} 일대` : "";
            const regionLabel = `${region.province} ${region.district} ${region.dong}${roadLabel ? ` · ${roadLabel}` : ""} · ${region.code}`;
            return <button
              type="button"
              key={region.code}
              className={`tb-region-picker__tile${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              aria-label={regionLabel}
              disabled={disableDongSelection}
              onClick={() => toggleRegion(region.code)}
              title={regionLabel}
            >
              <span className="tb-region-picker__tile-name">{region.dong}</span>
              {roadLabel && <small className="tb-region-picker__tile-road">{roadLabel}</small>}
              {selected && <small className="tb-region-picker__tile-selected">선택됨</small>}
            </button>;
          })}
          {rows.length === 0 && <p className="tb-region-picker__empty">선택한 구·군에서 찾을 수 있는 동이 없어요.</p>}
        </div>
        {selectionLimitMessage && <p className="tb-region-picker__selection-feedback" role="status">{selectionLimitMessage}</p>}
      </>}
    </div>
  );
}
