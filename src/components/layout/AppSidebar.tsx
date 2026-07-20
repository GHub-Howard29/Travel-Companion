import {
  Calendar,
  CircleDollarSign,
  CarFront,
  CheckSquare,
  ClipboardCheck,
  FolderOpen,
  Home,
  IdCard,
  Info,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import type {
  AdminUser,
  SidebarItemConfig,
  SidebarItemType,
  TripDetail,
  TripMeta,
  TripMode,
} from "../../types";
import {
  expandSidebarItemsWithPrivateChecklist,
  isSelfGuidedSpecialInfoIcon,
  shouldUseSpecialInfoIcon,
} from "../../utils/travelToolRegistry";

interface AppSidebarProps {
  isMenuOpen: boolean;
  onClose: () => void;
  selectedTripId: string;
  tripOptions: TripMeta[];
  currentTrip: TripDetail | null;
  userEmail: string | null;
  hasEditPermission: boolean;
  adminProfile: AdminUser | null;
  currentScreen: string;
  canCreateTrip: boolean;
  canEditCurrentTrip: boolean;
  onCreateTrip: () => void;
  onEditTrip: () => void;
  onTripSelect: (tripId: string) => void;
  onLogout: () => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onScreenSelect: (item: SidebarItemConfig) => void;
  appVersion: string;
  onOpenVersionInfo: () => void;
}

const renderSidebarIcon = (item: SidebarItemConfig, tripMode?: TripMode) => {
  if (shouldUseSpecialInfoIcon(item)) {
    return isSelfGuidedSpecialInfoIcon(item, tripMode) ? (
      <CarFront size={18} />
    ) : (
      <IdCard size={18} />
    );
  }

  const type: SidebarItemType = item.type;

  switch (type) {
    case "itinerary":
      return <Calendar size={18} />;
    case "checklist":
      return <CheckSquare size={18} />;
    case "privateChecklist":
      return <ClipboardCheck size={18} />;
    case "otherInfo":
      return <FolderOpen size={18} />;
    case "expense":
      return <Wallet size={18} />;
    case "exchangeRate":
      return <CircleDollarSign size={18} />;
    default:
      return <Home size={18} />;
  }
};

export default function AppSidebar({
  isMenuOpen,
  onClose,
  selectedTripId,
  tripOptions,
  currentTrip,
  userEmail,
  hasEditPermission,
  adminProfile,
  currentScreen,
  canCreateTrip,
  canEditCurrentTrip,
  onCreateTrip,
  onEditTrip,
  onTripSelect,
  onLogout,
  onGoogleLogin,
  onScreenSelect,
  appVersion,
  onOpenVersionInfo,
}: AppSidebarProps) {
  const sidebarItems = expandSidebarItemsWithPrivateChecklist(
    currentTrip?.sidebarConfig,
    userEmail,
  );

  return (
    <>
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${isMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">
                我的旅行小幫手
              </h3>
              <p className="text-xs text-slate-400">雲端權限多行程管理</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-2">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
              <FolderOpen size={12} /> 切換行程資料庫
            </label>
            <select
              value={selectedTripId}
              onChange={(e) => onTripSelect(e.target.value)}
              className="w-full text-sm p-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {tripOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title} ({option.departureDate})
                </option>
              ))}
            </select>
            {(canCreateTrip || canEditCurrentTrip) && (
              <div
                className={`mt-2 grid gap-2 ${
                  canCreateTrip && canEditCurrentTrip ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {canCreateTrip && (
                <button
                  type="button"
                  onClick={onCreateTrip}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Plus size={14} /> 新增旅程
                </button>
                )}
                {canEditCurrentTrip && (
                <button
                  type="button"
                  onClick={onEditTrip}
                  disabled={!currentTrip}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Pencil size={14} /> 編輯旅程
                </button>
                )}
              </div>
            )}
          </div>
        </div>

        <nav className="p-3 flex-1 space-y-1 overflow-y-auto">
          {sidebarItems?.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onScreenSelect(item)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left font-medium transition-all ${
                  isActive
                    ? "bg-slate-900 text-white font-bold shadow-md"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className={isActive ? "text-white" : "text-slate-400"}>
                  {renderSidebarIcon(item, currentTrip?.content.mode)}
                </div>
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-xs">
          {userEmail ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">目前登入：</span>
                <button
                  onClick={onLogout}
                  className="text-rose-600 font-bold flex items-center gap-0.5 hover:underline"
                >
                  <LogOut size={12} /> 登出
                </button>
              </div>
              <p className="font-semibold text-slate-700 truncate">{userEmail}</p>
              <div className="mt-1">
                {selectedTripId && currentTrip ? (
                  hasEditPermission ? (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">
                      🟢 本行程可編輯者{" "}
                      {adminProfile?.role === "super_admin"
                        ? "(超級管理員)"
                        : ""}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold rounded-full text-[10px]">
                      個人帳本模式
                    </span>
                  )
                ) : (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded-full text-[10px]">
                    請先選擇上方行程
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              {hasEditPermission ? (
                <div className="space-y-2 text-left bg-slate-100 p-2 rounded-lg">
                  <p className="text-slate-500 font-medium">📡 目前處於離線狀態</p>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">
                    🛡️ 已開啟離線編輯權限
                  </span>
                </div>
              ) : (
                <>
                  <p className="text-slate-400 mb-2">登入後解鎖雲端同步記帳</p>
                  <button
                    onClick={onGoogleLogin}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors shadow-sm"
                  >
                    <LogIn size={14} /> 使用 Google 登入
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenVersionInfo}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Info size={13} />
              版本資訊
            </span>
            <span className="font-mono text-[11px] font-bold text-emerald-700">
              v{appVersion}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
