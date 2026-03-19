"use client";

import { useEffect, useState, type ReactNode } from "react";

type CastPhotoImageProps = {
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  draggable?: boolean;
  loading?: "eager" | "lazy";
  fallback: ReactNode;
  debugPhoto?: boolean;
};

export function CastPhotoImage({
  src,
  fallbackSrc,
  alt,
  className,
  draggable = false,
  loading = "lazy",
  fallback,
  debugPhoto = false,
}: CastPhotoImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(src ?? null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [debugState, setDebugState] = useState("idle");

  useEffect(() => {
    setCurrentSrc(src ?? null);
    setUsedFallback(false);
    setDebugState(src ? "mounted-primary" : "empty");
  }, [src, fallbackSrc]);

  if (!currentSrc) {
    if (!debugPhoto) {
      return <>{fallback}</>;
    }
    return (
      <span
        data-debug-photo-src={src ?? ""}
        data-debug-photo-fallback={fallbackSrc ?? ""}
        data-debug-photo-state={debugState}
      >
        {fallback}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      draggable={draggable}
      loading={loading}
      data-debug-photo-src={debugPhoto ? (src ?? "") : undefined}
      data-debug-photo-fallback={debugPhoto ? (fallbackSrc ?? "") : undefined}
      data-debug-photo-state={debugPhoto ? debugState : undefined}
      onLoad={() => {
        setDebugState(usedFallback ? "loaded-fallback" : "loaded-primary");
      }}
      onError={() => {
        setDebugState(usedFallback ? "error-fallback" : "error-primary");
        if (!usedFallback && fallbackSrc && fallbackSrc !== currentSrc) {
          setCurrentSrc(fallbackSrc);
          setUsedFallback(true);
          setDebugState("mounted-fallback");
          return;
        }
        setCurrentSrc(null);
        setDebugState("placeholder");
      }}
    />
  );
}
