/* ==========================================================================
   NSDC Centralized Inventory Management — configuration
   Everything that depends on your Zoho Creator app lives in this file.
   Report / form / field values are Creator *link names* (not display names).
   ========================================================================== */
window.CIMS = window.CIMS || {};

CIMS.config = {
  orgName: "NSDC",
  productName: "Inventory Management",

  /* ---- Creator connection ------------------------------------------------ */
  // Application link name. Blank = the app this widget is installed in.
  appName: "",
  // Account (owner) name used in Creator links. Blank = detected at runtime.
  ownerName: "",
  // Creator base URL for your data centre (zoho.in = India, zoho.com = US, zoho.eu = EU …).
  // Blank = detected from the Creator page the widget runs in, falling back to creatorapp.zoho.com.
  creatorBaseUrl: "https://creatorapp.zoho.in",
  // Pattern for opening a form / report in Creator.
  // Placeholders: {base} {owner} {env} (e.g. /environment/development, blank in production) {app} {kind} (Form | Report) {name}
  urlTemplate: "{base}/{owner}{env}/{app}/#{kind}:{name}",
  openLinksIn: "new", // "new" tab or "same" window

  /* ---- Data fetching ----------------------------------------------------- */
  fieldConfig: "all",          // SDK v2 field_config: "quick_view" | "detail_view" | "all"
  maxRecordsPerReport: 5000,   // safety cap per report
  maxParallelRequests: 6,      // reports fetched at the same time (the console loads all three modules)

  /* ---- Formatting & rules ------------------------------------------------ */
  locale: "en-IN",
  currency: "INR",
  dateOrder: "DMY",            // only used for numeric dates like 11/09/2026 ("DMY" or "MDY")
  fiscalYearStartMonth: 4,     // April
  defaultPeriod: "this_fy",    // this_month | last_30 | last_90 | this_quarter | this_fy | last_12m | all
  nearExpiryDays: 30,
  // Stock status badges: "report" follows the stock report's own status field (e.g. Status =
  // "In Stock") whenever it has one, falling back to quantities; "numbers" always compares on-hand
  // stock with the reorder level (0 or less = out of stock, at or below the reorder level = low).
  stockStatusFrom: "report",
  // Flag items whose Creator status disagrees with their quantities (e.g. "In Stock" with 0 in stock).
  flagStatusMismatches: true,
  // Items whose name matches one of these (case-insensitive regular expressions) are left out
  // everywhere — stock, ledger, requests, consumption. Used to hide test records.
  excludeItems: ["\\btest", "testing"],
  // Where consumption (items issued) comes from: "auto" = the stock ledger's Consumed entries when a
  // ledger is connected, else completed requests; "transactions" or "requests" to force one.
  consumptionFrom: "auto",

  showDashboardSwitcher: true,
  // Approve / Reject buttons write the status value below straight to the request record. Off here:
  // this app approves and issues through its own Creator forms, whose workflows update stock — so
  // the dashboard opens the request in Creator instead.
  enableApprovalActions: false,
  approvalValues: { approve: "Approved", reject: "Rejected" },

  /* ---- The three modules -------------------------------------------------- */
  // reports.items             → current stock per item (stock, minimum level, status)
  // reports.itemMaster        → item master with prices; joined to items by item code (else name)
  // reports.transactions      → stock ledger (stock in, consumed, discarded …)
  // reports.requests          → employee demand requests (request management, approvals, issues)
  // reports.requestLines      → the requested items, one row per item, joined to requests by request no.
  // reports.purchaseRequests  → purchase orders to vendors (header: stage, amount)
  // reports.purchaseLines     → purchase-order items (flat rows or a report with an item subform)
  // reports.batches           → batch-wise stock with expiry dates
  // reports.people            → user master: gives each requester a department (joined by the user lookup, email or name).
  //                             Optional — a user who can't open it just doesn't see departments.
  // A list is tried in order and the first report that loads is used — All_ (whole team) first,
  // My_ as a fallback for users without access to it. The same report used twice is fetched once.
  // lineLevel.requests        → true when each requests row is one item; rows are grouped by request no.
  // criteria.*                → optional Creator criteria, e.g. 'Category == "Pantry"'
  // forms.*                   → Quick Actions. Blank = not set up in Creator (issueItem falls back to the requests report)
  // fields.<report>           → exact link names for this module's report, overriding detection,
  //                             e.g. fields: { items: { stock: "Available_Quantity" } }
  //                             ("none" switches a field off, e.g. transactions: { stock: "none" })
  dashboards: {
    housekeeping: {
      label: "Housekeeping",
      title: "Housekeeping Inventory",
      page: "housekeeping.html",
      icon: "sparkles",
      accent: "#0d9488",
      reports: {
        items: "All_Inventory_Housekeeping_Stocks",
        itemMaster: "Item_Master_Report",
        transactions: "HK_ledger_Entry1",
        requests: "Housekeeping_Demand_Request_Report",
        requestLines: "Housekeeping_Demand_Item_list_Report",
        purchaseRequests: ["All_Housekeeping__Inventory_Requests", "My_Housekeeping_Inventory_Requests"],
        purchaseLines: "All_Item_Lists",
        batches: "Batch_Master_Housekeeping_Report",
        people: "All_Employee_Masters"
      },
      criteria: {},
      forms: {
        newItem: "Item_Master", stockIn: "Stock_Inward_UI", issueItem: "", receiveBack: "",
        request: "Housekeeping_Demand_Request", purchaseRequest: "Housekeeping_Purchase_Request", reports: "Generate_Report_form"
      },
      fields: {
        items: { stockStatus: "Status" },
        transactions: { balance: "Available_Quantity", stock: "none" }
      }
    },
    pantry: {
      label: "Pantry",
      title: "Pantry Inventory",
      page: "pantry.html",
      icon: "coffee",
      accent: "#e8590c",
      reports: {
        items: "InventoryPantry_Stock_Report",
        itemMaster: "All_Pantry_Items",
        transactions: "Pantry_Stock_Ledger_Entry_Report",
        requests: "Pantry_Demand_Request_Report",
        requestLines: "Pantry_Demand_Item_List_Report",
        purchaseRequests: ["All_Pantry_Item_Request_Report", "My_Pantry_Item_Request_Report"],
        purchaseLines: ["Pantry_Items_Subform_Report", "My_Pantry_Item_Request_Report"],
        batches: "Batch_Master_Pantry_Report",
        people: "All_Employee_Masters"
      },
      criteria: {},
      forms: {
        newItem: "Pantry_Item_List", stockIn: "Pantry_Stock_Inward", issueItem: "", receiveBack: "",
        request: "Pantry_Demand_Request", purchaseRequest: "Pantry_Item_Request", reports: "Generate_Pantry_Report"
      },
      fields: {
        items: { item: "Item1", itemCode: "Item_ID1", stockStatus: "Status" },
        transactions: { balance: "Available_Quantity", stock: "none" }
      }
    },
    stationery: {
      label: "Stationery",
      title: "Stationery Inventory",
      page: "stationery.html",
      icon: "pen",
      accent: "#4f46e5",
      reports: {
        items: "Inventory_Stationery_Stock_Report",
        itemMaster: "Stationery_Item_Master_Report",
        transactions: "Stationery_Stock_Ledger_Entry_Report",
        requests: "Integrated_Daily_Consumption_Report",
        requestLines: "",
        purchaseRequests: ["All_Item_Request_Report", "StationeryItem_Request_Report"],
        purchaseLines: ["Stationery_Items_Subform_Report", "StationeryItem_Request_Report"],
        batches: "Batch_Master_Stationery_Report",
        people: "All_Employee_Masters"
      },
      lineLevel: { requests: true },
      criteria: {},
      forms: {
        newItem: "Stationery_Item_Master", stockIn: "Stationery_Stock_Inward", issueItem: "Stationery_Order_Issuing_form", receiveBack: "",
        request: "Stationery_Demand_Request", purchaseRequest: "Stationery_Purchase__Request", reports: "Generate_Stationery_Report"
      },
      fields: {
        items: { stockStatus: "Status" },
        transactions: { balance: "Available_Quantity", stock: "none" },
        requests: { completedDate: "Transaction_Date", remarks: "Remarks_Purpose" }
      }
    }
  },

  /* ---- Field link names -------------------------------------------------- */
  // Each logical field lists candidate link names. The first one present in a
  // report's data is used (matching ignores case, spaces and underscores, and a
  // trailing number, so Item_ID also finds Item_ID1).
  // Put your exact link name first if detection picks the wrong field, or pin it for one
  // module's report with dashboards.<name>.fields (see above).
  fields: {
    requestNo:     ["Request_ID", "Request_No", "Request_Number", "Req_No", "Ticket_No", "Reference_No", "Consumption_ID"],
    date:          ["Request_Date", "Date", "Requested_Date", "Transaction_Date", "Date_field", "Order_date", "created_date", "Issue_Date", "Added_Time"],
    item:          ["Item_Name", "Item", "Items", "Product", "Product_Name", "Stationery_Item_Name", "Stationery_Item", "Pantry_Item", "Housekeeping_Item",
                    "Name_of_Item", "Item_Description", "Material"],
    itemCode:      ["Item_Code", "SKU", "Code", "Item_ID", "Stationery_Item_ID"],
    category:      ["Category", "Item_Category", "Category_Name", "Item_Type", "Type_of_Item"],
    subCategory:   ["Sub_Category", "Subcategory", "Item_Sub_Category"],
    unit:          ["Unit", "UOM", "Unit_of_Measure", "Units"],
    brand:         ["Brand", "Brand_Name", "Make", "Manufacturer"],
    quantity:      ["Quantity", "Qty", "Requested_Quantity", "Quantity_Requested", "Required_Quantity", "Request_Quantity"],
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
    gstRate:       ["GST_Rate", "GST", "Tax_Rate"],
    amount:        ["Total_Amount", "Amount_With_GST", "Amount", "Total_Cost", "Total_Price", "Total_Value", "Total", "Net_Amount", "Estimated_Cost", "Stock_Value", "Value"],
    // Order_Stage (purchase orders) is more detailed than their Approval_Status, so it comes first
    status:        ["Status", "Request_Status", "Order_Stage", "Approval_Status", "Task_Status"],
    priority:      ["Priority", "Urgency"],
    department:    ["Department", "Dept", "Department_Name"],
    email:         ["Email", "User_Email", "Request_User_Email", "Requested_User_Email", "Email_ID"],
    employee:      ["Employee_Name", "Requested_By", "Request_User", "Requested_User", "Requester", "Employee", "Name", "Requestor_Name", "Added_User"],
    location:      ["Location", "Floor", "Area", "Room", "Block", "Wing", "Location_Name"],
    assignedTo:    ["Assigned_To", "Assignee", "Housekeeping_Staff", "Staff", "Staff_Name", "Handled_By"],
    dueDate:       ["Expected_Return_Date", "Return_Due_Date", "Due_Date", "Return_Date"],
    returnedDate:  ["Returned_Date", "Actual_Return_Date", "Returned_On"],
    returnStatus:  ["Return_Status", "Returned", "Is_Returned"],
    completedDate: ["Completed_Date", "Completion_Date", "Issued_Date", "Closed_Date", "Delivered_Date", "Order_Recevied_Date", "Order_Received_Date"],
    expiryDate:    ["Expiry_Date", "Expiry", "Best_Before", "Use_By"],
    batch:         ["Batch_ID", "Batch_Number", "Batch_No"],
    txnType:       ["Transaction_Type", "Movement_Type", "Stock_Type", "Type", "Entry_Type"],
    balance:       ["Balance", "Balance_Quantity", "Closing_Balance", "Running_Balance"],
    vendor:        ["Vendor", "Supplier", "Vendor_Name"],
    remarks:       ["Remarks", "Description", "Notes", "Comments", "Reason", "Purpose", "Remarks_Purpose", "Purpose_Description"],
    lineItems:     ["Items_List", "Item_Details", "Line_Items", "Request_Items", "Items_Subform", "Items", "Item_Table", "Demand_Item_List",
                    "SubForm", "Received_Quantity"]
  },

  /* ---- Value vocabularies (case-insensitive) ------------------------------ */
  statusGroups: {
    pending:    ["Pending", "Submitted", "Open", "New", "Requested", "Awaiting Approval", "Pending Approval", "Waiting for Approval", "Order Requested"],
    approved:   ["Approved", "Accepted", "Sanctioned", "Order Approved"],
    processing: ["Processing", "In Progress", "In-Progress", "Assigned", "Ordered", "Partially Issued", "On Hold", "Under Process", "Order Received"],
    completed:  ["Completed", "Issued", "Delivered", "Closed", "Fulfilled", "Done", "Resolved", "Received", "Order Issued", "Request Stock updated",
                 "Stock Leger Entry IN", "Stock Ledger Entry IN"],
    rejected:   ["Rejected", "Declined", "Cancelled", "Canceled", "Denied", "Order Rejected"],
    other:      ["Draft"]
  },
  transactionTypes: {
    in:         ["Stock In", "In", "Inward", "Purchase", "Received", "Receipt", "GRN", "Opening Stock", "Opening"],
    out:        ["Stock Out", "Out", "Outward", "Consumption", "Consumed", "Consume", "Used"],
    issue:      ["Issue", "Issued", "Item Issue"],
    return:     ["Return", "Returned", "Item Return"],
    adjustment: ["Adjustment", "Stock Adjustment", "Discarded", "Discard", "Damaged", "Damage", "Expired", "Write Off", "Correction", "Lost"]
  },
  returnedValues: ["Returned", "Yes", "True", "Completed", "Received"],
  priorities: ["Urgent", "Critical", "High", "Medium", "Normal", "Low"]
};
