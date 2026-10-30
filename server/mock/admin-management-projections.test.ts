import { afterEach, describe, expect, it } from "vitest";
import { centralStore, DEMO_STORE_ID, DEMO_USER_ID } from "./central-store";

afterEach(() => centralStore.resetDemoData());

describe("Admin Preview management projections", () => {
  it("keeps member and store phones out of default Admin DTOs", () => {
    centralStore.resetDemoData();

    const members = centralStore.listPreviewConsumerMembers();
    expect(members[0]).toMatchObject({ memberLabel: "미리보기 회원 001", genderLabel: "여성", ageBandLabel: "30–39세", regionLabel: "역삼1동" });
    expect(members.some(member => member.genderLabel === "남성")).toBe(true);
    expect(JSON.stringify(members)).not.toContain("010-0000-1001");
    expect(JSON.stringify(members)).not.toContain(DEMO_USER_ID);

    const stores = centralStore.listAdminBusinessStoreViews();
    const demoStore = stores.find((store) => store.storePublicId === DEMO_STORE_ID);
    expect(demoStore).toMatchObject({
      businessAccountLabel: "사업자 계정 001",
      contactStatus: "super_admin_only",
      maskedPhone: "02-***-0100",
      storeSubcategoryLabel: "카페",
      representativeName: null,
      ownerGenderLabel: "미연동",
      ownerAgeBandLabel: "미연동",
      ownerRegionLabel: "미연동",
    });
    expect(demoStore).not.toHaveProperty("phone");
    expect(demoStore).not.toHaveProperty("merchantAccountPublicId");
    expect(JSON.stringify(demoStore)).not.toContain("02-555-0100");

    const protectedPreviewContacts = centralStore.listPreviewAdminPhoneRecords();
    expect(protectedPreviewContacts).toContainEqual(expect.objectContaining({ ownerApp: "consumer", entityKey: "미리보기 회원 001", phone: "010-0000-1001" }));
    expect(protectedPreviewContacts).toContainEqual(expect.objectContaining({ ownerApp: "merchant", entityKey: DEMO_STORE_ID, phone: "02-555-0100" }));
  });

  it("projects synthetic representative names only from explicit Admin Preview fixtures", () => {
    centralStore.resetDemoData();
    const asOf = new Date("2026-10-26T12:00:00.000Z");
    centralStore.seedAdminDashboardValidationData(asOf);

    const stores = centralStore.listAdminBusinessStoreViews(asOf);
    expect(stores.find((store) => store.storePublicId === "seed-store-01")?.representativeName).toBe("검수용 대표자 01");
    expect(stores.find((store) => store.storePublicId === "seed-store-02")?.representativeName).toBe("검수용 대표자 02");
    expect(stores.find((store) => store.storePublicId === DEMO_STORE_ID)?.representativeName).toBeNull();
    expect(JSON.stringify(stores)).not.toContain("홍길동");
  });

  it("exposes trial applicants to Admin with anonymous labels and no free-text identity fields", () => {
    centralStore.resetDemoData();
    const campaign = centralStore.createTrialCampaign({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "admin-trial-campaign-0001",
      title: "Preview 시식 체험단",
      recruitmentGoal: 2,
      requiredGender: "all",
      requiredAgeBands: ["all"],
      targetRegionCodes: ["1168064000"],
      reviewChannels: ["Instagram"],
    });
    centralStore.setTrialCampaignStatus(campaign.publicId, "open", "dashboard");
    centralStore.createTrialApplication({
      campaignPublicId: campaign.publicId,
      consumerUserId: DEMO_USER_ID,
      nickname: "민감한 닉네임 예시",
      channels: ["Instagram"],
      preferredDate: "2026-11-01",
      preferredTime: "14:00",
      motivation: "민감할 수 있는 자유 입력 문구",
    });

    const campaigns = centralStore.listAdminTrialCampaigns();
    expect(campaigns[0]).toMatchObject({ title: "Preview 시식 체험단", applicantCount: 1, pendingCount: 1, selectedCount: 0 });
    const applicants = centralStore.listAdminTrialApplications();
    expect(applicants[0]).toMatchObject({ applicantLabel: "Preview 지원자 001", campaignTitle: "Preview 시식 체험단", status: "pending" });
    expect(applicants[0]).not.toHaveProperty("nickname");
    expect(applicants[0]).not.toHaveProperty("motivation");
    expect(applicants[0]).not.toHaveProperty("consumerUserId");

    const selected = centralStore.reviewTrialApplication(DEMO_STORE_ID, applicants[0]!.publicId, "selected", "dashboard");
    expect(selected.status).toBe("selected");
    expect(selected.chatPublicId).toBeTruthy();
    expect(centralStore.listAdminTrialCampaigns()[0]?.selectedCount).toBe(1);
  });

  it("keeps consumer and merchant referral partners in separate Admin scopes", () => {
    centralStore.resetDemoData();
    centralStore.seedAdminDashboardValidationData(new Date("2026-10-26T12:00:00.000Z"));

    const partners = centralStore.listPartnerManagementRecords();
    expect(partners.find((row) => row.partnerPublicId === "P-1001")?.ownerApp).toBe("consumer");
    expect(partners.find((row) => row.partnerPublicId === "P-1002")?.ownerApp).toBe("merchant");
    const consumerPartner = partners.find((row) => row.partnerPublicId === "P-1001");
    expect(consumerPartner?.contactPhoneMasked).toBe("010-****-1001");
    expect(consumerPartner).not.toHaveProperty("phone");
  });
});
