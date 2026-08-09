// popup.js
const jumpToLiveToggle = document.getElementById('jumpToLiveToggle');
const toast = document.getElementById('toast');

let jumpToLive = true;

async function init() {
  const stored = await chrome.storage.local.get('jumpToLive');
  if (typeof stored.jumpToLive === 'boolean') {
    jumpToLive = stored.jumpToLive;
  }
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
}

jumpToLiveToggle.addEventListener('click', () => {
  jumpToLive = !jumpToLive;
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  chrome.storage.local.set({ jumpToLive });
  showToast(jumpToLive ? '常に最新位置から再生: ON' : '常に最新位置から再生: OFF');
});

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

init();
