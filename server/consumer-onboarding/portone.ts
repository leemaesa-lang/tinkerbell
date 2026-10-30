export type PortOneIdentityConfig = {
  storeId: string;
  channelKey: string;
  apiSecret: string;
};

export type VerifiedPortOneCustomer = {
  phoneNumber: string;
  di: string;
  birthDate: string;
  gender: "MALE" | "FEMALE" | "OTHER";
};

export type VerifiedPortOneIdentity = {
  id: string;
  channelId: string;
  customer: VerifiedPortOneCustomer;
};

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as JsonRecord
  : null;

export function getPortOneIdentityConfig(): PortOneIdentityConfig {
  const storeId = process.env.PORTONE_STORE_ID?.trim();
  const channelKey = process.env.PORTONE_IDENTITY_CHANNEL_KEY?.trim();
  const apiSecret = process.env.PORTONE_API_SECRET?.trim();
  if (!storeId || !channelKey || !apiSecret) throw new Error("PortOne identity configuration is incomplete");
  return { storeId, channelKey, apiSecret };
}

export async function fetchVerifiedPortOneIdentity(
  identityVerificationId: string,
  config: PortOneIdentityConfig,
): Promise<VerifiedPortOneIdentity> {
  const response = await fetch(`https://api.portone.io/identity-verifications/${encodeURIComponent(identityVerificationId)}`, {
    method: "GET",
    headers: { Authorization: `PortOne ${config.apiSecret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`PortOne identity lookup failed (${response.status})`);

  const payload = record(await response.json());
  if (!payload || payload.status !== "VERIFIED" || payload.id !== identityVerificationId) {
    throw new Error("PortOne identity is not verified");
  }
  if (typeof payload.storeId === "string" && payload.storeId !== config.storeId) {
    throw new Error("PortOne identity belongs to a different store");
  }
  const channel = record(payload.channel);
  const channelId = typeof channel?.id === "string" ? channel.id : "";
  const channelKey = typeof channel?.key === "string" ? channel.key : "";
  if (!channel || (channelKey !== config.channelKey && channelId !== config.channelKey)) {
    throw new Error("PortOne identity belongs to a different channel");
  }

  const customer = record(payload.verifiedCustomer);
  const phoneNumber = customer?.phoneNumber;
  const di = customer?.di;
  const birthDate = customer?.birthDate;
  const gender = customer?.gender;
  if (
    typeof phoneNumber !== "string" || !phoneNumber.trim() ||
    typeof di !== "string" || !di.trim() ||
    typeof birthDate !== "string" || !birthDate.trim() ||
    (gender !== "MALE" && gender !== "FEMALE" && gender !== "OTHER")
  ) {
    throw new Error("PortOne identity response is missing required customer fields");
  }

  return {
    id: identityVerificationId,
    channelId: channelId || channelKey,
    customer: { phoneNumber, di, birthDate, gender },
  };
}
