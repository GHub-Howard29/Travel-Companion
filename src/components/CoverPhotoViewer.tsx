import { useEffect, useRef, type KeyboardEvent } from "react";
import { ExternalLink, X } from "lucide-react";

export interface CoverPhotoViewerData {
  url: string;
  alt: string;
  sourceLabel: string;
  sourcePageUrl: string;
  creator: string;
  credit?: string;
  license: string;
  licenseUrl?: string;
  transformation?: "cropped-resized-and-webp-transcoded";
}

interface CoverPhotoViewerProps {
  photo: CoverPhotoViewerData;
  onClose: () => void;
}

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

export const CoverPhotoViewer = ({ photo, onClose }: CoverPhotoViewerProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-photo-viewer-title"
        onKeyDown={handleKeyDown}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-auto rounded-2xl bg-slate-950 p-3 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-white">
          <h3 id="cover-photo-viewer-title" className="truncate text-sm font-bold">{photo.alt}</h3>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/15" aria-label="關閉照片放大檢視">
            <X size={20} />
          </button>
        </div>
        <div className="flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl bg-black p-2">
          <img src={photo.url} alt={photo.alt} referrerPolicy="no-referrer" className="max-h-[calc(100dvh-8rem)] max-w-full object-contain" />
          <div className="mt-2 max-w-[min(28rem,100%)] self-end rounded-lg bg-slate-800/90 p-3 text-xs leading-relaxed text-white backdrop-blur-sm">
            <p>{photo.sourceLabel} · {photo.creator}{photo.credit ? ` · ${photo.credit}` : ""}</p>
            <p className="mt-1">{photo.license}</p>
            {photo.transformation && <p className="mt-1">已裁切、縮放並轉為 WebP</p>}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <a href={photo.sourcePageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-emerald-300 hover:text-emerald-200">
                查看來源頁 <ExternalLink size={11} />
              </a>
              {photo.licenseUrl && (
                <a href={photo.licenseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-emerald-300 hover:text-emerald-200">
                  查看授權 <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-lg border border-white/30 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 sm:w-auto">
          取消
        </button>
      </div>
    </div>
  );
};
