import { randomUUID } from "node:crypto";
import type { CommerceDomainEvent, CommerceEventType } from "@shared/commerce-events";

export type EventListener = (event: CommerceDomainEvent) => void;

/** In-process adapter for development. Production must replace this with an outbox + broker. */
export class CommerceEventBus {
  private readonly listeners = new Set<EventListener>();
  subscribe(listener: EventListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish<TPayload extends Record<string, unknown>>(input: { eventType: CommerceEventType; aggregateId: string; aggregateVersion: number; payload: TPayload; idempotencyKey?: string; correlationId?: string }) {
    const event: CommerceDomainEvent<TPayload> = { eventId: randomUUID(), occurredAt: new Date().toISOString(), ...input };
    this.listeners.forEach((listener) => listener(event));
    return event;
  }
}

/** Prevents duplicate command execution within one process. Persist this in the DB in production. */
export class IdempotencyStore<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();
  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}
  get(key: string) { const entry = this.values.get(key); if (!entry) return undefined; if (entry.expiresAt <= Date.now()) { this.values.delete(key); return undefined; } return entry.value; }
  set(key: string, value: T) { this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs }); return value; }
}
