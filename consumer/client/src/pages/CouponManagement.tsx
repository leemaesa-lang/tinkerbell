import { useMemo, useState } from "react";
import {
  couponRegionTargetFromLegacyCodes,
  couponRegionTargetToLegacyCodes,
  createDongCouponTarget,
  findAdminRegionByCode,
  isCouponRegionTarget,
  RegionTargetPicker,
  type CouponRegionTarget,
} from "@tinkerbell/region-picker";
import { createDangamApi } from "@/lib/dangam-coupons/shared/createDangamApi";
import { useMerchantCoupons } from "@/lib/dangam-coupons/merchant/useMerchantCoupons";
import {
  buildMerchantCouponRegionMetadata,
  MERCHANT_COUPON_TARGET_DONGS_KEY,
  MERCHANT_COUPON_TARGET_LABEL_KEY,
  readMerchantCouponTargetCodes,
  readMerchantStoreRegionCode,
  saveMerchantCouponTargetCodes,
} from "@/lib/merchant-coupon-target-region";

const today = new Date().toISOString().slice(0, 10);
const monthEnd = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const EXPLICIT_COUPON_TARGET_KEY = "dangam_merchant_coupon_target_v2";

function readInitialCouponTarget(storeRegionCode: string): CouponRegionTarget {
  try {
    const saved = window.localStorage.getItem(EXPLICIT_COUPON_TARGET_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isCouponRegionTarget(parsed)) return parsed;
    }
  } catch {
    // Fall back to the compatible legacy dong list if the explicit preference is unavailable.
  }
  const codes = readMerchantCouponTargetCodes(window.localStorage, [storeRegionCode]);
  return codes.length ? couponRegionTargetFromLegacyCodes(codes) : createDongCouponTarget([storeRegionCode]);
}

export default function CouponManagement() {
  const storeRegionCode = readMerchantStoreRegionCode(window.localStorage);
  const [target, setTarget] = useState<CouponRegionTarget>(() => readInitialCouponTarget(storeRegionCode));
  const api = useMemo(() => createDangamApi(() => window.localStorage.getItem("dangam_access_token") ?? ""), []);
  const storePublicId = window.localStorage.getItem("dangam_merchant_store_public_id") ?? window.localStorage.getItem("dangam_merchant_store_id") ?? "demo-store";
  const { coupons, loading, error, createAndPublish } = useMerchantCoupons(api, storePublicId);
  const [title, setTitle] = useState("");
  const [discount, setDiscount] = useState("30");
  const [quantity, setQuantity] = useState("20");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const changeTarget = (next: CouponRegionTarget) => {
    setTarget(next);
    if (!isCouponRegionTarget(next)) return;
    window.localStorage.setItem(EXPLICIT_COUPON_TARGET_KEY, JSON.stringify(next));
    if (next.targetScope === "dong") {
      try {
        const savedCodes = saveMerchantCouponTargetCodes(window.localStorage, next.targetDongCodes);
        const names = savedCodes.flatMap((code) => {
          const region = findAdminRegionByCode(code);
          return region ? [region.dong] : [];
        });
        window.localStorage.setItem(MERCHANT_COUPON_TARGET_DONGS_KEY, JSON.stringify(names));
        window.localStorage.setItem(MERCHANT_COUPON_TARGET_LABEL_KEY, names.join(" · "));
      } catch {
        // An in-progress empty dong selection is allowed in the picker but is not persisted as a legacy preference.
      }
    }
  };

  const publish = async () => {
    if (!title.trim()) { setMessage("쿠폰명을 입력해 주세요."); return; }
    if (!isCouponRegionTarget(target) || target.targetScope === "none") {
      setMessage("쿠폰 대상 지역을 정본 행정구역으로 선택해 주세요.");
      return;
    }
    if (target.targetScope === "dong" && target.targetDongCodes.length < 1) {
      setMessage("대상 읍·면·동을 한 곳 이상 선택해 주세요.");
      return;
    }
    const legacyTargetRegionCodes = couponRegionTargetToLegacyCodes(target);
    setBusy(true); setMessage("");
    try {
      await createAndPublish({
        title: title.trim(),
        description: "사업자 발행 쿠폰",
        terms: "매장 결제 시 쿠폰을 보여주세요.",
        campaignKind: "standard",
        discountType: "percent",
        discountValue: Number(discount),
        originalPrice: 10000,
        discountedPrice: Math.max(0, 10000 - Number(discount) * 100),
        quantity: Math.max(1, Number(quantity)),
        perCustomerLimit: 1,
        startsAt: `${today}T00:00:00.000Z`,
        endsAt: `${monthEnd}T23:59:59.000Z`,
        metadata: {
          ...buildMerchantCouponRegionMetadata(legacyTargetRegionCodes, storeRegionCode),
          targetScope: target.targetScope,
          targetAreaLevel: target.targetAreaLevel,
          targetDistrictCode: target.targetDistrictCode,
          targetDongCodes: [...target.targetDongCodes],
          usageModes: ["visit"],
          branchName: "본점",
          merchantName: "팅커벨 제휴 매장",
        },
      });
      setTitle("");
      setMessage("쿠폰이 발행되어 소비자 앱에 반영되었습니다.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "쿠폰 발행에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="merchant-management-screen">
    <header><h1>쿠폰 관리</h1><p>발행 중 쿠폰</p></header>
    <section className="merchant-publish-card">
      <h2>새 쿠폰 발행</h2>
      <label>쿠폰명<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 아메리카노 30% 할인" /></label>
      <div className="merchant-form-grid">
        <label>할인율(%)<input type="number" min="1" max="100" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
        <label>수량<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      </div>
      <section aria-label="쿠폰 대상 지역" className="merchant-region-target-section">
        <h3>대상 지역</h3>
        <p>매장 주소와 별도로 전국, 시·도, 시·군·구 또는 여러 동을 선택할 수 있습니다.</p>
        <RegionTargetPicker value={target} onChange={changeTarget} idPrefix="preview-merchant-coupon-target" />
      </section>
      <button type="button" onClick={() => void publish()} disabled={busy}>{busy ? "발행 중..." : "쿠폰 발행"}</button>
      {message && <p role="status">{message}</p>}
    </section>
    <section className="merchant-coupon-list">
      <h2>발행 중 쿠폰</h2>
      {loading && <p>불러오는 중...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !coupons.length && <p>발행된 쿠폰이 없습니다.</p>}
      {coupons.map((coupon) => <article key={coupon.id}>
        <div><h3>{coupon.title}</h3><p>{coupon.discountValue}% 할인 · 잔여 {coupon.remaining_quantity}장</p></div>
        <strong>{coupon.status === "active" ? "발행 중" : coupon.status}</strong>
      </article>)}
    </section>
  </main>;
}
