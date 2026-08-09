// chat.js — ライブチャットの表示を「トップチャット」から「チャット(すべて表示)」へ自動切り替え
// live_chat iframe 内(all_frames)で動作する。watch 本体ページ側の content.js とは別プロセス。

(function () {
  'use strict';

  // 保険: マッチパターン外のフレームでは何もしない
  if (!location.pathname.startsWith('/live_chat')) return;

  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 300;

  let allChat = true;
  let done = false;
  let opened = false;

  chrome.storage.local.get('allChat', (stored) => {
    if (typeof stored.allChat === 'boolean') allChat = stored.allChat;
    if (allChat) start();
  });

  function start() {
    const startedAt = Date.now();
    (function tick() {
      if (done) return;
      trySwitch();
      if (!done && Date.now() - startedAt < MAX_WAIT_MS) {
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    })();
  }

  // view-selector ドロップダウン内のメニュー項目を取得（開いた後にレンダリングされる）
  function getMenuItems(selector) {
    let items = selector.querySelectorAll('tp-yt-paper-listbox a');
    if (!items.length) items = selector.querySelectorAll('#menu a');
    if (!items.length) items = selector.querySelectorAll('a.yt-dropdown-menu');
    return Array.from(items);
  }

  function trySwitch() {
    // 「上位のチャット / チャット」の切り替えドロップダウン
    const selector = document.querySelector('#view-selector');
    if (!selector) return; // まだ描画されていない

    const trigger =
      selector.querySelector('#trigger') ||
      selector.querySelector('tp-yt-paper-button');
    if (!trigger) return;

    // フェーズ1: メニューを開く
    if (!opened) {
      trigger.click();
      opened = true;
      return; // 次の tick で項目が揃うのを待つ
    }

    // フェーズ2: 項目が揃ったら「すべて表示(=末尾の項目)」を選択
    const items = getMenuItems(selector);
    if (items.length < 2) return; // まだ描画中

    // 既定は「上位のチャット(先頭)」。すべて表示は末尾の項目。
    const selectedIdx = items.findIndex(
      (el) =>
        el.getAttribute('aria-selected') === 'true' ||
        el.classList.contains('iron-selected')
    );
    const lastIdx = items.length - 1;

    if (selectedIdx === lastIdx) {
      // 既に「すべて表示」→ 開いたメニューを閉じて終了
      trigger.click();
    } else {
      items[lastIdx].click();
    }
    done = true;
  }
})();
