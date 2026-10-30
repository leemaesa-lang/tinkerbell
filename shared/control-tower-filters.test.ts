import { describe, expect, it } from "vitest";
import {
  filterForMetricCard,
  matchesControlTowerFilter,
  type ControlTowerFilterItem,
} from "./control-tower-filters";

function item(category: ControlTowerFilterItem["category"], actionType: ControlTowerFilterItem["actionType"]): ControlTowerFilterItem {
  return { category, actionType };
}

describe("control-tower KPI filters", () => {
  it("routes the charging KPI away from the refund workbench", () => {
    expect(filterForMetricCard("credit")).toBeNull();
  });

  it("maps the remaining KPI cards to their corresponding workbench filters", () => {
    expect(filterForMetricCard("refund")).toBe("refund");
    expect(filterForMetricCard("regulation")).toBe("adult_review");
    expect(filterForMetricCard("membership")).toBe("enrollment");
  });

  it("keeps the refund tab limited to refund cases", () => {
    expect(matchesControlTowerFilter(item("refund", "consumer_refund"), "refund")).toBe(true);
    expect(matchesControlTowerFilter(item("refund", "merchant_credit_refund"), "refund")).toBe(true);
    expect(matchesControlTowerFilter(item("coupon_review", "advertising"), "refund")).toBe(false);
    expect(matchesControlTowerFilter(item("adult_review", "adult_coupon"), "refund")).toBe(false);
  });

  it("filters the 19+ card to adult coupon reviews only", () => {
    expect(matchesControlTowerFilter(item("adult_review", "adult_coupon"), "adult_review")).toBe(true);
    expect(matchesControlTowerFilter(item("coupon_review", "distribution_coupon"), "adult_review")).toBe(false);
    expect(matchesControlTowerFilter(item("partner_review", "partner_application"), "adult_review")).toBe(false);
  });

  it("filters the membership and admission card to merchant entry reviews", () => {
    expect(matchesControlTowerFilter(item("partner_review", "store_entry"), "enrollment")).toBe(true);
    expect(matchesControlTowerFilter(item("partner_review", "partner_application"), "enrollment")).toBe(false);
  });

  it("preserves the original coupon and partner workbench categories", () => {
    expect(matchesControlTowerFilter(item("coupon_review", "advertising"), "coupon_review")).toBe(true);
    expect(matchesControlTowerFilter(item("partner_review", "partner_application"), "partner_review")).toBe(true);
  });
});
