/**
 * Desktop YouTube downloads stay paused: there is no legal, working direct
 * audio source for YouTube playback. The mobile download system is a separate
 * feature and only uses the isolated download-test provider for now.
 */
export const DOWNLOADS_ENABLED = false;

/**
 * Mobile-only download system. This is deliberately separate from
 * DOWNLOADS_ENABLED so desktop menus, the desktop Library and the desktop
 * player are completely unchanged.
 */
export const MOBILE_DOWNLOADS_ENABLED = true;
