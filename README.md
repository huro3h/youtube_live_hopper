# YouTubeLiveHopper

YouTube Liveの配信ページにアクセスすると、自動で配信の最新位置（ライブヘッド）へシークするChrome拡張機能です。

拡張機能の作者(@huro3h)はゲームのLive配信を流しっぱなしにしながら同じゲームをすることが多いですが、リンクや検索結果から配信を開くたびに手動でライブの最新位置までシークバーを動かすのが面倒と感じたのがモチベーションです。

Chrome Web Storeには公開していないため、手動でインストールして使用してください。

---

## インストール

```bash
git clone git@github.com:huro3h/youtube_live_hopper.git
```

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. クローンしたフォルダを選択

---

## 使い方

インストールするだけで動作します。ライブ配信中の動画ページ（`youtube.com/watch?v=...` または `youtube.com/live/...`）にアクセスすると、自動で配信の最新位置までシークします。

Chromeツールバーの YouTubeLiveHopper アイコンをクリックすると、以下の設定を切り替えられます。

| 設定 | 説明 |
|------|------|
| ⚡ 常に最新位置から再生 | OFFにすると自動シークを無効化できます（追っかけ再生をしたい場合など） |

---

## 仕組み

1. `content.js` がYouTubeの動画ページに注入される
2. 動画ページ（`/watch` または `/live/`）へのアクセス・SPA遷移（`yt-navigate-finish`）を検知
3. プレーヤーに `.ytp-live-badge`（ライブバッジ）が表示されるまで待機（配信中でない動画では何もしない）
4. ライブバッジのクリックとプレーヤーAPI（`seekToLiveHead()`）の両方で最新位置へシーク

---

## ファイル構成

```
YouTubeLiveHopper/
├── manifest.json     # 拡張機能の設定（Manifest V3）
├── popup.html        # ポップアップUI（設定トグルのみ）
├── popup.js          # ポップアップのロジック
├── content.js        # YouTubeページ内スクリプト（ライブヘッドへの自動シーク）
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## トラブルシューティング
(この拡張機能は永遠にWIPです)

**自動で最新位置に移動しない**
YouTubeのプレーヤーのDOM構造が変更された場合、シーク処理が機能しなくなることがあります。その場合はお手数ですが手動でシークバーを操作してください。

**Windows、Linuxで動きますか？、BraveやEdgeでも動きますか？**
Mac、Chrome以外は動作未検証です。動かない場合は自力で何とかしてもらうかこのリポジトリごと生成AIに丸投げして聞いて下さい

---

## 動作確認済み環境

- macOS Sequoia 15.7.2（24G325） / Chrome 148 以降

---

## Notes

個人利用・非商用を目的として作成したツールです。YouTube側の非公式な内部API（`seekToLiveHead()`）に依存している部分があり、YouTubeの仕様変更により予告なく動作しなくなる可能性があります。問題が生じた場合は公開を取り下げることがあります。利用は自己責任でお願いします。

---

## License

MIT
