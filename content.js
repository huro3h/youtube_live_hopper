// content.js — ライブ配信ページにアクセスした瞬間に最新位置(ライブヘッド)へシークする

(function () {
  'use strict';

  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 300;

  let lastVideoId = null;
  let jumpToLive = true;

  chrome.storage.local.get('jumpToLive', (stored) => {
    if (typeof stored.jumpToLive === 'boolean') jumpToLive = stored.jumpToLive;
    // 設定を読み込んでから初回実行する。同期的に実行すると既定値(true)のまま走ってしまい、
    // 機能をOFFにしていても初回ロードでシークしてしまう
    handleNavigation();
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

  // ライブ配信中のときだけライブバッジを返す。
  // 注意: .ytp-live-badge は通常動画のプレーヤーにも常に存在し、CSSで display:none に
  // されているだけなので、要素の有無ではライブ判定にならない（存在チェックだけで
  // クリックすると通常動画やショートの再生位置を壊す）。ライブ時のみ .ytp-time-display に
  // 付く .ytp-live クラスで判定する。
  function findLiveBadge() {
    if (!document.querySelector('.ytp-time-display.ytp-live')) return null;
    return document.querySelector('.ytp-live-badge');
  }

  function jumpToLiveHead() {
    const startedAt = Date.now();

    (function tick() {
      const badge = findLiveBadge();
      if (badge) {
        // 方法①: ライブバッジをクリック（最も確実）
        // 既に最新位置にいるときバッジは disabled になっており、その場合クリックは
        // ブラウザ側で無視されるため何も起こらない（害はない）
        badge.click();
        // 方法②: プレーヤーAPIも念押しで実行
        const player = document.getElementById('movie_player');
        if (player && typeof player.seekToLiveHead === 'function') {
          player.seekToLiveHead();
        }
        return;
      }
      // ライブ配信でない動画ではライブ表示にならないため、
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
  // 初回実行は上の chrome.storage.local.get のコールバック内で行う
})();
