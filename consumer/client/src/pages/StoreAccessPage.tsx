import { useEffect, useMemo, useState } from "react";
import { createDangamApi } from "@/lib/dangam-coupons/shared/createDangamApi";
import { consumerCoupons } from "@/lib/dangam-coupons/shared/consumer";
import { classifyStoreAccessFailure, type StoreAccessFailureKind } from "@/lib/dangam-coupons/consumer/store-access-policy";
import type { CentralConsumerStoreDetailView } from "../../../../shared/bridge-contracts";

type LoadState = "loading" | "ready" | StoreAccessFailureKind;
const ADULT_ONLY_MESSAGE = "만 19세 이상 성인만 이용 가능한 매장입니다";

export default function StoreAccessPage({ storePublicId }: { storePublicId: string }) {
  const api = useMemo(() => createDangamApi(() => typeof window === "undefined" ? "" : window.localStorage.getItem("dangam_access_token") ?? ""), []);
  const [state, setState] = useState<LoadState>("loading");
  const [store, setStore] = useState<CentralConsumerStoreDetailView | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    setStore(null);
    void (async () => {
      try {
        const detail = await consumerCoupons(api).storeDetail(storePublicId);
        if (!detail || typeof detail !== "object") {
          if (active) setState("not-found");
          return;
        }
        if (!active) return;
        setStore(detail);
        setState("ready");
      } catch (error) {
        if (!active) return;
        setStore(null);
        setState(classifyStoreAccessFailure(error));
      }
    })();
    return () => { active = false; };
  }, [api, storePublicId]);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fa", padding: "32px 18px", color: "#1f2937" }}>
      <section style={{ maxWidth: 620, margin: "0 auto", padding: 28, borderRadius: 18, background: "#fff", boxShadow: "0 12px 40px rgba(15,23,42,.08)" }}>
        {state === "loading" ? <p role="status" style={{ fontSize: 16, fontWeight: 700 }}>매장 정보를 확인하고 있습니다.</p> : null}
        {state === "adult-only" ? <p role="alert" style={{ fontSize: 18, fontWeight: 800 }}>{ADULT_ONLY_MESSAGE}</p> : null}
        {state === "not-found" ? <p role="alert" style={{ fontSize: 16, fontWeight: 700 }}>매장을 찾을 수 없습니다.</p> : null}
        {state === "unavailable" ? <p role="alert" style={{ fontSize: 16, fontWeight: 700 }}>매장 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
        {state === "ready" && store ? <div>
          <a href="/" style={{ display: "inline-block", marginBottom: 20, color: "#334155", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>소비자 홈으로</a>
          <h1 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 800 }}>{store.name}</h1>
          <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{store.category} · {store.subcategory}</p>
          {store.isAdultOnly ? <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>성인 전용 매장</p> : null}
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{store.area}</p>
          <p style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 700 }}>{store.address}</p>
        </div> : null}
      </section>
    </main>
  );
}
