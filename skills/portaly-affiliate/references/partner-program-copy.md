# Publishable copy for the creator's own site

Ready-to-adapt 正體中文 text explaining the program to buyers. The creator owns the wording.

**Payout conditions are not copied into this page.** They are stated in Portaly Rewards, where the promoter goes to see their earnings and withdraw; a second copy on the creator's site goes stale and turns a Portaly rule into the creator's support burden. Link there instead — and never write the conditions from memory.

Replace `{商品名稱}`, `{比例}`, `{計算基數}` and `{金額}` with real values. Never leave a placeholder in published copy.

`{計算基數}` and `{金額}` are a pair, and neither is simply copied out of `GET /promotion`: `plans[].commissionAmount` is worked out at the plan's list price, so on a plan that an active discount code reaches it is a ceiling rather than the figure to publish. Take both from the base you established in the discount check in SKILL.md step 3.

The placeholder is called `{計算基數}`, not `{售價}`, and the copy below says 成交金額 rather than 售價 on purpose. On a plan an active discount reaches, the base is *below* the list price — publishing it under the label 售價 puts a price on the creator's page that contradicts the price on their own product page, which is worse than showing no figure at all. 成交金額 stays true either way.

---

## Short version — for a product page or FAQ entry

> **買過就能推薦，成交抽 {比例}%**
>
> 購買「{商品名稱}」之後，你會在付款完成頁拿到一條專屬推廣連結。把它分享給朋友，只要有人透過你的連結完成購買，你就能獲得 NT${金額} 的分潤（成交金額 NT${計算基數} 的 {比例}%）。
>
> 分潤由 Portaly 記帳與發放，成效與提領都在 [Portaly Rewards](https://rewards.portaly.cc)。

---

## Full version — for a dedicated page

> ## 推薦夥伴計畫
>
> ### 怎麼參加
> 購買「{商品名稱}」之後，付款完成頁會提供你一條專屬推廣連結。不需要另外申請，也不需要先註冊任何帳號。
>
> ### 怎麼算
> 有人透過你的連結完成購買，你就能獲得成交金額的 {比例}%。以「{商品名稱}」目前的成交金額 NT${計算基數} 計算，每成交一筆是 NT${金額}。
>
> 計算方式有兩點要先知道：
> - **以最後點擊為準**：如果對方先點了別人的連結、之後才點你的，這筆算你的；反過來也一樣。
> - **效期三天**：對方點過你的連結之後三天內完成購買才算。
>
> ### 查看成效與提領
> 分潤由 Portaly 記帳與發放。到 [Portaly Rewards](https://rewards.portaly.cc) 用購買時的同一個 email 註冊或登入，就能看到自己的成效、目前累積多少、以及提領的方式與條件。

---

## What not to write

- **Don't restate the payout conditions.** Link to Portaly Rewards. Anything written here is a second copy that goes stale, and the creator is the one who answers for it.
- **Don't promise a payout date.** Settlement runs on Portaly's schedule and there is a withdrawal window; a specific date will be wrong.
- **Don't state fee or tax amounts.** They depend on the promoter's own situation and on thresholds that change. Point at the dashboard.
- **Don't print a NT$ figure on its own.** Every amount has to sit next to the base and the rate it came from. (Portaly's own Payment purchase-complete block shows only the amount and 分潤回饋 %, because the buyer just paid and knows what it cost; a page a stranger lands on does not have that context.) With the base in view the sentence stays true when a buyer pays less; without it, the number is a promise the creator cannot keep, and they are the one who answers for it. Label that base 成交金額, not 售價, whenever a discount reaches the plan — a 售價 that disagrees with the product page's own price is its own problem.
- **Don't show a promoter's accrued earnings that the creator's own site calculated.** "What one sale pays" is fine — it is price × rate and both halves are on the page. "What you have earned so far" is not: refunds claw commission back and settlement is not immediate, so any locally computed running total will diverge. That number comes from Portaly Rewards or it is not shown.

## English

No English version is provided on purpose: the program is limited to Taiwan-based Portaly accounts and its payout flow is Taiwan-only, so English-facing copy would advertise something most of its readers cannot complete. If the creator has English-speaking buyers who are Taiwan residents, translate the full version and keep the Portaly Rewards link intact.
