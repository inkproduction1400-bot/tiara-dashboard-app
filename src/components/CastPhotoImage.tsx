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

  useEffect(() => {
    setCurrentSrc(src ?? null);
    setUsedFallback(false);
  }, [src, fallbackSrc]);

  if (!currentSrc) {
    return <>{fallback}</>;
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
      data-debug-photo-state={
        debugPhoto ? (usedFallback ? "fallback" : "primary") : undefined
      }
      onError={() => {
        if (!usedFallback && fallbackSrc && fallbackSrc !== currentSrc) {
          setCurrentSrc(fallbackSrc);
          setUsedFallback(true);
          return;
        }
        setCurrentSrc(null);
      }}
    />
  );
}
