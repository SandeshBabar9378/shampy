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
}
