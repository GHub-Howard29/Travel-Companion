import { Menu } from "lucide-react";
import type { TripDetail } from "../../types";

interface AppHeaderProps {
  currentTrip: TripDetail | null;
  isUsingSharedExpenseBook: boolean;
  userEmail: string | null;
  onOpenMenu: () => void;
  headerBgClassName: string;
}

export default function AppHeader({
  currentTrip,
  isUsingSharedExpenseBook,
  userEmail,
  onOpenMenu,
  headerBgClassName,
}: AppHeaderProps) {
  const tripModeLabel =
    currentTrip?.content.mode === "selfGuided" ? "自助 / 自駕" : "跟團";

  return (
    <header
      className={`text-white p-4 sticky top-0 z-40 shadow-md transition-colors duration-300 ${headerBgClassName}`}
    >
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMenu}
            className="p-1 rounded hover:bg-black/10 transition-colors"
          >
            <Menu size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-wide">
              {currentTrip ? currentTrip.title : "載入中..."}
            </h1>
            <p className="text-xs text-slate-100 mt-0.5 flex items-center gap-1 flex-wrap">
              {currentTrip && (
                <>
                  <span className="rounded bg-white/15 px-1.5 py-0.5 font-bold">
                    {tripModeLabel}
                  </span>
                  <span className="opacity-60">•</span>
                </>
              )}
              <span>
                {isUsingSharedExpenseBook
                  ? "🌍 共用帳本同步中"
                  : userEmail
                    ? "個人帳本模式"
                    : "🔒 未登入瀏覽模式"}
              </span>
              {currentTrip?.departureDate && (
                <>
                  <span className="opacity-60">•</span>
                  <span>📅 出發：{currentTrip.departureDate}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
