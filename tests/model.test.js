// Model tests with records shaped like the live Creator reports (made-up values). Run: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

global.window = globalThis;
global.document = {};
for (const f of ["config.js", "core.js", "model.js"]) require(path.join(__dirname, "..", "app", "js", f));
const C = globalThis.CIMS, U = C.util, M = C.model;

const lookup = (field, v) => ({ ID: "1" + v.length, [field]: v, zc_display_value: v });
const ok = (records) => ({ report: "r", state: "ok", records });

function housekeeping() {
  return {
    items: ok([
      { ID: "1", Item: lookup("item_name", "CHEMICAL R4"), Item_ID: lookup("Item_ID", "ITM-0001"), Available_Quantity: "40", Minimum_Quantity: "5", Status: "In Stock", UOM: lookup("unit", "LTRS") },
      { ID: "2", Item: lookup("item_name", "DUST PAN"), Item_ID: lookup("Item_ID", "ITM-0002"), Available_Quantity: "0", Minimum_Quantity: "2", Status: "Out of Stock", UOM: lookup("unit", "NOS") },
      { ID: "3", Item: lookup("item_name", "Kasana Test"), Item_ID: lookup("Item_ID", "ITM-0099"), Available_Quantity: "3", Minimum_Quantity: "1", Status: "In Stock", UOM: {} }
    ]),
    itemMaster: ok([
      { ID: "10", item_name: "CHEMICAL R4", Item_ID: "ITM-0001", unit_price: "250.00", gst_rate: "18.00", minimum_stock: "5", unit: "LTRS" },
      { ID: "11", item_name: "DUST PAN", Item_ID: "ITM-0002", unit_price: "80.00", gst_rate: "12.00", minimum_stock: "2", unit: "NOS" }
    ]),
    transactions: ok([
      { ID: "20", Item: "CHEMICAL R4", Item_ID: "ITM-0001", Transaction_Type: "IN", Quantity: "50", Transaction_Date: "01-Sep-2026 10:00:00", Available_Quantity: "50", Request_ID: "HKREQ-0001" },
      { ID: "21", Item: "CHEMICAL R4", Item_ID: "ITM-0001", Transaction_Type: "Consumed", Quantity: "6", Transaction_Date: "05-Sep-2026 12:00:00", Available_Quantity: "44", Request_ID: "HKCONS-0001" },
      { ID: "22", Item: "CHEMICAL R4", Item_ID: "ITM-0001", Transaction_Type: "Discarded", Quantity: "4", Transaction_Date: "06-Sep-2026 09:00:00", Available_Quantity: "40", Request_ID: "HKDIS-0001" }
    ]),
    requests: ok([
      { ID: "30", Consumption_ID: "HKCONS-0001", Status: "Order Issued", Request_Date: "04-Sep-2026", Request_User: { ID: "5", Name: "Asha", zc_display_value: "Asha" } },
      { ID: "31", Consumption_ID: "HKCONS-0002", Status: "Submitted", Request_Date: "20-Sep-2026", Request_User: { ID: "6", Name: "Ravi", zc_display_value: "Ravi" } }
    ]),
    requestLines: ok([
      { ID: "40", Request_ID: "HKCONS-0001", Item_Name: lookup("item_name", "CHEMICAL R4"), Quantity_Requested: "6", Unit_of_Measure: "LTRS" },
      { ID: "41", Request_ID: "HKCONS-0002", Item_Name: lookup("item_name", "DUST PAN"), Quantity_Requested: "2", Unit_of_Measure: "NOS" },
      { ID: "42", Request_ID: "HKCONS-0002", Item_Name: lookup("item_name", "CHEMICAL R4"), Quantity_Requested: "3", Unit_of_Measure: "LTRS" }
    ]),
    purchaseRequests: ok([
      { ID: "50", Request_ID: "HKREQ-0001", Order_Stage: "Request Stock updated", Approval_Status: "Approved", Order_date: "28-Aug-2026 11:00:00" },
      { ID: "51", Request_ID: "HKREQ-0002", Order_Stage: "Order Requested", Approval_Status: "Pending", Order_date: "25-Sep-2026 11:00:00" }
    ]),
    purchaseLines: ok([
      { ID: "60", Request_ID: "HKREQ-0002", Item_Name: lookup("item_name", "DUST PAN"), Quantity_Requested: "10", Unit_Price: "80.00", Amount_With_GST: "896.00" }
    ]),
    batches: ok([
      { ID: "70", Item_Name: "CHEMICAL R4", Item_ID: "ITM-0001", Batch_ID: "HKBATCH/ITM-0001", Expiry_Date: "15-Oct-2026", Available_Quantity: "20" },
      { ID: "71", Item_Name: "CHEMICAL R4", Item_ID: "ITM-0001", Batch_ID: "HKBATCH/ITM-0001-2", Expiry_Date: "01-Oct-2026", Available_Quantity: "0" }
    ])
  };
}

test("numbers: currency prefixes, codes and Indian grouping", () => {
  assert.equal(U.num("Rs. 1,200.00"), 1200);
  assert.equal(U.num("₹1,23,456.50"), 123456.5);
  assert.equal(U.num("ITM-0036"), null);
  assert.equal(U.num("12 pcs."), 12);
  assert.equal(U.num("-5"), -5);
});

test("status words from the live reports map to the right groups", () => {
  M.build({}, "housekeeping"); // loads the vocabularies
  const expect = { "Submitted": "pending", "Order Issued": "completed", "Order Requested": "pending", "Order Approved": "approved",
    "Order Received": "processing", "Request Stock updated": "completed", "Order Rejected": "rejected", "Stock Leger Entry IN": "completed",
    "Not Approved": "rejected", "Draft": "other" };
  for (const [label, group] of Object.entries(expect)) assert.equal(M.statusGroup(label), group, label);
});

test("stock items get prices from the item master; test items are hidden", () => {
  const m = M.build(housekeeping(), "housekeeping");
  assert.deepEqual(m.items.map((i) => i.name), ["CHEMICAL R4", "DUST PAN"]);
  const r4 = m.items[0];
  assert.equal(r4.unitPrice, 250);
  assert.equal(r4.value, 40 * 250);
  assert.equal(r4.unit, "LTRS");
  assert.equal(m.items[1].stockStatus, "out");
  assert.ok(m.excludedCount >= 1);
});

test("ledger: Consumed is stock out, Discarded is a negative adjustment", () => {
  const m = M.build(housekeeping(), "housekeeping");
  const [inn, used, disc] = m.txns;
  assert.equal(inn.kind, "in"); assert.equal(inn.signed, 50);
  assert.equal(used.kind, "out"); assert.equal(used.signed, -6); assert.equal(used.amount, 6 * 250);
  assert.equal(disc.kind, "adjustment"); assert.equal(disc.signed, -4);
  assert.equal(disc.balance, 40);
});

test("demand requests: header + joined item lines, issue date and quantity from the ledger", () => {
  const m = M.build(housekeeping(), "housekeeping");
  assert.equal(m.requests.length, 2);
  const [issued, pending] = m.requests;
  assert.equal(issued.no, "HKCONS-0001");
  assert.equal(issued.group, "completed");
  assert.equal(issued.employee, "Asha");
  assert.equal(issued.item, "CHEMICAL R4");
  assert.equal(issued.issuedQty, 6);
  assert.equal(U.dayKey(issued.completedDate), "2026-09-05");
  assert.equal(pending.group, "pending");
  assert.equal(pending.lines.length, 2);
  assert.equal(pending.qty, 5);
  assert.equal(pending.item, "DUST PAN, CHEMICAL R4");
});

test("consumption comes from the ledger, with the requester from the linked request", () => {
  const m = M.build(housekeeping(), "housekeeping");
  assert.equal(m.consumptionSource, "transactions");
  assert.equal(m.consumption.length, 1);
  assert.deepEqual([m.consumption[0].qty, m.consumption[0].value, m.consumption[0].employee], [6, 1500, "Asha"]);
  assert.ok(m.hasValues);
  assert.equal(m.hasDepartments, false);
});

test("requesters get their department from the user master (by lookup ID, else name)", () => {
  const raw = housekeeping();
  raw.people = ok([
    { ID: "5", Name: "Someone Else", Email: "a@x.org", Department_Name: { ID: "90", Department: "Administration", zc_display_value: "Administration" } },
    { ID: "77", Name: "Ravi", Email: "r@x.org", Department_Name: { ID: "91", Department: "Finance", zc_display_value: "Finance" } }
  ]);
  const m = M.build(raw, "housekeeping");
  assert.equal(m.requests[0].department, "Administration", "Asha's lookup ID 5 wins over her name");
  assert.equal(m.requests[1].department, "Finance", "Ravi's lookup ID 6 has no user record, so his name is used");
  assert.equal(m.consumption[0].department, "Administration");
  assert.ok(m.hasDepartments);

  const st = M.build({ requests: ok([{ ID: "1", Request_ID: "S-1", Stationery_Item_Name: "PEN", Requested_Quantity: "2", Status: "Submitted", Requested_User: "Ravi", Requested_Date: "10-Sep-2026" }]), people: raw.people }, "stationery");
  assert.equal(st.requests[0].department, "Finance", "plain-text requester joins by name");
});

test("purchase orders use Order_Stage and pick up their item lines and amounts", () => {
  const m = M.build(housekeeping(), "housekeeping");
  const [done, open] = m.purchases;
  assert.equal(done.group, "completed");
  assert.equal(open.group, "pending");
  assert.equal(open.item, "DUST PAN");
  assert.equal(open.amount, 896);
  assert.equal(m.purchases.filter(M.isOpen).length, 1);
});

test("an item's expiry is its earliest batch that still has stock", () => {
  const m = M.build(housekeeping(), "housekeeping");
  assert.equal(m.batches.length, 2);
  assert.equal(U.dayKey(m.items[0].expiry), "2026-10-15");
  assert.equal(m.batches[0].value, 20 * 250);
});

test("stationery: one row per item is grouped into requests by request no.", () => {
  const item = (v) => ({ ID: "9", Item_Name: v, zc_display_value: v });
  const raw = { requests: ok([
    { ID: "1", Request_ID: "STATCONS-0001", Stationery_Item_Name: item("STAPLER"), Requested_Quantity: "2", Issued_Quantity: "2", Status: "Order Issued", Requested_User: "Meena", Requested_Date: "10-Sep-2026", Transaction_Date: "11-Sep-2026" },
    { ID: "2", Request_ID: "STATCONS-0001", Stationery_Item_Name: item("BOX FILE"), Requested_Quantity: "5", Issued_Quantity: "", Status: "Submitted", Requested_User: "Meena", Requested_Date: "10-Sep-2026", Transaction_Date: "" },
    { ID: "3", Request_ID: "STATCONS-0002", Stationery_Item_Name: item("Test prajjwal"), Requested_Quantity: "1", Status: "Submitted", Requested_User: "Kiran", Requested_Date: "12-Sep-2026" }
  ]) };
  const m = M.build(raw, "stationery");
  assert.equal(m.requests.length, 1, "test-only request dropped");
  const r = m.requests[0];
  assert.equal(r.lines.length, 2);
  assert.equal(r.qty, 7);
  assert.equal(r.issuedQty, 2);
  assert.equal(r.group, "pending", "least advanced line wins");
  assert.equal(r.employee, "Meena");
  assert.equal(U.dayKey(r.completedDate), "2026-09-11");
  assert.equal(m.consumptionSource, null, "nothing fully issued and no ledger");
});

test("pantry: purchase lines come from a report with an item subform", () => {
  const raw = {
    purchaseRequests: ok([{ ID: "1", Request_ID: "PANREQ-0001", Order_Stage: "Order Approved", Approval_Status: "Approved", created_date: "02-Sep-2026 10:00:00", Total: "1234.50" }]),
    purchaseLines: ok([{ ID: "1", Request_ID: "PANREQ-0001", Received_Quantity1: [
      { ID: "7", Item_Name: { ID: "8", Item_Name: "TABLE SALT", zc_display_value: "TABLE SALT" }, Requested_Quantity: "4", Received_Quantity: "4", Damaged_Quantity: "0" },
      { ID: "9", Item_Name: { ID: "8", Item_Name: "NASCAFE", zc_display_value: "NASCAFE" }, Requested_Quantity: "2", Received_Quantity: "2", Damaged_Quantity: "0" }
    ] }])
  };
  const m = M.build(raw, "pantry");
  const p = m.purchases[0];
  assert.equal(p.group, "approved");
  assert.equal(p.amount, 1234.5);
  assert.equal(p.item, "TABLE SALT, NASCAFE");
  assert.equal(p.qty, 6);
});
