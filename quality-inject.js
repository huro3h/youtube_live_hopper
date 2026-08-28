// quality-inject.js — 画質の自動設定 / MAIN world 側
// YouTube プレーヤー要素が持つ非公開メソッド（getAvailableQualityLevels /
// setPlaybackQualityRange）を直接呼んで画質を固定する。これらは YouTube 自身のページ
// スクリプトが付けるものなので、ISOLATED world からは見えない（詳細は skill を参照）。
// 設定は quality-bridge.js から CustomEvent で受け取る。

(() => {
  'use strict';

  const FALLBACK_INTERVAL_MS = 1500;

  // 設定が届くまでは何もしない。既定値で先に走らせると、機能をOFFにしていても
  // ページを開いた直後の1回だけ画質を書き換えてしまう（content.js の 2.6.1 と同じ轍）。
  let settings = null;
  let fallbackTimerId = null;

  document.addEventListener('ylh:quality-settings', (event) => {
    settings = event.detail;
    if (settings.autoQuality) {
      applyQualityToAllPlayers();
      startFallbackTimer();
    } else {
      stopFallbackTimer();
    }
  });

  document.dispatchEvent(new CustomEvent('ylh:quality-request'));

  function pickTargetQuality(available) {
    if (!available || available.length === 0) return null;
    if (settings.useMaxQuality) return available[0];
    if (available.includes(settings.defaultQuality)) return settings.defaultQuality;
    // 配信側の最大画質がデフォルト設定を下回る場合は、その中の最高画質を使う
    return available[0];
  }

  function applyQualityToPlayer(player) {
    if (
      typeof player.getAvailableQualityLevels !== 'function' ||
      typeof player.setPlaybackQualityRange !== 'function'
    ) {
      return;
    }
    try {
      const available = player.getAvailableQualityLevels();
      const target = pickTargetQuality(available);
      if (!target) return;
      if (typeof player.getPlaybackQuality === 'function' && player.getPlaybackQuality() === target) {
        return;
      }
      // 同じ値を2回渡すと範囲ではなく1つの画質に固定される
      player.setPlaybackQualityRange(target, target);
    } catch {
      // 非公開APIのため、YouTube側の実装変更で失敗しても無視して次回に委ねる
    }
  }

  function applyQualityToAllPlayers() {
    if (!settings || !settings.autoQuality) return;
    // 通常再生ページと Shorts のどちらも .html5-video-player
    document.querySelectorAll('.html5-video-player').forEach(applyQualityToPlayer);
  }

  // イベントを取りこぼした場合や、画質リストの準備が遅れた場合の保険
  function startFallbackTimer() {
    if (fallbackTimerId !== null) return;
    fallbackTimerId = setInterval(applyQualityToAllPlayers, FALLBACK_INTERVAL_MS);
  }

  function stopFallbackTimer() {
    if (fallbackTimerId === null) return;
    clearInterval(fallbackTimerId);
    fallbackTimerId = null;
  }

  // 通常再生・Shorts とも、動画切り替え時に発火する YouTube SPA のイベント
  document.addEventListener('yt-navigate-finish', applyQualityToAllPlayers);
})();
