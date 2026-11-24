import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE, type Role } from "../permissions/roles";
import { APP_SOURCE_CLIENT_ID, getAppDataRevision, getCurrentTripRemoteAccess, shouldNotifyForRevision, toAppDataRevision, type AppDataRevision } from "../services/tripDataRevisionService";
import { clearSharedTripDataAfterAccessLoss } from "../storage/sharedTripDataStorage";

export type TripDataNoticeKind = "revoked" | "conflict";
interface UseTripDataRevisionOptions {
  supabase: SupabaseClient; userId: string | null; userEmail: string | null;
  selectedTripId: string; role: Role; hasAnyManagementRole: boolean;
  isOnline: boolean; onReconcileTrips: () => Promise<boolean>;
}

export const useTripDataRevision = ({ supabase, userId, userEmail, selectedTripId, role, hasAnyManagementRole, isOnline, onReconcileTrips }: UseTripDataRevisionOptions) => {
  const noticeScope = `${selectedTripId}:${isOnline}:${hasAnyManagementRole}`;
  const [notice, setNotice] = useState<{ scope: string; kind: TripDataNoticeKind } | null>(null);
  const noticeKind = notice?.scope === noticeScope ? notice.kind : null;
  const setNoticeKind = useCallback((kind: TripDataNoticeKind | null) => {
    setNotice(kind ? { scope: noticeScope, kind } : null);
  }, [noticeScope]);
  const knownRevisionRef = useRef<number | null>(null);
  const tripRef = useRef(selectedTripId);
  const emailRef = useRef(userEmail);
  const roleRef = useRef(role);
  useEffect(() => { tripRef.current = selectedTripId; emailRef.current = userEmail; roleRef.current = role; }, [selectedTripId,userEmail,role]);

  useEffect(() => {
    knownRevisionRef.current = null;
    if (!selectedTripId || !isOnline || !hasAnyManagementRole) return;
    let disposed = false;
    void getAppDataRevision(supabase).then(revision => {
      if (!disposed && revision && tripRef.current === selectedTripId) knownRevisionRef.current = revision.revision;
    }).catch(error => console.warn("Failed to establish revision baseline",error));
    return () => { disposed = true; };
  }, [selectedTripId,isOnline,hasAnyManagementRole,supabase]);

  const inspectAccess = useCallback(async () => {
    const tripId=tripRef.current, email=emailRef.current;
    if (!tripId || !email || !navigator.onLine) {
      return;
    }
    try {
      if (await onReconcileTrips()) { setNoticeKind(null); return; }
      const access=await getCurrentTripRemoteAccess(supabase,tripId,email);
      if (!access.tripExists) { await onReconcileTrips(); setNoticeKind(null); return; }
      if (roleRef.current===ROLE.TRIP_EDITOR && !access.isCurrentTripEditor && !access.isSuperAdmin) {
        await clearSharedTripDataAfterAccessLoss(tripId,email); setNoticeKind("revoked");
      }
    } catch(error) { console.warn("Failed to revalidate Trip access",error); }
  },[onReconcileTrips,setNoticeKind,supabase]);

  const acceptRevision=useCallback(async (revision: AppDataRevision):Promise<boolean> => {
    if (!tripRef.current || knownRevisionRef.current===null || revision.revision<=knownRevisionRef.current) return false;
    const changed=shouldNotifyForRevision(knownRevisionRef.current,revision);
    knownRevisionRef.current=Math.max(knownRevisionRef.current,revision.revision);
    if(changed) void inspectAccess();
    return changed;
  },[inspectAccess]);

  const checkForRemoteTripChange=useCallback(async ():Promise<boolean>=>{
    if(!navigator.onLine || !hasAnyManagementRole) return false;
    try { const revision=await getAppDataRevision(supabase); return revision ? await acceptRevision(revision) : false; }
    catch(error){console.warn("Failed to check Trip revision",error);return false;}
  },[acceptRevision,hasAnyManagementRole,supabase]);

  useEffect(()=>{ if(!isOnline||!hasAnyManagementRole)return; const timer=window.setTimeout(()=>void checkForRemoteTripChange(),0);return()=>window.clearTimeout(timer);},[isOnline,hasAnyManagementRole,checkForRemoteTripChange]);
  useEffect(()=>{
    if(!isOnline||!userId||!hasAnyManagementRole||noticeKind==="revoked")return;
    let checked=false; void supabase.realtime.setAuth();
    const channel=supabase.channel(`travel-companion:data-revision:${userId}`,{config:{private:true}}).on("broadcast",{event:"revision_changed"},({payload})=>{const revision=toAppDataRevision(payload);if(revision)void acceptRevision(revision);}).subscribe(status=>{if(!checked&&(status==="CHANNEL_ERROR"||status==="TIMED_OUT")){checked=true;void checkForRemoteTripChange();}});
    return()=>{void supabase.removeChannel(channel);};
  },[acceptRevision,checkForRemoteTripChange,hasAnyManagementRole,isOnline,noticeKind,supabase,userId]);
  useEffect(()=>{const visible=()=>{if(document.visibilityState==="visible")void checkForRemoteTripChange();};const focus=()=>void checkForRemoteTripChange();window.addEventListener("focus",focus);window.addEventListener("online",focus);document.addEventListener("visibilitychange",visible);return()=>{window.removeEventListener("focus",focus);window.removeEventListener("online",focus);document.removeEventListener("visibilitychange",visible);};},[checkForRemoteTripChange]);
  const showConflict=useCallback(()=>setNoticeKind("conflict"),[setNoticeKind]);
  const reload=useCallback(()=>window.location.reload(),[]);
  return {noticeKind,isTripMasterLocked:noticeKind==="revoked",checkForRemoteTripChange,showConflict,reload,sourceClientId:APP_SOURCE_CLIENT_ID};
};
