export const DASHBOARD_EVENT_TYPES = {
  MEMBERSHIP_PAYMENT_SUBMITTED: "membership.payment.submitted",
  PARTNER_APPLICATION_SUBMITTED: "partner.application.submitted",
  SETTLEMENT_ACCOUNT_CHANGED: "partner.settlement_account.changed",
  SETTLEMENT_SNAPSHOT_UPDATED: "partner.settlement_snapshot.updated",
  RESERVATION_CREATED: "reservation.created",
} as const;

export type DashboardEventType = (typeof DASHBOARD_EVENT_TYPES)[keyof typeof DASHBOARD_EVENT_TYPES];

export type DashboardEventPayload = {
  eventId: string;
  type: DashboardEventType;
  occurredAt: string;
  actor: { userId?: number; clientUserId?: string; displayName?: string };
  data: Record<string, unknown>;
};

export type DashboardEventStatus = "PENDING" | "SENT" | "FAILED" | "ACKNOWLEDGED";
