import { useEffect } from "react";

import "./AppSplash.css";

type AppSplashProps = {
  isReady: boolean;
  onComplete: () => void;
};

export function AppSplash({ isReady, onComplete }: AppSplashProps) {
  const basePath = import.meta.env.BASE_URL;
  const appIconPath = `${basePath}pwa-512x512.png`;

  useEffect(() => {
    if (isReady) onComplete();
  }, [isReady, onComplete]);

  return (
    <section className="app-splash" aria-label="正在載入旅行小幫手" aria-live="polite">
      <img className="app-splash__icon" src={appIconPath} alt="" aria-hidden="true" />
    </section>
  );
}
