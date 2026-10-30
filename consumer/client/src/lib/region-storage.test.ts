import { describe, expect, it } from "vitest";
import { REGION_SELECTION_STORAGE_KEY, readRegionSelection, saveRegionSelection } from "./region-storage";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const storage = () => new MemoryStorage() as unknown as Storage;
const YEOKSAM_1 = "1168064000";
const YEOKSAM_2 = "1168065000";
const SANBON_1 = "4141054000";

describe("consumer region selection storage", () => {
  it("persists one validated canonical code and derives its official name and label", () => {
    const memory = storage();
    const saved = saveRegionSelection([YEOKSAM_1, "not-a-code"], memory);
    expect(saved.codes).toEqual([YEOKSAM_1]);
    expect(saved.names).toEqual(["역삼1동"]);
    expect(saved.labels).toEqual(["서울특별시 강남구 역삼1동"]);
    expect(JSON.parse(memory.getItem(REGION_SELECTION_STORAGE_KEY) ?? "{}")).toMatchObject({ version: 1, codes: [YEOKSAM_1] });
    expect(readRegionSelection(memory)).toEqual(saved);
  });

  it("allows an explicit empty selection and never invents a default location", () => {
    const memory = storage();
    expect(readRegionSelection(memory)).toEqual({ version: 1, codes: [], names: [], labels: [] });
    expect(saveRegionSelection([], memory)).toEqual({ version: 1, codes: [], names: [], labels: [] });
    expect(readRegionSelection(memory).codes).toEqual([]);
  });

  it("rejects multiple manual neighborhood codes instead of choosing one", () => {
    const memory = storage();
    expect(saveRegionSelection([YEOKSAM_1, YEOKSAM_2], memory).codes).toEqual([]);
    expect(readRegionSelection(memory).codes).toEqual([]);
  });

  it("migrates an explicit legacy canonical code", () => {
    const memory = storage();
    memory.setItem("dangam_selected_region_codes", JSON.stringify([YEOKSAM_1]));
    const migrated = readRegionSelection(memory);
    expect(migrated.codes).toEqual([YEOKSAM_1]);
    expect(migrated.names).toEqual(["역삼1동"]);
    expect(memory.getItem("dangam_selected_region_codes")).toBeNull();
  });

  it("ignores old name-only location values that may have come from GPS reverse geocoding", () => {
    const memory = storage();
    memory.setItem("dangam_coupon_browse_dongs", JSON.stringify(["산본1동"]));
    memory.setItem("dangam_coupon_browse_label", "경기도 군포시 산본1동");
    const migrated = readRegionSelection(memory);
    expect(migrated.codes).toEqual([]);
    expect(migrated.labels).toEqual([]);
  });

  it("does not guess an ambiguous legacy name or reuse a fake default", () => {
    const memory = storage();
    memory.setItem("dangam_selected_dongs", JSON.stringify(["중앙동"]));
    memory.setItem("dangam_consumer_address_display", "서울 강남구 중앙동 12-3");
    const migrated = readRegionSelection(memory);
    expect(migrated.codes).toEqual([]);
    expect(migrated.names).toEqual([]);
  });
});
