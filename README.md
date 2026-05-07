# wellness-mcp

SwitchBot 温湿度センサーと Oura リングのデータを Cloudflare Workers + D1 で収集し、
claude.ai のカスタムコネクタ経由で健康データを自然言語で照会できるようにする MCP サーバー。

## 概要

```
claude.ai
   │  Bearer token (MCP_AUTH_TOKEN)
   ▼
Cloudflare Worker (wellness-mcp)
   │  GET /health          — ヘルスチェック
   │  GET /oura/auth       — Oura OAuth フロー開始
   │  GET /oura/callback   — Oura OAuth コールバック
   │  ALL /mcp/*           — MCP Streamable HTTP (7 ツール)
   │  GET /privacy         — プライバシーポリシー
   │  GET /terms           — 利用規約
   │
   ├─ Oura API v2          — sleep / readiness / activity / heartrate
   ├─ SwitchBot API v1.1   — 温度・湿度・バッテリー
   └─ D1 (sensor-history)  — 10 分毎に蓄積されるセンサー履歴
        ▲
   cron (*/10 * * * *)
```

---

## 初回セットアップ手順

ブラウザ操作だけで完結します。CLI ツールは不要です。

### a. Cloudflare で D1 データベースを作成する

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン
2. 左メニュー **Storage & Databases → D1 SQL Database** を開く
3. **Create** → Name: `sensor-history` → **Create** を押す
4. 作成後の画面に表示される **Database ID** をコピーしておく

### b. Cloudflare API Token を発行する

1. 右上アカウントアイコン → **My Profile → API Tokens → Create Token**
2. **Edit Cloudflare Workers** テンプレートを選んで **Use template**
3. Account Resources・Zone Resources はデフォルトのまま **Continue to summary → Create Token**
4. 表示されたトークンをコピー（再表示不可）

### c. Cloudflare Account ID を控える

ダッシュボード右サイドバー、または **Workers & Pages** 画面右上に表示される
32 桁の **Account ID** をコピーする。

### d. このリポジトリを Fork する

GitHub 上で **Fork** を押してコピーを作る。
（clone して別リポジトリに push でも可）

### e. GitHub Secrets を登録する

Fork 先リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で 2 つ登録:

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | b で発行したトークン |
| `CLOUDFLARE_ACCOUNT_ID` | c で控えた Account ID |

### f. `wrangler.toml` を書き換えて push する

リポジトリ内の `wrangler.toml` を開き、`database_id` を a でコピーした値に書き換える:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sensor-history"
database_id = "ここを自分の Database ID に置き換える"
```

`main` ブランチに push すると GitHub Actions が自動で以下を実行する:

1. `npm test`
2. D1 マイグレーション（`sensor_readings` / `oauth_tokens` テーブルを作成）
3. Worker デプロイ

Actions タブで **Deploy** ジョブが ✅ になるまで待つ（初回は 1〜2 分）。

### g. Worker の URL を確認する

**Workers & Pages → wellness-mcp** を開く。
`https://wellness-mcp.<サブドメイン>.workers.dev` 形式の URL が表示される。
`/health` にアクセスして `{"ok":true}` が返れば正常起動。

### h. Worker Secrets を登録する

**Workers & Pages → wellness-mcp → Settings → Variables and Secrets**
**Add** ボタンから下記 5 つを **Type: Secret** で登録する。

| Secret 名 | 取得方法 |
|-----------|---------|
| `OURA_CLIENT_ID` | 後述の「Oura アプリ登録」で発行する Client ID |
| `OURA_CLIENT_SECRET` | 同 Client Secret |
| `SWITCHBOT_TOKEN` | SwitchBot アプリ → **Profile → Preferences → About** を **10 回連続タップ** → **Developer Options** → Token |
| `SWITCHBOT_SECRET` | 同 Client Secret |
| `MCP_AUTH_TOKEN` | [random.org/strings](https://www.random.org/strings/) などで 64 文字のランダム文字列を生成 |

登録後、**Deployments タブ → 最新のデプロイ → ⋯ → Redeploy** でリデプロイして Secrets を有効化する。

> **SwitchBot 注意**: API で取得できるのは SwitchBot Cloud に登録済みのデバイスのみ。
> ハブ経由でない単体 Bluetooth デバイスはデータを取得できない場合がある。
> アプリの **Cloud Services** 設定で対象デバイスのクラウド同期が有効か確認すること。

### i. Oura アプリを登録して OAuth 認証を通す

Oura API v2 は OAuth 2.0 Authorization Code フローを使う。

**アプリ登録**

1. [Oura Cloud Developer Portal](https://cloud.ouraring.com/oauth/applications) を開く
2. **Create New Application** を押す
3. 以下を入力:
   - **Redirect URIs**: `https://wellness-mcp.<サブドメイン>.workers.dev/oura/callback`
     （g で確認した Worker URL の末尾に `/oura/callback` を付けた値）
   - **Privacy Policy URL**: `https://wellness-mcp.<サブドメイン>.workers.dev/privacy`
   - **Terms of Service URL**: `https://wellness-mcp.<サブドメイン>.workers.dev/terms`
4. 保存後に表示される **Client ID** と **Client Secret** を h で登録する

**OAuth 認証の実行**

h の Secrets 登録とリデプロイが完了したら、ブラウザで以下の URL を開く:

```
https://wellness-mcp.<サブドメイン>.workers.dev/oura/auth?token=<MCP_AUTH_TOKEN の値>
```

Oura の認可画面にリダイレクトされるので **Allow** を押す。
「Oura connected!」と表示されれば認証完了。以後は自動でトークンが更新される。

### j. claude.ai にカスタムコネクタとして登録する

1. [claude.ai](https://claude.ai/) にログイン
2. 左サイドバー → **Settings → Integrations**（または **Connectors**）を開く
3. **Add integration**（または **Add custom connector**）を押す
4. 以下を入力:
   - **Name**: `wellness-mcp`（任意）
   - **URL**: `https://wellness-mcp.<サブドメイン>.workers.dev/mcp`
5. **ADVANCED SETTINGS** を開き、以下を入力:
   - **OAuth ID** （または **Client ID**）: `wellness-mcp`（任意の文字列）
   - **OAuth Secret** （または **Client Secret**）: `MCP_AUTH_TOKEN` に設定した値
6. 保存後、新しいチャットを開いてチャット下部の **+** → Connectors から `wellness-mcp` を有効にする

> **認証の仕組み**: claude.ai は OAuth 2.1 + PKCE の Authorization Code フローを使う。
> Worker は `/.well-known/oauth-authorization-server` でメタデータを返し、
> `/authorize` で自動承認のコードを発行、`/oauth/token` で
> `client_secret == MCP_AUTH_TOKEN` を確認した上で Bearer トークンを発行する。
> （Bearer トークンの実体は `MCP_AUTH_TOKEN` 自身で、`/mcp` 側はその一致を検証する）

> **⚠️ UI 注意**: claude.ai のメニュー名は変更される場合がある。
> 「Integrations」「Connectors」「MCP Servers」のいずれかのタブを探すこと。

---

## 日常運用

すべて Cloudflare ダッシュボードで完結。CLI 不要。

### ログを確認する

**Workers & Pages → wellness-mcp → Logs → Begin log stream**

### D1 の蓄積データを確認する

**Storage & Databases → D1 SQL Database → sensor-history → Console**

```sql
-- 最新 10 件
SELECT * FROM sensor_readings ORDER BY recorded_at DESC LIMIT 10;

-- デバイス別の直近平均温湿度
SELECT device_name,
       ROUND(AVG(temperature), 1) AS avg_temp,
       ROUND(AVG(humidity), 1)    AS avg_hum
FROM   sensor_readings
WHERE  recorded_at >= strftime('%s', 'now', '-24 hours')
GROUP  BY device_name;

-- Oura トークンの有効期限確認
SELECT provider,
       datetime(expires_at, 'unixepoch', 'localtime') AS expires
FROM   oauth_tokens;
```

### Cron を手動実行する

**Workers & Pages → wellness-mcp → Triggers → Cron Triggers → Run**
（デプロイ直後の動作確認や、データが蓄積されているかのチェックに使う）

### Oura トークンを再認証する

トークンが失効した場合や「Oura is not connected」エラーが出た場合は、
ブラウザで `/oura/auth?token=<MCP_AUTH_TOKEN>` を再度開いて認証し直す。

### Secret を更新する

**Workers → wellness-mcp → Settings → Variables and Secrets** から上書き後、リデプロイ。

### ロールバックする

**Workers → wellness-mcp → Deployments** タブで過去バージョンの **⋯ → Rollback** を押す。

---

## トラブルシューティング

| 症状 | 確認・対処 |
|------|-----------|
| **claude.ai が 401 を返す** | claude.ai 側の Bearer token と `MCP_AUTH_TOKEN` の値が一致しているか確認。コピー漏れ・末尾スペースに注意 |
| **「Oura is not connected」エラー** | `/oura/auth?token=…` を開いて OAuth 認証を完了させる |
| **Oura の認証が通らない（redirect_uri mismatch）** | Oura アプリの Redirect URI 設定と Worker URL が完全一致しているか確認。末尾スラッシュの有無も要注意 |
| **claude.ai が 500 を返す** | Logs でスタックトレースを確認。`env.XXX is undefined` なら Worker Secret の登録漏れ |
| **cron が動かない** | Triggers タブで Cron Triggers が有効か確認 → 手動 Run → SwitchBot の Cloud Services が有効か確認 |
| **SwitchBot のデータが空** | `list_switchbot_devices` ツールを claude.ai から呼んでデバイスが返るか確認。Bluetooth 単体デバイスはハブ経由が必要 |
| **claude.ai で「データが取れない」** | チャット下部 **+** → Connectors で `wellness-mcp` が有効になっているか確認。新規チャットを開いて再試行 |
| **GitHub Actions が失敗する** | Actions タブでエラーを確認。`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` の Secrets 登録漏れが多い |

---

## claude.ai での使用例

チャットで wellness-mcp を有効にした状態で、以下のような質問が使える。

- 「最近の睡眠スコアと寝室の温度を教えて」
- 「過去 24 時間で寝室が一番寒かった時間帯は? その時の HRV は?」
- 「先週の readiness スコアの推移を見せて」
- 「今日の体温偏差と昨晩の室温を比較して何か言える?」
- 「過去 3 日間の睡眠を振り返って、気になる点を挙げて」

---

## 拡張のヒント

| やりたいこと | 追加・変更箇所 |
|-------------|--------------|
| 他の SwitchBot デバイス追加（プラグ・カーテン等） | `src/scheduled.ts` のフィルタ条件を変更、`src/db/queries.ts` にテーブル追加 |
| Oura メトリクス追加（VO2max・ストレス・SpO2） | `src/oura/client.ts` にエンドポイント追加、`src/mcp/server.ts` にツール登録 |
| 週間サマリービューを MCP ツールに追加 | `src/mcp/server.ts` に集計クエリを呼ぶツールを追加 |
| 複数ユーザー対応 | D1 テーブルに `user_id` カラム追加、認証を拡張 |
