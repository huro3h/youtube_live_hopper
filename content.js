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
      if (player && typeof player.seekToLiveHead === 'function') {
        player.seekToLiveHead();
      } else if (tries > 0) {
        setTimeout(() => attempt(tries - 1), 1000);
      }
    };
    setTimeout(() => attempt(10), 2000);
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
