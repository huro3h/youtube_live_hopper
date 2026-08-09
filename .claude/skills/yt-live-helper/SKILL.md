---
name: yt-live-helper
description: Architecture and history for the yt-live-helper Chrome extension (formerly youtube_live_hopper / YouTubeLiveHopper; a small grab-bag of YouTube Live viewing conveniences — auto-seeks live pages to the live head, switches live chat from "Top chat" to "all chat", and hides the creator's pinned-message banner locally). Use when extending or debugging this extension, understanding why it was pared down from a multi-feature channel-hopper before growing back into a small convenience collection, or dealing with the MAIN/ISOLATED content-script world split.
---

# yt-live-helper — development notes

A minimal, dependency-free Manifest V3 Chrome extension: a small grab-bag of
"make watching YouTube Live nicer" conveniences. Framing note: the manifest
`description` was deliberately generalized to
「YouTube Liveの視聴を快適にする便利機能を詰め合わせたChrome拡張機能」so that
adding a feature no longer requires editing it — do **not** narrow it back to
a single-feature sentence.

Three features today, each with its own popup toggle (all stored in
`chrome.storage.local`, default `true`):

- **Live-head auto-seek** (`常に最新位置から再生`, key `jumpToLive`) — on opening
  a live watch page, seek the player to the live head. `content.js`.
- **Chat auto all-view** (`チャットを常に全表示`, key `allChat`) — switch the live
  chat from the default "トップチャット"(Top chat) to "チャット"(all chat).
  `chat.js`.
- **Pinned-message auto-hide** (`固定メッセージを自動で非表示`, key `hidePinned`)
  — hide the creator's pinned-message banner from *your own* view via injected
  CSS. `chat.js`. Purely local; never touches YouTube's "unpin" action.

Popup labels are plain text (no leading emoji — an earlier ⚡/💬 pass was
removed at the user's request).

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

**Rename:** the project was renamed `youtube_live_hopper` / `YouTubeLiveHopper`
→ repo `yt-live-helper`, display name `YouTube Live Helper`, skill
`yt-live-helper`, and the local working-copy directory
`~/projects/yt-live-helper` (to match the `yt-*` prefix of sibling extensions
like `yt-auto-quality-lite`, and because "Hopper" was a leftover from the
removed channel-hopper). Note the Claude Code project-memory dir is still keyed
to the old path (`-Users-huro3h-projects-youtube-live-hopper`) — that key is
frozen at creation and doesn't follow the directory rename.

## How it works now

Two content scripts, no `background.js`, no `host_permissions`. Only the
`storage` permission.

### Live-head auto-seek — `content.js`

`content.js` (ISOLATED world), injected on
`https://www.youtube.com/watch*` and `https://www.youtube.com/live/*` at
`document_idle`.

- Reads `jumpToLive` from `chrome.storage.local` on load and via
  `chrome.storage.onChanged`, so toggling the popup switch applies without a
  page reload if the SPA navigates again.
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

### Chat features — `chat.js` (all-view switch + pinned-message hide)

`chat.js` (ISOLATED world), injected on `https://www.youtube.com/live_chat*`
with **`all_frames: true`** — the live chat is a *same-origin iframe*
(`#chatframe`, src `…/live_chat?…`) nested in the watch page, and content
scripts reach subframes only when `all_frames` is set. This is a **separate
`content_scripts` entry** from `content.js` (which matches only the top-frame
watch/live URLs), so `content.js` never runs in the chat frame and `chat.js`
never runs in the top frame. Purely DOM/CSS — no player methods — so ISOLATED
world is fine (no MAIN-world bridge needed). Handles two features (`allChat`,
`hidePinned`), both read once from `chrome.storage.local` on load.

**Pinned-message hide (`hidePinned`).** Injects one `<style id="ylh-hide-pinned">`
into the chat iframe:
`yt-live-chat-banner-renderer:has(yt-live-chat-text-message-renderer){display:none!important;}`.
The pinned message is a banner in `yt-live-chat-banner-manager#live-chat-banner`;
targeting the renderer that *contains a text-message* hides only pinned
messages (polls etc. stay visible), and the manager collapses from ~44px to 0.
Toggled live via `chrome.storage.onChanged` (add/remove the style element), no
reload needed. CSS (not element removal / clicking) was chosen deliberately:
it auto-applies to re-pinned messages with no MutationObserver, and it never
invokes YouTube's own dismiss.
  - **Why not click YouTube's "メッセージの固定を解除" (unpin) menu item:** it
    exists in the banner's kebab ("チャットの操作") menu and *does* remove the
    banner — verified via Playwright/Brave that in an anonymous session it drops
    `has-active-banner` and the renderer count to 0. But "固定を解除" is
    semantically *unpin*, and for a moderator/owner it would very likely unpin
    for **all** viewers (can't be tested anonymously). The user chose the
    local-hide approach precisely to avoid that risk. If you ever revisit,
    don't switch to clicking that item without solving the mod/owner case.
  - Verified end-to-end with the extension loaded in Brave: style injected,
    banner renderer `display:none`, manager height 0 (and `allChat` switched to
    "チャット" in the same run).

**All-view switch (`allChat`).**

- Reads `allChat` from `chrome.storage.local`; if `true`, runs once. Guards
  with `location.pathname.startsWith('/live_chat')` as a belt.
- The mode switch is the `#view-selector` dropdown in the chat header (the
  "トップチャット / チャット" selector). Two-phase, polled up to 15s (300ms):
  phase 1 clicks the trigger to open the menu; phase 2, once the menu items
  render, clicks the **last** item (= all-chat; Top chat is first and is the
  default). If the already-selected item (`aria-selected="true"` /
  `.iron-selected`) is already the last, it closes the menu and no-ops.
- Chosen "click the last / the non-selected item" over matching the label
  text so it's language-independent. Item selectors are defensive
  (`tp-yt-paper-listbox a` → `#menu a` → `a.yt-dropdown-menu`) because the
  exact live_chat DOM wasn't introspected — **verified working in the real
  UI by the user**, but if it breaks, this selector chain and the
  first/last-index assumption are the first things to re-check.
- Runs once per iframe load. Not yet confirmed whether an SPA video-change
  reloads the chat iframe (which would re-inject `chat.js`) or reuses it
  (which would not re-run) — verify if switching videos ever stops
  auto-switching.

## Removed: live elapsed-time display (`elapsed.js`)

A second feature was built and then removed at the user's request: a MAIN-world
`elapsed.js` that inserted a live-updating "（開始からhh:mm:ss経過）" span next
to the "◯時間前にライブ配信開始" date in the description. It worked in
end-to-end tests but the user found the flicker not fully suppressible, the
readout hard to read, and it failed to appear on some videos — so the whole
feature (the script, its `world: "MAIN"` content-script entry, and the docs)
was dropped. **If re-attempting**, the notes below are what was learned;
budget for the flicker/reliability problems being real, not just polish.

- Exact stream start came from
  `player.getPlayerResponse().microformat.playerMicroformatRenderer.liveBroadcastDetails.startTimestamp`
  (ISO string), fallback `window.ytInitialPlayerResponse` same path;
  elapsed = `Date.now() - new Date(startTimestamp)`. `player.getDuration()`
  is **not** usable for this — during a live broadcast it returns ~1h more
  than the real elapsed time (appears to include the DVR window).
- Insert-beside beat overwrite-in-place: overwriting the date element's
  `textContent` fought YouTube's re-render loop and flickered between our text
  and the original ~1×/s. Inserting our own `<span id="ylh-elapsed">` after
  the anchor (re-positioned every tick when `anchor.nextElementSibling !==
  el`) was better but still had a residual ~1s blip at each re-render, plus
  the "not appearing on some videos" issue — which is why it was ultimately
  cut.

### The MAIN vs ISOLATED world gotcha (keep this lesson even though elapsed.js is gone)

The player's methods (`getPlayerResponse`, `getCurrentTime`,
`seekToLiveHead`, …) and page globals (`ytInitialPlayerResponse`) are
attached by YouTube's own page scripts, which run in the **MAIN** world. A
default content script runs in the **ISOLATED** world: it shares the DOM, so
`document.getElementById('movie_player')` returns the element and DOM clicks
work, but the element's YouTube-added methods are **invisible**
(`typeof player.getPlayerResponse === 'function'` is `false`). Any future
feature that needs to *call* a player method (not just click DOM) must run in
a `world: "MAIN"` content script.

Debugging trap that cost time here: Puppeteer's `page.evaluate()` runs in the
MAIN world by default, so a standalone `evaluate` reading `getCurrentTime()`
*succeeds* and makes the approach look viable — while the same call from the
ISOLATED content script silently returns nothing. Always confirm which world
a call needs before assuming an `evaluate` result reflects what a content
script will see. (Same MAIN/ISOLATED concern as `yt-auto-quality-lite`, which
bridges with `CustomEvent`s.)

## Scope / known limitations

- No automated tests. Manual check: open a live YouTube stream, seek
  backwards, then navigate to another live video via a YouTube link — it
  should land at the live edge automatically, the chat should switch from
  "トップチャット" to "チャット" on its own, and any creator-pinned message
  banner should stay hidden.
- **E2E.** Use the shared **`browser-testing`** skill (Playwright + Brave
  Browser Nightly; its Recipe B loads the unpacked extension). Project-specific
  bits: the live chat is a same-origin subframe, so grab it with
  `page.frames().find(f => f.url().includes('live_chat'))` and `evaluate` inside
  *that frame*. The chat features were verified this way with the extension
  loaded (style injected, pinned banner `display:none`, manager height 0, and
  `allChat` switched to "チャット" in the same run). An older Puppeteer +
  Chrome-for-Testing recipe from the `yt-auto-quality-lite` skill also works.
- `seekToLiveHead()`/`.ytp-live-badge` (player), `#view-selector` +
  `tp-yt-paper-listbox` (chat mode dropdown), and
  `yt-live-chat-banner-renderer` / `yt-live-chat-banner-manager` (pinned banner)
  are all unofficial/internal YouTube surfaces (same caveat as
  `yt-auto-quality-lite`'s quality-forcing API) — fragile to YouTube UI changes,
  no official replacement exists. The pinned-hide CSS relies on `:has()` (fine
  in current Chromium/Brave; `CSS.supports('selector(:has(*))')` was true).
- Old `chrome.storage.local` keys from v1 (`apiKey`, `topicChannels`,
  `channels`, `currentIndex`, `autoHop`, `lastQuery`) are simply orphaned on
  upgrade, not migrated or cleared — harmless unused data, not worth the
  added code to clean up for a personal WIP tool.
