/** 判斷目前 active worker 是否已是可直接重新載入套用的穩定替代版本。 */
export const hasStableActivatedReplacement = (
  registration: Pick<ServiceWorkerRegistration, "active" | "waiting" | "installing">,
  previousController: ServiceWorker | null,
): boolean =>
  Boolean(
    registration.active &&
      registration.active !== previousController &&
      registration.active.state === "activated" &&
      !registration.waiting &&
      !registration.installing,
  );
