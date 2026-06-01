繁體中文 | [English](./README.md)

# Portaly Skills

[Portaly](https://portaly.cc) 創作者專用的 AI Agent Skill 集合。透過 AI Agent 將 Portaly 服務 — 分析、支付、用戶管理 — 整合到任何專案中。

## 安裝

```bash
# 安裝全部
npx skills add portaly-ai/portaly-skills

# 安裝單一 skill
npx skills add portaly-ai/portaly-skills --skill portaly-analytics
```

## 更新

```bash
# 更新所有已安裝的 skill 到最新版
npx skills update

# 更新單一 skill
npx skills update portaly-analytics
```

## Skills 一覽

| Skill | 說明 | 觸發關鍵字 |
|-------|------|-----------|
| **portaly-analytics** | GA4 分析安裝、Portaly 事件追蹤、儀表板連結 | `GA4`、`Google Analytics`、`事件追蹤` |
| **portaly-payment** | Portaly Vibe 託管結帳、訂閱方案、單次購買、動態金額定價、優惠碼、callback 驗證 | `Portaly Vibe 支付`、`訂閱`、`結帳`、`優惠碼`、`單次購買`、`動態定價`、`贊助` |
| **portaly-product** | 從你 vibe-coded 的網站賣創作者的 Portaly 數位商品 — 商品列表 API、單品或 bundle checkout session、託管結帳 + 寄信、簽章 webhook | `Portaly 數位商品`、`bundle 結帳`、`商品 API` |
| **portaly-user** | 用戶同步至 Portaly Vibe — 全量遷移、增量同步、Dashboard 查看 | `用戶同步`、`member sync`、`用戶管理` |
| **portaly-sentry** | Portaly Vibe 支付串接的安全與可靠性健康檢查，可回報結果到 Vibe 儀表板 | `Portaly 健康檢查`、`sentry 掃描`、`金流安全審計` |
| **portaly-email** | 將 Invitation Email 註冊連結導向 Portaly 託管 CTA（零設定）或 vibe coder 自架的 waitlist 落地頁 | `Invitation Email`、`Waitlist 落地頁`、`app base URL` |

## Portaly Analytics Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-analytics
```

協助創作者在網站安裝 Google Analytics 4，並連結到 Portaly 後台查看分析數據。

- 支援 Next.js（App Router / Pages Router）、React SPA、純 HTML 的 GA4 安裝
- 5 個 Portaly 標準事件 + GA4 電商事件對應
- Portaly 後台 GA 授權連結流程

**前置條件：** Google Analytics 4 帳號與 Measurement ID（`G-XXXXXXX`），以及 Portaly 帳號。

**Skill 觸發條件：**
- 「幫我在網站安裝 Google Analytics」
- 「我想追蹤 Portaly 結帳事件」
- 「幫我串接 GA4 到我的 Next.js 專案」
- 「我想在 Portaly 後台看到網站分析數據」
- 「幫我把 Google Analytics 連結到 Portaly」

## Portaly Vibe Payment Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

協助串接 Portaly Vibe 託管支付結帳，包含商家設定、訂閱方案、結帳 session 與 callback 驗證。

- 透過 API 建立商家設定與訂閱方案
- 託管結帳 session 流程
- 固定價格方案（`monthly` 訂閱）與**動態定價方案（dynamic plan）**：適用於單次購買、贊助，或任何金額需要由買家或系統動態決定的場景；實際金額於每次建立結帳 session 時傳入
- 優惠碼（Discount Code）— 支援定額／折扣百分比／免費，可重複 N 期或永久，亦可作為註冊推薦碼於結帳時自動套用
- HMAC-SHA256 callback 簽章驗證
- 訂閱生命週期管理（取消 / 恢復）
- 訂閱者自助入口（Self-Service Portal）

> ⚠️ **年訂閱方案暫時停用。** 目前無法建立或結帳 `yearly` 方案，針對年訂閱方案的優惠碼規則也會被擋下——請改用 `monthly` 或 `one-time` 方案。

**前置條件：** Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。至 [Portaly Vibe Dashboard](https://portaly.ai/dashboard) 申請。

**Skill 觸發條件：**
- 「幫我在 Portaly Vibe 上新增一個訂閱商品」
- 「幫我串接 Portaly Vibe 的支付功能」
- 「我要使用 Portaly Vibe 的支付 API」
- 「請協助我整合 Portaly Vibe 的支付功能」
- 「幫我在 Portaly Vibe 建立優惠碼」
- 「在 Portaly Vibe 加上單次購買或自訂金額的結帳流程」
- 「在 Portaly Vibe 加上贊助功能」

## Portaly Digital Products Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-product
```

協助 vibe coder 在自家網站上販售創作者的 Portaly 數位商品 — 商品展示 UI 由你掌控，Portaly 負責結帳、金流、寄信與訂單成功頁。

- 透過 API 取得創作者商品並在自家網站渲染（價格一律讀 `effectivePrice`）
- 單品或自訂 bundle checkout session，跳轉到 Portaly 託管結帳頁
- Bundle 採原價比例拆價，每筆商品在 Portaly 端各自獨立成單
- HMAC-SHA256 webhook 簽章驗證（timestamp 5 分鐘有效）
- Per-order 事件：`digital_product.checkout.completed`、`digital_product.order.refunded`
- 託管寄信 — 每筆付費訂單一封確認信，免費商品跳過

**前置條件：** Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`），與 payment skill 共用。至 [Portaly Vibe Dashboard](https://portaly.ai/dashboard) 申請。

**Skill 觸發條件：**
- 「在我自己的網站上賣 Portaly 數位商品」
- 「幫我做 Portaly 商品的 bundle 結帳」
- 「在我的網站上列出創作者的下載/模板/課程」
- 「打造一個 powered by Portaly 的商店」
- 「設定 Portaly 數位商品的 webhook」

## Portaly User Management

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-user
```

協助 vibe coder 將應用程式的用戶資料同步到 Portaly Vibe，讓創作者在 Dashboard 查看完整的使用者與訂閱狀態。

- 全量同步：批次匯入既有用戶，支援分批與指數退避
- 增量同步：在註冊/更新/停用事件中以 fire-and-forget 模式自動同步
- Dashboard 可視化：`https://portaly.ai/dashboard/users`
- 同步紀錄：追蹤每次同步的成功/失敗狀態

**前置條件：** Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。至 [Portaly Vibe Dashboard](https://portaly.ai/dashboard) 申請。

**Skill 觸發條件：**
- 「幫我同步用戶到 Portaly Vibe」
- 「幫我把既有的會員資料遷移到 Portaly」
- 「幫我設定用戶增量同步」

## Portaly Sentry 健康檢查

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-sentry
```

在部署前對 Portaly Vibe 支付串接執行安全與可靠性稽核。搭配 `portaly-payment` 使用——以其 API 合約作為正確串接的 canonical 參考。

- 8 大類、合計 26 項檢查：簽章驗證、訂閱生命週期、Callback 端點、環境憑證、安全最佳實踐、Web 安全、依賴安全、資料處理
- 純靜態分析——不需要執行使用者的程式碼
- Read-only audit——絕不修改使用者程式碼
- 可選擇將掃描結果回報至 Vibe 儀表板 `https://portaly.ai/dashboard/sentry-scans`
- 支援手動執行與每週排程掃描

**前置條件：** 已安裝 `portaly-payment` skill（作為 canonical 參考）。選用：Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`），用來把結果回報到 Vibe 儀表板。

**Skill 觸發條件：**
- 「部署前幫我跑一次 Portaly 健康檢查」
- 「幫我稽核 Portaly 支付串接有沒有安全問題」
- 「掃描我的 Portaly callback 簽章驗證是否正確」
- 「我的 Portaly 串接可以安心上線嗎？」
- 「執行一次 Portaly sentry 掃描」

## Portaly Invitation Email Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-email
```

協助 vibe coder 把 Portaly Vibe 註冊邀請信件中的連結導向正確的落地頁 — 可選擇 Portaly 託管頁面（零開發）或在自己的網域上實作 `/waitlist/[creatorSlug]`（完全控制 UX）。

- Mode A — 直接嵌入 `https://portaly.ai/waitlist/{creatorSlug}` CTA，不用寫任何後端
- Mode B — 設定 `appBaseUrl` 並在自己的網域實作頁面；點擊追蹤仍走 Portaly
- Mode B 提供 Next.js、React SPA、純 HTML 三種範本
- 與 `portaly-user` 串接，把新訂閱者同步進創作者儀表板

**前置條件：** Portaly Vibe Payment API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。Mode B 需要一個可公開存取的 HTTPS 網域。

**Skill 觸發條件：**
- 「註冊信件的連結會導去哪裡？」
- 「我想把 waitlist 落地頁放在自己網站上」
- 「在 Hero 區塊放一個 Portaly waitlist CTA」
- 「設定 invitation email 的 app base URL」

## 串接到自己的 Server

這些 skill 預設指向 `https://portaly.ai`，直接安裝者不用設定。若 fork 後要串自架或相容後端，設定 `PORTALY_API_HOST` 即可——內建 script 與 Agent 產出的程式碼都會讀：

```bash
PORTALY_API_HOST=https://your-backend.example.com
```

後端相容契約見 [PROVIDER.md](./PROVIDER.md)。

## 從舊 Repo 遷移

如果你之前從獨立的 repository 安裝過 skill：

```bash
rm -rf ~/.claude/skills/portaly-analytics-skill
rm -rf ~/.claude/skills/portaly-payment-skill
npx skills add portaly-ai/portaly-skills --all -g
```

舊的 repository 已封存：
- `real-engine-tw/portaly-analytics-skill`（已封存）
- `real-engine-tw/portaly-payment-skill`（已封存）

## Windows 注意事項

在 Windows 環境使用支付相關 API 時，PowerShell 可能會有中文編碼問題。請先執行：

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
```

## 授權條款

MIT
