export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number; // in seconds
  youtubeId?: string;
  artistId?: string;
  previewUrl?: string;
  genre?: string;
  language?: string;
  /**
   * A direct, legally downloadable audio URL. Only providers that own or are
   * licensed to distribute the audio may set this (never YouTube).
   */
  downloadUrl?: string;
  downloadMimeType?: string;
  /** Expected byte size, when the provider knows it. */
  fileSize?: number;
  /** "test" marks the isolated temporary provider. */
  source?: "test" | "youtube" | "external";
  isTest?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  trackCount?: number;
  tracks?: Track[];
  userId?: string;
}

export interface SavedPlaylist {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  trackCount: number;
}

export interface FollowedArtist {
  browseId: string;
  name: string;
  thumbnail: string;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  /** Present only for signed-in accounts; guests have none. */
  email?: string;
}
