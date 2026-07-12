/**
 * ==========================================================
 * Travel Companion
 * 檔案：attachmentUtils.ts
 * 功能：附件相關工具函式
 *
 * 職責：
 * 1. 檔名安全化
 * 2. 檔案大小格式化
 * 3. 圖片壓縮
 * 4. Canvas / Blob 轉換
 * 5. 圖片載入工具
 * ==========================================================
 */
// 附件相關常數
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_EDGE,
} from '../constants/appConstants';

export const sanitizeStorageFileName = (value: string) => {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  const clean = ascii
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/^[.]+/, '')
    .slice(0, 120);

  return clean || 'receipt-photo';
};

export const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas-export-failed'));
    }, 'image/jpeg', quality);
  });
};

export const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-load-failed'));
    };
    image.src = url;
  });
};

const hasImageFileExtension = (fileName: string) => {
  return /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(fileName);
};

const shouldTranscodeImageFile = (file: File) => {
  const type = file.type.toLowerCase();

  return (
    !type ||
    type === 'application/octet-stream' ||
    type === 'image/heic' ||
    type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name)
  );
};

export const compressImageFile = async (file: File): Promise<File> => {
  const isImageFile =
    file.type.startsWith('image/') ||
    (!file.type && hasImageFileExtension(file.name));

  if (!isImageFile) {
    throw new Error('請選擇照片檔案。');
  }

  if (file.size <= MAX_ATTACHMENT_BYTES && !shouldTranscodeImageFile(file)) {
    return file;
  }

  let image: HTMLImageElement;
  try {
    image = await loadImageFromFile(file);
  } catch {
    throw new Error('瀏覽器無法解碼這張照片；若檔案超過 1MB，請先轉成 JPG 或 PNG 後再選擇。');
  }
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const edge = Math.max(width, height);
  const initialScale = edge > MAX_ATTACHMENT_EDGE ? MAX_ATTACHMENT_EDGE / edge : 1;
  width = Math.max(1, Math.round(width * initialScale));
  height = Math.max(1, Math.round(height * initialScale));

  for (const scale of [1, 0.85, 0.7, 0.55, 0.42, 0.32]) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器無法壓縮這張照片。');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_ATTACHMENT_BYTES) {
        const originalBaseName = file.name.replace(/\.[^.]+$/, '');
        return new File([blob], `${originalBaseName}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
      }
    }
  }

  throw new Error('照片壓縮後仍超過 1MB，請改用較小或較低解析度的照片。');
};
