/**
 * Offline downloads are paused: YouTube currently rejects the audio request,
 * so there is no working audio source. The storage, sync and UI code is kept
 * and switches back on by flipping this flag (also see /api/download).
 */
export const DOWNLOADS_ENABLED = false;
