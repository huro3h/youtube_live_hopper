// content.js — ライブ配信ページにアクセスした瞬間に最新位置(ライブヘッド)へシークする

(function () {
  'use strict';

  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 300;

  let lastVideoId = null;
  let jumpToLive = true;

  chrome.storage.local.get('jumpToLive', (stored) => {
    if (typeof stored.jumpToLive === 'boolean') jumpToLive = stored.jumpToLive;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.jumpToLive) {
      jumpToLive = changes.jumpToLive.newValue;
    }
  });

  function isWatchPage() {
    return location.pathname === '/watch' || location.pathname.startsWith('/live/');
  }

  function getVideoId() {
    if (location.pathname === '/watch') {
      return new URLSearchParams(location.search).get('v');
    }
    const match = location.pathname.match(/^\/live\/([\w-]{11})/);
    return match ? match[1] : null;
  }

  function jumpToLiveHead() {
    const startedAt = Date.now();

    (function tick() {
      const badge = document.querySelector('.ytp-live-badge');
      if (badge) {
        // 方法①: ライブバッジをクリック（最も確実）
        badge.click();
        // 方法②: プレーヤーAPIも念押しで実行
        const player = document.getElementById('movie_player');
        if (player && typeof player.seekToLiveHead === 'function') {
          player.seekToLiveHead();
        }
        return;
      }
      // ライブ配信でない動画では .ytp-live-badge が存在しないため、
      // MAX_WAIT_MS を過ぎたら諦めて何もしない
      if (Date.now() - startedAt < MAX_WAIT_MS) {
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    })();
  }

  function handleNavigation() {
    if (!jumpToLive || !isWatchPage()) return;

    const videoId = getVideoId();
    if (!videoId || videoId === lastVideoId) return;
    lastVideoId = videoId;

    jumpToLiveHead();
  }

  // YouTube は SPA なので通常のページ遷移イベントが発火しない
  document.addEventListener('yt-navigate-finish', handleNavigation);
  handleNavigation();
})();
