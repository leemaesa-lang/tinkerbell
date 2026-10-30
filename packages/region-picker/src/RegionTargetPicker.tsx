import React, { useEffect, useMemo, useState } from "react";
import { RegionPicker } from "./RegionPicker";
import {
  createDistrictCouponTarget,
  createNationwideCouponTarget,
  findCouponTargetArea,
  findCouponTargetAreaCode,
  isCanonicalProvinceName,
  type CouponRegionTarget,
  type CouponTargetAreaLevel,
} from "./coupon-target";
import { findAdminRegionByCode, getAdminDistricts, getAdminProvinces } from "./regions";

export type RegionTargetPickerProps = {
  value: CouponRegionTarget;
  onChange: (target: CouponRegionTarget) => void;
  idPrefix?: string;
  searchPlaceholder?: string;
};

type SelectionMode = "nationwide" | "sido" | "sigungu" | "dong";

function initialArea(value: CouponRegionTarget) {
  if (value.targetScope === "district" && value.targetAreaLevel && value.targetDistrictCode) {
    const area = findCouponTargetArea(value.targetAreaLevel, value.targetDistrictCode);
    if (area) return { province: area.level === "sido" ? area.name : area.province!, district: area.level === "sigungu" ? area.name : getAdminDistricts(area.name)[0] ?? "" };
  }
  if (value.targetScope === "dong" && value.targetDongCodes.length) {
    const region = findAdminRegionByCode(value.targetDongCodes[0]);
    if (region) return { province: region.province, district: region.district };
  }
  const provinces = getAdminProvinces();
  const province = provinces.includes("서울특별시") ? "서울특별시" : provinces[0] ?? "";
  return { province, district: getAdminDistricts(province)[0] ?? "" };
}

function modeFor(value: CouponRegionTarget): SelectionMode {
  if (value.targetScope === "district") return value.targetAreaLevel ?? "sigungu";
  if (value.targetScope === "dong") return "dong";
  if (value.targetScope === "nationwide") return "nationwide";
  return "nationwide";
}

export function RegionTargetPicker({ value, onChange, idPrefix = "coupon-region-target", searchPlaceholder = "읍·면·동 이름 검색" }: RegionTargetPickerProps) {
  const initial = useMemo(() => initialArea(value), []);
  const [province, setProvince] = useState(initial.province);
  const [district, setDistrict] = useState(initial.district);
  const [search, setSearch] = useState("");
  const mode = modeFor(value);
  const provinces = useMemo(() => getAdminProvinces(), []);
  const districts = useMemo(() => getAdminDistricts(province), [province]);
  const dongCodeKey = value.targetDongCodes.join("|");

  useEffect(() => {
    if (value.targetScope === "district" && value.targetAreaLevel && value.targetDistrictCode) {
      const area = findCouponTargetArea(value.targetAreaLevel, value.targetDistrictCode);
      if (area) {
        const nextProvince = area.level === "sido" ? area.name : area.province!;
        const nextDistrict = area.level === "sigungu" ? area.name : getAdminDistricts(area.name)[0] ?? "";
        setProvince(nextProvince);
        setDistrict(nextDistrict);
      }
    } else if (value.targetScope === "dong" && value.targetDongCodes.length) {
      const first = findAdminRegionByCode(value.targetDongCodes[0]);
      if (first) {
        setProvince(first.province);
        setDistrict(first.district);
      }
    }
    setSearch("");
  }, [value.targetScope, value.targetAreaLevel, value.targetDistrictCode, dongCodeKey]);

  const updateArea = (level: CouponTargetAreaLevel, nextProvince = province, nextDistrict = district) => {
    const code = findCouponTargetAreaCode(level, nextProvince, level === "sigungu" ? nextDistrict : undefined);
    if (code) onChange(createDistrictCouponTarget(level, code));
  };

  const changeProvince = (nextProvince: string) => {
    setProvince(nextProvince);
    const nextDistrict = getAdminDistricts(nextProvince)[0] ?? "";
    setDistrict(nextDistrict);
    if (mode === "sido") updateArea("sido", nextProvince, nextDistrict);
    if (mode === "sigungu") updateArea("sigungu", nextProvince, nextDistrict);
  };

  const changeDistrict = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    if (mode === "sigungu") updateArea("sigungu", province, nextDistrict);
  };

  const changeMode = (nextMode: SelectionMode) => {
    setSearch("");
    if (nextMode === "nationwide") {
      onChange(createNationwideCouponTarget());
      return;
    }
    if (nextMode === "sido") {
      const nextProvince = isCanonicalProvinceName(province) ? province : provinces[0] ?? "";
      setProvince(nextProvince);
      updateArea("sido", nextProvince);
      return;
    }
    if (nextMode === "sigungu") {
      const nextProvince = isCanonicalProvinceName(province) ? province : provinces[0] ?? "";
      const nextDistrict = getAdminDistricts(nextProvince).includes(district) ? district : getAdminDistricts(nextProvince)[0] ?? "";
      setProvince(nextProvince);
      setDistrict(nextDistrict);
      updateArea("sigungu", nextProvince, nextDistrict);
      return;
    }
    onChange({ targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: value.targetScope === "dong" ? [...value.targetDongCodes] : [] });
  };

  return <section className="tb-region-target-picker" aria-label="쿠폰 대상 지역 범위">
    <div className="tb-region-target-picker__scope" role="group" aria-label="대상 범위">
      <button type="button" className={mode === "nationwide" ? "is-selected" : ""} aria-pressed={mode === "nationwide"} onClick={() => changeMode("nationwide")}>전국</button>
      <button type="button" className={mode === "sido" ? "is-selected" : ""} aria-pressed={mode === "sido"} onClick={() => changeMode("sido")}>시·도 전체</button>
      <button type="button" className={mode === "sigungu" ? "is-selected" : ""} aria-pressed={mode === "sigungu"} onClick={() => changeMode("sigungu")}>시·군·구 전체</button>
      <button type="button" className={mode === "dong" ? "is-selected" : ""} aria-pressed={mode === "dong"} onClick={() => changeMode("dong")}>여러 동</button>
    </div>

    {mode === "nationwide" ? <p className="tb-region-target-picker__hint">전국의 소비자에게 노출합니다.</p> : null}

    {(mode === "sido" || mode === "sigungu") ? <div className="tb-region-target-picker__area-fields">
      <label className="tb-region-target-picker__field" htmlFor={`${idPrefix}-sido`}>
        <span>시·도</span>
        <select id={`${idPrefix}-sido`} value={province} onChange={(event) => changeProvince(event.target.value)}>
          {provinces.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {mode === "sigungu" ? <label className="tb-region-target-picker__field" htmlFor={`${idPrefix}-sigungu`}>
        <span>시·군·구</span>
        <select id={`${idPrefix}-sigungu`} value={districts.includes(district) ? district : districts[0] ?? ""} onChange={(event) => changeDistrict(event.target.value)}>
          {districts.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label> : null}
      <p className="tb-region-target-picker__hint">{mode === "sido" ? `${province} 전체에 적용합니다.` : `${province} ${district} 전체에 적용합니다.`}</p>
    </div> : null}

    {mode === "dong" ? <>
      <RegionPicker
        idPrefix={idPrefix}
        province={province}
        district={district}
        selectedCodes={value.targetDongCodes}
        onProvinceChange={changeProvince}
        onDistrictChange={changeDistrict}
        onSelectedCodesChange={(codes) => onChange({ targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [...new Set(codes)] })}
        searchQuery={search}
        onSearchQueryChange={setSearch}
        searchPlaceholder={searchPlaceholder}
      />
      <p className="tb-region-target-picker__hint" aria-live="polite">
        {value.targetDongCodes.length ? `${value.targetDongCodes.length}개 행정동을 선택했습니다.` : "쿠폰을 노출할 동을 한 곳 이상 선택해 주세요."}
      </p>
    </> : null}
  </section>;
}
