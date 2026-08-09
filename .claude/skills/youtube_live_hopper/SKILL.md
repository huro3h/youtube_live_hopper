---
name: youtube_live_hopper
description: Architecture and history for the youtube_live_hopper Chrome extension (auto-seeks YouTube Live pages to the live head, and shows the stream's elapsed time). Use when extending or debugging this extension, understanding why it was pared down from a multi-feature channel-hopper, or dealing with the MAIN/ISOLATED content-script world split.
---

# youtube_live_hopper — development notes

A minimal, dependency-free Manifest V3 Chrome extension with two features:
(1) when a YouTube Live watch page loads (or is navigated to via YouTube's SPA
router), automatically seek the player to the live head; (2) insert a
live-updating "（開始からhh:mm:ss経過）" elapsed-time readout next to the
"◯時間前にライブ配信開始" relative date in the description. One popup toggle
(`⚡ 常に最新位置から再生`, stored as `chrome.storage.local.jumpToLive`,
default `true`) can disable the seek if the user wants to catch up from behind
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

Two content scripts, both injected on `https://www.youtube.com/watch*` and
`https://www.youtube.com/live/*` at `document_idle`. No `background.js`, no
`host_permissions`.

**`content.js` — auto-seek (ISOLATED world, default):**

- Reads `jumpToLive` from `chrome.storage.local` on load and via
  `chrome.storage.onChanged` (only the ISOLATED world can touch `chrome.*`),
  so toggling the popup switch applies without a page reload if the SPA
  navigates again.
- Listens for YouTube's `yt-navigate-finish` document event (the same signal
  used elsewhere in this workspace, e.g. `yt-auto-quality-lite`, to detect
  SPA navigation) plus runs once on initial script load, dedup'd by video ID
  (`?v=` on `/watch`, or the path segment on `/live/<id>`) so it only acts
  once per video, not on every SPA event for the same video.
- Seeks via two mechanisms together (belt-and-suspenders): clicking
  `.ytp-live-badge` (the visible "LIVE" button) and calling the player's
  undocumented `seekToLiveHead()` method. `.ytp-live-badge` only exists in
  the DOM when the video is actually a live broadcast, so this naturally
  no-ops on regular VODs — polls for up to 15s (300ms interval) in case the
  player hasn't mounted yet, then gives up silently.
- **Note:** from the ISOLATED world, `player.seekToLiveHead()` is actually
  *not callable* (see world gotcha below) — the seek works because of the
  `.ytp-live-badge` click, which is a plain DOM click. The
  `seekToLiveHead()` call is a dead no-op belt kept only because it's
  harmless; don't rely on it as the mechanism.

**`elapsed.js` — live elapsed-time display (MAIN world):**

- Inserts a "（開始からhh:mm:ss経過）" span **next to** (not replacing) the
  "◯時間前にライブ配信開始" relative-date text in the description area,
  updated every second.
- Gets the exact stream start from
  `player.getPlayerResponse().microformat.playerMicroformatRenderer.liveBroadcastDetails.startTimestamp`
  (an ISO string), falling back to `window.ytInitialPlayerResponse` at the
  same path. Elapsed = `Date.now() - new Date(startTimestamp)`.
- Finds the anchor with `findLiveStartTextEl()`: leaf elements
  (`el.children.length === 0`) under `ytd-watch-metadata` / `#above-the-fold`
  / `ytd-watch-flexy #primary` whose trimmed text matches `/ライブ配信開始$/`
  and is `< 60` chars (avoids comment-section false matches).
- **Insertion, not replacement (this was a deliberate change).** An earlier
  version overwrote the date element's `textContent`; that fought YouTube's
  re-render loop and flickered between our text and the original ~once a
  second. Now we keep our own `<span id="ylh-elapsed">` and, every tick,
  re-find the anchor and re-attach our span immediately after it
  (`anchor.insertAdjacentElement('afterend', el)` only when
  `anchor.nextElementSibling !== el`). `getElementById` returns null when our
  span was removed by a re-render (getElementById only returns connected
  nodes), so we recreate it; otherwise we just move the existing node (no
  duplicates). This is important: without the per-tick re-position, a
  re-render that swaps the anchor node leaves our span stranded at its old
  spot (`adjacent` goes false) even though it's still connected. Residual
  cosmetic blip: a single ~1s frame where our span is briefly empty/misplaced
  right at a re-render, self-corrected next tick — accepted, not worth
  fighting.
- No `chrome.*` used here, so MAIN world is fine — this feature is always on
  and independent of the `jumpToLive` toggle.

### The MAIN vs ISOLATED world gotcha (the key lesson from adding elapsed.js)

The player's methods (`getPlayerResponse`, `getCurrentTime`,
`seekToLiveHead`, …) and page globals (`ytInitialPlayerResponse`) are
attached by YouTube's own page scripts, which run in the **MAIN** world. A
default content script runs in the **ISOLATED** world: it shares the DOM, so
`document.getElementById('movie_player')` returns the element and DOM clicks
work, but the element's YouTube-added methods are **invisible**
(`typeof player.getPlayerResponse === 'function'` is `false`). That's why the
elapsed feature *must* be a separate `world: "MAIN"` script and can't live in
`content.js`.

Debugging trap that cost time here: Puppeteer's `page.evaluate()` runs in the
MAIN world by default, so a standalone `evaluate` reading `getCurrentTime()`
*succeeds* and makes the approach look viable — while the same call from the
ISOLATED content script silently returns nothing. Always confirm which world
a call needs before assuming an `evaluate` result reflects what a content
script will see. (Same MAIN/ISOLATED bridging concern as `yt-auto-quality-lite`,
which uses `CustomEvent`s; here no bridge is needed because the MAIN-world
script both reads the player and writes the DOM itself.)

Also rejected: `player.getDuration()` for the elapsed value — during a live
broadcast it returns a value ~1h larger than the real elapsed time (looks
like it includes the DVR window), so it's unusable. `startTimestamp` is exact.

## Scope / known limitations

- No automated tests. Manual check: open a live YouTube stream, seek
  backwards, then navigate to another live video via a YouTube link — it
  should land at the live edge automatically, and the description should show
  "開始からhh:mm:ss経過" ticking up.
- Puppeteer + Chrome-for-Testing recipe (from the `yt-auto-quality-lite`
  skill) is what was used to verify end-to-end — retail Chrome silently
  ignores `--load-extension`. `world: "MAIN"` content scripts load fine that
  way; verify the elapsed text actually changes over several seconds, not
  just that it was set once.
- `seekToLiveHead()`, `.ytp-live-badge`, `getPlayerResponse()` and
  `ytInitialPlayerResponse` are all unofficial/internal YouTube surfaces
  (same caveat as `yt-auto-quality-lite`'s quality-forcing API) — fragile to
  YouTube changes, no official replacement exists.
- Old `chrome.storage.local` keys from v1 (`apiKey`, `topicChannels`,
  `channels`, `currentIndex`, `autoHop`, `lastQuery`) are simply orphaned on
  upgrade, not migrated or cleared — harmless unused data, not worth the
  added code to clean up for a personal WIP tool.
