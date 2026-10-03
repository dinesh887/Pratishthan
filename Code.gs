/* =====================================================================
   शिवस्वराज्य निर्मिती प्रतिष्ठाण — Gadkot Spardha 2026
   Google Apps Script backend (Code.gs)

   Website form  ->  doPost(e)  ->  ONE central Google Sheet (new row each time)

   SETUP: paste your Google Sheet ID below, then Deploy > New deployment >
   Web app (Execute as: Me, Who has access: Anyone).
   ===================================================================== */

// >>> PASTE YOUR GOOGLE SHEET ID HERE (the long text between /d/ and /edit in the sheet URL) <<<
const SPREADSHEET_ID = "1e3TmmNpfAkkJJ2T5d4I50FG4d_yqGG0YyLSzZZWVews";
const SHEET_NAME = "Registrations";

const ID_PREFIX = "SSR-GAD-2026-";      // -> SSR-GAD-2026-0001, 0002, ...
const TIME_ZONE = "Asia/Kolkata";

// Column order (A to K). Do not reorder.
const HEADERS = [
  "Registration ID",          // A
  "Registration Date",        // B
  "Registration Time",        // C
  "Registration Type",        // D
  "Group / Personal Name",    // E
  "Area",                     // F
  "Address",                  // G
  "Fort Name",                // H
  "Fort Type",                // I
  "Contact Number",           // J
  "Alternate Contact Number"  // K
];

/* ---------------------------------------------------------------------
   POST handler: receives the form submission
   --------------------------------------------------------------------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);                       // one submission at a time -> unique IDs

    const p = (e && e.parameter) ? e.parameter : {};
    const data = {
      type:     clean_(p.type, 30),
      name:     clean_(p.name, 200),
      area:     clean_(p.area, 100),
      address:  clean_(p.address, 500),
      fort:     clean_(p.fort, 200),
      fortType: clean_(p.fortType, 50),
      phone:    clean_(p.phone, 10),
      phone2:   clean_(p.phone2, 10)
    };

    // Server-side validation (never trust the browser only)
    if (!data.name || !data.area || !data.address || !data.fort ||
        !/^\d{10}$/.test(data.phone) ||
        (data.phone2 && !/^\d{10}$/.test(data.phone2))) {
      return json_({ success: false, message: "Registration failed" });
    }

    // Accidental duplicate (e.g. retry after a slow network): same person within 2 minutes
    const cache = CacheService.getScriptCache();
    const dupKey = "dup_" + Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
        [data.name, data.phone, data.fort].join("|").toLowerCase()));
    const already = cache.get(dupKey);
    if (already) {
      return json_({ success: true, registrationId: already, message: "Registration successful" });
    }

    const sheet = getSheet_();
    const registrationId = nextRegistrationId_(sheet);
    const now = new Date();

    const row = sheet.getLastRow() + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);

    const range = sheet.getRange(row, 1, 1, HEADERS.length);
    range.setNumberFormat("@");                  // plain text: keeps leading zeroes
    range.setValues([[
      registrationId,
      Utilities.formatDate(now, TIME_ZONE, "dd/MM/yyyy"),
      Utilities.formatDate(now, TIME_ZONE, "HH:mm:ss"),
      data.type,
      data.name,
      data.area,
      data.address,
      data.fort,
      data.fortType,
      data.phone,
      data.phone2
    ]]);
    SpreadsheetApp.flush();
    sheet.autoResizeColumns(1, HEADERS.length);

    cache.put(dupKey, registrationId, 120);

    return json_({ success: true, registrationId: registrationId, message: "Registration successful" });

  } catch (err) {
    console.error(err);
    return json_({ success: false, message: "Registration failed" });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* Opening the Web App URL in a browser shows this (handy for testing). */
function doGet() {
  return json_({ success: true, message: "Registration service is running" });
}

/* ---------------------------------------------------------------------
   Run this ONCE manually from the editor (select setupSheet > Run) to
   authorize the script and create/format the sheet before going live.
   --------------------------------------------------------------------- */
function setupSheet() {
  const sheet = getSheet_();
  Logger.log("Sheet ready: " + sheet.getName());
}

/* ---------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------- */
function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);   // ID stays here, never on the website
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  // One-time migration for sheets created before the Area column existed:
  // they have "Address" in column F. Insert a new column F so every existing
  // row shifts right (Address -> G ... Alternate Contact -> K) and Area stays
  // blank for old rows. Runs only once; no data is deleted.
  if (sheet.getLastRow() >= 1 && String(sheet.getRange(1, 6).getValue()).trim() === "Address") {
    sheet.insertColumnBefore(6);
  }
  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }

  // Headers (row 1)
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setNumberFormat("@");
  headerRange.setValues([HEADERS]);
  headerRange.setFontWeight("bold").setBackground("#F6B400").setFontColor("#3A1112");

  // Freeze header row
  sheet.setFrozenRows(1);

  // Text format for all data columns (phone numbers, date, time, ID)
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, HEADERS.length).setNumberFormat("@");
  }

  // Filter on header row (created once; re-created if it does not cover all columns)
  let filter = sheet.getFilter();
  if (filter && filter.getRange().getNumColumns() < HEADERS.length) {
    filter.remove();
    filter = null;
  }
  if (!filter) {
    sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), HEADERS.length).createFilter();
  }

  sheet.autoResizeColumns(1, HEADERS.length);
  return sheet;
}

/* Next ID = highest existing number in column A + 1 (works even if rows are sorted/deleted). */
function nextRegistrationId_(sheet) {
  let max = 0;
  const last = sheet.getLastRow();
  if (last > 1) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    ids.forEach(function (r) {
      const m = String(r[0]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return ID_PREFIX + String(max + 1).padStart(4, "0");
}

function clean_(v, maxLen) {
  return String(v == null ? "" : v).trim().slice(0, maxLen);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
