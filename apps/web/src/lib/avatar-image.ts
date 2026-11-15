// Shrinks a picked photo to a square avatar before upload: centre-crop, 256px, WebP (JPEG where WebP is unsupported).
// A 4 MB phone photo becomes roughly 10-30 KB, and EXIF location data is dropped because the canvas re-encodes only pixels.
export const AVATAR_SIZE = 256;

export async function shrinkAvatar(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Choose a JPG, PNG, WebP or GIF image.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("This image could not be read."); });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not available in this browser.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    let blob = await toBlob("image/webp");
    if (blob?.type !== "image/webp") blob = await toBlob("image/jpeg"); // Safari < 17 silently returns PNG for WebP
    if (!blob) throw new Error("Could not compress the image.");
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
    return new File([blob], `avatar.${ext}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
