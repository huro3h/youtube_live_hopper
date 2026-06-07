// content.js — YouTubeページに注入されるスクリプト

(function () {
  'use strict';

  let observer = null;
  let checkTimer = null;
  let hasNotified = false;
  let currentVideoId = null;
  let initTimer = null;
  let isLiveConfirmed = false;

  function bootstrap() {
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId || videoId === currentVideoId) return;

    currentVideoId = videoId;
    hasNotified = false;
    isLiveConfirmed = false;
    cleanup();
    waitForLiveBadge();
  }

  // ライブバッジが表示されるまで待ってから監視開始（誤検知防止）
  function waitForLiveBadge() {
    let attempts = 0;
    function tick() {
      if (hasNotified) return;
      attempts++;
      if (document.querySelector('.ytp-live-badge')) {
        isLiveConfirmed = true;
        startMonitoring();
      } else if (attempts < 30) {
        initTimer = setTimeout(tick, 500);
      }
    }
    initTimer = setTimeout(tick, 3000);
  }

  function startMonitoring() {
    const player = document.getElementById('movie_player');
    if (player) {
      observer = new MutationObserver(() => {
        if (isLiveConfirmed && !hasNotified) checkLiveStatus();
      });
      observer.observe(player, { attributes: true, attributeFilter: ['class'] });
    }
    checkTimer = setInterval(checkLiveStatus, 60000);
  }

  function checkLiveStatus() {
    if (hasNotified || !isLiveConfirmed) return;
    const player = document.getElementById('movie_player');
    if (player?.classList.contains('ended-mode')) {
      // 誤検知防止のため3秒後に再確認
      setTimeout(() => {
        if (!hasNotified && document.getElementById('movie_player')?.classList.contains('ended-mode')) {
          notifyEnded();
        }
      }, 3000);
    }
  }

  function notifyEnded() {
    if (hasNotified) return;
    hasNotified = true;
    cleanup();
    chrome.runtime.sendMessage({ type: 'LIVE_ENDED' }, () => { chrome.runtime.lastError; });
  }

  function cleanup() {
    if (observer) { observer.disconnect(); observer = null; }
    clearInterval(checkTimer);
    clearTimeout(initTimer);
  }

  function seekToLiveHead() {
    const attempt = (tries) => {
      const player = document.getElementById('movie_player');
      if (!player) {
        if (tries > 0) setTimeout(() => attempt(tries - 1), 500);
        return;
      }

      // 方法①: ライブバッジをクリック（最も確実）
      const liveBadge = document.querySelector('.ytp-live-badge');
      if (liveBadge) {
        liveBadge.click();
        // 念押しで方法②も実行
        if (typeof player.seekToLiveHead === 'function') player.seekToLiveHead();
        return;
      }

      // 方法②: プレーヤーAPIを使用
      if (typeof player.seekToLiveHead === 'function') {
        const playerState = player.getPlayerState?.();
        if (playerState === 1 || playerState === 2 || playerState === 3) {
          player.seekToLiveHead();
          setTimeout(() => {
            const badge = document.querySelector('.ytp-live-badge');
            if (badge) badge.click();
          }, 2000);
          return;
        }
      }

      // どちらもまだ準備できていない場合はリトライ
      if (tries > 0) setTimeout(() => attempt(tries - 1), 500);
    };
    setTimeout(() => attempt(20), 1000);
  }

  // YouTube SPA のページ遷移を検知
  let lastUrl = location.href;
  const navObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.pathname === '/watch') setTimeout(bootstrap, 500);
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'INIT_MONITOR') {
      hasNotified = false;
      currentVideoId = null;
      isLiveConfirmed = false;
      if (msg.jumpToLive) seekToLiveHead();
      bootstrap();
    }

    // ytInitialDataからライブ一覧を取得（InnerTubeより正確）
    if (msg.type === 'FETCH_YT_INITIAL_DATA') {
      try {
        const data = window.ytInitialData;
        if (!data) { sendResponse({ ok: false, videos: [] }); return; }

        const seen = new Set();
        const videoIds = [];
        JSON.stringify(data, (key, val) => {
          if (key === 'videoId' && typeof val === 'string' && !seen.has(val)) {
            seen.add(val); videoIds.push(val);
          }
          return val;
        });

        sendResponse({ ok: true, videoIds });
      } catch(e) {
        sendResponse({ ok: false, videos: [] });
      }
    }
  });

  bootstrap();

})();
