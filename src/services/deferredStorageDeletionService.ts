import type { SupabaseClient } from "@supabase/supabase-js";

export const scheduleStorageDeletion = async (
  supabase: SupabaseClient,
  bucketId: "expense-attachments" | "itinerary-covers",
  paths: Iterable<string | null | undefined>,
): Promise<void> => {
  const uniquePaths = [...new Set(paths)].filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
  for (const objectName of uniquePaths) {
    const { error } = await supabase.rpc("tc_schedule_storage_deletion", {
      target_bucket_id: bucketId,
      target_object_name: objectName,
    });
    if (error) throw error;
  }
};
