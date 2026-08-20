import { useEffect, useRef, useState } from "react";

import "./AppSplash.css";

type AppSplashProps = {
  isReady: boolean;
  onComplete: () => void;
};

type SplashAssetProps = {
  className: string;
  src: string;
};

function SplashAsset({ className, src }: SplashAssetProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    const removeBlackBackdrop = () => {
      if (image.dataset.processed || !image.naturalWidth) return;
      image.dataset.processed = "true";

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);

      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const brightness = Math.max(red, green, blue);
        const spread = brightness - Math.min(red, green, blue);
        if (brightness < 18 && spread < 9) pixels.data[index + 3] = 0;
      }

      context.putImageData(pixels, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        image.src = URL.createObjectURL(blob);
        void image.decode().catch(() => undefined).finally(() => setIsReady(true));
      }, "image/png");
    };

    if (image.complete) removeBlackBackdrop();
    else image.addEventListener("load", removeBlackBackdrop, { once: true });

    return () => image.removeEventListener("load", removeBlackBackdrop);
  }, []);

  return (
    <img
      ref={imageRef}
      className={`${className}${isReady ? " app-splash__asset--ready" : ""}`}
      src={src}
      alt=""
      aria-hidden="true"
    />
  );
}

export function AppSplash({ isReady, onComplete }: AppSplashProps) {
  const completionTimerRef = useRef<number | null>(null);
  const basePath = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!isReady || completionTimerRef.current !== null) return;
    completionTimerRef.current = window.setTimeout(onComplete, 520);
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [isReady, onComplete]);

  const assetPath = (name: string) => `${basePath}splash-assets/${name}`;

  return (
    <section
      className={`app-splash${isReady ? " app-splash--exit" : ""}`}
      aria-label="正在載入旅行小幫手"
      aria-live="polite"
    >
      <div className="app-splash__orbit" aria-hidden="true" />
      <div className="app-splash__scene" aria-hidden="true">
        <SplashAsset className="app-splash__cloud app-splash__cloud--left" src={assetPath("cloud-3d.png")} />
        <SplashAsset className="app-splash__cloud app-splash__cloud--right" src={assetPath("cloud-3d.png")} />
        <SplashAsset className="app-splash__plane" src={assetPath("airplane-3d.png")} />
        <SplashAsset className="app-splash__map" src={assetPath("map-pins-3d.png")} />
        <SplashAsset className="app-splash__suitcase" src={assetPath("suitcase-3d.png")} />
      </div>
      <div className="app-splash__copy">
        <p className="app-splash__eyebrow">TRAVEL COMPANION</p>
        <h1>旅行小幫手</h1>
        <p className="app-splash__message">正在準備你的下一段旅程</p>
        <div className="app-splash__progress" role="progressbar" aria-label="載入中">
          <span />
        </div>
        <p className="app-splash__status">載入旅程資料中</p>
      </div>
    </section>
  );
}
