"use client";

import { useMemo, useState } from "react";

interface ProviderBadgeProps {
  color: string;
  name: string;
  domain?: string;
  size?: number;
  radius?: number;
}

export function ProviderBadge({ color, name, domain, size = 44, radius = 12 }: ProviderBadgeProps) {
  const candidates = useMemo(() => {
    if (!domain) return [] as string[];
    return [
      `/bank-logos/${domain}.png`,
      `https://www.google.com/s2/favicons?domain=www.${domain}&sz=128`,
    ];
  }, [domain]);

  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const src = !exhausted ? (candidates[idx] ?? null) : null;
  const showImage = src != null && loaded;

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  const imageInset = Math.max(2, Math.round(size * 0.12));
  const imageSize = size - imageInset * 2;

  const advance = () => {
    setLoaded(false);
    if (idx + 1 < candidates.length) setIdx(idx + 1);
    else setExhausted(true);
  };

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: showImage ? "#ffffff" : color,
        border: showImage ? "1px solid var(--border)" : "none",
      }}
    >
      {src != null ? (
        <img
          key={src}
          src={src}
          alt=""
          width={imageSize}
          height={imageSize}
          onLoad={(e) => {
            const img = e.currentTarget;
            const isFavicon = src.startsWith("http");
            if (isFavicon && img.naturalWidth <= 16 && img.naturalHeight <= 16) {
              advance();
              return;
            }
            setLoaded(true);
          }}
          onError={advance}
          className={showImage ? "block object-contain" : "pointer-events-none absolute opacity-0"}
          style={{ width: imageSize, height: imageSize }}
        />
      ) : null}
      {!showImage && (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(0,0,0,0.05))",
            }}
          />
          <span className="relative font-bold tracking-tight" style={{ fontSize: size * 0.4 }}>
            {initials}
          </span>
        </>
      )}
    </div>
  );
}
