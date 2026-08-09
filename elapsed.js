// elapsed.js — MAIN world で動作。ライブ配信の「◯時間前にライブ配信開始」表示の
// 右隣に「開始からhh:mm:ss経過」を挿入して並べて表示し、毎秒更新する。
//
// 既存テキストは書き換えず自前の要素を挿入する方式にすることで、YouTubeの
// 再描画とテキストを取り合って点滅する問題を避けている。自前要素が再描画で
// 消えた場合は毎秒のtickで入れ直す。
//
// プレーヤーの getPlayerResponse() 等はYouTubeのページスクリプト(MAIN world)が
// 要素に付けるメソッドで、コンテンツスクリプト(ISOLATED world)からは参照できない。
// そのためこのスクリプトだけ manifest で world: "MAIN" を指定して注入している。

(function () {
  'use strict';

  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 300;
  const UPDATE_MS = 1000;
  const MARKER_ID = 'ylh-elapsed';

  let lastVideoId = null;
  let intervalId = null;
  let startMs = null;

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

  // 現在再生中のライブ配信の開始時刻(ISO文字列)を取得する。
  // getPlayerResponse() はSPA遷移後も現在の動画の値を返すため優先し、
  // 初回ロード直後などで未取得の場合は window.ytInitialPlayerResponse を使う。
  function getStartTimestamp() {
    const sources = [];
    const player = document.getElementById('movie_player');
    if (player && typeof player.getPlayerResponse === 'function') {
      try { sources.push(player.getPlayerResponse()); } catch (e) {}
    }
    try { sources.push(window.ytInitialPlayerResponse); } catch (e) {}

    for (const pr of sources) {
      const details = pr && pr.microformat && pr.microformat.playerMicroformatRenderer
        && pr.microformat.playerMicroformatRenderer.liveBroadcastDetails;
      if (details && details.isLiveNow && details.startTimestamp) {
        return details.startTimestamp;
      }
    }
    return null;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatElapsed(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }

  // 「4 時間前にライブ配信開始」のような相対時刻テキストのリーフ要素を探す。
  // ytd-watch-metadata 配下に絞ることで、コメント欄等の誤マッチを防ぐ。
  function findLiveStartTextEl() {
    const roots = [
      document.querySelector('ytd-watch-metadata'),
      document.querySelector('#above-the-fold'),
      document.querySelector('ytd-watch-flexy #primary'),
      document
    ].filter(Boolean);

    for (const root of roots) {
      const candidates = root.querySelectorAll('yt-formatted-string, span, div');
      for (const el of candidates) {
        if (el.children.length > 0) continue; // テキストのみのリーフ要素に限定
        const text = el.textContent && el.textContent.trim();
        if (text && text.length < 60 && /ライブ配信開始$/.test(text)) return el;
      }
    }
    return null;
  }

  // 既存テキストの右隣に自前の経過時間要素を用意する（無ければ作成）。
  // YouTubeの再描画でアンカーが差し替わると位置がずれるため、毎回アンカーの
  // 直後になるよう置き直す（既存ノードのmoveなので重複はしない）。
  function ensureElapsedEl(anchor) {
    let el = document.getElementById(MARKER_ID);
    if (!el) {
      el = document.createElement('span');
      el.id = MARKER_ID;
      el.style.marginLeft = '6px';
      el.style.opacity = '0.85';
      el.style.fontWeight = '500';
    }
    if (anchor.nextElementSibling !== el) {
      anchor.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function tick() {
    if (startMs === null) return;
    const anchor = findLiveStartTextEl();
    if (!anchor) return;
    const el = ensureElapsedEl(anchor);
    el.textContent = `（開始から${formatElapsed((Date.now() - startMs) / 1000)}経過）`;
  }

  function start() {
    stop();
    const startedAt = Date.now();

    (function waitTick() {
      const ts = getStartTimestamp();
      const anchor = findLiveStartTextEl();
      if (ts && anchor) {
        startMs = new Date(ts).getTime();
        tick();
        intervalId = setInterval(tick, UPDATE_MS);
        return;
      }
      // ライブでない動画や取得前は諦める/リトライ
      if (Date.now() - startedAt < MAX_WAIT_MS) {
        setTimeout(waitTick, POLL_INTERVAL_MS);
      }
    })();
  }

  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    startMs = null;
    const el = document.getElementById(MARKER_ID);
    if (el) el.remove();
  }

  function handleNavigation() {
    if (!isWatchPage()) { stop(); return; }
    const videoId = getVideoId();
    if (!videoId || videoId === lastVideoId) return;
    lastVideoId = videoId;
    start();
  }

  document.addEventListener('yt-navigate-finish', handleNavigation);
  handleNavigation();
})();
