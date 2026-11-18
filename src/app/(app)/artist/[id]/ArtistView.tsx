"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mic2, Play, Disc3, ListMusic, UserPlus, Check } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { Track } from "@/lib/types";
import { getDefaultArtworkFallbackUrl } from "@/lib/artwork";

interface ArtistTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
}

interface ArtistRelease {
  browseId: string;
  title: string;
  year: string;
  type: string;
  thumbnail: string;
}

interface FeaturedPlaylist {
  browseId: string;
  title: string;
  subtitle: string;
  author?: string;
  thumbnail: string;
  isCommunity?: boolean;
}

interface SimilarArtist {
  browseId: string;
  name: string;
  thumbnail: string;
}

interface ArtistData {
  title: string;
  thumbnail: string;
  description?: string;
  subscriberCount?: string;
  tracks: ArtistTrack[];
  albums?: ArtistRelease[];
  singles?: ArtistRelease[];
  featuredOn?: FeaturedPlaylist[];
  fansAlsoLike?: SimilarArtist[];
}

function toTrack(item: ArtistTrack): Track {
  return {
    id: item.videoId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.thumbnail || getDefaultArtworkFallbackUrl(),
    duration: item.duration || 0,
    youtubeId: item.videoId,
  };
}

export function ArtistView({ id }: { id: string }) {
  const { playTrack, followedArtists, toggleFollowArtist } = usePlayer();
  const [artist, setArtist] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discographyTab, setDiscographyTab] = useState<"popular" | "albums" | "singles">("popular");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/artist?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load artist");
        }
        return res.json() as Promise<ArtistData>;
      })
      .then((data) => {
        if (!cancelled) setArtist(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load artist");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const tracks: Track[] = artist ? artist.tracks.map(toTrack) : [];
  const albums = artist?.albums || [];
  const singles = artist?.singles || [];
  const rawFeatured = artist?.featuredOn || [];
  // Sort featuring playlists: "This Is" and "Radio" first, then other official, then community playlists
  const featuredOn = [...rawFeatured].sort((a, b) => {
    const aIsPriority = /this is|radio/i.test(a.title);
    const bIsPriority = /this is|radio/i.test(b.title);
    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;
    if (!a.isCommunity && b.isCommunity) return -1;
    if (a.isCommunity && !b.isCommunity) return 1;
    return 0;
  });
  const fansAlsoLike = artist?.fansAlsoLike || [];

  const isFollowing = followedArtists.some((followed) => followed.browseId === id);

  // Popular releases: mix of albums and singles or all releases
  const popularReleases = [...albums, ...singles];

  const hasDiscography = popularReleases.length > 0;

  let displayedReleases: ArtistRelease[] = [];
  if (discographyTab === "popular") {
    displayedReleases = popularReleases.slice(0, 10);
  } else if (discographyTab === "albums") {
    displayedReleases = albums;
  } else if (discographyTab === "singles") {
    displayedReleases = singles;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gradient-to-b from-neutral-900 via-neutral-950 to-[var(--background)]">
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 pb-[calc(var(--player-height)+24px)] scrollbar-thin scrollbar-thumb-neutral-800">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors mb-3 sm:mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          {loading ? (
            <div className="py-24 text-center text-neutral-400">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-mono">Loading artist...</p>
            </div>
          ) : error || !artist ? (
            <div className="py-24 text-center">
              <Mic2 className="w-16 h-16 mx-auto mb-4 text-neutral-600" />
              <p className="text-lg font-bold text-white">Could not load artist</p>
              <p className="text-xs text-neutral-400 mt-1.5">{error || "Artist not found"}</p>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Artist header */}
              <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl bg-gradient-to-b from-neutral-800/70 to-neutral-950/40">
                <div className="w-[120px] h-[120px] sm:w-[200px] sm:h-[200px] rounded-full overflow-hidden shadow-2xl shrink-0 bg-neutral-800">
                  {artist.thumbnail ? (
                    <img
                      src={artist.thumbnail}
                      alt={artist.title}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = getDefaultArtworkFallbackUrl();
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic2 className="w-20 h-20 text-neutral-600" />
                    </div>
                  )}
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-emerald-400 font-mono">ARTIST</p>
                  <h1 className="font-display text-3xl sm:text-5xl font-bold text-white mt-1 mb-1.5 sm:mb-2 tracking-tight break-words leading-tight line-clamp-2">
                    {artist.title}
                  </h1>
                  <p className="text-sm text-neutral-300">
                    {artist.subscriberCount ? `${artist.subscriberCount} • ` : ""}
                    {tracks.length} songs
                  </p>
                </div>
              </div>

              {/* Play + Follow actions */}
              <div className="flex items-center gap-3">
                {tracks.length > 0 && (
                  <button
                    onClick={() => playTrack(tracks[0], tracks)}
                    className="w-14 h-14 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                    title="Play Artist"
                  >
                    <Play className="w-6 h-6 fill-black ml-0.5" />
                  </button>
                )}
                <button
                  onClick={() =>
                    toggleFollowArtist({
                      browseId: id,
                      name: artist.title,
                      thumbnail: artist.thumbnail,
                    })
                  }
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border transition-colors cursor-pointer ${
                    isFollowing
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                      : "border-white/20 text-neutral-200 hover:border-white/40 hover:text-white"
                  }`}
                  aria-pressed={isFollowing}
                >
                  {isFollowing ? (
                    <>
                      <Check className="w-4 h-4" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Follow
                    </>
                  )}
                </button>
              </div>

              {/* Artist biography (only when the API provides real text) */}
              {artist.description && (
                <p className="text-sm text-neutral-300 leading-relaxed max-w-3xl line-clamp-4">
                  {artist.description}
                </p>
              )}

              {/* Popular section */}
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Popular</h2>
                <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                  {tracks.length === 0 ? (
                    <div className="py-16 text-center text-neutral-500">
                      <Mic2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-base font-semibold text-neutral-300">No tracks found</p>
                    </div>
                  ) : (
                    tracks.slice(0, 10).map((track, index) => (
                      <TrackRow key={track.id} track={track} index={index} queue={tracks} />
                    ))
                  )}
                </div>
              </div>

              {/* Discography section */}
              {hasDiscography && (
                <div>
                  <div className="flex flex-col gap-2.5 mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-white">Discography</h2>
                    {/* On phones the three tabs share one scrollable row; on desktop
                        this is the original inline group beside the heading. */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1 sm:mx-0 sm:gap-2 sm:overflow-visible sm:px-0">
                      <button
                        onClick={() => setDiscographyTab("popular")}
                        className={`shrink-0 whitespace-nowrap px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors sm:px-3 sm:py-1 sm:text-xs ${
                          discographyTab === "popular"
                            ? "bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]"
                            : "bg-neutral-800 text-neutral-400 hover:text-white"
                        }`}
                      >
                        Popular releases
                      </button>
                      {albums.length > 0 && (
                        <button
                          onClick={() => setDiscographyTab("albums")}
                          className={`shrink-0 whitespace-nowrap px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors sm:px-3 sm:py-1 sm:text-xs ${
                            discographyTab === "albums"
                              ? "bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]"
                              : "bg-neutral-800 text-neutral-400 hover:text-white"
                          }`}
                        >
                          Albums
                        </button>
                      )}
                      {singles.length > 0 && (
                        <button
                          onClick={() => setDiscographyTab("singles")}
                          className={`shrink-0 whitespace-nowrap px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors sm:px-3 sm:py-1 sm:text-xs ${
                            discographyTab === "singles"
                              ? "bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]"
                              : "bg-neutral-800 text-neutral-400 hover:text-white"
                          }`}
                        >
                          Singles and EPs
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {displayedReleases.map((release, idx) => (
                      <Link
                        key={`${release.browseId}-${idx}`}
                        href={`/album/${release.browseId}`}
                        className="shrink-0 w-32 p-2.5 sm:w-36 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all border border-neutral-800/40 flex flex-col"
                      >
                        <div className="w-24 h-24 mx-auto mb-3 rounded-xl overflow-hidden shadow-lg bg-neutral-800 shrink-0 sm:w-28 sm:h-28">
                          {release.thumbnail ? (
                            <img
                              src={release.thumbnail}
                              alt={release.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getDefaultArtworkFallbackUrl();
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Disc3 className="w-12 h-12 text-neutral-600" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400">
                          {release.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {release.year ? `${release.year} • ` : ""}{release.type || "Release"}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Featuring <artist name> section */}
              {featuredOn.length > 0 && (
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
                    Featuring {artist.title}
                  </h2>
                  <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {featuredOn.map((playlist, idx) => (
                      <Link
                        key={`${playlist.browseId}-${idx}`}
                        href={`/playlist/${playlist.browseId}`}
                        className="shrink-0 w-32 p-2.5 sm:w-36 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all border border-neutral-800/40 flex flex-col"
                      >
                        <div className="w-24 h-24 mx-auto mb-3 rounded-xl overflow-hidden shadow-lg bg-neutral-800 shrink-0 sm:w-28 sm:h-28">
                          {playlist.thumbnail ? (
                            <img
                              src={playlist.thumbnail}
                              alt={playlist.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getDefaultArtworkFallbackUrl();
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ListMusic className="w-12 h-12 text-neutral-600" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400">
                          {playlist.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {playlist.author || playlist.subtitle || "Playlist"}
                        </p>
                        {playlist.isCommunity && (
                          <span className="inline-block text-[10px] text-emerald-400 font-medium truncate mt-0.5">
                            Community playlist
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Fans also like section */}
              {fansAlsoLike.length > 0 && (
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Fans also like</h2>
                  <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {fansAlsoLike.map((similar, idx) => (
                      <Link
                        key={`${similar.browseId}-${idx}`}
                        href={`/artist/${similar.browseId}`}
                        className="shrink-0 w-32 p-2.5 sm:w-36 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all text-center border border-neutral-800/40 flex flex-col"
                      >
                        <div className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden shadow-lg bg-neutral-800 shrink-0 sm:w-24 sm:h-24">
                          {similar.thumbnail ? (
                            <img
                              src={similar.thumbnail}
                              alt={similar.name}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getDefaultArtworkFallbackUrl();
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Mic2 className="w-10 h-10 text-neutral-600" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400">
                          {similar.name}
                        </p>
                        <p className="text-xs text-neutral-400 mt-0.5">Artist</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </main>
    </div>
  );
}
