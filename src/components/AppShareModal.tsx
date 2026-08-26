import { useEffect, useRef, useState } from "react";
import { ExternalLink, Share2, X } from "lucide-react";

interface AppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getAppHomeUrl = (): string =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;

export default function AppShareModal({ isOpen, onClose }: AppShareModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareStatus("idle");
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const homeUrl = getAppHomeUrl();
  const closeModal = () => {
    setShareStatus("idle");
    onClose();
  };
  const shareHome = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "我的旅行小幫手",
          text: "我的旅行小幫手首頁",
          url: homeUrl,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Native sharing failed", error);
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(homeUrl);
      setShareStatus("copied");
    } catch (error) {
      console.warn("Copying the app home link failed", error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/45 px-4 pt-[max(5rem,env(safe-area-inset-top))]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="分享我的旅行小幫手"
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-end border-b border-slate-100 px-4 py-3">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeModal}
            aria-label="關閉分享視窗"
            title="關閉"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-5 pb-6 pt-5">
          <div className="flex flex-col items-center text-center">
            <img
              src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
              alt="我的旅行小幫手"
              className="h-20 w-20 rounded-[22%] shadow-md"
            />
            <a
              href={homeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 font-bold text-cyan-700 underline decoration-cyan-300 underline-offset-4"
            >
              我的旅行小幫手首頁
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>

          <button
            type="button"
            onClick={() => void shareHome()}
            className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left font-bold text-slate-700 transition-colors hover:bg-slate-100"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
              <Share2 size={20} aria-hidden="true" />
            </span>
            <span>{shareStatus === "copied" ? "已複製分享連結" : "分享連結"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
