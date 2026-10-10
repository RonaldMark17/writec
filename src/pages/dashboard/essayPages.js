import { apiFetch, getBackendUrl } from "../../apiFetch";
import { useEffect, useState } from "react";

export const DEFAULT_UPLOAD_LIMITS = { max_image_bytes: 10 * 1024 ** 2, max_submission_bytes: 50 * 1024 ** 2, max_pages: 20 };
export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff";
export const isEssayImage = file => /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file?.name || "") &&
  (!file.type || /^image\/(png|jpeg|jpg|webp|bmp|tiff|x-ms-bmp)$/i.test(file.type));

export async function getUploadLimits() {
  try {
    const response = await apiFetch(`${getBackendUrl()}/api/upload-limits`);
    if (!response.ok) return DEFAULT_UPLOAD_LIMITS;
    const limits = await response.json();
    return Object.values(limits).length && Object.keys(DEFAULT_UPLOAD_LIMITS).every(key => Number.isFinite(limits[key]) && limits[key] > 0)
      ? limits : DEFAULT_UPLOAD_LIMITS;
  } catch { return DEFAULT_UPLOAD_LIMITS; }
}

export function validateEssayPages(files, limits = DEFAULT_UPLOAD_LIMITS) {
  if (!files.length) throw new Error("Choose at least one image.");
  if (files.length > limits.max_pages) throw new Error(`An essay may contain up to ${limits.max_pages} pages.`);
  if (files.some(file => !isEssayImage(file))) throw new Error("Choose JPG, PNG, WEBP, BMP, or single-page TIFF images only.");
  if (files.some(file => !file.size || file.size > limits.max_image_bytes)) throw new Error(`Each image must be nonempty and ${limits.max_image_bytes / 1024 ** 2} MB or smaller.`);
  if (files.reduce((total, file) => total + file.size, 0) > limits.max_submission_bytes) throw new Error(`The total submission must not exceed ${limits.max_submission_bytes / 1024 ** 2} MB.`);
}

export function combinePageText(pages) {
  const ordered = [...pages].sort((a, b) => a.page_number - b.page_number);
  if (!ordered.length || ordered.some((page, index) => page.page_number !== index + 1 || page.status !== "ready" || !page.text?.trim())) {
    throw new Error("Every numbered page must finish transcription before checking similarity.");
  }
  return ordered.map(page => page.text.trim()).join("\n");
}

export function useUploadLimits() {
  const [limits, setLimits] = useState(DEFAULT_UPLOAD_LIMITS);
  useEffect(() => { let live = true; getUploadLimits().then(value => { if (live) setLimits(value); }); return () => { live = false; }; }, []);
  return limits;
}
