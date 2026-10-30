import type { CentralAdminControlTowerActionItem } from "./bridge-contracts";

export type ControlTowerFilterId =
  | "all"
  | "refund"
  | "adult_review"
  | "coupon_review"
  | "partner_review"
  | "enrollment";

export type ControlTowerMetricCardId = "credit" | "refund" | "regulation" | "membership";

export type ControlTowerFilterItem = Pick<CentralAdminControlTowerActionItem, "category" | "actionType">;

const metricCardFilters = {
  refund: "refund",
  regulation: "adult_review",
  membership: "enrollment",
} as const satisfies Record<Exclude<ControlTowerMetricCardId, "credit">, ControlTowerFilterId>;

export function filterForMetricCard(card: "credit"): null;
export function filterForMetricCard(card: Exclude<ControlTowerMetricCardId, "credit">): ControlTowerFilterId;
export function filterForMetricCard(card: ControlTowerMetricCardId): ControlTowerFilterId | null {
  return card === "credit" ? null : metricCardFilters[card];
}

export function matchesControlTowerFilter(item: ControlTowerFilterItem, filter: ControlTowerFilterId): boolean {
  switch (filter) {
    case "all":
      return true;
    case "refund":
      return item.category === "refund";
    case "adult_review":
      return item.category === "adult_review" && item.actionType === "adult_coupon";
    case "coupon_review":
      return item.category === "coupon_review";
    case "partner_review":
      return item.category === "partner_review";
    case "enrollment":
      return item.actionType === "store_entry";
  }
}
