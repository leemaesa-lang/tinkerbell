import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/Home.tsx"), "utf8");

describe("Merchant Preview trial facilities", () => {
  const start = source.indexOf("const createLiveTrial = async");
  const end = source.indexOf("const changeLiveTrialStatus", start);
  const submit = source.slice(start, end);
  const previewStart = submit.indexOf("if (previewBridgeEnabled)");
  const liveCreateStart = submit.indexOf("const campaign = await trialCreateMutation.mutateAsync");

  it("sends Preview trials with facility snapshots before any live tRPC mutation", () => {
    expect(previewStart).toBeGreaterThanOrEqual(0);
    expect(liveCreateStart).toBeGreaterThan(previewStart);
    const previewBranch = submit.slice(previewStart, liveCreateStart);
    expect(previewBranch).toContain("requestPreviewTrialApi<CentralPreviewTrialCampaign>");
    expect(previewBranch).toContain("facilityTags: liveTrialForm.facilityTags");
    expect(previewBranch).not.toContain("trialCreateMutation");
    expect(previewBranch).not.toContain("trialStatusMutation");
    expect(previewBranch).toContain("resetLiveTrialForm()");
  });

  it("renders the store-scoped facilities accordion in the Preview trial form", () => {
    expect(source).toContain("const liveTrialFacilityAccordion = previewBridgeEnabled");
    expect(source).toContain("selectedTags={liveTrialForm.facilityTags}");
    const renderStart = source.indexOf("const renderTrialForm = () =>");
    const renderEnd = source.indexOf("if (!effectiveLiveAccountId)", renderStart);
    expect(source.slice(renderStart, renderEnd)).toContain("{liveTrialFacilityAccordion}");
  });
});
