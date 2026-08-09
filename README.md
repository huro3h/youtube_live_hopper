# YouTubeLiveHopper

YouTube Liveの配信ページにアクセスすると、自動で配信の最新位置（ライブヘッド）へシークするChrome拡張機能です。あわせて概要欄の「◯時間前にライブ配信開始」の右隣に「（開始からhh:mm:ss経過）」を並べて表示し、配信の経過時間をリアルタイム表示します。

拡張機能の作者(@huro3h)はゲームのLive配信を流しっぱなしにしながら同じゲームをすることが多いですが、リンクや検索結果から配信を開くたびに手動でライブの最新位置までシークバーを動かすのが面倒と感じたのがモチベーションです。また長時間流し見するので、配信の経過時間が一目でわかると便利だと思いこの機能を足しました。

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

インストールするだけで動作します。ライブ配信中の動画ページ（`youtube.com/watch?v=...` または `youtube.com/live/...`）にアクセスすると、自動で配信の最新位置までシークし、概要欄の「◯時間前にライブ配信開始」の右隣に「（開始からhh:mm:ss経過）」が並んで毎秒更新されます。

Chromeツールバーの YouTubeLiveHopper アイコンをクリックすると、以下の設定を切り替えられます。

| 設定 | 説明 |
|------|------|
| ⚡ 常に最新位置から再生 | OFFにすると自動シークを無効化できます（追っかけ再生をしたい場合など） |

※経過時間の表示は常時ONです（トグルは自動シークのみを制御します）。

---

## 仕組み

**自動シーク（`content.js` / ISOLATED world）**

1. 動画ページ（`/watch` または `/live/`）へのアクセス・SPA遷移（`yt-navigate-finish`）を検知
2. プレーヤーに `.ytp-live-badge`（ライブバッジ）が表示されるまで待機（配信中でない動画では何もしない）
3. ライブバッジのクリックとプレーヤーAPI（`seekToLiveHead()`）の両方で最新位置へシーク

**経過時間の表示（`elapsed.js` / MAIN world）**

1. プレーヤーの `getPlayerResponse()`（フォールバックで `window.ytInitialPlayerResponse`）から配信開始時刻（`liveBroadcastDetails.startTimestamp`）を取得
2. 概要欄の「◯時間前にライブ配信開始」要素の右隣に自前の `<span>` を挿入し、`現在時刻 − 配信開始時刻` を `hh:mm:ss` にして「（開始から◯経過）」と表示、毎秒更新（既存テキストは書き換えないので再描画と点滅を取り合わない。YouTubeの再描画で自前要素が消えたり位置がずれたら、毎秒の更新時に入れ直す）
3. `getPlayerResponse()` 等のプレーヤーAPIはYouTubeのページスクリプト（MAIN world）が要素に付けるメソッドで、通常のコンテンツスクリプト（ISOLATED world）からは参照できないため、このスクリプトだけ `world: "MAIN"` で注入している

---

## ファイル構成

```
YouTubeLiveHopper/
├── manifest.json     # 拡張機能の設定（Manifest V3）
├── popup.html        # ポップアップUI（設定トグルのみ）
├── popup.js          # ポップアップのロジック
├── content.js        # 自動シーク（ISOLATED world）
├── elapsed.js        # 配信経過時間の表示（MAIN world）
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

**経過時間が表示されない・一瞬消える**
YouTubeの内部データ（`getPlayerResponse()` / `ytInitialPlayerResponse`）や概要欄のDOM構造が変更されると、この機能が動作しなくなることがあります。また再描画のタイミングで経過時間表示が一瞬消えたり位置がずれることがありますが、通常は1秒以内に復帰します。

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
