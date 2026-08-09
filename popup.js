// popup.js
const jumpToLiveToggle = document.getElementById('jumpToLiveToggle');
const allChatToggle = document.getElementById('allChatToggle');
const hidePinnedToggle = document.getElementById('hidePinnedToggle');
const hidePollsToggle = document.getElementById('hidePollsToggle');
const toast = document.getElementById('toast');

let jumpToLive = true;
let allChat = true;
let hidePinned = true;
let hidePolls = true;

async function init() {
  const stored = await chrome.storage.local.get(['jumpToLive', 'allChat', 'hidePinned', 'hidePolls']);
  if (typeof stored.jumpToLive === 'boolean') {
    jumpToLive = stored.jumpToLive;
  }
  if (typeof stored.allChat === 'boolean') {
    allChat = stored.allChat;
  }
  if (typeof stored.hidePinned === 'boolean') {
    hidePinned = stored.hidePinned;
  }
  if (typeof stored.hidePolls === 'boolean') {
    hidePolls = stored.hidePolls;
  }
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  allChatToggle.classList.toggle('on', allChat);
  hidePinnedToggle.classList.toggle('on', hidePinned);
  hidePollsToggle.classList.toggle('on', hidePolls);
}

jumpToLiveToggle.addEventListener('click', () => {
  jumpToLive = !jumpToLive;
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  chrome.storage.local.set({ jumpToLive });
  showToast(jumpToLive ? '常に最新位置から再生: ON' : '常に最新位置から再生: OFF');
});

allChatToggle.addEventListener('click', () => {
  allChat = !allChat;
  allChatToggle.classList.toggle('on', allChat);
  chrome.storage.local.set({ allChat });
  showToast(allChat ? 'チャットを常に全表示: ON' : 'チャットを常に全表示: OFF');
});

hidePinnedToggle.addEventListener('click', () => {
  hidePinned = !hidePinned;
  hidePinnedToggle.classList.toggle('on', hidePinned);
  chrome.storage.local.set({ hidePinned });
  showToast(hidePinned ? '固定メッセージを自動で非表示: ON' : '固定メッセージを自動で非表示: OFF');
});

hidePollsToggle.addEventListener('click', () => {
  hidePolls = !hidePolls;
  hidePollsToggle.classList.toggle('on', hidePolls);
  chrome.storage.local.set({ hidePolls });
  showToast(hidePolls ? 'アンケートを自動で非表示: ON' : 'アンケートを自動で非表示: OFF');
});

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

init();
