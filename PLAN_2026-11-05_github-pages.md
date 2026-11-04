# 計画: 音の池を GitHub Pages で公開する（2026-11-05）

## 目的
- 1 枚の HTML で作った「音の池」（しずくの波紋で石を鳴らす音のおもちゃ）を git で管理する。
- GitHub の公開リポジトリ `makamaika/oto-no-ike` を作り、GitHub Pages で公開する。
- 公開 URL（予定）: https://makamaika.github.io/oto-no-ike/

## 変更するファイルと内容

| ファイル | 内容 |
| --- | --- |
| `docs/index.html` | ルートの `index.html` を移す。CSS と JS を外部ファイルに分け、CSP の meta タグとファビコンを追加する |
| `docs/style.css` | 元の `<style>` の中身 |
| `docs/app.js` | 元の `<script>` の中身 |
| `docs/favicon.svg` | 波紋と石のアイコン（新規） |
| `docs/.nojekyll` | Pages の Jekyll 処理を止める空ファイル |
| `README.md` | 概要・遊び方・公開 URL・ローカルでの確認方法 |
| `.gitignore` | `.env*`、`node_modules`、DB ファイル、OS やエディターの一時ファイル、`.claude/` を除外 |
| `.gitattributes` | 改行コードを LF にそろえる |
| `PLAN_2026-11-05_github-pages.md` | この計画。完了後に結果を追記する |

サイトを `docs/` に置き、Pages は main ブランチの `/docs` だけを公開する。README や計画ファイルはサイトとしては配信されない。

### CSP
GitHub Pages ではレスポンスヘッダーを設定できないため、meta タグで次を指定する。外部への通信やインラインスクリプトは使っていないので、自分のオリジンのファイルだけを許可する。

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'
```

## 手順
1. この計画を保存する
2. `git init -b main`。作者情報はこのリポジトリだけに設定する（名前 `makamaika`、GitHub の非公開用アドレス）。PC 全体の git 設定は変えない
3. `.gitignore` と `.gitattributes` を作る
4. `index.html` を `docs/` に移し、CSS と JS を分けて CSP を設定する。ファビコンと `.nojekyll` を追加する
5. README を作る
6. ローカルで表示と動作を確認する（127.0.0.1 の一時サーバー。確認後に停止）
7. 初回コミット
8. `gh repo create makamaika/oto-no-ike --public` でリポジトリを作り、main をプッシュする
9. Pages を有効にする（main ブランチの `/docs`）
10. Pages のビルド完了を待ち、公開 URL で表示と動作を確認する
11. この計画に結果を追記し、コミットしてプッシュする

## 検証方法
- ローカル: CSP 違反を含むコンソールエラーがないこと。しずく・連鎖・石の移動・追加・削除・保存が動くこと。スマホ幅でレイアウトが崩れないこと
- 公開後: Pages のビルドが成功し、公開 URL で同じ確認ができること

## 影響範囲と戻し方
- 影響するのは、このフォルダーと GitHub の `makamaika/oto-no-ike` だけ。ほかのプロジェクトや PC 全体の設定は変えない
- 公開をやめるとき: `gh api -X DELETE repos/makamaika/oto-no-ike/pages` で Pages を無効にする。リポジトリごと消すときは GitHub のリポジトリ設定から削除する
- ローカルの変更は git で戻せる

## 結果（2026-11-05）

### 実施内容
- `git init -b main`。作者情報はリポジトリだけに設定した（`makamaika` / GitHub の非公開用アドレス）。PC 全体の git 設定は変えていない
- `index.html` を `docs/index.html`・`docs/style.css`・`docs/app.js` に分け、CSP の meta タグ、`favicon.svg`、`.nojekyll` を追加した
- 確認中に見つけた点を 1 つ直した。石の連打防止（80ms）の時刻比較を絶対値にした。確認用の `simulate()` で時刻が先に進むと、石をタップしても鳴らなくなっていたため
- README、`.gitignore`、`.gitattributes` を追加した
- 初回コミット `4d5969c` を作り、公開リポジトリ https://github.com/makamaika/oto-no-ike を作ってプッシュした
- Pages を有効にした（main ブランチの `/docs`、build_type は legacy、HTTPS は強制）

### 検証結果
- ローカル（127.0.0.1 の一時サーバー。確認後に停止）
  - CSP が効き、インラインスクリプトはブロックされた
  - 自分のサイトの CSS・JS・ファビコンは読み込まれた
  - しずくの連鎖（1 滴で約 30 回鳴る）、石のドラッグで音が変わる、石の追加・削除・タップ、雨・消音・初期配置、保存が動いた
- 公開後
  - Pages のビルド（pages build and deployment）は成功した
  - https://makamaika.github.io/oto-no-ike/ で同じ操作が動き、コンソールのエラーは 0 件だった
  - `favicon.svg` は 200 だった。`README.md`・計画ファイル・`.gitignore` は 404 で、サイトとしては配信されていない

### 残課題・メモ
- 音そのものは耳で確認していない（自動の確認では鳴った回数だけを数えた）
- ウィンドウのサイズを変えると、Canvas の `getImageData` について性能の警告がコンソールに出ることがある（エラーではない）
- 動作確認用の `window.__pond` を残している。不要なら `docs/app.js` の末尾から削除できる
- ライセンスはまだ付けていない
- プロジェクト用の AGENTS.md はまだない
- 内蔵ブラウザのプレビュー（`preview_start`）が移動前のフォルダーの設定を読んだため、ローカルの確認は自分で起動した一時サーバーで行った。そのとき作った `.claude/launch.json` は削除した
