// popup.js
const API_BASE = 'https://www.googleapis.com/youtube/v3';

let apiKey = '';
let autoHop = true;
let jumpToLive = true;
let topicChannels = []; // [{ channelId, label }] ユーザー登録トピックチャンネル
let channels = [];      // 統合再生リスト
let currentIndex = -1;
let lastQuery = '';

// DOM refs
const apiKeyInput      = document.getElementById('apiKeyInput');
const saveKeyBtn       = document.getElementById('saveKeyBtn');
const queryInput       = document.getElementById('queryInput');
const searchBtn        = document.getElementById('searchBtn');
const channelList      = document.getElementById('channelList');
const loading          = document.getElementById('loading');
const empty            = document.getElementById('empty');
const nowPlaying       = document.getElementById('nowPlaying');
const npTitle          = document.getElementById('npTitle');
const prevBtn          = document.getElementById('prevBtn');
const nextBtn          = document.getElementById('nextBtn');
const refreshBtn       = document.getElementById('refreshBtn');
const autoHopToggle    = document.getElementById('autoHopToggle');
const jumpToLiveToggle = document.getElementById('jumpToLiveToggle');
const statusPill       = document.getElementById('statusPill');
const statusText       = document.getElementById('statusText');
const toast            = document.getElementById('toast');
const apiKeyBadge      = document.getElementById('apiKeyBadge');
const apiKeySection    = document.getElementById('apiKeySection');
const apiKeyPrompt     = document.getElementById('apiKeyPrompt');

// ── Init ──────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get([
    'apiKey', 'autoHop', 'jumpToLive',
    'topicChannels', 'lastQuery', 'channels', 'currentIndex'
  ]);

  if (stored.apiKey) {
    apiKey = stored.apiKey;
    apiKeyInput.value = '••••••••••••••••';
    setApiKeyStored(true);
  } else {
    setApiKeyStored(false);
  }
  if (typeof stored.autoHop === 'boolean') {
    autoHop = stored.autoHop;
    autoHopToggle.classList.toggle('on', autoHop);
  }
  if (typeof stored.jumpToLive === 'boolean') {
    jumpToLive = stored.jumpToLive;
    jumpToLiveToggle.classList.toggle('on', jumpToLive);
  }
  if (stored.topicChannels) topicChannels = stored.topicChannels;
  if (stored.lastQuery) {
    lastQuery = stored.lastQuery;
    queryInput.value = lastQuery;
  }
  if (stored.channels?.length) {
    channels = stored.channels;
    currentIndex = stored.currentIndex ?? -1;
    renderChannels();
    updateControls();
    updateNowPlaying();
  }

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res) updateStatus(res.active, res.channelName);
  });
}

// ── APIキー ───────────────────────────────────────────
function setApiKeyStored(stored) {
  if (stored) {
    apiKeySection.classList.add('collapsed');
    apiKeyBadge.classList.add('visible');
    apiKeyBadge.textContent = '🔑 設定済み';
    apiKeyBadge.style.background = '';
    apiKeyBadge.style.borderColor = '';
    apiKeyBadge.style.color = '';
    queryInput.disabled = false;
    searchBtn.disabled = false;
    queryInput.placeholder = 'キーワード or トピックID (UC...)';
    apiKeyPrompt.style.display = 'none';
  } else {
    apiKeySection.classList.remove('collapsed');
    apiKeyBadge.classList.remove('visible');
    queryInput.disabled = true;
    searchBtn.disabled = true;
    queryInput.placeholder = 'APIキーを設定してください';
    apiKeyPrompt.style.display = 'block';
  }
}

apiKeyBadge.addEventListener('click', () => {
  const isCollapsed = apiKeySection.classList.contains('collapsed');
  if (isCollapsed) {
    apiKeySection.classList.remove('collapsed');
    apiKeyInput.value = '••••••••••••••••';
    apiKeyBadge.textContent = '✕ 閉じる';
    apiKeyBadge.style.background = 'rgba(255,61,107,0.1)';
    apiKeyBadge.style.borderColor = 'rgba(255,61,107,0.3)';
    apiKeyBadge.style.color = 'var(--accent)';
  } else {
    setApiKeyStored(true);
  }
});

saveKeyBtn.addEventListener('click', () => {
  const val = apiKeyInput.value.trim();
  if (!val || val.startsWith('•')) return;
  apiKey = val;
  chrome.storage.local.set({ apiKey: val });
  apiKeyInput.value = '••••••••••••••••';
  setApiKeyStored(true);
  showToast('APIキーを保存しました', 'success');
});

// ── 入力判定：トピックチャンネルID or キーワード ──────
searchBtn.addEventListener('click', handleInput);
queryInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleInput(); });

function getSearchMode() {
  return document.querySelector('input[name="searchMode"]:checked')?.value || 'and';
}

async function handleInput() {
  const val = queryInput.value.trim();
  if (!val) return;

  if (/^UC[\w-]{22}$/.test(val)) {
    await addTopicChannel(val);
  } else {
    await doSearch(val);
  }
}

// ── トピックチャンネル登録 ────────────────────────────
async function addTopicChannel(channelId) {
  if (topicChannels.find(t => t.channelId === channelId)) {
    showToast('すでに登録済みです'); return;
  }

  // Data APIでチャンネル名を取得
  let label = channelId;
  if (apiKey) {
    try {
      const res = await fetch(
        `${API_BASE}/channels?part=snippet&id=${channelId}&key=${apiKey}`
      );
      const data = await res.json();
      label = data.items?.[0]?.snippet?.title || channelId;
    } catch {}
  }

  topicChannels.push({ channelId, label });
  chrome.storage.local.set({ topicChannels });
  queryInput.value = '';
  showToast(`📌 ${label} を登録しました`, 'success');
  await buildMergedList(lastQuery);
}

function removeTopicChannel(channelId) {
  topicChannels = topicChannels.filter(t => t.channelId !== channelId);
  chrome.storage.local.set({ topicChannels });
  showToast('登録を解除しました');
  buildMergedList(lastQuery);
}

// ── キーワード検索 ────────────────────────────────────
async function doSearch(query) {
  if (!apiKey) { showToast('APIキーを設定してください', 'error'); return; }
  lastQuery = query;
  chrome.storage.local.set({ lastQuery: query });
  await buildMergedList(query);
}

// ── 統合リスト構築 ────────────────────────────────────
async function buildMergedList(query) {
  setLoading(true);
  try {
    const [topicLives, searchResults] = await Promise.all([
      fetchTopicLives(),
      query && apiKey ? fetchLiveStreams(query) : Promise.resolve([])
    ]);

    // トピック結果のvideoIdを除外して検索結果をマージ
    const topicIds = new Set(topicLives.map(v => v.videoId));
    const filteredSearch = searchResults.filter(v => !topicIds.has(v.videoId));

    channels = [...topicLives, ...filteredSearch];
    chrome.storage.local.set({ channels });

    // チャンネルが0件でもトピック登録済みなら配信なし表示をするためrenderChannelsを呼ぶ
    const hasAnythingToShow = channels.length > 0 || topicChannels.length > 0;
    if (hasAnythingToShow) {
      setEmpty(false);
      renderChannels();
      updateControls();
      updateNowPlaying();
    } else {
      setEmpty(true);
    }
  } catch(e) {
    showToast('エラー: ' + e.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── InnerTube はbackground.jsで実行（CORS回避） ────────
async function fetchTopicLives() {
  if (!topicChannels.length || !apiKey) return [];
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_TOPIC_LIVES', topicChannels, apiKey },
      (res) => resolve(res?.result || [])
    );
  });
}

// ── Data API キーワード検索 ───────────────────────────
async function fetchLiveStreams(query) {
  const mode = getSearchMode();
  if (mode === 'or') {
    const keywords = query.split(/\s+/).filter(Boolean);
    if (keywords.length <= 1) return fetchLiveStreamsSingle(query);
    const all = await Promise.all(keywords.map(kw => fetchLiveStreamsSingle(kw)));
    const seen = new Set();
    return all.flat().filter(ch => {
      if (seen.has(ch.videoId)) return false;
      seen.add(ch.videoId);
      return true;
    }).sort((a, b) => b.viewerCount - a.viewerCount);
  }
  return fetchLiveStreamsSingle(query);
}

async function fetchLiveStreamsSingle(query) {
  const searchUrl = `${API_BASE}/search?part=snippet&eventType=live&type=video&q=${encodeURIComponent(query)}&maxResults=20&key=${apiKey}&relevanceLanguage=ja&order=viewCount`;
  const res = await fetch(searchUrl);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || 'API Error');
  }
  const data = await res.json();
  if (!data.items?.length) return [];

  const videoIds = data.items.map(i => i.id.videoId).join(',');
  const statsRes = await fetch(
    `${API_BASE}/videos?part=liveStreamingDetails,snippet&id=${videoIds}&key=${apiKey}`
  );
  const statsData = await statsRes.json();

  return (statsData.items || []).map(item => ({
    videoId: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    thumbnail: item.snippet.thumbnails?.default?.url || '',
    viewerCount: parseInt(item.liveStreamingDetails?.concurrentViewers || '0'),
    url: `https://www.youtube.com/watch?v=${item.id}`,
    isTopic: false
  })).sort((a, b) => b.viewerCount - a.viewerCount);
}

// アコーディオンの開閉状態（セクションキーごとに管理）
const sectionCollapsed = {};

// ── Render ────────────────────────────────────────────
function renderChannels() {
  channelList.innerHTML = '';
  channelList.style.display = '';

  // トピックチャンネルごとにセクションを分けて描画
  topicChannels.forEach(topic => {
    const topicItems = channels.filter(ch => ch.isTopic && ch.topicChannelId === topic.channelId);
    const key = `topic:${topic.channelId}`;
    if (!(key in sectionCollapsed)) sectionCollapsed[key] = false;

    const header = makeAccordionHeader({
      label: `📌 ${topic.label || topic.channelId}`,
      count: topicItems.length,
      collapsed: sectionCollapsed[key],
      onToggle: () => {
        sectionCollapsed[key] = !sectionCollapsed[key];
        renderChannels();
      },
      onRemove: () => removeTopicChannel(topic.channelId)
    });
    channelList.appendChild(header);

    if (!sectionCollapsed[key]) {
      if (topicItems.length === 0) {
        // 配信なし行
        const div = document.createElement('div');
        div.className = 'channel-item';
        div.innerHTML = `
          <div class="channel-info" style="padding-left:4px">
            <div class="channel-name" style="color:var(--text-muted)">${escHtml(topic.label || topic.channelId)}</div>
            <div class="channel-meta"><span class="offline-badge">● 配信なし</span></div>
          </div>
        `;
        channelList.appendChild(div);
      } else {
        topicItems.forEach(ch => {
          const idx = channels.indexOf(ch);
          channelList.appendChild(makeChannelItem(ch, idx));
        });
      }
    }
  });

  // 検索結果セクション
  const searchItems = channels.filter(ch => !ch.isTopic);
  if (searchItems.length > 0 && lastQuery) {
    const key = 'search';
    if (!(key in sectionCollapsed)) sectionCollapsed[key] = false;

    const header = makeAccordionHeader({
      label: `🔍 「${lastQuery}」の検索結果`,
      count: searchItems.length,
      collapsed: sectionCollapsed[key],
      onToggle: () => {
        sectionCollapsed[key] = !sectionCollapsed[key];
        renderChannels();
      },
      onClear: clearSearch
    });
    channelList.appendChild(header);

    if (!sectionCollapsed[key]) {
      searchItems.forEach(ch => {
        const idx = channels.indexOf(ch);
        channelList.appendChild(makeChannelItem(ch, idx));
      });
    }
  }
}

function makeAccordionHeader({ label, count, collapsed, onToggle, onRemove, onClear }) {
  const div = document.createElement('div');
  div.className = 'section-header';
  div.style.cursor = 'pointer';

  const left = document.createElement('div');
  left.className = 'section-header-left';
  left.innerHTML = `
    <span style="font-size:9px;margin-right:2px">${collapsed ? '▶' : '▼'}</span>
    <span>${escHtml(label)}</span>
    <span class="section-count">${count}件</span>
  `;
  left.addEventListener('click', onToggle);
  div.appendChild(left);

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '4px';

  if (onRemove) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.style.cssText = 'font-size:10px;padding:2px 7px;opacity:0.7';
    btn.textContent = '✕ 解除';
    btn.addEventListener('click', e => { e.stopPropagation(); onRemove(); });
    right.appendChild(btn);
  }
  if (onClear) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.style.cssText = 'font-size:10px;padding:2px 7px;opacity:0.7';
    btn.textContent = '✕';
    btn.addEventListener('click', e => { e.stopPropagation(); onClear(); });
    right.appendChild(btn);
  }

  div.appendChild(right);
  return div;
}

function makeChannelItem(ch, idx) {
  const div = document.createElement('div');
  div.className = 'channel-item' + (idx === currentIndex ? ' playing' : '');

  const viewers = ch.viewerCount > 0
    ? (ch.viewerCount >= 1000 ? (ch.viewerCount / 1000).toFixed(1) + 'K' : ch.viewerCount) + ' 視聴中'
    : '';

  div.innerHTML = `
    <img class="channel-thumb" src="${ch.thumbnail}" onerror="this.src=''" />
    <div class="channel-info">
      <div class="channel-name">${escHtml(ch.channelTitle)}</div>
      <div class="channel-meta">
        <span class="live-badge">● LIVE</span>
        ${viewers ? `<span class="viewer-count">${viewers}</span>` : ''}
      </div>
    </div>
    <div class="channel-actions">
      <button class="btn btn-ghost btn-sm play-btn">▶</button>
    </div>
  `;

  div.querySelector('.play-btn').addEventListener('click', e => { e.stopPropagation(); playChannel(idx); });
  div.addEventListener('click', () => playChannel(idx));
  return div;
}

async function removeFavorite(channelId) {}

function clearSearch() {
  lastQuery = '';
  queryInput.value = '';
  chrome.storage.local.set({ lastQuery: '' });
  channels = channels.filter(ch => ch.isTopic);
  chrome.storage.local.set({ channels });
  if (currentIndex >= channels.length) {
    currentIndex = -1;
    chrome.storage.local.set({ currentIndex });
  }
  const hasAnythingToShow = channels.length > 0 || topicChannels.length > 0;
  if (hasAnythingToShow) {
    setEmpty(false);
    renderChannels();
    updateControls();
    updateNowPlaying();
  } else {
    setEmpty(true);
  }
}

// ── Playback ──────────────────────────────────────────
async function playChannel(idx) {
  if (idx < 0 || idx >= channels.length) return;
  currentIndex = idx;
  const ch = channels[idx];
  chrome.storage.local.set({ currentIndex });

  renderChannels();
  updateControls();
  updateNowPlaying();

  const youtubeTab = await findYouTubeTab();
  if (youtubeTab) {
    await chrome.tabs.update(youtubeTab.id, { url: ch.url, active: true });
  } else {
    await chrome.tabs.create({ url: ch.url });
  }

  chrome.runtime.sendMessage({
    type: 'START_MONITORING',
    channel: ch, autoHop, jumpToLive, channels, currentIndex
  });

  updateStatus(true, ch.channelTitle);
  showToast(`▶ ${ch.channelTitle}`, 'success');
}

async function findYouTubeTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' });
  return tabs[0] || null;
}

// ── Prev / Next / Refresh ─────────────────────────────
prevBtn.addEventListener('click', () => { if (currentIndex > 0) playChannel(currentIndex - 1); });
nextBtn.addEventListener('click', () => { playChannel((currentIndex + 1) % channels.length); });
refreshBtn.addEventListener('click', async () => {
  await buildMergedList(lastQuery);
  showToast('更新しました', 'success');
});

// ── Toggles ───────────────────────────────────────────
autoHopToggle.addEventListener('click', () => {
  autoHop = !autoHop;
  autoHopToggle.classList.toggle('on', autoHop);
  chrome.storage.local.set({ autoHop });
  chrome.runtime.sendMessage({ type: 'SET_AUTOHOP', autoHop });
  showToast(autoHop ? '自動切り替え: ON' : '自動切り替え: OFF');
});
jumpToLiveToggle.addEventListener('click', () => {
  jumpToLive = !jumpToLive;
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  chrome.storage.local.set({ jumpToLive });
  chrome.runtime.sendMessage({ type: 'SET_JUMP_TO_LIVE', jumpToLive });
  showToast(jumpToLive ? '最新位置から再生: ON' : '最新位置から再生: OFF');
});

// ── Background messages ───────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CHANNEL_HOPPED') {
    currentIndex = msg.currentIndex;
    channels = msg.channels;
    chrome.storage.local.set({ currentIndex });
    renderChannels(); updateControls(); updateNowPlaying();
    updateStatus(true, channels[currentIndex]?.channelTitle);
  }
  if (msg.type === 'LIVE_ENDED_NO_NEXT') {
    updateStatus(false);
    showToast('すべての配信が終了しました');
  }
});

// ── UI helpers ────────────────────────────────────────
function updateControls() {
  prevBtn.disabled = currentIndex <= 0 || channels.length === 0;
  nextBtn.disabled = channels.length === 0;
}
function updateNowPlaying() {
  if (currentIndex >= 0 && channels[currentIndex]) {
    nowPlaying.classList.add('visible');
    npTitle.textContent = channels[currentIndex].title;
  } else {
    nowPlaying.classList.remove('visible');
  }
}
function updateStatus(active) {
  statusPill.classList.toggle('active', active);
  statusText.textContent = active ? '再生中' : '待機中';
}
function setLoading(on) {
  loading.classList.toggle('visible', on);
  if (on) channelList.style.display = 'none';
  searchBtn.disabled = on;
}
function setEmpty(on) {
  empty.classList.toggle('visible', on);
  if (on) channelList.style.display = 'none';
}
let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
