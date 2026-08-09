// chat.js — ライブチャットの視聴補助（live_chat iframe 内 / all_frames）
//   (1) 表示を「トップチャット」→「チャット(すべて表示)」へ自動切り替え
//   (2) 配信主の固定メッセージ(ピン留めバナー)を自分の画面から自動で非表示
//   (3) 配信主のアンケート(チャット最下部のパネル)を自分の画面から自動で非表示
// watch 本体ページ側の content.js とは別プロセス。純粋な DOM/CSS 操作のみ。

(function () {
  'use strict';

  // 保険: マッチパターン外のフレームでは何もしない
  if (!location.pathname.startsWith('/live_chat')) return;

  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 300;

  // ---------------------------------------------------------------------------
  // (2)(3) 固定メッセージ / アンケートの非表示 — CSS 注入方式
  // ---------------------------------------------------------------------------
  // 要素を消す/クリックするのではなく <style> を挿すだけ。再表示された新しい要素に
  // も自動で効き、MutationObserver も不要。YouTube の「固定を解除」等は押さないので、
  // モデレーター/オーナーであっても他視聴者には一切影響しない。
  //
  // - 固定メッセージ: テキストメッセージを含むバナーだけを狙う（アンケート等の他
  //   バナーは対象外）。中身が消えるとバナーマネージャは高さ0に畳まれる。
  // - アンケート: チャット最下部の #action-panel 内 yt-live-chat-poll-renderer。
  //   アンケートの格納先はチャット表示モードで変わる:
  //     ・トップチャット → 最下部の #action-panel 内
  //     ・すべて表示     → 上部のバナーマネージャ内の banner-renderer へ移動し、
  //                        しかも 32px の壊れたスタブとして描画される
  //   両方の格納先を狙うことで、どのモードでも綺麗に消え、崩れたスタブも解消する。
  const HIDE_STYLES = {
    hidePinned: {
      id: 'ylh-hide-pinned',
      css: 'yt-live-chat-banner-renderer:has(yt-live-chat-text-message-renderer){display:none!important;}',
    },
    hidePolls: {
      id: 'ylh-hide-polls',
      css:
        '#action-panel:has(yt-live-chat-poll-renderer),' +
        'yt-live-chat-banner-renderer:has(yt-live-chat-poll-renderer)' +
        '{display:none!important;}',
    },
  };

  function applyStyle(key, on) {
    const def = HIDE_STYLES[key];
    const existing = document.getElementById(def.id);
    if (on) {
      if (existing) return;
      const s = document.createElement('style');
      s.id = def.id;
      s.textContent = def.css;
      (document.head || document.documentElement).appendChild(s);
    } else if (existing) {
      existing.remove();
    }
  }

  // ---------------------------------------------------------------------------
  // (1) 「すべて表示」への切り替え
  // ---------------------------------------------------------------------------
  let done = false;
  let opened = false;

  function startAllChat() {
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

  // ---------------------------------------------------------------------------
  // 初期化 & 設定の反映
  // ---------------------------------------------------------------------------
  chrome.storage.local.get(['allChat', 'hidePinned', 'hidePolls'], (stored) => {
    const allChat = typeof stored.allChat === 'boolean' ? stored.allChat : true;
    const hidePinned =
      typeof stored.hidePinned === 'boolean' ? stored.hidePinned : true;
    const hidePolls =
      typeof stored.hidePolls === 'boolean' ? stored.hidePolls : true;
    if (hidePinned) applyStyle('hidePinned', true);
    if (hidePolls) applyStyle('hidePolls', true);
    if (allChat) startAllChat();
  });

  // 非表示トグルはページ再読み込みなしで即時反映（CSS の付け外し）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.hidePinned) applyStyle('hidePinned', changes.hidePinned.newValue !== false);
    if (changes.hidePolls) applyStyle('hidePolls', changes.hidePolls.newValue !== false);
  });
})();
