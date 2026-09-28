# Medicine Stock Tracker — NSDC inventory dashboards

Zoho Creator widget (Zoho Extension Toolkit / `zet`) with three dashboards that read **live data from Creator reports**: Housekeeping, Pantry and Stationery.

Each dashboard is its own page and has four tabs:

| Tab | What it shows |
|---|---|
| Overview | 10 KPIs, a "Needs attention" strip, quick actions, 12-month consumption trend, requests by status, top items, low-stock watchlist |
| Inventory | Item master, categories, stock in/out, issue & return, adjustments, stock ledger, current stock, low stock & reorder, valuation |
| Requests | Create, pending, approvals (Approve / Reject write back to Creator), approved / rejected, processing & completed, status tracking |
| Module tab | Housekeeping (tasks, assignment, priority, locations, board, performance), Pantry (stock, consumption, expiry, expenses) or Stationery (employee-wise issue, department/item consumption, monthly cost) |

## Reports it reads

Set in [`app/js/config.js`](app/js/config.js). Where two names are listed, the first is tried first and the second is a fallback for users who cannot open the team-wide report.

| Dashboard | Requests & purchase requests | Stock |
|---|---|---|
| Housekeeping | All_Housekeeping__Inventory_Requests → My_Housekeeping_Inventory_Requests | All_Inventory_Housekeeping_Stocks |
| Pantry | All_Pantry_Item_Request_Report → My_Pantry_Item_Request_Report | InventoryPantry_Stock_Report |
| Stationery | All_Item_Request_Report → StationeryItem_Request_Report | Inventory_Stationery_Stock_Report |

A stock-ledger report is not configured yet, so the Stock in/out, Stock adjustment and Stock ledger tabs ask for one.

## Configuration

Everything app-specific lives in `app/js/config.js`:

- **`reports`** — report link names per dashboard (a single name, or a list to try in order).
- **`fields`** — candidate link names per logical field. The first one present in a report wins; matching ignores case, spaces and underscores, and also matches Creator's numbered names (`Item1`, `Item_ID1`).
- **`dashboards.<name>.fields.<report>`** — pin an exact link name when detection picks the wrong field, e.g. Pantry pins `item: "Item1"`, `itemCode: "Item_ID1"`, `stockStatus: "Status"`.
- **`stockStatusFrom`** — `"report"` follows the stock report's own Status field (In Stock / Low Stock / Out of Stock); `"numbers"` compares stock with the reorder level.
- **`flagStatusMismatches`** — flag items whose Status disagrees with their quantities.
- **`enableApprovalActions`**, **`approvalValues`** — Approve / Reject write-back.
- **`creatorBaseUrl`**, **`urlTemplate`** — links back into Creator (set the base URL for your data centre, e.g. `https://creatorapp.zoho.in`).

Open **Data sources** in the dashboard header to see which report loaded, which fields were detected, which are missing, and a sample record.

## Deploy to Zoho Creator

```bash
npm install
zet pack          # writes dist/CIMS.zip
```

In Creator: **Settings → Widgets → Create**, hosting **Internal**, upload `dist/CIMS.zip`, and set the index file to `/housekeeping.html`. Repeat with the same zip for `/pantry.html` and `/stationery.html`, then add each widget to a page.

## Run locally

```bash
npm install
zet run           # https://127.0.0.1:5000
```

`zet run` needs `key.pem` and `cert.pem`, which are deliberately not committed. Generate them once:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=127.0.0.1" -keyout key.pem -out cert.pem
```

The dashboards read live Creator data, so outside Creator they show "Open this dashboard inside Zoho Creator" instead of sample numbers.

## Layout

```
app/
  housekeeping.html  pantry.html  stationery.html   # one dashboard per page
  widget.html                                       # launcher linking to the three
  css/dashboard.css
  js/config.js        # everything app-specific
  js/core.js          # dates, numbers, DOM helper, icons
  js/creator-api.js   # Creator SDK wrapper (v2, falls back to v1)
  js/model.js         # records -> items, transactions, requests, consumption
  js/charts.js        # bars, columns, stacked bar (no external library)
  js/components.js    # cards, KPI tiles, tables, dialogs
  js/views.js         # Overview, Quick actions, Inventory, Requests
  js/views-modules.js # Housekeeping / Pantry / Stationery sections
  js/app.js           # header, tabs, data loading, Data sources panel
server/index.js       # local dev server (from the zet template)
plugin-manifest.json  # Creator widget manifest
```
