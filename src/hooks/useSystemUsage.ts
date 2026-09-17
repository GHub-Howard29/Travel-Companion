import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseSystemUsageSummary,
  type SystemUsageSummary,
} from "../types/systemUsage";

interface UseSystemUsageOptions {
  supabase: SupabaseClient;
  userId: string | null;
  userEmail: string | null;
  isOnline: boolean;
}

const LOAD_ERROR_MESSAGE =
  "無法載入使用紀錄。請確認網路連線與系統開發者權限後重試。";

export default function useSystemUsage({
  supabase,
  userId,
  userEmail,
  isOnline,
}: UseSystemUsageOptions) {
  const [systemDeveloperUserId, setSystemDeveloperUserId] = useState<string | null>(null);
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const [isUsageLoading, setIsUsageLoading] = useState(false);
  const [usageSummary, setUsageSummary] = useState<SystemUsageSummary | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const recordedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;
    if (!userId || !userEmail || !isOnline) {
      if (!userId) recordedUserIdRef.current = null;
      return () => {
        isActive = false;
      };
    }

    void (async () => {
      try {
        const { data, error } = await supabase.rpc("tc_is_system_developer");
        if (!isActive) return;
        setSystemDeveloperUserId(!error && data === true ? userId : null);
      } catch {
        if (isActive) setSystemDeveloperUserId(null);
      }
    })();

    if (recordedUserIdRef.current !== userId) {
      void (async () => {
        try {
          const { error } = await supabase.rpc("tc_record_usage_session");
          if (error) {
            console.warn("Usage session recording failed without blocking App startup");
            return;
          }
          recordedUserIdRef.current = userId;
        } catch {
          console.warn("Usage session recording failed without blocking App startup");
        }
      })();
    }

    return () => {
      isActive = false;
    };
  }, [isOnline, supabase, userEmail, userId]);

  const refreshUsageSummary = useCallback(async () => {
    setIsUsageLoading(true);
    setUsageError(null);
    try {
      const { data, error } = await supabase.rpc("tc_get_usage_summary");
      const parsedSummary = error ? null : parseSystemUsageSummary(data);
      if (!parsedSummary) {
        setUsageSummary(null);
        setUsageError(LOAD_ERROR_MESSAGE);
        return;
      }
      setUsageSummary(parsedSummary);
    } catch {
      setUsageSummary(null);
      setUsageError(LOAD_ERROR_MESSAGE);
    } finally {
      setIsUsageLoading(false);
    }
  }, [supabase]);

  const openUsageModal = useCallback(() => {
    setIsUsageModalOpen(true);
    void refreshUsageSummary();
  }, [refreshUsageSummary]);

  const closeUsageModal = useCallback(() => {
    setIsUsageModalOpen(false);
  }, []);

  return {
    isSystemDeveloper:
      Boolean(userId && userEmail && isOnline) && systemDeveloperUserId === userId,
    isUsageModalOpen,
    isUsageLoading,
    usageSummary,
    usageError,
    openUsageModal,
    closeUsageModal,
    refreshUsageSummary,
  };
}
