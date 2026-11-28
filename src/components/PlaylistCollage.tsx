"use client";

import React from "react";
import { Music } from "lucide-react";
import { Track } from "@/lib/types";
import { getDefaultArtworkFallbackUrl, normalizeArtworkUrl } from "@/lib/artwork";

interface PlaylistCollageProps {
  tracks?: Track[];
  fallbackCoverUrl?: string;
  className?: string;
}

const DEFAULT_FALLBACK = getDefaultArtworkFallbackUrl();

export function PlaylistCollage({ tracks = [], fallbackCoverUrl, className = "w-full h-full" }: PlaylistCollageProps) {
  // Collect images with covers
  const images = tracks
    .map((t) => t.coverUrl)
    .filter((url): url is string => Boolean(url && url.trim().length > 0))
    .map((url) => normalizeArtworkUrl(url))
    .slice(0, 4);

  // 0 songs: fallbackCoverUrl or music note placeholder
  if (images.length === 0) {
    if (fallbackCoverUrl) {
      return (
        <img
          src={fallbackCoverUrl}
          alt="Playlist cover"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          onError={(e) => {
            e.currentTarget.src = DEFAULT_FALLBACK;
          }}
          className={`${className} object-cover`}
        />
      );
    }
    return (
      <div className={`${className} bg-neutral-800 flex items-center justify-center text-neutral-500`}>
        <Music className="w-1/3 h-1/3 opacity-50" />
      </div>
    );
  }

  // 1 song: full single cover
  if (images.length === 1) {
    return (
      <img
        src={images[0]}
        alt="Playlist cover"
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
        onError={(e) => {
          e.currentTarget.src = DEFAULT_FALLBACK;
        }}
        className={`${className} object-cover`}
      />
    );
  }

  // 2 songs: 2 vertical halves side-by-side
  if (images.length === 2) {
    return (
      <div className={`${className} grid grid-cols-2 overflow-hidden`}>
        {images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            loading="eager"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = DEFAULT_FALLBACK;
            }}
            className="w-full h-full object-cover"
          />
        ))}
      </div>
    );
  }

  // 3 songs: top row 2 images, bottom row 1 image full width
  if (images.length === 3) {
    return (
      <div className={`${className} flex flex-col overflow-hidden`}>
        <div className="flex-1 grid grid-cols-2">
          {images.slice(0, 2).map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              onError={(e) => {
                e.currentTarget.src = DEFAULT_FALLBACK;
              }}
              className="w-full h-full object-cover"
            />
          ))}
        </div>
        <div className="flex-1">
          <img
            src={images[2]}
            alt=""
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            loading="eager"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = DEFAULT_FALLBACK;
            }}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    );
  }

  // 4+ songs: 2x2 grid of first 4 covers
  return (
    <div className={`${className} grid grid-cols-2 grid-rows-2 overflow-hidden`}>
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          onError={(e) => {
            e.currentTarget.src = DEFAULT_FALLBACK;
          }}
          className="w-full h-full object-cover"
        />
      ))}
    </div>
  );
}
