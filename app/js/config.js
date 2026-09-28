/* ==========================================================================
   Medicine Stock Tracker — configuration
   Everything that depends on your Zoho Creator app lives in this file.
   Report / form / field values are Creator *link names* (not display names).
   ========================================================================== */
window.CIMS = window.CIMS || {};

CIMS.config = {
  orgName: "NSDC",
  productName: "Medicine Stock Tracker",

  /* ---- Creator connection ------------------------------------------------ */
  // Application link name. Blank = the app this widget is installed in.
  appName: "",
  // Account (owner) name used in Creator links. Blank = detected at runtime.
  ownerName: "",
  // Creator base URL for your data centre, e.g. "https://creatorapp.zoho.in".
  // Blank = detected from the host page, falling back to creatorapp.zoho.com.
  creatorBaseUrl: "",
  // Pattern for opening a form / report in Creator.
  // Placeholders: {base} {owner} {app} {kind} (Form | Report) {name}
  urlTemplate: "{base}/{owner}/{app}/#{kind}:{name}",
  openLinksIn: "new", // "new" tab or "same" window

  /* ---- Data fetching ----------------------------------------------------- */
  fieldConfig: "all",          // SDK v2 field_config: "quick_view" | "detail_view" | "all"
  maxRecordsPerReport: 5000,   // safety cap per report

  /* ---- Formatting & rules ------------------------------------------------ */
  locale: "en-IN",
  currency: "INR",
  dateOrder: "DMY",            // only used for numeric dates like 11/09/2026 ("DMY" or "MDY")
  fiscalYearStartMonth: 4,     // April
  defaultPeriod: "this_month", // see the period list in js/core.js
  nearExpiryDays: 30,
  // Stock status badges: "report" follows the stock report's own status field (e.g. Stock_Status =
  // "In Stock") whenever it has one, falling back to quantities; "numbers" always compares on-hand
  // stock with the reorder level (0 or less = out of stock, at or below the reorder level = low).
  stockStatusFrom: "report",
  // Flag items whose Creator status disagrees with their quantities (e.g. "In Stock" with 0 in stock).
  flagStatusMismatches: true,

  showDashboardSwitcher: true,
  enableApprovalActions: true, // Approve / Reject buttons update the request's status field
  approvalValues: { approve: "Approved", reject: "Rejected" },

  /* ---- The three dashboards ---------------------------------------------- */
  // reports.requests          → the module's request report (sections 4 and 5/6/7)
  // reports.purchaseRequests  → the purchase-request report (Quick Actions, Pending purchase requests)
  //                             A list is tried in order and the first report that loads is used —
  //                             All_ (whole team) first, My_ as a fallback for users without access to it.
  //                             The same report used twice is only fetched once.
  // reports.items             → item master for this category (stock, reorder level, price, expiry)
  // reports.transactions      → stock ledger (stock in / out, issue, return, adjustment)
  // criteria.*                → optional Creator criteria, e.g. 'Category == "Pantry"'
  // forms.*                   → optional form link names; when blank, the report is opened instead
  // fields.<report>           → exact link names for this dashboard's report, overriding detection,
  //                             e.g. fields: { items: { stock: "Available_Quantity", reorderLevel: "Minimum_Stock" } }
  //                             ("none" switches a field off, e.g. items: { stockStatus: "none" })
  dashboards: {
    housekeeping: {
      label: "Housekeeping",
      title: "Housekeeping Inventory",
      page: "housekeeping.html",
      icon: "sparkles",
      accent: "#0d9488",
      reports: {
        requests: ["All_Housekeeping__Inventory_Requests", "My_Housekeeping_Inventory_Requests"],
        purchaseRequests: ["All_Housekeeping__Inventory_Requests", "My_Housekeeping_Inventory_Requests"],
        items: "All_Inventory_Housekeeping_Stocks",
        transactions: ""
      },
      criteria: { requests: "", purchaseRequests: "", items: "", transactions: "" },
      forms: { request: "", purchaseRequest: "" },
      fields: { items: { stockStatus: "Status" }, requests: {}, purchaseRequests: {}, transactions: {} }
    },
    pantry: {
      label: "Pantry",
      title: "Pantry Inventory",
      page: "pantry.html",
      icon: "coffee",
      accent: "#e8590c",
      reports: {
        requests: ["All_Pantry_Item_Request_Report", "My_Pantry_Item_Request_Report"],
        purchaseRequests: ["All_Pantry_Item_Request_Report", "My_Pantry_Item_Request_Report"],
        items: "InventoryPantry_Stock_Report",
        transactions: ""
      },
      criteria: { requests: "", purchaseRequests: "", items: "", transactions: "" },
      forms: { request: "", purchaseRequest: "" },
      fields: { items: { item: "Item1", itemCode: "Item_ID1", stockStatus: "Status" }, requests: {}, purchaseRequests: {}, transactions: {} }
    },
    stationery: {
      label: "Stationery",
      title: "Stationery Inventory",
      page: "stationery.html",
      icon: "pen",
      accent: "#4f46e5",
      reports: {
        requests: ["All_Item_Request_Report", "StationeryItem_Request_Report"],
        purchaseRequests: ["All_Item_Request_Report", "StationeryItem_Request_Report"],
        items: "Inventory_Stationery_Stock_Report",
        transactions: ""
      },
      criteria: { requests: "", purchaseRequests: "", items: "", transactions: "" },
      forms: { request: "", purchaseRequest: "" },
      fields: { items: { stockStatus: "Status" }, requests: {}, purchaseRequests: {}, transactions: {} }
    }
  },

  /* ---- Field link names -------------------------------------------------- */
  // Each logical field lists candidate link names. The first one present in a
  // report's data is used (matching ignores case, spaces and underscores).
  // Put your exact link name first if detection picks the wrong field, or pin it for one
  // dashboard's report with dashboards.<name>.fields (see above).
  fields: {
    requestNo:     ["Request_ID", "Request_No", "Request_Number", "Req_No", "Ticket_No", "Reference_No"],
    date:          ["Request_Date", "Date", "Requested_Date", "Transaction_Date", "Date_field", "Added_Time"],
    item:          ["Item_Name", "Item", "Items", "Product", "Product_Name", "Stationery_Item", "Pantry_Item", "Housekeeping_Item", "Name_of_Item", "Item_Description", "Material"],
    itemCode:      ["Item_Code", "SKU", "Code", "Item_ID"],
    category:      ["Category", "Item_Category", "Category_Name", "Item_Type", "Type_of_Item"],
    subCategory:   ["Sub_Category", "Subcategory", "Item_Sub_Category"],
    unit:          ["Unit", "UOM", "Unit_of_Measure", "Units"],
    brand:         ["Brand", "Brand_Name", "Make", "Manufacturer"],
    quantity:      ["Quantity", "Qty", "Requested_Quantity", "Required_Quantity", "Request_Quantity"],
    issuedQty:     ["Issued_Quantity", "Issued_Qty", "Quantity_Issued", "Approved_Quantity", "Delivered_Quantity"],
    // stock reports that call on-hand stock "Quantity" or "Balance" are handled automatically
    stock:         ["Current_Stock", "Available_Stock", "Stock_in_Hand", "Quantity_in_Stock", "Stock_Quantity", "Stock_Qty", "In_Stock", "Stock",
                    "Available_Quantity", "Available_Qty", "Remaining_Stock", "Remaining_Quantity", "Balance_Stock", "Present_Stock", "Total_Stock", "Closing_Stock"],
    reorderLevel:  ["Reorder_Level", "Re_order_Level", "Minimum_Stock", "Minimum_Stock_Level", "Min_Stock", "Minimum_Quantity", "Min_Quantity",
                    "Minimum_Qty", "Min_Qty", "Reorder_Point", "Safety_Stock", "Threshold", "Alert_Level"],
    reorderQty:    ["Reorder_Quantity", "Reorder_Qty", "Order_Quantity"],
    // the stock report's own status (In Stock / Low Stock / Out of Stock); also detected from its values
    stockStatus:   ["Stock_Status", "Stock_Availability", "Availability", "Availability_Status", "Inventory_Status", "Item_Status", "Stock_State"],
    unitPrice:     ["Unit_Price", "Price", "Rate", "Unit_Rate", "Unit_Cost", "Cost_per_Unit", "Price_per_Unit", "Rate_per_Unit", "Purchase_Price", "Cost_Price", "Cost"],
    amount:        ["Total_Amount", "Amount", "Total_Cost", "Total_Price", "Total_Value", "Total", "Net_Amount", "Estimated_Cost", "Stock_Value", "Value"],
    status:        ["Status", "Request_Status", "Approval_Status", "Task_Status"],
    priority:      ["Priority", "Urgency"],
    department:    ["Department", "Dept", "Department_Name"],
    employee:      ["Employee_Name", "Requested_By", "Requester", "Employee", "Name", "Requestor_Name", "Added_User"],
    location:      ["Location", "Floor", "Area", "Room", "Block", "Wing", "Location_Name"],
    assignedTo:    ["Assigned_To", "Assignee", "Housekeeping_Staff", "Staff", "Staff_Name", "Handled_By"],
    dueDate:       ["Expected_Return_Date", "Return_Due_Date", "Due_Date", "Return_Date"],
    returnedDate:  ["Returned_Date", "Actual_Return_Date", "Returned_On"],
    returnStatus:  ["Return_Status", "Returned", "Is_Returned"],
    completedDate: ["Completed_Date", "Completion_Date", "Issued_Date", "Closed_Date", "Delivered_Date"],
    expiryDate:    ["Expiry_Date", "Expiry", "Best_Before", "Use_By"],
    txnType:       ["Transaction_Type", "Movement_Type", "Stock_Type", "Type", "Entry_Type"],
    balance:       ["Balance", "Balance_Quantity", "Closing_Balance", "Running_Balance"],
    vendor:        ["Vendor", "Supplier", "Vendor_Name"],
    remarks:       ["Remarks", "Description", "Notes", "Comments", "Reason", "Purpose"],
    lineItems:     ["Items_List", "Item_Details", "Line_Items", "Request_Items", "Items_Subform", "Items"]
  },

  /* ---- Value vocabularies (case-insensitive) ------------------------------ */
  statusGroups: {
    pending:    ["Pending", "Submitted", "Open", "New", "Requested", "Awaiting Approval", "Pending Approval", "Waiting for Approval", "Draft"],
    approved:   ["Approved", "Accepted", "Sanctioned"],
    processing: ["Processing", "In Progress", "In-Progress", "Assigned", "Ordered", "Partially Issued", "On Hold", "Under Process"],
    completed:  ["Completed", "Issued", "Delivered", "Closed", "Fulfilled", "Done", "Resolved", "Received"],
    rejected:   ["Rejected", "Declined", "Cancelled", "Canceled", "Denied"]
  },
  transactionTypes: {
    in:         ["Stock In", "In", "Inward", "Purchase", "Received", "Receipt", "GRN", "Opening Stock", "Opening"],
    out:        ["Stock Out", "Out", "Outward", "Consumption", "Consumed", "Used"],
    issue:      ["Issue", "Issued", "Item Issue"],
    return:     ["Return", "Returned", "Item Return"],
    adjustment: ["Adjustment", "Stock Adjustment", "Damaged", "Damage", "Expired", "Write Off", "Correction", "Lost"]
  },
  returnedValues: ["Returned", "Yes", "True", "Completed", "Received"],
  priorities: ["Urgent", "Critical", "High", "Medium", "Normal", "Low"]
};
