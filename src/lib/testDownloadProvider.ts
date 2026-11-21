/**
 * Temporary, isolated download test provider.
 *
 * This is the ONLY legal download source enabled right now. It never touches
 * YouTube extraction logic. Every downloadable file is a real MP3 bundled with
 * the app under /test-audio and comes from samplelib.com's unrestricted test
 * audio library. See public/test-audio/LICENSE.txt.
 *
 * Tracks from this provider are intentionally kept out of search,
 * recommendations, trending and the synced library. They only appear in the
 * dedicated "Download Test Playlist" / test album.
 *
 * Remove this module together with `public/test-audio` when a licensed
 * provider replaces it. Nothing outside this module knows where the audio
 * comes from.
 */

import type { Playlist, Track } from "./types";

export const DOWNLOAD_TEST_PLAYLIST_ID = "download-test-playlist";
export const DOWNLOAD_TEST_ALBUM_ID = "download-test-samples";
export const DOWNLOAD_TEST_PLAYLIST_HIDE_KEY = "shubhu_hide_download_test_playlist";
export const DOWNLOAD_TEST_SOURCE_ID = "bundled-samplelib-test-audio";
export const DOWNLOAD_TEST_NOTE =
  "TEMPORARY TEST PROVIDER — bundled samplelib.com test audio. Never part of your library, recommendations or history.";

const COVER_TEST = "/test-audio/test-artwork.svg";

interface Fixture {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number;
  /** Omitted for an intentionally unavailable track (partial-playlist test). */
  file?: string;
  bytes?: number;
}

const FIXTURES: Fixture[] = [
  {
    id: "dltest00001",
    title: "3-Second Test Sample",
    artist: "Samplelib",
    album: "Download Test Samples",
    coverUrl: COVER_TEST,
    duration: 3,
    file: "/test-audio/sample-3s.mp3",
    bytes: 52079,
  },
  {
    id: "dltest00002",
    title: "6-Second Test Sample",
    artist: "Samplelib",
    album: "Download Test Samples",
    coverUrl: COVER_TEST,
    duration: 6,
    file: "/test-audio/sample-6s.mp3",
    bytes: 103070,
  },
  {
    id: "dltest00003",
    title: "9-Second Test Sample",
    artist: "Samplelib",
    album: "Download Test Samples",
    coverUrl: COVER_TEST,
    duration: 9,
    file: "/test-audio/sample-9s.mp3",
    bytes: 154062,
  },
  {
    id: "dltest00004",
    title: "12-Second Test Sample",
    artist: "Samplelib",
    album: "Download Test Samples",
    coverUrl: COVER_TEST,
    duration: 12,
    file: "/test-audio/sample-12s.mp3",
    bytes: 205470,
  },
  {
    id: "dltest00005",
    title: "15-Second Test Sample",
    artist: "Samplelib",
    album: "Download Test Samples",
    coverUrl: COVER_TEST,
    duration: 15,
    file: "/test-audio/sample-15s.mp3",
    bytes: 307453,
  },
  {
    // Deliberately has no audio file: verifies unavailable-track handling and
    // accurate 5/6 progress for a partially downloadable playlist.
    id: "dltest00006",
    title: "Unavailable Test Track",
    artist: "Samplelib",
    album: "Download Test Samples",
    coverUrl: COVER_TEST,
    duration: 0,
  },
];

const BY_ID = new Map(FIXTURES.map((fixture) => [fixture.id, fixture]));

function toTrack(fixture: Fixture): Track {
  return {
    id: fixture.id,
    title: fixture.title,
    artist: fixture.artist,
    album: fixture.album,
    coverUrl: fixture.coverUrl,
    duration: fixture.duration,
    previewUrl: fixture.file,
    downloadUrl: fixture.file,
    downloadMimeType: fixture.file ? "audio/mpeg" : undefined,
    fileSize: fixture.bytes,
    source: "test",
    isTest: true,
  };
}

export interface DownloadSource {
  url: string;
  mimeType: string;
  expectedSize: number;
  sourceId: string;
  label: string;
}

export function isDownloadTestTrackId(id: string | null | undefined): boolean {
  return typeof id === "string" && BY_ID.has(id);
}

export function isDownloadTestTrack(track: Track | null | undefined): boolean {
  if (!track) return false;
  return track.source === "test" || track.isTest === true || isDownloadTestTrackId(track.id);
}

export function isDownloadTestPlaylistId(id: string | null | undefined): boolean {
  return id === DOWNLOAD_TEST_PLAYLIST_ID;
}

export function isDownloadTestAlbumId(id: string | null | undefined): boolean {
  return id === DOWNLOAD_TEST_ALBUM_ID;
}

export function getDownloadTestTracks(): Track[] {
  return FIXTURES.map(toTrack);
}

export function getDownloadTestPlaylist(): Playlist {
  const tracks = getDownloadTestTracks();
  return {
    id: DOWNLOAD_TEST_PLAYLIST_ID,
    name: "Download Test Playlist",
    description: DOWNLOAD_TEST_NOTE,
    coverUrl: COVER_TEST,
    trackCount: tracks.length,
    tracks,
  };
}

export function getDownloadTestAlbum(): {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  tracks: Track[];
} {
  return {
    id: DOWNLOAD_TEST_ALBUM_ID,
    title: "Download Test Album",
    author: "Samplelib test audio",
    coverUrl: COVER_TEST,
    tracks: getDownloadTestTracks(),
  };
}

/** Returns a legal, bundled source only for the test fixtures. */
export function resolveDownloadSource(track: Track): DownloadSource | null {
  const fixture = BY_ID.get(track.id);
  if (!fixture?.file) return null;
  return {
    url: fixture.file,
    mimeType: "audio/mpeg",
    expectedSize: fixture.bytes ?? 0,
    sourceId: DOWNLOAD_TEST_SOURCE_ID,
    label: "Bundled samplelib.com test recording",
  };
}

export function getDownloadTestFileSize(id: string): number | null {
  return BY_ID.get(id)?.bytes ?? null;
}

export function getDownloadTestTrack(id: string): Track | null {
  const fixture = BY_ID.get(id);
  return fixture ? toTrack(fixture) : null;
}
