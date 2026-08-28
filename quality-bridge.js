// quality-bridge.js — 画質の自動設定 / ISOLATED world 側（www.youtube.com 全体・トップフレームのみ）
// chrome.storage に触れるのは ISOLATED world だけ、プレーヤーの非公開メソッドを呼べるのは
// MAIN world だけ。両者は document を共有するので、設定を CustomEvent で quality-inject.js へ
// 橋渡しする。（統合前の独立拡張 yt-auto-quality-lite の bridge.js を移植したもの）

(function () {
  'use strict';

  const DEFAULTS = { autoQuality: true, defaultQuality: 'hd1080', useMaxQuality: false };

  function sendSettings() {
    chrome.storage.local.get(DEFAULTS, (settings) => {
      document.dispatchEvent(new CustomEvent('ylh:quality-settings', { detail: settings }));
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.autoQuality || changes.defaultQuality || changes.useMaxQuality) {
      sendSettings();
    }
  });

  // quality-inject.js の初期化が先行して初回配信を取りこぼした場合の再送要求に応える
  document.addEventListener('ylh:quality-request', sendSettings);

  sendSettings();
})();
