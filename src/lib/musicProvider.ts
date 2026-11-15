import { Track } from "./types";

export const FEATURED_PLAYLISTS = [
  {
    id: "top-hits-2026",
    playlistId: "PL3-sRm8xAzY999ARkg8XztLMO-IikrsQw",
    name: "Today's Top Hits",
    description: "The hottest tracks right now across global and Indian charts.",
    coverUrl: "https://i.ytimg.com/vi/34Na4j8AVgA/hqdefault.jpg",
    query: "top hits 2026",
  },
  {
    id: "bollywood-butter",
    playlistId: "PLSSRgrU8wl9O2WHKf2PhCirmx8hhyJr-Q",
    name: "Bollywood Butter",
    description: "The ultimate Bollywood bangers, romance, and viral chartbusters.",
    coverUrl: "https://i.ytimg.com/vi/BddP6PYo2gs/hqdefault.jpg",
    query: "arijit singh pritam",
  },
  {
    id: "punjabi-101",
    playlistId: "PLh6lERmo-5SzgnFDFZqLxFYX7MSDtvMfw",
    name: "Punjabi 101",
    description: "High energy Punjabi beats featuring Karan Aujla, Diljit, AP Dhillon.",
    coverUrl: "https://i.ytimg.com/vi/cWMxCE2HTag/hqdefault.jpg",
    query: "diljit dosanjh karan aujla",
  },
  {
    id: "lofi-beats",
    playlistId: "PLBTanuC8SLeZUH4mYXFvRbDfxTMKvNLHJ",
    name: "Lofi Chill & Study",
    description: "Relaxing lofi beats, ambient instrumentals, and soft focus tunes.",
    coverUrl: "https://i.ytimg.com/vi/gJLVTKhTnog/hqdefault.jpg",
    query: "lofi chill beats",
  },
  {
    id: "all-out-hiphop",
    playlistId: "PL3-sRm8xAzY-556lOpSGH6wVzyofoGpzU",
    name: "Rap Caviar & Hip Hop",
    description: "Hard hitting verses from Kendrick, Drake, Travis Scott, and Seedhe Maut.",
    coverUrl: "https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg",
    query: "kendrick lamar travis scott",
  },
  {
    id: "marathi-hits",
    playlistId: "RDCLAK5uy_n_j5hn1oZvozN_MEKW6IG3CiakXxTAHkM",
    name: "Marathi Hits",
    description: "Best of Marathi music, viral folk, Ajay-Atul classics and energetic tracks.",
    coverUrl: "https://i.ytimg.com/vi/JHk4O02oYjA/hqdefault.jpg",
    query: "marathi hits ajay atul",
  },
  {
    id: "indie-india",
    playlistId: "PLQhCFaR5aOU4",
    name: "Indie India",
    description: "Acoustic vibes and best of homegrown Indian independent artists.",
    coverUrl: "https://i.ytimg.com/vi/gJLVTKhTnog/hqdefault.jpg",
    query: "anuv jain prateek kuhad",
  },
];

// Curated tracks with valid YouTube thumbnails and videoIds for instant fallback
export const CURATED_TRACKS: Track[] = [
  {
    id: "34Na4j8AVgA",
    title: "Starboy",
    artist: "The Weeknd ft. Daft Punk",
    album: "Starboy",
    coverUrl: "https://i.ytimg.com/vi/34Na4j8AVgA/hqdefault.jpg",
    duration: 230,
    genre: "R&B/Soul",
    language: "English",
    youtubeId: "34Na4j8AVgA",
  },
  {
    id: "4NRXx6U8ABQ",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    coverUrl: "https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg",
    duration: 200,
    genre: "Pop",
    language: "English",
    youtubeId: "4NRXx6U8ABQ",
  },
  {
    id: "cWMxCE2HTag",
    title: "Softly",
    artist: "Karan Aujla & Ikky",
    album: "Four You",
    coverUrl: "https://i.ytimg.com/vi/cWMxCE2HTag/hqdefault.jpg",
    duration: 154,
    genre: "Punjabi",
    language: "Hindi",
    youtubeId: "cWMxCE2HTag",
  },
  {
    id: "BddP6PYo2gs",
    title: "Kesariya",
    artist: "Arijit Singh & Pritam",
    album: "Brahmastra",
    coverUrl: "https://i.ytimg.com/vi/BddP6PYo2gs/hqdefault.jpg",
    duration: 268,
    genre: "Bollywood",
    language: "Hindi",
    youtubeId: "BddP6PYo2gs",
  },
  {
    id: "gJLVTKhTnog",
    title: "Husn",
    artist: "Anuv Jain",
    album: "Husn - Single",
    coverUrl: "https://i.ytimg.com/vi/gJLVTKhTnog/hqdefault.jpg",
    duration: 218,
    genre: "Indie Pop",
    language: "Hindi",
    youtubeId: "gJLVTKhTnog",
  },
  {
    id: "ApXoWvfEYVU",
    title: "Sunflower",
    artist: "Post Malone & Swae Lee",
    album: "Spider-Man: Into the Spider-Verse",
    coverUrl: "https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg",
    duration: 158,
    genre: "Hip-Hop",
    language: "English",
    youtubeId: "ApXoWvfEYVU",
  },
  {
    id: "mH_LFkWxpI0",
    title: "Lover",
    artist: "Diljit Dosanjh",
    album: "MoonChild Era",
    coverUrl: "https://i.ytimg.com/vi/mH_LFkWxpI0/hqdefault.jpg",
    duration: 191,
    genre: "Punjabi",
    language: "Hindi",
    youtubeId: "mH_LFkWxpI0",
  },
  {
    id: "kPa7bsKwL-c",
    title: "Die With A Smile",
    artist: "Lady Gaga & Bruno Mars",
    album: "Die With A Smile - Single",
    coverUrl: "https://i.ytimg.com/vi/kPa7bsKwL-c/hqdefault.jpg",
    duration: 251,
    genre: "Pop",
    language: "English",
    youtubeId: "kPa7bsKwL-c",
  },
  {
    id: "JHk4O02oYjA",
    title: "Zingaat",
    artist: "Ajay-Atul",
    album: "Sairat",
    coverUrl: "https://i.ytimg.com/vi/JHk4O02oYjA/hqdefault.jpg",
    duration: 226,
    genre: "Bollywood",
    language: "Marathi",
    youtubeId: "JHk4O02oYjA",
  },
  {
    id: "mqPLj0frBO8",
    title: "Gulabachi Kali",
    artist: "Vaishali Samant & Amitraj",
    album: "Tu Hi Re",
    coverUrl: "https://i.ytimg.com/vi/mqPLj0frBO8/hqdefault.jpg",
    duration: 278,
    genre: "Bollywood",
    language: "Marathi",
    youtubeId: "mqPLj0frBO8",
  },
];

export async function searchTracks(query: string, limit: number = 25): Promise<Track[]> {
  if (!query || query.trim().length === 0) {
    return CURATED_TRACKS;
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) {
      return CURATED_TRACKS.filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.artist.toLowerCase().includes(query.toLowerCase())
      );
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.results.map((r: any): Track => {
      let cover = r.artworkUrl100 || "";
      if (cover) {
        cover = cover.replace("100x100bb.jpg", "600x600bb.jpg");
      }

      return {
        id: String(r.trackId),
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName || r.trackName,
        coverUrl: cover || "/placeholder.svg",
        duration: Math.round((r.trackTimeMillis || 0) / 1000),
        previewUrl: r.previewUrl,
        genre: r.primaryGenreName,
      };
    });
  } catch (err) {
    console.error("Music search error:", err);
    return CURATED_TRACKS;
  }
}

export async function getRecommendations(seedArtist?: string, seedGenre?: string): Promise<Track[]> {
  const query = seedArtist || seedGenre || "trending pop";
  const tracks = await searchTracks(query, 15);
  return tracks;
}
