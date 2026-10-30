export type CommerceEventType =
  | "coupon.created"
  | "coupon.updated"
  | "coupon.published"
  | "coupon.paused"
  | "coupon.ended"
  | "coupon.quantity_changed"
  | "coupon.claimed"
  | "coupon.redeemed"
  | "reservation.created"
  | "reservation.updated"
  | "reservation.cancelled"
  | "chat.message_created"
  | "media.uploaded";

export type CommerceDomainEvent<TPayload = Record<string, unknown>> = {
  eventId: string;
  eventType: CommerceEventType;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId?: string;
  idempotencyKey?: string;
  payload: TPayload;
};
