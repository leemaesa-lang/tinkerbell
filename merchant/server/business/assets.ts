import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { storeAssets, stores } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireStoreAccess } from "./access";
import { writeAuditEvent } from "./audit";
import { decryptField, encryptField, newPublicId } from "./security";
import { storageGetSignedUrl, storagePut } from "../storage";

const publicId = z.string().uuid();
const uploadSchema = z.object({
  storePublicId: publicId,
  assetType: z.enum(["business_certificate", "store_photo", "coupon_image", "coupon_video"]),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  base64: z.string().min(8).max(17_000_000),
  isPrimary: z.boolean().default(false),
});

const MIME_BY_TYPE: Record<z.infer<typeof uploadSchema>["assetType"], readonly string[]> = {
  business_certificate: ["application/pdf", "image/jpeg", "image/png"],
  store_photo: ["image/jpeg", "image/png", "image/webp"],
  coupon_image: ["image/jpeg", "image/png", "image/webp"],
  coupon_video: ["video/mp4", "video/webm"],
};
const maxBytesByType = {
  business_certificate: 8 * 1024 * 1024,
  store_photo: 5 * 1024 * 1024,
  coupon_image: 5 * 1024 * 1024,
  coupon_video: 12 * 1024 * 1024,
} as const;

function safeFileName(name: string) {
  const lastPart = name.replaceAll("\\", "/").split("/").pop() ?? "upload";
  const safe = lastPart.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 150);
  return safe || "upload";
}
function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}
function decodeUpload(input: z.infer<typeof uploadSchema>) {
  const maxBytes = maxBytesByType[input.assetType];
  if (input.base64.length > Math.ceil(maxBytes * 4 / 3) + 8) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "파일 크기 제한을 초과했습니다." });
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)) throw new TRPCError({ code: "BAD_REQUEST", message: "파일 인코딩이 올바르지 않습니다." });
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > maxBytes) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "파일 크기 제한을 초과했습니다." });
  const actualMime = sniffMime(bytes);
  if (!actualMime || actualMime !== input.mimeType || !MIME_BY_TYPE[input.assetType].includes(actualMime)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "파일 형식과 실제 내용이 일치하지 않습니다." });
  }
  return bytes;
}

export const assetsRouter = router({
  list: protectedProcedure.input(z.object({ storePublicId: publicId })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    const rows = await access.db.select().from(storeAssets).where(and(eq(storeAssets.storeId, access.storeId), isNull(storeAssets.deletedAt))).orderBy(storeAssets.displayOrder, storeAssets.createdAt);
    const visibleAssets = rows.filter(asset => asset.assetType !== "business_certificate" || access.canManageStore);
    return Promise.all(visibleAssets.map(async asset => {
      let url: string | null = null;
      if (asset.assetType !== "business_certificate") {
        try {
          // This URL is issued only after the authenticated store-access check above.
          url = await storageGetSignedUrl(asset.storageKey);
        } catch {
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "매장 미디어 주소를 발급하지 못했습니다." });
        }
      }
      return {
        publicId: asset.publicId,
        assetType: asset.assetType,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        isPrimary: asset.isPrimary,
        displayOrder: asset.displayOrder,
        url,
        createdAt: asset.createdAt,
      };
    }));
  }),

  upload: protectedProcedure.input(uploadSchema).mutation(async ({ ctx, input }) => {
    const action = input.assetType === "business_certificate" ? "manage" : "write";
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, action);
    if (input.isPrimary && input.assetType !== "store_photo") throw new TRPCError({ code: "BAD_REQUEST", message: "대표 이미지는 매장 사진만 지정할 수 있습니다." });
    const bytes = decodeUpload(input);
    const assetPublicId = newPublicId();
    const cleanName = safeFileName(input.originalName);
    const extension = input.mimeType === "image/jpeg" ? "jpg" : input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "video/mp4" ? "mp4" : "webm";
    const storagePath = `tinkerbell/${access.accountPublicId}/${access.storePublicId}/${input.assetType}/${randomUUID()}.${extension}`;
    const storedBytes = input.assetType === "business_certificate"
      ? Buffer.from(encryptField(bytes.toString("base64"))!, "utf8")
      : bytes;
    let uploaded: Awaited<ReturnType<typeof storagePut>>;
    try {
      uploaded = await storagePut(storagePath, storedBytes, input.assetType === "business_certificate" ? "application/octet-stream" : input.mimeType);
    } catch {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "파일 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    await access.db.transaction(async tx => {
      if (input.assetType === "business_certificate") {
        const [store] = await tx.select({ certificateAssetId: stores.certificateAssetId }).from(stores).where(eq(stores.id, access.storeId)).limit(1);
        if (store?.certificateAssetId) await tx.update(storeAssets).set({ deletedAt: new Date() }).where(eq(storeAssets.id, store.certificateAssetId));
      }
      if (input.isPrimary && input.assetType === "store_photo") {
        await tx.update(storeAssets).set({ isPrimary: false }).where(and(eq(storeAssets.storeId, access.storeId), eq(storeAssets.assetType, input.assetType), isNull(storeAssets.deletedAt)));
      }
      await tx.insert(storeAssets).values({
        publicId: assetPublicId, accountId: access.accountId, storeId: access.storeId,
        assetType: input.assetType, storageKey: uploaded.key, originalName: cleanName,
        mimeType: input.mimeType, byteSize: bytes.byteLength, uploadedByUserId: ctx.user.id,
        isPrimary: input.isPrimary, displayOrder: 0,
      });
      const [asset] = await tx.select({ id: storeAssets.id }).from(storeAssets).where(eq(storeAssets.publicId, assetPublicId)).limit(1);
      if (!asset) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "업로드 기록을 저장하지 못했습니다." });
      if (input.assetType === "business_certificate") await tx.update(stores).set({ certificateAssetId: asset.id, updatedByUserId: ctx.user.id }).where(eq(stores.id, access.storeId));
      await writeAuditEvent(tx as never, ctx.user.id, access.accountId, access.storeId, "asset.uploaded", "store_asset", assetPublicId, { assetType: input.assetType, byteSize: bytes.byteLength });
    });
    // Never return the stable /manus-storage path. Authorized assets.list issues a short-lived URL.
    return { publicId: assetPublicId, assetType: input.assetType, byteSize: bytes.byteLength };
  }),

  setPrimary: protectedProcedure.input(z.object({ storePublicId: publicId, assetPublicId: publicId })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    const [asset] = await access.db.select().from(storeAssets).where(and(eq(storeAssets.publicId, input.assetPublicId), eq(storeAssets.storeId, access.storeId), isNull(storeAssets.deletedAt))).limit(1);
    if (!asset || asset.assetType !== "store_photo") throw new TRPCError({ code: "NOT_FOUND", message: "대표 이미지로 지정할 수 있는 매장 사진을 찾을 수 없습니다." });
    await access.db.transaction(async tx => {
      await tx.update(storeAssets).set({ isPrimary: false }).where(and(eq(storeAssets.storeId, access.storeId), eq(storeAssets.assetType, asset.assetType), isNull(storeAssets.deletedAt)));
      await tx.update(storeAssets).set({ isPrimary: true }).where(eq(storeAssets.id, asset.id));
      await writeAuditEvent(tx as never, ctx.user.id, access.accountId, access.storeId, "asset.primary_changed", "store_asset", asset.publicId);
    });
    return { ok: true, publicId: asset.publicId };
  }),

  remove: protectedProcedure.input(z.object({ storePublicId: publicId, assetPublicId: publicId })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
    const [asset] = await access.db.select().from(storeAssets).where(and(eq(storeAssets.publicId, input.assetPublicId), eq(storeAssets.accountId, access.accountId), eq(storeAssets.storeId, access.storeId), isNull(storeAssets.deletedAt))).limit(1);
    if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "파일을 찾을 수 없습니다." });
    await access.db.transaction(async tx => {
      await tx.update(storeAssets).set({ deletedAt: new Date(), isPrimary: false }).where(eq(storeAssets.id, asset.id));
      if (asset.assetType === "business_certificate") await tx.update(stores).set({ certificateAssetId: null, updatedByUserId: ctx.user.id }).where(and(eq(stores.id, access.storeId), eq(stores.certificateAssetId, asset.id)));
      await writeAuditEvent(tx as never, ctx.user.id, access.accountId, access.storeId, "asset.soft_deleted", "store_asset", asset.publicId, { assetType: asset.assetType });
    });
    return { ok: true, physicalObjectDeleted: false, notice: "목록에서 숨겼습니다. 저장소 API는 파일 바이트를 물리 삭제하지 않으므로 보존·폐기 정책을 별도로 적용해야 합니다." };
  }),

  certificate: protectedProcedure.input(z.object({ storePublicId: publicId })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
    const [store] = await access.db.select({ certificateAssetId: stores.certificateAssetId }).from(stores).where(eq(stores.id, access.storeId)).limit(1);
    if (!store?.certificateAssetId) return null;
    const [asset] = await access.db.select().from(storeAssets).where(and(eq(storeAssets.id, store.certificateAssetId), isNull(storeAssets.deletedAt))).limit(1);
    if (!asset || asset.assetType !== "business_certificate") throw new TRPCError({ code: "NOT_FOUND", message: "사업자등록증 파일을 찾을 수 없습니다." });
    const signedUrl = await storageGetSignedUrl(asset.storageKey);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "사업자등록증을 불러오지 못했습니다." });
    const envelope = await response.text();
    const base64 = decryptField(envelope);
    if (!base64) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "사업자등록증 암호화 데이터가 비어 있습니다." });
    return { originalName: asset.originalName, mimeType: asset.mimeType, base64 };
  }),
});
