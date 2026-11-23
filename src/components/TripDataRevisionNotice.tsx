import { AlertTriangle, RefreshCw } from "lucide-react";
import type { TripDataNoticeKind } from "../hooks/useTripDataRevision";
interface Props { kind: TripDataNoticeKind|null; onReload:()=>void; }
const copy:Record<TripDataNoticeKind,{title:string;body:string;button:string}>={
 revoked:{title:"旅程編輯權限已撤銷",body:"你已失去此旅程的編輯權限。重新載入應用程式以清除共享旅程資料並繼續。",button:"重新載入"},
 conflict:{title:"旅程資料衝突",body:"最新旅程資料無法安全套用。請重新載入以恢復目前旅程狀態。",button:"重新載入"},
};
export const TripDataRevisionNotice=({kind,onReload}:Props)=>{if(!kind)return null;const text=copy[kind];return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center"><section role="alertdialog" aria-modal="true" aria-labelledby="trip-data-revision-critical-title" className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"><div className="flex items-start gap-3"><span className="rounded-full bg-rose-100 p-2 text-rose-700"><AlertTriangle size={20}/></span><div><h2 id="trip-data-revision-critical-title" className="text-lg font-bold text-slate-900">{text.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text.body}</p></div></div><button type="button" onClick={onReload} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"><RefreshCw size={16}/>{text.button}</button></section></div>};
