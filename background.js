// background.js — Service Worker

let state = {
  active: false,
  autoHop: true,
  jumpToLive: true,
  channels: [],
  currentIndex: -1,
  monitoringTabId: null,
  checkInterval: null,
  channelName: ''
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATUS':
      sendResponse({ active: state.active, channelName: state.channelName });
      break;
    case 'START_MONITORING':
      startMonitoring(msg.channel, msg.autoHop, msg.jumpToLive, msg.channels, msg.currentIndex);
      break;
    case 'SET_AUTOHOP':
      state.autoHop = msg.autoHop;
      break;
    case 'SET_JUMP_TO_LIVE':
      state.jumpToLive = msg.jumpToLive;
      break;
    case 'FETCH_TOPIC_LIVES':
      fetchTopicLives(msg.topicChannels, msg.apiKey)
        .then(result => sendResponse({ result }))
        .catch(() => sendResponse({ result: [] }));
      break;
    case 'LIVE_ENDED':
      if (state.autoHop) hopToNext();
      else { state.active = false; broadcastToPopup({ type: 'LIVE_ENDED_NO_NEXT' }); }
      break;
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === state.monitoringTabId && changeInfo.status === 'complete') {
    if (tab.url?.includes('youtube.com/watch')) {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          type: 'INIT_MONITOR',
          jumpToLive: state.jumpToLive
        }).catch(() => {});
      }, 2000);
    }
  }
});

async function startMonitoring(channel, autoHop, jumpToLive, channels, currentIndex) {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' });
  state.active = true;
  state.autoHop = autoHop;
  state.jumpToLive = jumpToLive;
  state.channels = channels;
  state.currentIndex = currentIndex;
  state.channelName = channel.channelTitle;
  state.monitoringTabId = tabs[0]?.id || null;

  clearInterval(state.checkInterval);
  if (autoHop) {
    state.checkInterval = setInterval(() => pollLiveStatus(channel.videoId), 60000);
  }
}

async function hopToNext() {
  clearInterval(state.checkInterval);

  // 遷移前にリストを最新化する
  const { apiKey, topicChannels, lastQuery } = await chrome.storage.local.get(['apiKey', 'topicChannels', 'lastQuery']);
  if (apiKey) {
    const [topicLives, searchResults] = await Promise.all([
      topicChannels?.length ? fetchTopicLives(topicChannels, apiKey) : Promise.resolve([]),
      lastQuery ? fetchLiveStreamsSingle(lastQuery, apiKey) : Promise.resolve([])
    ]);
    const topicIds = new Set(topicLives.map(v => v.videoId));
    const merged = [...topicLives, ...searchResults.filter(v => !topicIds.has(v.videoId))];
    if (merged.length > 0) {
      state.channels = merged;
      await chrome.storage.local.set({ channels: merged });
    }
  }

  const next = state.currentIndex + 1;
  if (next >= state.channels.length) {
    state.active = false;
    broadcastToPopup({ type: 'LIVE_ENDED_NO_NEXT' });
    return;
  }

  state.currentIndex = next;
  const ch = state.channels[next];
  state.channelName = ch.channelTitle;

  if (state.monitoringTabId) {
    await chrome.tabs.update(state.monitoringTabId, { url: ch.url }).catch(async () => {
      const tab = await chrome.tabs.create({ url: ch.url });
      state.monitoringTabId = tab.id;
    });
  } else {
    const tab = await chrome.tabs.create({ url: ch.url });
    state.monitoringTabId = tab.id;
  }

  state.checkInterval = setInterval(() => pollLiveStatus(ch.videoId), 60000);
  broadcastToPopup({ type: 'CHANNEL_HOPPED', currentIndex: state.currentIndex, channels: state.channels });
}

// Data APIで配信状態をポーリング（終了検知のフォールバック）
async function pollLiveStatus(videoId) {
  if (!videoId) return;
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) return;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    );
    const data = await res.json();
    const item = data.items?.[0];
    if (!item || ['none', 'completed'].includes(item.snippet?.liveBroadcastContent)) {
      if (state.autoHop) hopToNext();
    }
  } catch {}
}

// キーワード検索（background.jsから呼び出し用）
async function fetchLiveStreamsSingle(query, apiKey) {
  const API_BASE = 'https://www.googleapis.com/youtube/v3';
  try {
    const searchUrl = `${API_BASE}/search?part=snippet&eventType=live&type=video&q=${encodeURIComponent(query)}&maxResults=20&key=${apiKey}&relevanceLanguage=ja&order=viewCount`;
    const res = await fetch(searchUrl);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items?.length) return [];

    const videoIds = data.items.map(i => i.id.videoId).join(',');
    const statsRes = await fetch(
      `${API_BASE}/videos?part=liveStreamingDetails,snippet&id=${videoIds}&key=${apiKey}`
    );
    const statsData = await statsRes.json();

    return (statsData.items || [])
      .filter(item => item.snippet?.liveBroadcastContent === 'live')
      .map(item => ({
        videoId: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        channelId: item.snippet.channelId,
        thumbnail: item.snippet.thumbnails?.default?.url || '',
        viewerCount: parseInt(item.liveStreamingDetails?.concurrentViewers || '0'),
        actualStartTime: item.liveStreamingDetails?.actualStartTime || null,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        isTopic: false
      })).sort((a, b) => b.viewerCount - a.viewerCount);
  } catch { return []; }
}

// トピックの /live ページHTMLからytInitialDataを取得
async function fetchTopicLives(topicChannels, apiKey) {
  const API_BASE = 'https://www.googleapis.com/youtube/v3';
  const allVideos = [];

  await Promise.all(topicChannels.map(async (topic) => {
    try {
      // /live ページのHTMLを直接fetch（background.jsはCookieを持たないがytInitialDataは取得可能）
      const res = await fetch(
        `https://www.youtube.com/channel/${topic.channelId}/live`,
        {
          headers: {
            'Accept-Language': 'ja,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }
      );
      const html = await res.text();

      // ytInitialDataをHTMLから抽出
      const match = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s);
      if (!match) return;

      const data = JSON.parse(match[1]);
      const seen = new Set();
      const videoIds = [];
      JSON.stringify(data, (key, val) => {
        if (key === 'videoId' && typeof val === 'string' && !seen.has(val)) {
          seen.add(val); videoIds.push(val);
        }
        return val;
      });

      if (!videoIds.length) return;

      // Data APIで視聴者数・ライブ状態を確認（50件ずつ分割）
      const allItems = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const statsRes = await fetch(
          `${API_BASE}/videos?part=liveStreamingDetails,snippet&id=${videoIds.slice(i, i + 50).join(',')}&key=${apiKey}`
        );
        const statsData = await statsRes.json();
        allItems.push(...(statsData.items || []));
      }

      allItems.forEach(item => {
        if (item.snippet?.liveBroadcastContent !== 'live') return;
        allVideos.push({
          videoId: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          thumbnail: item.snippet.thumbnails?.default?.url || '',
          viewerCount: parseInt(item.liveStreamingDetails?.concurrentViewers || '0'),
          actualStartTime: item.liveStreamingDetails?.actualStartTime || null,
          url: `https://www.youtube.com/watch?v=${item.id}`,
          isTopic: true,
          topicChannelId: topic.channelId
        });
      });
    } catch(e) {
      console.warn('[LiveHopper] fetchTopicLives error:', topic.channelId, e.message);
    }
  }));

  return allVideos.sort((a, b) => b.viewerCount - a.viewerCount);
}

async function broadcastToPopup(msg) {
  try { await chrome.runtime.sendMessage(msg); } catch {}
}
