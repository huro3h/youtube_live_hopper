---
name: youtube_live_hopper
description: Architecture and history for the youtube_live_hopper Chrome extension (auto-seeks YouTube Live pages to the live head on access). Use when extending or debugging this extension, or understanding why it was pared down from a multi-feature channel-hopper to a single-purpose auto-seek tool.
---

# youtube_live_hopper — development notes

A minimal, dependency-free Manifest V3 Chrome extension. Its only job: when a
YouTube Live watch page loads (or is navigated to via YouTube's SPA router),
automatically seek the player to the live head. One popup toggle
(`⚡ 常に最新位置から再生`, stored as `chrome.storage.local.jumpToLive`,
default `true`) can disable this if the user wants to catch up from behind
instead.

## History — this used to be a much bigger extension

The original v1 was a full "channel hopper": YouTube Data API v3 keyword
search, topic-channel registration (scraping `ytInitialData` off `/live`
pages via `background.js`), a merged/curated channel list in the popup, and
an auto-hop-to-next-channel feature that watched for the player's
`ended-mode` class (plus a 60s API-polling fallback) to detect stream end and
jump to the next channel in the list.

All of that was deliberately removed in a v2 rewrite — the user wanted only
the live-head auto-seek behavior, nothing else. Removed: the YouTube Data API
integration (no more API key input/storage), keyword search, topic-channel
registration/list, the merged channel list UI, prev/next/refresh controls,
the auto-hop-on-end feature, and `background.js` entirely (no service worker
needed once there's no cross-tab channel-switching state to own).

If a past version of this extension is ever referenced (docs, old commits,
memory from a prior session), assume it described the removed multi-feature
version — verify against current `manifest.json`/`content.js` before trusting
it.

## How it works now

- `content.js` only, injected on `https://www.youtube.com/watch*` and
  `https://www.youtube.com/live/*` (`document_idle`). No `background.js`, no
  `host_permissions` — content scripts can call `chrome.storage` directly, so
  there's no need to relay settings through a service worker.
- Reads `jumpToLive` from `chrome.storage.local` on load and via
  `chrome.storage.onChanged`, so toggling the popup switch applies without a
  page reload if the SPA navigates again.
- Listens for YouTube's `yt-navigate-finish` document event (the same signal
  used elsewhere in this workspace, e.g. `yt-auto-quality-lite`, to detect
  SPA navigation) plus runs once on initial script load, dedup'd by video ID
  (`?v=` on `/watch`, or the path segment on `/live/<id>`) so it only acts
  once per video, not on every SPA event for the same video.
- Seeks via two mechanisms together (belt-and-suspenders, carried over from
  the v1 implementation which needed both): clicking `.ytp-live-badge`
  (the visible "LIVE" button) and calling the player's undocumented
  `seekToLiveHead()` method. `.ytp-live-badge` only exists in the DOM when
  the video is actually a live broadcast, so this naturally no-ops on
  regular VODs — polls for up to 15s (300ms interval) in case the player
  hasn't mounted yet, then gives up silently.

## Scope / known limitations

- No automated tests. Manual check: open a live YouTube stream, seek
  backwards, then navigate to another live video via a YouTube link — it
  should land at the live edge automatically.
- `seekToLiveHead()` and `.ytp-live-badge` are unofficial/internal YouTube
  player surfaces (same caveat as `yt-auto-quality-lite`'s quality-forcing
  API) — fragile to YouTube UI changes, no official replacement exists.
- Old `chrome.storage.local` keys from v1 (`apiKey`, `topicChannels`,
  `channels`, `currentIndex`, `autoHop`, `lastQuery`) are simply orphaned on
  upgrade, not migrated or cleared — harmless unused data, not worth the
  added code to clean up for a personal WIP tool.
