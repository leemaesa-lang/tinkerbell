export type MeetingImageCompressionOptions = {
  maxWidth: number;
  quality: number;
  maxBytes?: number;
};

export type CompressedMeetingImage = {
  blob: Blob;
  dataUrl: string;
};

export const MEETING_COVER_COMPRESSION: MeetingImageCompressionOptions = {
  maxWidth: 600,
  quality: 0.7,
  maxBytes: 180 * 1024,
};

export const MEETING_DETAIL_COMPRESSION: MeetingImageCompressionOptions = {
  maxWidth: 800,
  quality: 0.6,
  maxBytes: 100 * 1024,
};

const readBlobAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지 변환에 실패했습니다."));
  reader.onerror = () => reject(reader.error ?? new Error("이미지 변환에 실패했습니다."));
  reader.readAsDataURL(blob);
});

const loadImage = async (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
      });
    }
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const canvasToJpeg = (image: HTMLImageElement, width: number, quality: number) => new Promise<Blob>((resolve, reject) => {
  const height = Math.max(1, Math.round(image.naturalHeight * (width / image.naturalWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    reject(new Error("이미지 압축 기능을 사용할 수 없습니다."));
    return;
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("이미지 압축에 실패했습니다.")), "image/jpeg", quality);
});

export async function compressMeetingImage(
  source: Blob | string,
  options: MeetingImageCompressionOptions,
): Promise<CompressedMeetingImage> {
  const original = typeof source === "string" ? await fetch(source).then((response) => {
    if (!response.ok) throw new Error("이미지 파일을 불러오지 못했습니다.");
    return response.blob();
  }) : source;
  if (!original.type.startsWith("image/")) throw new Error("이미지 파일만 압축할 수 있습니다.");

  const image = await loadImage(original);
  const naturalWidth = image.naturalWidth || image.width;
  if (!naturalWidth || !image.naturalHeight) throw new Error("이미지 크기를 확인할 수 없습니다.");

  let width = Math.max(1, Math.min(options.maxWidth, naturalWidth));
  let quality = options.quality;
  let compressed: Blob | null = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    compressed = await canvasToJpeg(image, width, quality);
    if (!options.maxBytes || compressed.size <= options.maxBytes) break;
    if (quality > 0.4) {
      quality = Math.max(0.4, Math.round((quality - 0.05) * 100) / 100);
      continue;
    }
    if (width > 480) {
      width = Math.max(480, Math.floor(width * 0.85));
      quality = options.quality;
      continue;
    }
    break;
  }

  if (!compressed) throw new Error("이미지 압축에 실패했습니다.");
  return { blob: compressed, dataUrl: await readBlobAsDataUrl(compressed) };
}
