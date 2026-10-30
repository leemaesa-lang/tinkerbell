import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./ChatRoomLayout.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./ChatRoomLayout.css", import.meta.url), "utf8");

describe("shared mobile chat room layout", () => {
  it("provides a common ChevronLeft/title/more header and banner, message, composer, and overlay slots", () => {
    expect(source).toContain("ChevronLeft");
    expect(source).toContain("EllipsisVertical");
    expect(source).toContain("className=\"chat-room-layout-header\"");
    expect(source).toContain("className=\"chat-room-layout-banner\"");
    expect(source).toContain("className={messagesClass}");
    expect(source).toContain("className=\"chat-room-layout-composer\"");
    expect(source).toContain("{overlays}");
  });

  it("matches the 58px compact app-header height while respecting the device safe area", () => {
    expect(styles).toContain("height: calc(58px + env(safe-area-inset-top, 0px)) !important;");
    expect(styles).toContain("min-height: calc(58px + env(safe-area-inset-top, 0px)) !important;");
    expect(styles).toContain("font-size: 16px !important;");
    expect(styles).toContain("width: 40px !important;");
  });

  it("anchors the white scrolling shell and shared composer to the app frame above the global six-tab navigation", () => {
    expect(styles).toContain("flex: 1 1 0% !important;");
    expect(styles).toContain("overflow-y: auto !important;");
    expect(styles).toContain("background: #ffffff !important;");
    expect(styles).toContain("padding: 8px 12px !important;");
    expect(styles).toContain("grid-template-columns: repeat(6, minmax(0, 1fr)) !important;");
    expect(styles).toContain("position: absolute !important;");
    expect(styles).toContain("inset: 0 0 calc(70px + env(safe-area-inset-bottom, 0px)) 0 !important;");
    expect(styles).toContain("body:has(.chat-room-layout) .app-frame");
  });

  it("shows a 40px marketplace thumbnail and role-specific compact action in the 52px information strip", () => {
    expect(styles).toContain("height: 52px !important;");
    expect(styles).toContain("grid-template-columns: 40px minmax(0, 1fr) auto !important;");
    expect(styles).toContain("width: 40px !important;");
    expect(styles).toContain(".marketplace-chat-status-change,");
    expect(styles).toContain(".marketplace-chat-schedule-button");
  });

  it("keeps the transaction item banner compact and uses the same fixed composer and six-tab footer shell", () => {
    expect(styles).toContain("margin: 6px 12px !important;");
    expect(styles).toContain("padding: 6px 12px !important;");
    expect(styles).toContain("#root .chat-room-layout .chat-room-layout-composer");
    expect(styles).toContain("height: calc(70px + env(safe-area-inset-bottom, 0px)) !important;");
    expect(styles).toContain(".marketplace-chat-more-menu");
    expect(styles).not.toContain(".marketplace-chat-product-price .marketplace-chat-status");
  });
});
