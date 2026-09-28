# NSDC Inventory Management — Zoho Creator widget

Zoho Creator widget (Zoho Extension Toolkit / `zet`) for the `medicine-stock-tracker` app. It has a **management console** covering all three stores, plus a detailed dashboard per store: Housekeeping, Pantry and Stationery. Everything is **live data from Creator reports**.

| Page | What it shows |
|---|---|
| `widget.html`: Management Console | The 10 overview KPIs across all stores, Needs attention, Quick Actions (New item, Stock in, Issue item, Receive back, Create request, Create purchase request, Generate reports), a summary card per store, consumption trend, requests by status, low-stock watchlist, expiring batches |
| `housekeeping.html`, `pantry.html`, `stationery.html` | **Overview** · **Inventory** (item master, categories, stock in/out, issue & return, adjustments, ledger, current stock, low stock & reorder, valuation) · **Requests** (create, pending, approvals, approved/rejected, processing & completed, status tracking) · the store's own tab (Housekeeping tasks and performance; Pantry stock, consumption, expiry, expenses; Stationery employee-wise issue, consumption, monthly cost) |

Every table has **Export CSV**, and every page has **Print**.

## Where the data comes from

Set per store in [`app/js/config.js`](app/js/config.js) → `dashboards.<store>.reports`:

| Source | Housekeeping | Pantry | Stationery |
|---|---|---|---|
| `items`: current stock | All_Inventory_Housekeeping_Stocks | InventoryPantry_Stock_Report | Inventory_Stationery_Stock_Report |
| `itemMaster`: prices, joined by item code | Item_Master_Report | All_Pantry_Items | Stationery_Item_Master_Report |
| `transactions`: stock ledger | HK_ledger_Entry1 | Pantry_Stock_Ledger_Entry_Report | Stationery_Stock_Ledger_Entry_Report |
| `requests`: employee demand requests | Housekeeping_Demand_Request_Report | Pantry_Demand_Request_Report | Integrated_Daily_Consumption_Report (one row per item, grouped) |
| `requestLines`: requested items | Housekeeping_Demand_Item_list_Report | Pantry_Demand_Item_List_Report | — |
| `purchaseRequests`: vendor orders | All_Housekeeping__Inventory_Requests → My_… | All_Pantry_Item_Request_Report → My_… | All_Item_Request_Report → StationeryItem_Request_Report |
| `purchaseLines`: ordered items | All_Item_Lists | Pantry_Items_Subform_Report → My_… | Stationery_Items_Subform_Report → StationeryItem_Request_Report |
| `batches`: expiry | Batch_Master_Housekeeping_Report | Batch_Master_Pantry_Report | Batch_Master_Stationery_Report |
| `people`: requesters' departments (optional) | All_Employee_Masters | All_Employee_Masters | All_Employee_Masters |

- **Consumption / items issued** = the ledger's *Consumed* entries, valued at the item-master unit price (excluding GST). The requester comes from the demand request the entry references.
- **Stock adjustment** = the ledger's *Discarded* entries.
- **Approvals** happen in Creator. Its approval forms update the ledger, so *Review in Creator* opens the request instead of writing a status directly. `enableApprovalActions: true` switches on direct Approve / Reject.
- **Test data**: items whose name matches `excludeItems` (by default anything containing "test") are hidden everywhere.

When a report can't be opened, a list of reports is tried in order (team-wide `All_` first, then the per-user `My_` report). Open **Data sources** on a store page to see which report loaded, the detected fields, and a sample record.

## Not tracked in Creator yet

These screens explain what's missing instead of showing an empty chart. Each one is picked up automatically once the field exists:

- **Housekeeping task assignment, priority, location** need `Assigned_To`, `Priority` and `Location` fields on the demand request form. Until then, *Performance* shows request fulfilment by requester.
- **Returns / Receive back** need a return form, plus a return due date (e.g. `Expected_Return_Date`) on issues. Then set `forms.receiveBack`. No form in the app records items coming back from employees.
- **Department-wise consumption** uses the department on each requester's user record (`All_Employee_Masters` → Department Name). Requesters are matched by the user lookup on the request, else by email or name. Requesters whose user record has no department count as "Unspecified". Alternatively, add a `Department` field to the demand request forms.
- **Categories** need `Category` / `Sub_Category` on the item masters.

## Configuration

Everything app-specific lives in `app/js/config.js`:

- **`dashboards.<store>.reports` / `forms`**: report and form link names. `forms` drives the Quick Actions; a blank form shows "Not set up in Creator yet".
- **`dashboards.<store>.fields.<source>`**: pin an exact link name when detection picks the wrong field (`"none"` switches a field off).
- **`fields`**: candidate link names per logical field. Matching ignores case, spaces and underscores, and a trailing number (`Item1`).
- **`statusGroups`, `transactionTypes`**: map Creator's status and transaction words (e.g. *Submitted*, *Order Issued*, *Request Stock updated*, *Consumed*) to dashboard stages.
- **`defaultPeriod`**, `stockStatusFrom`, `flagStatusMismatches`, `excludeItems`, `consumptionFrom`, `creatorBaseUrl`, `urlTemplate`.

## Deploy to Zoho Creator

```bash
npm install
zet pack          # writes dist/CIMS.zip
```

In Creator: **Settings → Widgets → Create**, hosting **Internal**, upload `dist/CIMS.zip`, set the index file to `/widget.html`, and add the widget to a page. The console links to the three store pages inside the same widget. They can also be added as separate widgets with `/housekeeping.html`, `/pantry.html` or `/stationery.html` as the index file.

## Run locally

Either host the `app/` folder externally (for example with VS Code Live Server at `http://127.0.0.1:5500/app/widget.html`) and point a Creator widget at it, or:

```bash
npm install
zet run           # https://127.0.0.1:5000
```

`zet run` needs `key.pem` and `cert.pem`, which are deliberately not committed. Generate them once:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=127.0.0.1" -keyout key.pem -out cert.pem
```

The pages read live Creator data, so outside Creator they show "Open this dashboard inside Zoho Creator".

## Tests

```bash
npm test          # model tests with records shaped like the live reports
```

## Layout

```
app/
  widget.html                                       # management console (all stores)
  housekeeping.html  pantry.html  stationery.html   # one dashboard per store
  css/dashboard.css
  js/config.js        # everything app-specific
  js/core.js          # dates, numbers, DOM helper, icons
  js/creator-api.js   # Creator SDK wrapper (v2, falls back to v1)
  js/loader.js        # loads a store's reports (fallbacks, shared cache, parallel limit)
  js/model.js         # records -> items, ledger, requests, purchases, batches, consumption (with joins)
  js/charts.js        # bars, columns, stacked bar (no external library)
  js/components.js    # cards, KPI tiles, tables (search, sort, CSV export), dialogs
  js/views.js         # Overview, Quick actions, Inventory, Requests
  js/views-modules.js # Housekeeping / Pantry / Stationery sections
  js/app.js           # store page: header, tabs, loading, Data sources panel
  js/console.js       # management console
tests/model.test.js
server/index.js       # local dev server (from the zet template)
plugin-manifest.json  # Creator widget manifest
```
