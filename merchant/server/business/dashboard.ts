import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { bookings, couponRedemptions, coupons, storeMemberships, stores, trialApplications, trialCampaigns } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase, requireStoreAccess } from "./access";
import { decryptField } from "./security";

const publicId = z.string().uuid();
function startOfSeoulMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find(part => part.type === "year")?.value ?? "";
  const month = parts.find(part => part.type === "month")?.value ?? "";
  return new Date(`${year}-${month}-01T00:00:00.000+09:00`);
}
function todayInSeoul(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const year = parts.find(part => part.type === "year")?.value ?? "";
  const month = parts.find(part => part.type === "month")?.value ?? "";
  const day = parts.find(part => part.type === "day")?.value ?? "";
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

export const dashboardRouter = router({
  summary: protectedProcedure.input(z.object({ storePublicId: publicId })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    const db = access.db;
    const monthStart = startOfSeoulMonth();
    const [couponCounts, redeemedCount, bookingCounts, trialCount, store, membershipRows] = await Promise.all([
      db.select({ total: count() }).from(coupons).where(eq(coupons.storeId, access.storeId)),
      db.select({ total: count() }).from(couponRedemptions).where(and(eq(couponRedemptions.storeId, access.storeId), gte(couponRedemptions.createdAt, monthStart))),
      db.select({ total: count() }).from(bookings).where(and(eq(bookings.storeId, access.storeId), inArray(bookings.status, ["pending", "approved"]))),
      db.select({ total: count() }).from(trialApplications).where(and(eq(trialApplications.storeId, access.storeId), eq(trialApplications.status, "pending"))),
      db.select().from(stores).where(eq(stores.id, access.storeId)).limit(1),
      db.select().from(storeMemberships).where(eq(storeMemberships.storeId, access.storeId)).limit(1),
    ]);
    const [activeCoupons] = await db.select({ total: count() }).from(coupons).where(and(eq(coupons.storeId, access.storeId), eq(coupons.status, "active")));
    const [pendingBookings] = await db.select({ total: count() }).from(bookings).where(and(eq(bookings.storeId, access.storeId), eq(bookings.status, "pending")));
    const [approvedBookings] = await db.select({ total: count() }).from(bookings).where(and(eq(bookings.storeId, access.storeId), eq(bookings.status, "approved")));
    const [activeCampaigns] = await db.select({ total: count() }).from(trialCampaigns).where(and(eq(trialCampaigns.storeId, access.storeId), eq(trialCampaigns.status, "open")));
    const recent = await db.select().from(bookings).where(and(eq(bookings.storeId, access.storeId), gte(bookings.visitDate, todayInSeoul()))).orderBy(asc(bookings.visitDate), asc(bookings.visitTime)).limit(5);
    const currentStore = store[0];
    const membership = membershipRows[0];
    const now = new Date();
    const membershipActive = Boolean(membership?.status === "active" && membership.startsAt && membership.startsAt <= now && (!membership.endsAt || membership.endsAt > now));
    return {
      store: currentStore ? { publicId: currentStore.publicId, name: currentStore.name, category: currentStore.category, operatingStatus: currentStore.operatingStatus, isActive: currentStore.isActive } : null,
      coupons: { total: Number(couponCounts[0]?.total ?? 0), active: Number(activeCoupons?.total ?? 0) },
      couponUsesThisMonth: Number(redeemedCount[0]?.total ?? 0),
      bookings: { open: Number(bookingCounts[0]?.total ?? 0), pending: Number(pendingBookings?.total ?? 0), approved: Number(approvedBookings?.total ?? 0) },
      pendingTrialApplications: Number(trialCount[0]?.total ?? 0),
      activeTrialCampaigns: Number(activeCampaigns?.total ?? 0),
      membership: { plan: "meetup_monthly_presence" as const, status: membershipActive ? "active" as const : membership?.status ?? "inactive" as const, active: membershipActive, monthlyPriceKrw: 10_000 },
      recentBookings: recent.map(row => ({ publicId: row.publicId, customerName: access.canWriteStore ? decryptField(row.customerNameCiphertext) ?? "예약자" : "예약자", visitDate: row.visitDate, visitTime: row.visitTime, status: row.status })),
      finance: { status: "not_connected" as const, balance: null, message: "PG사·다날 연동 전입니다. 표시되는 실잔액과 결제·정산은 없습니다." },
    };
  }),
});
