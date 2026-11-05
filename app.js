/**
 * Asset Master Matcher
 * Organised: CONFIG · STATE · helpers · parse · validate · payload · API ·
 * flatten · workbook · UI · events
 *
 * Change the API endpoint via DEFAULT_API_URL below, or in Settings (persisted).
 * Do NOT hardcode API keys — add Authorization via Settings → Optional headers.
 */
(function () {
  "use strict";

  // ===========================================================================
  // CONFIG
  // ===========================================================================

  /** @type {string} Default: local Azure Function (`func start`). Override in Settings. */
  const DEFAULT_API_URL = "http://localhost:7071/api/asset_master_match";

  const STORAGE_KEY = "assetMasterMatcher.settings.v1";
  /** Per HTTP request; matches the Function's functionTimeout headroom. */
  const API_TIMEOUT_MS = 180_000;
  /** API hard limit: total assets across all customers in one request. */
  const MAX_ASSETS_PER_REQUEST = 50;
  const PAGE_SIZE = 50;
  /** Empty / missing optional fields are sent as JSON `null` (key always present). */
  const OPTIONAL_EMPTY = null;

  const CANONICAL_HEADERS = [
    "CustomerId",
    "AssetName",
    "AssetDescription",
    "AssetType",
    "PlantLocation",
    "AssetClass",
    "AssetClassId",
    "Category",
    "CategoryId",
    "Cost",
    "Count",
  ];

  const REQUIRED_HEADERS = ["CustomerId", "AssetName"];
  const NUMERIC_HEADERS = ["CustomerId", "AssetClassId", "CategoryId", "Cost", "Count"];

  const OUTPUT_PREFERRED_ORDER = [
    "CustomerId",
    "AssetName",
    "AssetDescription",
    "AssetType",
    "PlantLocation",
    "AssetClass",
    "AssetClassId",
    "Category",
    "CategoryId",
    "Cost",
    "Count",
    "master.AssetClass",
    "master.AssetClassId",
    "master.Category",
    "master.CategoryId",
    "master.SubCategory",
    "master.SubCategoryId",
    "master.MakeModel",
    "master.MakeModelId",
    "MatchFound",
    "MakeModelGenerated",
    "Message",
    "Error",
  ];

  const TEMPLATE_SAMPLE_ROWS = [
    {
      CustomerId: 1063,
      AssetName: "KONE 1400 kgs",
      AssetDescription: "Passenger elevator 1400 kg capacity",
      AssetType: "PP&E",
      PlantLocation: "Flipkart Hub",
      AssetClass: "BUILDING",
      AssetClassId: 1000,
      Category: "BUILDING",
      CategoryId: 1014,
      Cost: 2200000,
      Count: 1,
    },
    {
      CustomerId: 1001,
      AssetName: "Hp Probook 430 G9",
      AssetDescription: "Laptop computer",
      AssetType: "PP&E",
      PlantLocation: "HQ Office",
      AssetClass: "IT EQUIPMENT",
      AssetClassId: 2000,
      Category: "COMPUTERS",
      CategoryId: 2010,
      Cost: 65000,
      Count: 1,
    },
  ];

  /**
   * Embedded demo response (16 results / 3 customers) for offline UI testing.
   * Mirrors the sample contract: 3 exact matches (MakeModelGenerated=N), 13 generated.
   */
  const DEMO_RESPONSE = {
    results: [
      {
        CustomerId: 1063, AssetName: "KONE 1400 kgs", AssetDescription: "Passenger elevator 1400 kg", AssetType: "PP&E",
        PlantLocation: "Flipkart Hub", AssetClass: "BUILDING", AssetClassId: 1000, Category: "BUILDING", CategoryId: 1014, Cost: 2200000, Count: 1,
        master: { AssetClass: "BUILDING", AssetClassId: 1000, Category: "ELEVATORS", CategoryId: 1102, SubCategory: "PASSENGER", SubCategoryId: 11021, MakeModel: "KONE 1400 kgs", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1063, AssetName: "KONE 1800 kgs", AssetDescription: "Passenger elevator 1800 kg", AssetType: "PP&E",
        PlantLocation: "Flipkart Hub", AssetClass: "BUILDING", AssetClassId: 1000, Category: "BUILDING", CategoryId: 1014, Cost: 2800000, Count: 1,
        master: { AssetClass: "BUILDING", AssetClassId: 1000, Category: "ELEVATORS", CategoryId: 1102, SubCategory: "PASSENGER", SubCategoryId: 11021, MakeModel: "KONE 1800 kgs", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1063, AssetName: "Schindler 3300", AssetDescription: "Machine-room-less elevator", AssetType: "PP&E",
        PlantLocation: "Flipkart Hub", AssetClass: "BUILDING", AssetClassId: 1000, Category: "BUILDING", CategoryId: 1014, Cost: 3100000, Count: 2,
        master: { AssetClass: "BUILDING", AssetClassId: 1000, Category: "ELEVATORS", CategoryId: 1102, SubCategory: "PASSENGER", SubCategoryId: 11021, MakeModel: "Schindler 3300", MakeModelId: 27503 },
        MatchFound: "Y", MakeModelGenerated: "N", Message: null,
      },
      {
        CustomerId: 1063, AssetName: "HVAC Chiller 200TR", AssetDescription: "Central cooling plant", AssetType: "PP&E",
        PlantLocation: "Flipkart Hub", AssetClass: "BUILDING", AssetClassId: 1000, Category: "HVAC", CategoryId: 1020, Cost: 4500000, Count: 1,
        master: { AssetClass: "BUILDING", AssetClassId: 1000, Category: "HVAC", CategoryId: 1020, SubCategory: "CHILLERS", SubCategoryId: 10201, MakeModel: "HVAC Chiller 200TR", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1063, AssetName: "Diesel Genset 500 kVA", AssetDescription: "Backup power", AssetType: "PP&E",
        PlantLocation: "Flipkart Hub", AssetClass: "BUILDING", AssetClassId: 1000, Category: "POWER", CategoryId: 1030, Cost: 1800000, Count: 1,
        master: { AssetClass: "BUILDING", AssetClassId: 1000, Category: "POWER", CategoryId: 1030, SubCategory: "GENERATORS", SubCategoryId: 10301, MakeModel: "Diesel Genset 500 kVA", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1063, AssetName: "Fire Pump Set", AssetDescription: "Fire suppression pump", AssetType: "PP&E",
        PlantLocation: "Flipkart Hub", AssetClass: "BUILDING", AssetClassId: 1000, Category: "SAFETY", CategoryId: 1040, Cost: 650000, Count: 1,
        master: { AssetClass: "BUILDING", AssetClassId: 1000, Category: "SAFETY", CategoryId: 1040, SubCategory: "FIRE SYSTEMS", SubCategoryId: 10401, MakeModel: "Fire Pump Set", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1001, AssetName: "Hp Probook 430 G9", AssetDescription: "Business laptop", AssetType: "PP&E",
        PlantLocation: "HQ Office", AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "COMPUTERS", CategoryId: 2010, Cost: 65000, Count: 10,
        master: { AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "COMPUTERS", CategoryId: 2010, SubCategory: "LAPTOPS", SubCategoryId: 20101, MakeModel: "Hp Probook 430 G9", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1001, AssetName: "Dell OptiPlex 7090", AssetDescription: "Desktop PC", AssetType: "PP&E",
        PlantLocation: "HQ Office", AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "COMPUTERS", CategoryId: 2010, Cost: 48000, Count: 5,
        master: { AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "COMPUTERS", CategoryId: 2010, SubCategory: "DESKTOPS", SubCategoryId: 20102, MakeModel: "Dell OptiPlex 7090", MakeModelId: 1031 },
        MatchFound: "Y", MakeModelGenerated: "N", Message: null,
      },
      {
        CustomerId: 1001, AssetName: "Cisco Catalyst 9300", AssetDescription: "Network switch", AssetType: "PP&E",
        PlantLocation: "HQ Office", AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "NETWORK", CategoryId: 2020, Cost: 320000, Count: 2,
        master: { AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "NETWORK", CategoryId: 2020, SubCategory: "SWITCHES", SubCategoryId: 20201, MakeModel: "Cisco Catalyst 9300", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1001, AssetName: "APC Smart-UPS 3000VA", AssetDescription: "UPS battery backup", AssetType: "PP&E",
        PlantLocation: "HQ Office", AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "POWER", CategoryId: 2030, Cost: 95000, Count: 4,
        master: { AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "POWER", CategoryId: 2030, SubCategory: "UPS", SubCategoryId: 20301, MakeModel: "APC Smart-UPS 3000VA", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1001, AssetName: "Epson EcoTank L3250", AssetDescription: "Inkjet printer", AssetType: "PP&E",
        PlantLocation: "HQ Office", AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "PERIPHERALS", CategoryId: 2040, Cost: 18000, Count: 3,
        master: { AssetClass: "IT EQUIPMENT", AssetClassId: 2000, Category: "PERIPHERALS", CategoryId: 2040, SubCategory: "PRINTERS", SubCategoryId: 20401, MakeModel: "Epson EcoTank L3250", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1299, AssetName: "Toyota Forklift 2.5T", AssetDescription: "Warehouse forklift", AssetType: "PP&E",
        PlantLocation: "Warehouse A", AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "FORKLIFTS", CategoryId: 3010, Cost: 1250000, Count: 2,
        master: { AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "FORKLIFTS", CategoryId: 3010, SubCategory: "COUNTERBALANCE", SubCategoryId: 30101, MakeModel: "Toyota Forklift 2.5T", MakeModelId: 1869 },
        MatchFound: "Y", MakeModelGenerated: "N", Message: null,
      },
      {
        CustomerId: 1299, AssetName: "Raymond Reach Truck", AssetDescription: "Narrow aisle truck", AssetType: "PP&E",
        PlantLocation: "Warehouse A", AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "FORKLIFTS", CategoryId: 3010, Cost: 980000, Count: 1,
        master: { AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "FORKLIFTS", CategoryId: 3010, SubCategory: "REACH", SubCategoryId: 30102, MakeModel: "Raymond Reach Truck", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1299, AssetName: "Conveyor Belt 30m", AssetDescription: "Sortation conveyor", AssetType: "PP&E",
        PlantLocation: "Warehouse A", AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "CONVEYORS", CategoryId: 3020, Cost: 750000, Count: 1,
        master: { AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "CONVEYORS", CategoryId: 3020, SubCategory: "BELT", SubCategoryId: 30201, MakeModel: "Conveyor Belt 30m", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1299, AssetName: "Pallet Racking System", AssetDescription: "Selective racking", AssetType: "PP&E",
        PlantLocation: "Warehouse A", AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "STORAGE", CategoryId: 3030, Cost: 420000, Count: 1,
        master: { AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "STORAGE", CategoryId: 3030, SubCategory: "RACKING", SubCategoryId: 30301, MakeModel: "Pallet Racking System", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
      {
        CustomerId: 1299, AssetName: "Dock Leveler Hydraulic", AssetDescription: "Loading dock equipment", AssetType: "PP&E",
        PlantLocation: "Warehouse A", AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "DOCK", CategoryId: 3040, Cost: 185000, Count: 4,
        master: { AssetClass: "MATERIAL HANDLING", AssetClassId: 3000, Category: "DOCK", CategoryId: 3040, SubCategory: "LEVELERS", SubCategoryId: 30401, MakeModel: "Dock Leveler Hydraulic", MakeModelId: null },
        MatchFound: "Y", MakeModelGenerated: "Y", Message: null,
      },
    ],
  };

  // ===========================================================================
  // STATE
  // ===========================================================================

  const state = {
    step: 1,
    inputMode: "excel",
    source: "excel",
    file: null,
    rawRows: [],
    validRows: [],
    errors: [],
    payload: null,
    results: null,
    columns: [],
    workbookBuffer: null,
    autoDownloaded: false,
    abortController: null,
    previewPage: 1,
    resultsPage: 1,
    settings: loadSettings(),
  };

  // ===========================================================================
  // DOM HELPERS
  // ===========================================================================

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "className") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v; // only for trusted static markup
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === false || v == null) { /* skip */ }
      else if (k === "dataset") Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? "" : String(v));
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function toast(message, type = "info") {
    const region = $("#toastRegion");
    const item = el("div", { className: `toast toast--${type}`, role: "status" }, message);
    region.appendChild(item);
    setTimeout(() => {
      item.style.opacity = "0";
      setTimeout(() => item.remove(), 220);
    }, 3800);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = el("textarea", { style: "position:fixed;left:-9999px" });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return Promise.resolve();
  }

  // ===========================================================================
  // SETTINGS
  // ===========================================================================

  function defaultSettings() {
    return {
      apiUrl: DEFAULT_API_URL,
      headers: [],
      maxAssetsPerRequest: MAX_ASSETS_PER_REQUEST,
      demoMode: false,
      includePayloadSheet: false,
    };
  }

  function clampMaxAssets(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return MAX_ASSETS_PER_REQUEST;
    return Math.min(MAX_ASSETS_PER_REQUEST, Math.floor(n));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultSettings();
      const merged = { ...defaultSettings(), ...JSON.parse(raw) };
      delete merged.batchSize;
      if (!merged.apiUrl || merged.apiUrl.includes("YOUR-API-HOST")) merged.apiUrl = DEFAULT_API_URL;
      merged.maxAssetsPerRequest = clampMaxAssets(merged.maxAssetsPerRequest);
      return merged;
    } catch {
      return defaultSettings();
    }
  }

  function saveSettings(next) {
    state.settings = { ...state.settings, ...next };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }

  // ===========================================================================
  // PARSE / NORMALIZE (pure helpers)
  // ===========================================================================

  /** Case/space/underscore-insensitive header → canonical PascalCase key. */
  function normalizeHeader(raw) {
    if (raw == null) return "";
    const compact = String(raw).trim().toLowerCase().replace(/[\s_]+/g, "");
    const map = {};
    CANONICAL_HEADERS.forEach((h) => {
      map[h.toLowerCase()] = h;
    });
    return map[compact] || "";
  }

  function coerceNumber(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const cleaned = String(value).trim().replace(/,/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  function isBlankRow(obj) {
    return Object.values(obj).every((v) => v == null || String(v).trim() === "");
  }

  function parseWorkbook(arrayBuffer, fileName) {
    if (typeof XLSX === "undefined") {
      throw new Error("SheetJS failed to load. Check your network or CDN access.");
    }
    const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Workbook has no sheets.");
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    if (!matrix.length) throw new Error("The sheet is empty.");

    const headerRow = matrix[0].map((h) => String(h ?? "").trim());
    const mapped = headerRow.map(normalizeHeader);
    const present = new Set(mapped.filter(Boolean));

    const missingRequiredCols = REQUIRED_HEADERS.filter((h) => !present.has(h));
    if (missingRequiredCols.length) {
      return {
        rows: [],
        errors: [{
          row: 1,
          column: missingRequiredCols.join(", "),
          problem: `Required column(s) missing from header: ${missingRequiredCols.join(", ")}`,
        }],
        fileName,
        missingRequiredCols,
      };
    }

    const colIndex = {};
    mapped.forEach((canon, i) => {
      if (canon && colIndex[canon] == null) colIndex[canon] = i;
    });

    const rows = [];
    const errors = [];

    for (let r = 1; r < matrix.length; r++) {
      const line = matrix[r] || [];
      const excelRow = r + 1; // 1-based for humans
      const provisional = {};
      let any = false;
      CANONICAL_HEADERS.forEach((key) => {
        const idx = colIndex[key];
        if (idx == null) return;
        const cell = line[idx];
        if (cell != null && String(cell).trim() !== "") any = true;
        provisional[key] = cell;
      });
      if (!any || isBlankRow(provisional)) continue;

      const row = { __excelRow: excelRow };
      let rowHasError = false;

      CANONICAL_HEADERS.forEach((key) => {
        const idx = colIndex[key];
        const raw = idx == null ? undefined : provisional[key];
        const isEmpty = raw == null || String(raw).trim() === "";

        if (NUMERIC_HEADERS.includes(key)) {
          if (isEmpty) {
            if (REQUIRED_HEADERS.includes(key)) {
              errors.push({ row: excelRow, column: key, problem: "Required value is missing" });
              rowHasError = true;
            } else {
              // Empty optional numeric → include key as null in payload
              row[key] = OPTIONAL_EMPTY;
            }
            return;
          }
          const num = coerceNumber(raw);
          if (Number.isNaN(num)) {
            errors.push({ row: excelRow, column: key, problem: `Expected a number, got “${String(raw).trim()}”` });
            rowHasError = true;
            return;
          }
          row[key] = num;
          return;
        }

        // strings
        if (isEmpty) {
          if (REQUIRED_HEADERS.includes(key)) {
            errors.push({ row: excelRow, column: key, problem: "Required value is missing" });
            rowHasError = true;
          } else {
            // Empty / missing optional string → include key as null in payload
            row[key] = OPTIONAL_EMPTY;
          }
          return;
        }
        row[key] = String(raw).trim();
      });

      if (!rowHasError) rows.push(row);
      else {
        // keep invalid row reference only in errors; don't include in validRows
      }
    }

    return { rows, errors, fileName, missingRequiredCols: [] };
  }

  /**
   * Parse a request body in either API shape into flat rows (same shape as Excel rows).
   * Preferred: { requests: [{ CustomerId, assets: [...] }] } · Legacy: { CustomerId, assets: [...] }
   * Extra asset fields are kept so the API can echo them back.
   */
  function parseJsonInput(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid JSON: ${err.message}`);
    }

    const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
    let groups;
    if (isObj(data) && Array.isArray(data.requests)) {
      groups = data.requests.map((g, i) => ({ g, path: `requests[${i}]` }));
    } else if (isObj(data) && Array.isArray(data.assets)) {
      groups = [{ g: data, path: "" }];
    } else {
      throw new Error('JSON must be { "requests": [ { "CustomerId": …, "assets": [ … ] } ] } or { "CustomerId": …, "assets": [ … ] }.');
    }

    const rows = [];
    const errors = [];

    groups.forEach(({ g, path }) => {
      const label = path || "(root)";
      if (!isObj(g)) {
        errors.push({ row: label, column: "", problem: "Each request must be a JSON object" });
        return;
      }
      if (!Array.isArray(g.assets)) {
        errors.push({ row: label, column: "assets", problem: "assets must be an array" });
        return;
      }
      const customerId = coerceNumber(g.CustomerId);
      if (customerId == null || Number.isNaN(customerId)) {
        errors.push({
          row: label,
          column: "CustomerId",
          problem: `Required numeric CustomerId is missing or invalid — ${g.assets.length} asset(s) skipped`,
        });
        return;
      }

      g.assets.forEach((asset, j) => {
        const where = `${path ? `${path}.` : ""}assets[${j}]`;
        if (!isObj(asset)) {
          errors.push({ row: where, column: "", problem: "Asset must be a JSON object" });
          return;
        }
        const row = { __excelRow: where, CustomerId: customerId };
        let rowHasError = false;

        Object.keys(asset).forEach((key) => {
          if (key !== "CustomerId") row[key] = asset[key];
        });

        if (asset.AssetName == null || String(asset.AssetName).trim() === "") {
          errors.push({ row: where, column: "AssetName", problem: "Required value is missing" });
          rowHasError = true;
        } else {
          row.AssetName = String(asset.AssetName).trim();
        }

        NUMERIC_HEADERS.forEach((key) => {
          if (key === "CustomerId" || !Object.prototype.hasOwnProperty.call(asset, key)) return;
          const raw = asset[key];
          if (raw == null || String(raw).trim() === "") {
            row[key] = OPTIONAL_EMPTY;
            return;
          }
          const num = coerceNumber(raw);
          if (Number.isNaN(num)) {
            errors.push({ row: where, column: key, problem: `Expected a number, got “${String(raw).trim()}”` });
            rowHasError = true;
            return;
          }
          row[key] = num;
        });

        if (!rowHasError) rows.push(row);
      });
    });

    if (!rows.length && !errors.length) {
      errors.push({ row: "(root)", column: "assets", problem: "No assets found in JSON" });
    }
    return { rows, errors };
  }

  // ===========================================================================
  // VALIDATE
  // ===========================================================================

  function validateRows(rows) {
    // parseWorkbook already validates; this is a safety net for programmatic use
    const errors = [];
    rows.forEach((row) => {
      const excelRow = row.__excelRow || "?";
      REQUIRED_HEADERS.forEach((key) => {
        if (row[key] == null || row[key] === "") {
          errors.push({ row: excelRow, column: key, problem: "Required value is missing" });
        }
      });
      NUMERIC_HEADERS.forEach((key) => {
        if (row[key] == null) return;
        if (typeof row[key] !== "number" || Number.isNaN(row[key])) {
          errors.push({ row: excelRow, column: key, problem: "Must be numeric" });
        }
      });
    });
    return errors;
  }

  // ===========================================================================
  // BUILD PAYLOAD
  // ===========================================================================

  /**
   * Group flat rows by CustomerId (Map preserves first-seen order).
   * Excel rows always carry every canonical key (empty → `null`).
   * JSON rows send only the keys the user provided, plus any extra fields.
   */
  function buildPayload(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const id = row.CustomerId;
      if (!groups.has(id)) groups.set(id, []);
      const asset = {};
      const fromJson = state.source === "json";
      CANONICAL_HEADERS.forEach((key) => {
        if (key === "CustomerId") return;
        const has = Object.prototype.hasOwnProperty.call(row, key);
        if (fromJson && !has) return;
        const value = has ? row[key] : OPTIONAL_EMPTY;
        // Normalize blank strings to null so the API always sees null, not ""
        asset[key] = value === "" || value === undefined ? OPTIONAL_EMPTY : value;
      });
      Object.keys(row).forEach((key) => {
        if (key === "CustomerId" || key.startsWith("__") || CANONICAL_HEADERS.includes(key)) return;
        asset[key] = row[key] === undefined ? OPTIONAL_EMPTY : row[key];
      });
      groups.get(id).push(asset);
    });

    const requests = [];
    groups.forEach((assets, CustomerId) => {
      requests.push({ CustomerId, assets });
    });
    return { requests };
  }

  /**
   * Split a `{ requests }` payload into API-sized bodies of at most `maxAssets` assets total.
   * A customer is kept in one body when it fits; a customer larger than `maxAssets`
   * is split across consecutive bodies (same CustomerId). Order is preserved.
   */
  function chunkPayload(payload, maxAssets) {
    const chunks = [];
    let current = [];
    let count = 0;
    const flush = () => {
      if (current.length) chunks.push({ requests: current });
      current = [];
      count = 0;
    };

    (payload.requests || []).forEach((group) => {
      const assets = group.assets || [];
      let i = 0;
      while (i < assets.length) {
        const remaining = assets.length - i;
        if (count > 0 && remaining > maxAssets - count) {
          flush();
          continue;
        }
        const take = Math.min(maxAssets - count, remaining);
        current.push({ CustomerId: group.CustomerId, assets: assets.slice(i, i + take) });
        count += take;
        i += take;
        if (count >= maxAssets) flush();
      }
    });
    flush();
    return chunks;
  }

  // ===========================================================================
  // FLATTEN / COLUMNS
  // ===========================================================================

  function flatten(obj, prefix = "") {
    const out = {};
    if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
      out[prefix || "value"] = obj;
      return out;
    }
    Object.keys(obj).forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (val != null && typeof val === "object" && !Array.isArray(val)) {
        Object.assign(out, flatten(val, path));
      } else {
        out[path] = val;
      }
    });
    return out;
  }

  /** Ordered union of flattened keys across results (preferred order first, then first-seen). */
  function collectColumns(results) {
    const seen = new Set();
    const dynamic = [];
    (results || []).forEach((item) => {
      const flat = flatten(item);
      Object.keys(flat).forEach((k) => {
        if (!seen.has(k)) {
          seen.add(k);
          dynamic.push(k);
        }
      });
    });

    const ordered = [];
    OUTPUT_PREFERRED_ORDER.forEach((k) => {
      if (seen.has(k)) {
        ordered.push(k);
        seen.delete(k);
      }
    });
    dynamic.forEach((k) => {
      if (seen.has(k)) ordered.push(k);
    });
    return ordered;
  }

  // ===========================================================================
  // API
  // ===========================================================================

  async function callApi(payload, settings, signal, onProgress) {
    if (settings.demoMode) {
      await delay(700, signal);
      return structuredClone(DEMO_RESPONSE);
    }

    const url = (settings.apiUrl || "").trim();
    if (!url || url.includes("YOUR-API-HOST")) {
      throw new ApiError(
        "API URL not configured",
        "Set a real API URL in Settings (gear icon), or enable Demo mode to try the UI without a backend."
      );
    }

    const headers = { "Content-Type": "application/json" };
    (settings.headers || []).forEach(({ key, value }) => {
      if (key && String(key).trim()) headers[String(key).trim()] = value == null ? "" : String(value);
    });

    const chunks = chunkPayload(payload, clampMaxAssets(settings.maxAssetsPerRequest));
    const merged = [];
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (onProgress) onProgress(i + 1, chunks.length);
      const part = await postJson(url, headers, chunks[i], signal);
      merged.push(...part.results);
    }
    return { results: merged };
  }

  async function postJson(url, headers, body, signal) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, API_TIMEOUT_MS);
    const onParentAbort = () => controller.abort();
    signal?.addEventListener("abort", onParentAbort);

    let response;
    let text;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      text = await response.text();
    } catch (err) {
      if (err?.name === "AbortError") {
        if (timedOut) {
          throw new ApiError(
            "Request timed out",
            `The API did not respond within ${API_TIMEOUT_MS / 60_000} minutes.`
          );
        }
        throw err;
      }
      throw new ApiError(
        "Network / CORS error",
        "The request could not reach the API. Check that the Function is running and the API URL in Settings is correct. If the API is on another origin, it must allow this page via CORS (Access-Control-Allow-Origin). You can also enable Demo mode in Settings to exercise the UI offline."
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onParentAbort);
    }

    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw new ApiError(
            `HTTP ${response.status}`,
            `Server returned non-JSON. Snippet: ${text.slice(0, 280)}`
          );
        }
        throw new ApiError("Invalid JSON", "The API response could not be parsed as JSON.");
      }
    }

    if (!response.ok) {
      const snippet = text ? text.slice(0, 280) : "(empty body)";
      throw new ApiError(`HTTP ${response.status}`, `Request failed. Body snippet: ${snippet}`);
    }

    if (!data || !Array.isArray(data.results)) {
      throw new ApiError("Invalid response", "Response JSON is missing a results array.");
    }
    return data;
  }

  function ApiError(title, body) {
    this.name = "ApiError";
    this.title = title;
    this.message = body;
    this.body = body;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }

  // ===========================================================================
  // WORKBOOK BUILD
  // ===========================================================================

  function timestampName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `asset_master_results_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
  }

  async function buildWorkbook(results, options = {}) {
    const columns = collectColumns(results);
    const flatRows = (results || []).map((r) => flatten(r));

    if (typeof ExcelJS !== "undefined") {
      return buildWithExcelJS(columns, flatRows, results, options);
    }
    return buildWithSheetJS(columns, flatRows, options);
  }

  async function buildWithExcelJS(columns, flatRows, results, options) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Asset Master Matcher";
    const ws = wb.addWorksheet("Results", {
      views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
    });

    ws.columns = columns.map((key) => ({
      header: key,
      key,
      width: Math.min(50, Math.max(12, key.length + 2)),
    }));

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    headerRow.alignment = { vertical: "middle" };

    flatRows.forEach((flat, idx) => {
      const values = {};
      columns.forEach((c) => {
        const v = flat[c];
        values[c] = v == null ? null : v;
      });
      const row = ws.addRow(values);

      // Auto-ish widths from content (capped)
      columns.forEach((c, i) => {
        const cellVal = values[c];
        const len = cellVal == null ? 0 : String(cellVal).length;
        const col = ws.getColumn(i + 1);
        const next = Math.min(50, Math.max(col.width || 12, len + 2, c.length + 2));
        col.width = next;
      });

      const genCol = columns.indexOf("MakeModelGenerated") + 1;
      const matchCol = columns.indexOf("MatchFound") + 1;
      const errorCol = columns.indexOf("Error") + 1;
      const costCol = columns.indexOf("Cost") + 1;

      if (errorCol > 0) {
        const cell = row.getCell(errorCol);
        if (cell.value === true) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
        }
      }

      if (costCol > 0) {
        const cell = row.getCell(costCol);
        if (typeof cell.value === "number") cell.numFmt = "#,##0";
      }

      if (genCol > 0) {
        const cell = row.getCell(genCol);
        if (cell.value === "Y") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        } else if (cell.value === "N") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
        }
      }
      if (matchCol > 0) {
        const cell = row.getCell(matchCol);
        if (cell.value === "N") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
        }
      }
    });

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    if (options.includePayloadSheet && options.payload) {
      const ps = wb.addWorksheet("Request Payload");
      ps.getCell("A1").value = "Request Payload (JSON)";
      ps.getCell("A1").font = { bold: true };
      ps.getCell("A2").value = JSON.stringify(options.payload, null, 2);
      ps.getColumn(1).width = 100;
    }

    const buffer = await wb.xlsx.writeBuffer();
    return { buffer, fileName: timestampName(), columns };
  }

  function buildWithSheetJS(columns, flatRows, options) {
    const aoa = [columns];
    flatRows.forEach((flat) => {
      aoa.push(columns.map((c) => (flat[c] == null ? "" : flat[c])));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    if (options.includePayloadSheet && options.payload) {
      const ps = XLSX.utils.aoa_to_sheet([["Request Payload (JSON)"], [JSON.stringify(options.payload, null, 2)]]);
      XLSX.utils.book_append_sheet(wb, ps, "Request Payload");
    }
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return { buffer, fileName: timestampName(), columns };
  }

  function downloadBuffer(buffer, fileName) {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    if (typeof saveAs === "function") {
      saveAs(blob, fileName);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function downloadTemplate() {
    if (typeof ExcelJS !== "undefined") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Assets");
      ws.columns = CANONICAL_HEADERS.map((h) => ({ header: h, key: h, width: Math.min(50, h.length + 4) }));
      const header = ws.getRow(1);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      TEMPLATE_SAMPLE_ROWS.forEach((r) => ws.addRow(r));
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CANONICAL_HEADERS.length } };
      const buffer = await wb.xlsx.writeBuffer();
      downloadBuffer(buffer, "asset_master_input_template.xlsx");
      return;
    }
    const aoa = [CANONICAL_HEADERS, ...TEMPLATE_SAMPLE_ROWS.map((r) => CANONICAL_HEADERS.map((h) => r[h]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assets");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBuffer(buffer, "asset_master_input_template.xlsx");
  }

  // ===========================================================================
  // UI RENDERING
  // ===========================================================================

  function goToStep(n) {
    state.step = n;
    $$(".step-panel").forEach((panel) => {
      const step = Number(panel.dataset.step);
      const active = step === n;
      panel.hidden = !active;
      panel.classList.toggle("is-visible", active);
    });
    $$(".stepper__item").forEach((item) => {
      const step = Number(item.dataset.step);
      item.classList.toggle("is-active", step === n);
      item.classList.toggle("is-complete", step < n);
      const badge = item.querySelector(".stepper__badge");
      badge.textContent = step < n ? "✓" : String(step);
    });
  }

  function resetApp() {
    if (state.abortController) {
      try { state.abortController.abort(); } catch { /* ignore */ }
    }
    state.file = null;
    state.rawRows = [];
    state.validRows = [];
    state.errors = [];
    state.payload = null;
    state.results = null;
    state.columns = [];
    state.workbookBuffer = null;
    state.autoDownloaded = false;
    state.abortController = null;
    state.previewPage = 1;
    state.resultsPage = 1;

    $("#fileInput").value = "";
    $("#jsonFileInput").value = "";
    $("#jsonInput").value = "";
    $("#fileMeta").hidden = true;
    $("#uploadError").hidden = true;
    $("#uploadError").textContent = "";
    $("#validationAlert").hidden = true;
    $("#processError").hidden = true;
    $("#btnCancelApi").hidden = true;
    goToStep(1);
  }

  function showFileMeta(name, sizeBytes, rowCount) {
    $("#fileMeta").hidden = false;
    $("#fileName").textContent = name;
    const rowsText = `${rowCount} asset row${rowCount === 1 ? "" : "s"}`;
    $("#fileDetail").textContent = sizeBytes == null ? rowsText : `${formatBytes(sizeBytes)} · ${rowsText}`;
  }

  function setInputMode(mode) {
    state.inputMode = mode === "json" ? "json" : "excel";
    const isJson = state.inputMode === "json";
    $("#tabExcel").classList.toggle("is-active", !isJson);
    $("#tabExcel").setAttribute("aria-selected", String(!isJson));
    $("#tabJson").classList.toggle("is-active", isJson);
    $("#tabJson").setAttribute("aria-selected", String(isJson));
    $("#panelExcel").hidden = isJson;
    $("#panelJson").hidden = !isJson;
    $("#btnTemplate").hidden = isJson;
    $("#uploadError").hidden = true;
  }

  function pageInfo(total, page) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    const current = Math.min(Math.max(1, page || 1), totalPages);
    const start = total === 0 ? 0 : (current - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    return { total, totalPages, current, start, end };
  }

  function updatePager(controlsId, noteId, labelId, prevId, nextId, info, emptyText, allText, rangeText) {
    const controls = $(controlsId);
    const note = $(noteId);
    const label = $(labelId);
    const prev = $(prevId);
    const next = $(nextId);
    if (!note) return;

    if (info.total === 0) {
      note.textContent = emptyText;
      if (controls) controls.hidden = true;
      return;
    }

    if (info.totalPages <= 1) {
      note.textContent = allText(info.total);
      if (controls) controls.hidden = true;
      return;
    }

    note.textContent = rangeText(info.start + 1, info.end, info.total);
    if (controls) controls.hidden = false;
    if (label) label.textContent = `Page ${info.current} of ${info.totalPages}`;
    if (prev) prev.disabled = info.current <= 1;
    if (next) next.disabled = info.current >= info.totalPages;
  }

  function renderPreview() {
    const chips = $("#summaryChips");
    clearChildren(chips);
    const customerCount = new Set(state.validRows.map((r) => r.CustomerId)).size;
    chips.appendChild(el("span", { className: "chip" }, `${customerCount} customer${customerCount === 1 ? "" : "s"}`));
    chips.appendChild(el("span", { className: "chip chip--teal" }, `${state.validRows.length} asset${state.validRows.length === 1 ? "" : "s"}`));
    state.payload = buildPayload(state.validRows);
    const callCount = chunkPayload(state.payload, clampMaxAssets(state.settings.maxAssetsPerRequest)).length;
    if (callCount) {
      chips.appendChild(el("span", { className: "chip" }, `${callCount} API call${callCount === 1 ? "" : "s"}`));
    }

    // Validation alert (expandable details)
    const alert = $("#validationAlert");
    const continueBtn = $("#btnContinueValid");
    const details = $("#validationDetails");
    if (state.errors.length) {
      alert.hidden = false;
      $("#validationTitle").textContent = `${state.errors.length} validation issue${state.errors.length === 1 ? "" : "s"} found`;
      $("#validationSummary").textContent = state.validRows.length
        ? `${state.validRows.length} valid row(s) can still be processed.`
        : "No valid rows remain. Fix the input and try again.";

      const wrap = $("#validationErrorWrap");
      clearChildren(wrap);
      const table = el("table", { className: "error-table" });
      const thead = el("thead", {}, el("tr", {}, [
        el("th", { text: "Row" }),
        el("th", { text: "Column" }),
        el("th", { text: "Problem" }),
      ]));
      const tbody = el("tbody");
      state.errors.slice(0, 200).forEach((e) => {
        tbody.appendChild(el("tr", {}, [
          el("td", { text: String(e.row) }),
          el("td", { text: e.column }),
          el("td", { text: e.problem }),
        ]));
      });
      table.appendChild(thead);
      table.appendChild(tbody);
      wrap.appendChild(table);

      // Open details so issues are visible immediately; user can collapse
      if (details) details.open = true;

      continueBtn.hidden = state.validRows.length === 0;
      $("#btnProcess").disabled = true;
    } else {
      alert.hidden = true;
      continueBtn.hidden = true;
      if (details) details.open = false;
      clearChildren($("#validationErrorWrap"));
      $("#btnProcess").disabled = state.validRows.length === 0;
    }

    // Preview table (paginated)
    const table = $("#previewTable");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    clearChildren(thead);
    clearChildren(tbody);

    const headRow = el("tr");
    CANONICAL_HEADERS.forEach((h) => headRow.appendChild(el("th", { text: h })));
    thead.appendChild(headRow);

    const total = state.validRows.length;
    const info = pageInfo(total, state.previewPage);
    state.previewPage = info.current;
    const slice = state.validRows.slice(info.start, info.end);
    slice.forEach((row) => {
      const tr = el("tr");
      CANONICAL_HEADERS.forEach((h) => {
        const v = row[h];
        tr.appendChild(el("td", { text: v == null ? "" : String(v), title: v == null ? "" : String(v) }));
      });
      tbody.appendChild(tr);
    });

    updatePager(
      "#previewPagerControls",
      "#previewNote",
      "#previewPageLabel",
      "#btnPreviewPrev",
      "#btnPreviewNext",
      info,
      "No valid rows to preview.",
      (n) => `Showing all ${n} valid row${n === 1 ? "" : "s"}.`,
      (from, to, n) => `Showing ${from}–${to} of ${n} valid rows.`,
    );

    $("#requestJson").textContent = JSON.stringify(state.payload, null, 2);
  }

  function setProgress(phase, pct, label) {
    $("#progressLabel").textContent = label;
    $("#progressBar").style.width = `${pct}%`;
    $$("#progressSteps li").forEach((li) => {
      const p = li.dataset.phase;
      li.classList.toggle("is-active", p === phase);
      const order = ["parsing", "calling", "building"];
      li.classList.toggle("is-done", order.indexOf(p) < order.indexOf(phase));
    });
  }

  function summarizeResults(results) {
    let matched = 0;
    let generated = 0;
    let existing = 0;
    let notFound = 0;
    (results || []).forEach((r) => {
      if (r.MatchFound === "N") notFound += 1;
      else matched += 1;
      if (r.MakeModelGenerated === "Y") generated += 1;
      else if (r.MakeModelGenerated === "N") existing += 1;
    });
    return { total: (results || []).length, matched, generated, existing, notFound };
  }

  function renderResults() {
    const stats = summarizeResults(state.results);
    const grid = $("#statGrid");
    clearChildren(grid);
    const cards = [
      { label: "Total", value: stats.total, cls: "" },
      { label: "Matched", value: stats.matched, cls: "stat-card--matched" },
      { label: "Generated MakeModel", value: stats.generated, cls: "stat-card--generated" },
      { label: "Existing MakeModel", value: stats.existing, cls: "stat-card--existing" },
      { label: "Not Found", value: stats.notFound, cls: "stat-card--notfound" },
    ];
    cards.forEach((c) => {
      grid.appendChild(el("div", { className: `stat-card ${c.cls}` }, [
        el("div", { className: "stat-card__value", text: String(c.value) }),
        el("div", { className: "stat-card__label", text: c.label }),
      ]));
    });

    const columns = state.columns.length ? state.columns : collectColumns(state.results);
    state.columns = columns;
    const table = $("#resultsTable");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    clearChildren(thead);
    clearChildren(tbody);

    const headRow = el("tr");
    columns.forEach((h) => headRow.appendChild(el("th", { text: h })));
    thead.appendChild(headRow);

    const total = (state.results || []).length;
    const info = pageInfo(total, state.resultsPage);
    state.resultsPage = info.current;
    const slice = (state.results || []).slice(info.start, info.end);
    slice.forEach((item) => {
      const flat = flatten(item);
      const tr = el("tr");
      columns.forEach((h) => {
        const v = flat[h];
        const td = el("td");
        if (h === "MatchFound" || h === "MakeModelGenerated" || (h === "Error" && v != null)) {
          const badge = el("span", {
            className: badgeClass(h, v),
            text: v == null ? "" : String(v),
          });
          td.appendChild(badge);
        } else {
          td.textContent = v == null ? "" : String(v);
          td.title = v == null ? "" : String(v);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    updatePager(
      "#resultsPagerControls",
      "#resultsNote",
      "#resultsPageLabel",
      "#btnResultsPrev",
      "#btnResultsNext",
      info,
      "No results to show.",
      (n) => `Showing all ${n} result row${n === 1 ? "" : "s"}.`,
      (from, to, n) => `Showing ${from}–${to} of ${n} results.`,
    );

    $("#responseJson").textContent = JSON.stringify({ results: state.results }, null, 2);
  }

  function badgeClass(field, value) {
    if (field === "MakeModelGenerated") {
      if (value === "Y") return "badge badge--amber";
      if (value === "N") return "badge badge--green";
    }
    if (field === "MatchFound") {
      if (value === "Y") return "badge badge--y";
      if (value === "N") return "badge badge--n";
    }
    if (field === "Error" && value === true) return "badge badge--n";
    return "badge";
  }

  // ===========================================================================
  // SETTINGS DRAWER UI
  // ===========================================================================

  function openSettings() {
    fillSettingsForm();
    $("#drawerBackdrop").hidden = false;
    const drawer = $("#settingsDrawer");
    drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => drawer.classList.add("is-open"));
  }

  function closeSettings() {
    const drawer = $("#settingsDrawer");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    setTimeout(() => { $("#drawerBackdrop").hidden = true; }, 240);
  }

  function fillSettingsForm() {
    const s = state.settings;
    $("#settingApiUrl").value = s.apiUrl || "";
    $("#settingMaxAssets").value = clampMaxAssets(s.maxAssetsPerRequest);
    $("#settingDemoMode").checked = !!s.demoMode;
    $("#settingIncludePayloadSheet").checked = !!s.includePayloadSheet;
    renderHeaderRows(s.headers && s.headers.length ? s.headers : [{ key: "", value: "" }]);
  }

  function renderHeaderRows(headers) {
    const wrap = $("#headerRows");
    clearChildren(wrap);
    headers.forEach((h, idx) => {
      const row = el("div", { className: "header-row" }, [
        el("input", { className: "field__input", type: "text", placeholder: "Header name", value: h.key || "", "data-role": "key", "aria-label": `Header ${idx + 1} name` }),
        el("input", { className: "field__input", type: "text", placeholder: "Value", value: h.value || "", "data-role": "value", "aria-label": `Header ${idx + 1} value` }),
        el("button", {
          type: "button",
          className: "btn btn--ghost btn--sm",
          text: "✕",
          "aria-label": "Remove header",
          onClick: () => {
            row.remove();
            if (!$("#headerRows").children.length) renderHeaderRows([{ key: "", value: "" }]);
          },
        }),
      ]);
      wrap.appendChild(row);
    });
  }

  function readSettingsForm() {
    const headers = $$("#headerRows .header-row").map((row) => ({
      key: row.querySelector('[data-role="key"]').value.trim(),
      value: row.querySelector('[data-role="value"]').value,
    })).filter((h) => h.key);
    return {
      apiUrl: $("#settingApiUrl").value.trim() || DEFAULT_API_URL,
      headers,
      maxAssetsPerRequest: clampMaxAssets($("#settingMaxAssets").value.trim()),
      demoMode: $("#settingDemoMode").checked,
      includePayloadSheet: $("#settingIncludePayloadSheet").checked,
    };
  }

  // ===========================================================================
  // FILE HANDLING / FLOW
  // ===========================================================================

  const ACCEPTED_EXT = [".xlsx", ".xls", ".csv"];

  function isAcceptedFile(file) {
    if (!file) return false;
    const name = file.name.toLowerCase();
    return ACCEPTED_EXT.some((ext) => name.endsWith(ext));
  }

  async function handleFile(file) {
    $("#uploadError").hidden = true;
    if (!isAcceptedFile(file)) {
      $("#uploadError").hidden = false;
      $("#uploadError").textContent = "Please upload an .xlsx, .xls, or .csv file.";
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbook(buffer, file.name);
      state.source = "excel";
      state.file = file;
      state.validRows = parsed.rows;
      state.errors = parsed.errors;
      state.rawRows = parsed.rows;
      state.previewPage = 1;

      const errorRowCount = new Set(parsed.errors.map((e) => e.row)).size;
      const displayedRows = parsed.rows.length + (parsed.missingRequiredCols?.length ? 0 : errorRowCount);
      showFileMeta(file.name, file.size, displayedRows || parsed.rows.length);

      renderPreview();
      goToStep(2);
      if (!parsed.errors.length) toast("File parsed successfully", "success");
      else toast("File parsed with validation issues", "info");
    } catch (err) {
      $("#uploadError").hidden = false;
      $("#uploadError").textContent = err?.message || "Could not read that file.";
      toast("Failed to parse file", "error");
    }
  }

  function handleJsonText(text, sourceName) {
    $("#uploadError").hidden = true;
    if (!text || !text.trim()) {
      $("#uploadError").hidden = false;
      $("#uploadError").textContent = "Paste a JSON request body or load a .json file.";
      return;
    }

    try {
      const parsed = parseJsonInput(text);
      state.source = "json";
      state.file = null;
      state.validRows = parsed.rows;
      state.errors = parsed.errors;
      state.rawRows = parsed.rows;
      state.previewPage = 1;

      const errorRowCount = new Set(parsed.errors.map((e) => e.row)).size;
      showFileMeta(sourceName, null, parsed.rows.length + errorRowCount);

      renderPreview();
      goToStep(2);
      if (!parsed.errors.length) toast("JSON parsed successfully", "success");
      else toast("JSON parsed with validation issues", "info");
    } catch (err) {
      $("#uploadError").hidden = false;
      $("#uploadError").textContent = err?.message || "Could not read that JSON.";
      toast("Failed to parse JSON", "error");
    }
  }

  async function handleJsonFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      $("#uploadError").hidden = false;
      $("#uploadError").textContent = "Please choose a .json file.";
      return;
    }
    const text = await file.text();
    $("#jsonInput").value = text;
    handleJsonText(text, file.name);
  }

  async function runProcess() {
    if (!state.validRows.length) {
      toast("No valid rows to process", "error");
      return;
    }

    goToStep(3);
    $("#processError").hidden = true;
    $("#progress").hidden = false;
    $("#btnCancelApi").hidden = false;

    const controller = new AbortController();
    state.abortController = controller;

    try {
      setProgress("parsing", 15, "Building request payload…");
      state.payload = buildPayload(state.validRows);
      await delay(200, controller.signal);

      setProgress("calling", 45, state.settings.demoMode ? "Using demo response…" : "Calling matching API…");
      const response = await callApi(state.payload, state.settings, controller.signal, (current, total) => {
        const pct = 45 + Math.round((35 * (current - 1)) / total);
        const label = total > 1
          ? `Calling matching API (batch ${current} of ${total})…`
          : "Calling matching API…";
        setProgress("calling", pct, label);
      });
      state.results = response.results;
      state.resultsPage = 1;

      setProgress("building", 80, "Building Excel workbook…");
      const built = await buildWorkbook(state.results, {
        includePayloadSheet: !!state.settings.includePayloadSheet,
        payload: state.payload,
      });
      state.workbookBuffer = built.buffer;
      state.columns = built.columns;
      state.autoDownloaded = false;

      setProgress("building", 100, "Done");
      $("#btnCancelApi").hidden = true;

      renderResults();
      goToStep(4);

      toast("Results ready — download Excel when you want", "success");
    } catch (err) {
      $("#btnCancelApi").hidden = true;
      $("#progress").hidden = true;
      $("#processError").hidden = false;

      if (err?.name === "AbortError") {
        $("#processErrorTitle").textContent = "Request cancelled";
        $("#processErrorBody").textContent = "The API call was cancelled.";
      } else if (err?.name === "ApiError") {
        $("#processErrorTitle").textContent = err.title || "API error";
        $("#processErrorBody").textContent = err.body || err.message;
      } else {
        $("#processErrorTitle").textContent = "Unexpected error";
        $("#processErrorBody").textContent = err?.message || String(err);
      }
    } finally {
      state.abortController = null;
    }
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  function bindEvents() {
    const dropzone = $("#dropzone");
    const fileInput = $("#fileInput");

    $("#btnBrowse").addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleFile(file);
    });

    ["dragenter", "dragover"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("is-dragover");
      });
    });
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    $("#tabExcel").addEventListener("click", () => setInputMode("excel"));
    $("#tabJson").addEventListener("click", () => setInputMode("json"));
    $("#btnParseJson").addEventListener("click", () => handleJsonText($("#jsonInput").value, "Pasted JSON"));
    $("#btnLoadJsonFile").addEventListener("click", () => $("#jsonFileInput").click());
    $("#jsonFileInput").addEventListener("change", () => {
      handleJsonFile($("#jsonFileInput").files?.[0]).catch((err) => {
        $("#uploadError").hidden = false;
        $("#uploadError").textContent = err?.message || "Could not read that file.";
      });
    });

    $("#btnClearFile").addEventListener("click", resetApp);
    $("#btnTemplate").addEventListener("click", () => {
      downloadTemplate().then(() => toast("Template downloaded", "success"))
        .catch((err) => toast(err?.message || "Template failed", "error"));
    });

    $("#btnBackUpload").addEventListener("click", () => goToStep(1));
    $("#btnContinueValid").addEventListener("click", () => {
      state.errors = [];
      renderPreview();
      toast("Continuing with valid rows only", "info");
    });
    $("#btnPreviewPrev").addEventListener("click", () => {
      if (state.previewPage <= 1) return;
      state.previewPage -= 1;
      renderPreview();
    });
    $("#btnPreviewNext").addEventListener("click", () => {
      const info = pageInfo(state.validRows.length, state.previewPage);
      if (state.previewPage >= info.totalPages) return;
      state.previewPage += 1;
      renderPreview();
    });
    $("#btnResultsPrev").addEventListener("click", () => {
      if (state.resultsPage <= 1) return;
      state.resultsPage -= 1;
      renderResults();
    });
    $("#btnResultsNext").addEventListener("click", () => {
      const info = pageInfo((state.results || []).length, state.resultsPage);
      if (state.resultsPage >= info.totalPages) return;
      state.resultsPage += 1;
      renderResults();
    });
    $("#btnProcess").addEventListener("click", runProcess);
    $("#btnRetry").addEventListener("click", runProcess);
    $("#btnCancelProcess").addEventListener("click", () => {
      resetApp();
    });
    $("#btnCancelApi").addEventListener("click", () => {
      state.abortController?.abort();
    });

    $("#btnDownload").addEventListener("click", () => {
      if (!state.workbookBuffer) {
        toast("Nothing to download yet", "error");
        return;
      }
      downloadBuffer(state.workbookBuffer, timestampName());
      toast("Excel downloaded", "success");
    });
    $("#btnReset").addEventListener("click", resetApp);
    $("#btnStartNew").addEventListener("click", resetApp);

    $("#btnCopyRequest").addEventListener("click", () => {
      copyText($("#requestJson").textContent || "").then(() => toast("Request JSON copied", "success"));
    });
    $("#btnCopyResponse").addEventListener("click", () => {
      copyText($("#responseJson").textContent || "").then(() => toast("Response JSON copied", "success"));
    });

    $("#btnSettings").addEventListener("click", openSettings);
    $("#btnCloseSettings").addEventListener("click", closeSettings);
    $("#drawerBackdrop").addEventListener("click", closeSettings);
    $("#btnAddHeader").addEventListener("click", () => {
      const current = $$("#headerRows .header-row").map((row) => ({
        key: row.querySelector('[data-role="key"]').value,
        value: row.querySelector('[data-role="value"]').value,
      }));
      renderHeaderRows([...current, { key: "", value: "" }]);
    });
    $("#btnSaveSettings").addEventListener("click", () => {
      saveSettings(readSettingsForm());
      closeSettings();
      toast("Settings saved", "success");
    });
    $("#btnResetSettings").addEventListener("click", () => {
      saveSettings(defaultSettings());
      fillSettingsForm();
      toast("Settings reset to defaults", "info");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#settingsDrawer").classList.contains("is-open")) {
        closeSettings();
      }
    });
  }

  // Expose pure helpers for console/testing
  window.AssetMasterMatcher = {
    normalizeHeader,
    parseJsonInput,
    buildPayload,
    chunkPayload,
    flatten,
    collectColumns,
    buildWorkbook,
    validateRows,
    DEMO_RESPONSE,
  };

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    setInputMode("excel");
    goToStep(1);
  });
})();
