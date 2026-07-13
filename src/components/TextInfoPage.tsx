import type { CustomTabConfig } from "../types";

interface TextInfoPageProps {
  content?: CustomTabConfig;
}

export const TextInfoPage = ({ content }: TextInfoPageProps) => (
  <div className="space-y-4">
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5">
      <h3 className="text-xl font-bold text-slate-800 mb-1">
        {content?.subtitle || "自訂資訊區"}
      </h3>
      <div className="w-full h-px bg-slate-100 my-3" />
      <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono">
        {content?.mainText || "目前尚無詳細欄位內容。"}
      </p>
    </div>
  </div>
);
