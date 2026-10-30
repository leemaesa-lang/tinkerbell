import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const gate = readFileSync(resolve(process.cwd(), "client/src/components/PhoneOnboardingGate.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "client/src/components/consumer-onboarding.css"), "utf8");
const homeStage = gate
  .split('if (previewOnly && previewStage === "home")')[1]
  ?.split("\n  if (previewOnly)")[0] ?? "";

describe("Consumer Preview banner removal", () => {
  it("removes only the top banner and reset button while preserving Preview Home", () => {
    expect(homeStage).toContain("ConsumerPreviewDemoProvider");
    expect(homeStage).toContain('value={{ active: true, membershipActive: previewMembershipActive, profile: previewProfile }}');
    expect(homeStage).toContain('className="consumer-preview-demo-root"');
    expect(homeStage).toContain('className="consumer-preview-demo-content">{children}</div>');
    expect(homeStage).not.toContain("consumer-preview-demo-banner");
    expect(homeStage).not.toContain("처음부터");
    expect(styles).not.toContain("consumer-preview-demo-banner");
    expect(styles).toContain(".consumer-preview-demo-content { min-height: 100dvh; }");
  });
});
