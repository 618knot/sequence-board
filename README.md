# Sequence Board

YAMLファイルで定義されたシーケンス図をステップごとに再生・説明表示できるWebアプリケーションです。

---

## 起動方法

本プロジェクトは Vite + TypeScript でビルドされています。パッケージマネージャーは `pnpm` を想定しています。

### 1. 依存パッケージのインストール
```bash
pnpm install
```

### 2. ローカル開発サーバーの起動
```bash
pnpm dev
```
起動後、ブラウザで [http://localhost:5173/](http://localhost:5173/) にアクセスしてください。

### 3. プロダクションビルドの生成
```bash
pnpm build
```
ビルド完了後、`dist` ディレクトリに配備用の静的ファイルが出力されます。

---

## YAML 定義ガイド

本アプリケーションに読み込ませる（またはYAMLエディタに貼り付ける）ファイルのスキーマ定義です。
単一のフロー定義のほか、`---` で区切って複数のフローを1つのファイルにまとめて定義し、タブで切り替えることができます。

### 単一フローの定義例

```yaml
title: "ユーザー認証フロー"
description: "ブラウザからのログインリクエストがAPIサーバーを経由してDBに至るフロー"

participants:
  - id: browser
    label: "Browser"
    icon: browser       # iconの種類: browser, person, server, database, cloud, mobile, service, queue
  - id: api
    label: "API Server"
    icon: server
  - id: db
    label: "Database"
    icon: database

steps:
  - from: browser
    to: api
    arrow: "->>"        # 矢印の種類 (詳細は後述)
    label: "POST /login"
    title: "ログインリクエスト"
    description: |
      ブラウザがAPIサーバーにHTTPS経由でPOSTリクエストを送ります。
      マークダウン表記がサポートされています。
```

### 複数フローの定義例 (`---` による複数ドキュメント連結)

```yaml
title: "ユーザー認証フロー"
participants:
  - id: browser
    label: "Browser"
    icon: browser
  - id: api
    label: "API Server"
    icon: server
steps:
  - from: browser
    to: api
    arrow: "->>"
    label: "POST /login"
---
title: "注文決済フロー"
participants:
  - id: browser
    label: "Browser"
    icon: browser
  - id: api
    label: "API Server"
    icon: server
steps:
  - from: browser
    to: api
    arrow: "->>"
    label: "POST /orders"
```

---

## パラメータ・仕様詳細

### 1. `participants` (参加者定義)
シーケンス図に登場するアクターを定義します。

* `id` (必須): 他のステップ定義から参照される一意のID
* `label` (任意): 図内に表示されるアクターの名前（省略時は `id` と同名）
* `icon` (任意): アクターの上部に表示されるアイコン。以下のキーワードがサポートされています。
  * `browser` : ブラウザ
  * `person` : 人（ユーザー）
  * `server` : サーバー
  * `database` : データベース
  * `cloud` : クラウド・外部API
  * `mobile` : モバイル端末
  * `service` : マイクロサービス・歯車
  * `queue` : メッセージキュー・バッファ

### 2. `steps` (手順定義)
シーケンスの各矢印（ステップ）を順番に定義します。

* `from` (必須): 送信元アクターの `id`
* `to` (必須): 送信先アクターの `id`
* `arrow` (必須): 矢印のスタイル表現。以下の8種類が指定可能です。
  * `->` : 実線矢印
  * `-->` : 点線矢印
  * `->>` : 実線三角矢印 (同期処理推奨)
  * `-->>` : 点線三角矢印 (同期レスポンス推奨)
  * `-x` : 実線バツ印 (非同期/切断など)
  * `--x` : 点線バツ印
  * `-)` : 実線半円矢印 (非同期)
  * `--)` : 点線半円矢印
* `label` (必須): 矢印の横・下に表示されるアクション名（旧 `message`）
* `title` (任意): ナビゲーションバー等で簡潔に表示されるステップのタイトル名（旧 `label`）
* `description` (任意): 右側説明パネルに表示される詳細テキスト。**Markdown表記**（太字、インラインコード、コードブロック、箇条書きリストなど）が使用可能です。

---

## 特長機能

1. **インタラクティブな遷移**:
   - 画面下部のナビゲーションボタンやステップドットだけでなく、**シーケンス図内の任意の矢印行を直接クリック**してその手順へ瞬時に移動できます。
2. **フレキシブルなUI幅の調整**:
   - シーケンス図と右側説明パネルの間にあるスプリッター線をドラッグすることで、パネルの横幅（320px〜800px）を自由に調整可能です。
3. **滑らかなアニメーション演出**:
   - ステップを切り替えた際、関連するアクターや現在の手順（矢印、文字、シーケンス番号バッジ）が滑らかにブルーにフェードインします。
   - 連続してアクティブなアクターは、アニメーションのちらつき（flicker）なく状態を維持する最適化が施されています。
