# **AI Engineer Code Challenge**  Inventory Intelligence

**Submission:** Live deployed web link \+ GitHub repo \+ 2-minute Loom walkthrough

---

## **Why This Challenge**

One of the biggest operational risks for any product business is stocking out, and the inverse is over-ordering and tying up cash. Most teams track this in spreadsheets: manual, error-prone, reactive. The challenge here is to build a smarter alternative. An intelligent inventory agent that predicts reorder dates, models demand scenarios, and surfaces problems before they happen.

We want to see how you turn messy real-world inputs into clean, actionable intelligence; and present it in a way a non-technical operator can actually use.

**Use AI tooling heavily (Claude, Cursor, Copilot — whatever you'd use day-to-day).** We care about your decisions and judgment, not your typing speed.

## **The Task: "Reorder Intelligence Dashboard"**

Build a small full-stack app that ingests SKU data, sales history, supplier info, and shipping parameters and tells the user **when to reorder, how much to order, and how healthy each SKU's stock position is**.

### **Core Requirements (must-haves)**

1. **Ingest** — load the provided dataset of \~20 SKUs with their cost data, current stock, sales history, lead times, MOQs, and shipping times (see Dummy Data below).  
2. **Calculate per SKU**:  
   * **Daily sales velocity** — based on the last 7 and 14 days (show both)  
   * **Days of stock remaining** at current velocity  
   * **Reorder date** — the date a PO must be placed to arrive before the SKU runs out, factoring in production lead time \+ shipping time \+ a configurable shipping delay buffer  
   * **Recommended PO (purchase order) quantity** — must respect MOQ and cover a configurable forecast window  
   * **Stock health status** — Healthy / Low / Critical, with thresholds that are configurable  
   * **Estimated reorder cost** (PO quantity × cost per unit)  
3. **Scenario modelling** — let the user input a projected sales increase (e.g. \+20%, \+30%) and see how it changes reorder dates and recommended PO quantities across all SKUs. This should update live, not require a page reload.  
4. **Dashboard UI** — a usable interface for a non-technical operator that shows:  
   * All SKUs with their key metrics and health status  
   * Visual indicators for stock health (colour-coded — Healthy/Low/Critical)  
   * A "what needs ordering this week" view sorted by urgency  
   * Filtering or sorting by status, urgency, or category  
   * The scenario modelling controls  
   * Lead & Shipping Times included in each product row  
5. **AI layer** — use an LLM somewhere meaningful in the system. Some options (pick one — don't try to do all):  
   * Natural language query: "Which SKUs need ordering before next Friday?" or "What's my exposure if sales increase 30%?"  
   * AI-generated weekly summary explaining the current stock position in plain English  
   * AI-suggested actions per SKU with reasoning ("Order now because lead time is 35 days and stock will run out in 28 days at \+20% growth")  
   * Anomaly detection — flag SKUs where recent sales velocity diverges significantly from the longer trend  
6. **Backend \+ frontend** — must be a real full-stack app. No notebooks, no single-file scripts.  
7. **Deployed and live** — must be hosted on a public URL we can access without spinning anything up. Vercel, Railway, Render, Fly.io, Cloudflare Pages — whatever you prefer. If it requires us to clone and run locally, it doesn't count.

### **Stack**

Your choice — pick what you'd ship to production. Any LLM provider is fine.

## **The Formula (use this — don't reinvent)**

Use this as your baseline. You can refine but the operator needs to be able to verify the maths.

**Daily Velocity (7d)**  \= Units sold in last 7 days / 7

**Daily Velocity (14d)** \= Units sold in last 14 days / 14

**Projected Velocity**   \= Daily Velocity × (1 \+ growth%)

**Days of Stock**        \= Current Stock / Projected Velocity

**Total Lead Days**      \= Production Lead Time \+ Shipping Days \+ Shipping Buffer Days

**Reorder Date**         \= Today \+ (Days of Stock \- Total Lead Days)

**Recommended PO Qty**   \= max(MOQ, Projected Velocity × Forecast Window Days)

**Stock Health:**

**Critical** \= Days of Stock \< Total Lead Days

**Low**      \= Days of Stock \< Total Lead Days × 1.5

**Healthy**  \= Days of Stock ≥ Total Lead Days × 1.5

The shipping buffer, forecast window, and growth % should all be configurable in the UI — don't hard-code them.

## 

## **Stretch Goals — Pick 1 or 2**

This is where standout candidates separate themselves. **One excellently executed stretch goal beats three half-finished ones.**

* **Scenario save & compare** — let the user save scenarios ("baseline", "+20%", "Christmas push") and compare them side by side.  
* **PO export** — generate a clean CSV or email-ready PO for any SKU or batch of SKUs the user selects.  
* **Cash flow forecast** — show the total reorder spend across the next 30/60/90 days so the operator can plan cash.  
* **ABC classification —** automatically classify SKUs into A/B/C tiers based on revenue contribution over the data window (classic 80/20 analysis). Surface which SKUs are driving the business, which are steady performers, and which are clearance candidates. ***Bonus***: flag SKUs that look like one tier but are behaving like another (e.g. a "C" item that's actually trending up, or an "A" item that's quietly declining).  
* **Seasonality multipliers** — let the user apply a seasonal uplift (e.g. "Christmas \+40%") to specific SKUs or categories and have it factor into reorder dates.  
* **AI-powered "what should I do this week"** — agentic prompt that looks at the full data, picks the top 3 actions, and writes them as recommendations with reasoning.  
* **Confidence flags** — flag SKUs where the sales data is too sparse or noisy to forecast reliably (e.g. only 3 days of data, or extremely volatile).

## **Dummy Data**

Save this as `inventory.json` in your repo. 

**Dummy data json file:** [https://drive.google.com/file/d/1YN2dQ61vq6ghGq4jsPrktfAFOiuroW0-/view?usp=drive\_link](https://drive.google.com/file/d/1YN2dQ61vq6ghGq4jsPrktfAFOiuroW0-/view?usp=drive_link) 

**A few things you'll notice in the data (intentional):**

* One SKU is already at zero stock (catch this)  
* One SKU has 7 days of zero sales then suddenly starts selling (was it stocked out? Out of season? A new launch? Your forecast should handle this gracefully)  
* One SKU is below MOQ on current stock and dropping fast (critical)  
* One has highly volatile day-to-day sales (the bundle) — a strong system flags this as low-confidence  
* Lead times vary significantly across suppliers (21–42 production days, 12–21 shipping days)

##   

## **What We're Evaluating**

You don't need to ace every dimension — show us where you shine.

| Dimension | What strong looks like |
| :---- | :---- |
| **Calculation correctness** | The maths is right. Edge cases (zero stock, sparse data, MOQ binding) are handled. |
| **Product sense** | A non-technical operator can open the dashboard and immediately know what to do this week. |
| **AI integration quality** | The LLM is used somewhere that genuinely adds value — not bolted on as a gimmick. |
| **Config-driven thinking** | Thresholds, buffers, and growth % are configurable in the UI, not hard-coded. |
| **UI/UX judgment** | Clean, scannable, prioritises what matters. Visual hierarchy reflects business urgency. |
| **Deployment & polish** | The deployed link works first time, no setup needed. README is clear. |
| **Communication** | Your 2-min video tells us *why* you made the choices you did. |

## 

## **Deliverables**

1. **Live deployed URL** — public, accessible, no auth required (or auth credentials in your README). Must work on first click.  
2. **GitHub repo** (public or shared with us) with:  
   * The working code  
   * A `README.md` covering: setup, your stack choices and why, what stretch goals you tackled, what you'd do with another day, and **how you used AI tooling during the challenge**  
3. **2-minute Loom walkthrough** — demo the live app and explain:  
   * What you built and why  
   * One non-obvious decision you made  
   * The benefits of your approach for a real product business  
   * What you'd build next if you had another day

Keep the video tight. Two minutes. Not three, not five. Time-boxing is part of the test.

## **Ground Rules**

* **Use AI tooling heavily.** That's the job. We want to see you collaborate with AI effectively.  
* **The deployed link must work.** If we click it and it 500s or asks us to clone and run locally, we won't proceed with the application. Test it before submitting.  
* **Be honest in your README** about what's done, what's stubbed, what's broken. We trust candidates who are upfront.  
* **A scrappy working app with one excellent stretch goal beats a polished MVP with nothing notable.**

## **Questions?**

Reach out anytime — we'd rather you ask than waste time guessing. Have fun with it\!

