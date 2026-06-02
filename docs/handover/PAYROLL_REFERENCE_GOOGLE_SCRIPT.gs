// ================================================================
//  PAYROLL EXPORT SCRIPT  v2  —  multi-artist, self-configuring
//  ────────────────────────────────────────────────────────────────
//  REFERENCE DOC for the Lowpass app Payroll product build.
//
//  This is Adam's current Google Apps Script that automates payroll
//  PDF export from his Google Sheets workflow. It is the SOURCE OF
//  TRUTH for what the Payroll product needs to do for him.
//
//  When writing the Payroll spec for CC, this file is the
//  authoritative reference for:
//    - What rate types exist (show / travel / lowpass / per diem)
//    - How day types are classified (Show Day / Off-Travel Day / etc.)
//    - Per-diem rules (auto-applied on Show + Off/Travel, skipped on No Tour)
//    - How advances work (column K, subtracted from week subtotal)
//    - PDF output shape (per-person AND combined all-staff)
//    - Artist branding (color + logo per artist)
//    - Currency handling (£ / $ auto-detection in his sheet, will be tour-level in Lowpass)
//    - Multi-artist support (King Princess / Good Neighbours / etc.)
//
//  The Lowpass product version should do everything below BETTER —
//  using the relational database (artists, tours, personnel, rates)
//  instead of string-matching against a Google Sheet. No SUMMARY
//  drift, no temperamental Apps Script rendering.
//  ────────────────────────────────────────────────────────────────
//  SWITCH ARTIST    →  Payroll menu → Select Artist
//  ADD AN ARTIST    →  copy an entry in the ARTISTS block below
//  COLUMN LAYOUT    →  auto-detected from the SUMMARY header row
//  CURRENCY         →  auto-detected from £ / $ symbols in SUMMARY
// ================================================================

// ──────────────────────────────────────────────────────────────────
//  ARTIST DEFINITIONS
//
//  brandHex      – accent colour used throughout the PDF
//  logoDriveId   – Drive file ID for the artist logo (PDF footer).
//                  Can be left '' — the menu will prompt on first run.
//  headerDriveId – Drive file ID for a banner image (PDF top).
//                  Leave '' to show the artist name as text instead.
//  namePrefix    – first characters of the spreadsheet name used for
//                  auto-detection (e.g. "KP" matches "KP | Payroll …")
// ──────────────────────────────────────────────────────────────────
const ARTISTS = {
  KING_PRINCESS: {
    name:          'King Princess',
    brandHex:      '#FF6A00',
    logoDriveId:   '1oO-S7Wt8kup7a9KFtL3p1MY_aysMwNlB',
    headerDriveId: '',
    namePrefix:    'KP',
  },
  GOOD_NEIGHBOURS: {
    name:          'Good Neighbours',
    brandHex:      '#2D6A4F',
    logoDriveId:   '13CZ-RpleKYhIxsOje2MNnySBlSFX0mUc',
    headerDriveId: '',
    namePrefix:    'GN',
  },
};

// ──────────────────────────────────────────────────────────────────
//  LAYOUT  —  only edit if the weekly sheet column structure changes.
//  SUMMARY columns are auto-detected from header names at runtime.
// ──────────────────────────────────────────────────────────────────
const LAYOUT = {
  summarySheet: 'SUMMARY',
  col: {           // weekly tab columns (1-based: A=1, B=2 …)
    role:     1,   // A  crew role
    first:    2,   // B  first name
    last:     3,   // C  last name
    dayStart: 4,   // D  first day of week
    dayEnd:   10,  // J  last day of week
    advance:  11,  // K  advance amount
  },
  // Keywords used to classify each day cell
  showKeys:         ['SHOW'],
  travelKeys:       ['TRAVEL'],
  aclPerDiemText:   'ACL PER DIEM',
  aclPerDiemAmount: 125,
  perDiemOn:        ['SHOW DAY', 'OFF/TRAVEL DAY'],
  // PDF appearance
  headerMaxHeightPx: 120,
  footerLogoWidthPx: 80,
  makeWeekSubfolder: true,
};

// ─── Property key helpers ─────────────────────────────────────────
// Artist is stored per-spreadsheet so copying the script to a new
// sheet doesn't carry over the previous sheet's artist setting.
function artistPropKey_()  { return 'PAYROLL_ARTIST_' + SpreadsheetApp.getActive().getId(); }
function logoPropKey_(k)   { return 'PAYROLL_LOGO_' + k; }
const FOLDER_PROP_ = 'PAYROLL_OUTPUT_FOLDER_ID';

// ================================================================
//  MENU
//  The menu title shows the currently selected artist once set.
// ================================================================
function onOpen() {
  const name  = getStoredArtistName_();
  const label = name ? ('Payroll  [' + name + ']') : 'Payroll';
  SpreadsheetApp.getUi()
    .createMenu(label)
    .addItem('Generate weekly PDFs',              'generateWeeklyPDFs')
    .addItem('Generate All-Staff (combined PDF)',  'exportAllStaffCombinedPdf')
    .addSeparator()
    .addItem('Select Artist',                     'selectArtist')
    .addItem('Set / Change default folder',        'setOutputFolder')
    .addToUi();
}

function getStoredArtistName_() {
  const k = PropertiesService.getUserProperties().getProperty(artistPropKey_()) || '';
  return (k && ARTISTS[k]) ? ARTISTS[k].name : '';
}

function getStoredArtistKey_() {
  const k = PropertiesService.getUserProperties().getProperty(artistPropKey_()) || '';
  return (k && ARTISTS[k]) ? k : Object.keys(ARTISTS)[0];
}

// ================================================================
//  ARTIST SELECTION
// ================================================================
/** Menu item — lets the user pick or change the artist for this sheet */
function selectArtist() {
  const key = promptSelectArtist_();
  if (!key) return;
  promptForLogoIfMissing_(key);
  SpreadsheetApp.getUi().alert(
    'Artist set to: ' + ARTISTS[key].name +
    '\n\nReload the spreadsheet to update the menu title.'
  );
}

/** Shows a numbered list; saves selection to properties. Returns key or null. */
function promptSelectArtist_() {
  const ui      = SpreadsheetApp.getUi();
  const entries = Object.entries(ARTISTS);
  const list    = entries.map(function(e, i) { return (i + 1) + '. ' + e[1].name; }).join('\n');
  const resp = ui.prompt(
    'Select Artist',
    'Which artist is this payroll sheet for?\n\n' + list + '\n\nType a number:',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  const num = parseInt(resp.getResponseText().trim(), 10);
  if (isNaN(num) || num < 1 || num > entries.length) {
    ui.alert('Invalid selection — please type a number from the list.');
    return null;
  }
  const key = entries[num - 1][0];
  PropertiesService.getUserProperties().setProperty(artistPropKey_(), key);
  return key;
}

/** If no logo is configured or stored for this artist, offer to set one. */
function promptForLogoIfMissing_(artistKey) {
  if (getLogoId_(artistKey)) return; // already have one
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    'Logo for ' + ARTISTS[artistKey].name,
    'No logo is set for this artist.\n' +
    'Paste a Google Drive file URL or ID for the logo\n(or leave blank to skip):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const id = parseDriveFileId_(resp.getResponseText().trim());
  if (!id) {
    ui.alert('Could not read a file ID — skipping. Run Select Artist again to try once more.');
    return;
  }
  PropertiesService.getUserProperties().setProperty(logoPropKey_(artistKey), id);
  ui.alert('Logo saved for ' + ARTISTS[artistKey].name + '.');
}

/**
 * Returns the active artist key for this spreadsheet.
 * Order of resolution:
 *   1. Stored in UserProperties for this spreadsheet ID
 *   2. Auto-detected from the spreadsheet name prefix (KP, GN, …)
 *   3. User is prompted to pick from the list
 */
function getActiveArtistKey_() {
  const props  = PropertiesService.getUserProperties();
  const stored = props.getProperty(artistPropKey_()) || '';
  if (stored && ARTISTS[stored]) return stored;
  // Auto-detect from spreadsheet name
  const ssName = SpreadsheetApp.getActive().getName().toUpperCase();
  for (var k in ARTISTS) {
    var prefix = (ARTISTS[k].namePrefix || '').toUpperCase();
    if (prefix && ssName.startsWith(prefix)) {
      props.setProperty(artistPropKey_(), k);
      return k;
    }
  }
  // Fall back to asking the user
  return promptSelectArtist_();
}

/** Returns the logo Drive file ID: checks stored property then falls back to config. */
function getLogoId_(artistKey) {
  var stored = PropertiesService.getUserProperties().getProperty(logoPropKey_(artistKey)) || '';
  return stored || (ARTISTS[artistKey] || {}).logoDriveId || '';
}

// ================================================================
//  GENERATE INDIVIDUAL PDFs  (one per person)
// ================================================================
function generateWeeklyPDFs() {
  var result = prepare_();
  if (!result) return;
  var weekTitle = result.weekTitle, roster = result.roster,
      images = result.images, outFolder = result.outFolder,
      currency = result.currency, artistKey = result.artistKey;

  var links = [];
  roster.forEach(function(person) {
    var li = computeLineItems_(person, false);
    var html  = renderFullPage_(person, li.lineItems, li.subtotal, li.grandTotal,
                                weekTitle, images, currency, artistKey);
    var fname = (person.last + ' ' + person.first + ' - ' + weekTitle + '.pdf').replace(/\s+/g, ' ').trim();
    var file  = outFolder.createFile(Utilities.newBlob(html, 'text/html; charset=utf-8').getAs('application/pdf')).setName(fname);
    links.push('<li>' + dialogLink_(file.getUrl(), fname) + '</li>');
  });

  showDialog_(
    '<p>Saved ' + links.length + ' file(s) to ' +
    dialogLink_(outFolder.getUrl(), outFolder.getName()) + '.</p>' +
    '<ul>' + links.join('') + '</ul>',
    'Weekly PDFs ready', 440, 340
  );
}

// ================================================================
//  GENERATE COMBINED ALL-STAFF PDF
// ================================================================
function exportAllStaffCombinedPdf() {
  var result = prepare_();
  if (!result) return;
  var weekTitle = result.weekTitle, roster = result.roster,
      images = result.images, outFolder = result.outFolder,
      currency = result.currency, artistKey = result.artistKey;

  var ssName = SpreadsheetApp.getActive().getName();
  var missing  = [];
  var sections = roster.map(function(person) {
    if (!person.hasRates) missing.push(person.first + ' ' + person.last);
    var li = computeLineItems_(person, true);
    return renderSection_(person, li.lineItems, li.subtotal, li.grandTotal,
                          weekTitle, images, currency, artistKey);
  });

  var html  = wrapCombinedHtml_(sections, currency, artistKey);
  var fname = ssName.split('|')[0].trim() + ' | ' + weekTitle + ' | All Staff.pdf';
  var file  = outFolder.createFile(Utilities.newBlob(html, 'text/html; charset=utf-8').getAs('application/pdf')).setName(fname);

  var missingHtml = missing.length
    ? '<p style="color:#c00"><strong>Missing in SUMMARY:</strong><br>' + missing.map(escHtml_).join('<br>') + '</p>'
    : '';
  showDialog_(
    '<p>Saved ' + dialogLink_(file.getUrl(), file.getName()) + '.</p>' + missingHtml,
    'All-Staff ready', 420, 240
  );
}

// ================================================================
//  SHARED SETUP
//  Detects rows, columns, currency; loads roster, images and folder.
// ================================================================
function prepare_() {
  var artistKey = getActiveArtistKey_();
  if (!artistKey) return null;

  var ss    = SpreadsheetApp.getActive();
  var sheet = ss.getActiveSheet();

  var rows  = detectRows_(sheet);
  if (sheet.getLastRow() < rows.firstDataRow) {
    ss.toast('No data rows found.', 'Payroll', 5);
    return null;
  }

  var dayCount = LAYOUT.col.dayEnd - LAYOUT.col.dayStart + 1;
  var dates  = sheet.getRange(rows.dateRow, LAYOUT.col.dayStart, 1, dayCount).getDisplayValues()[0];
  // venues = event/festival abbreviations (row below the date row, e.g. ZEYZEY, BOTTLEROCK)
  var venues = sheet.getRange(rows.cityRow, LAYOUT.col.dayStart, 1, dayCount).getDisplayValues()[0];
  // locations = geographic city labels for tax purposes, read from the column-header row (D-J
  // of the FORENAME/SURNAME row). Day-type keywords (SHOW, TRAVEL, REHEARSAL…) are filtered out.
  var headerDayVals = (rows.firstDataRow > 1)
    ? sheet.getRange(rows.firstDataRow - 1, LAYOUT.col.dayStart, 1, dayCount).getDisplayValues()[0]
    : [];
  var locations = headerDayVals.map(function(v) { return isDayTypeLabel_(v) ? '' : normalize_(v); });
  var weekTitle = 'W/C ' + dates[0] + ' - ' + dates[dates.length - 1];

  var summarySheet = ss.getSheetByName(LAYOUT.summarySheet);
  if (!summarySheet) {
    ss.toast('SUMMARY sheet not found — check the sheet name in LAYOUT.summarySheet.', 'Payroll', 8);
    return null;
  }

  var summaryCol = detectSummaryColumns_(summarySheet);
  var currency   = detectCurrency_(summarySheet);
  var ratesMap   = loadRates_(summarySheet, summaryCol);

  // Diagnostic logging — visible in Apps Script: View → Executions → click run
  console.log('[Payroll] SUMMARY cols: ' + JSON.stringify(summaryCol));
  console.log('[Payroll] Rates loaded for ' + Object.keys(ratesMap).length +
              ' people: ' + Object.keys(ratesMap).join(', '));

  if (Object.keys(ratesMap).length === 0) {
    ss.toast(
      'No rates found in SUMMARY. Check column headers say: FORENAME, SURNAME, SHOW RATE, TRAVEL RATE, PER DIEM',
      'Payroll', 10
    );
    return null;
  }

  var roster  = buildRoster_(sheet, rows, dates, venues, locations, ratesMap);
  var images  = loadImages_(artistKey);
  // Prompt for logo at export time if none is set, so it isn't silently skipped
  if (!images.logo) {
    promptForLogoIfMissing_(artistKey);
    images = loadImages_(artistKey);
  }

  var baseFolder = pickFolder_();
  if (!baseFolder) return null;
  var outFolder = LAYOUT.makeWeekSubfolder ? getOrCreate_(baseFolder, weekTitle) : baseFolder;

  return { artistKey: artistKey, weekTitle: weekTitle, roster: roster,
           images: images, outFolder: outFolder, currency: currency };
}

// ================================================================
//  ROW AUTO-DETECTION
//  Scans up to 30 rows to find:
//    dateRow      – row where D–J have 4+ cells containing digits
//    cityRow      – next populated row after dateRow
//    firstDataRow – row after the FORENAME / SURNAME column header
//  Falls back to the old hardcoded values if detection fails.
// ================================================================
function detectRows_(sheet) {
  var scanLimit = Math.min(30, sheet.getLastRow());
  var data      = sheet.getRange(1, 1, scanLimit, LAYOUT.col.dayEnd).getDisplayValues();
  var dateRow = 0, cityRow = 0, firstDataRow = 0;

  for (var r = 0; r < scanLimit; r++) {
    var b = normalize_(data[r][LAYOUT.col.first - 1]).toUpperCase();
    var c = normalize_(data[r][LAYOUT.col.last  - 1]).toUpperCase();

    // Column header row → data starts on the next line
    if (b === 'FORENAME' && c === 'SURNAME') {
      firstDataRow = r + 2;
      break;
    }

    var days   = data[r].slice(LAYOUT.col.dayStart - 1, LAYOUT.col.dayEnd);
    var filled = days.filter(function(v) { return v.trim() !== ''; });

    if (filled.length >= 4 && filled.some(function(v) { return /\d/.test(v); }) && !dateRow) {
      dateRow = r + 1;
    } else if (dateRow && !cityRow && filled.length >= 1) {
      cityRow = r + 1;
    }
  }

  return {
    dateRow:      dateRow      || 6,
    cityRow:      cityRow      || 8,
    firstDataRow: firstDataRow || 9,
  };
}

// ================================================================
//  SUMMARY COLUMN AUTO-DETECTION
//  Scans the SUMMARY sheet for a header row containing "FORENAME",
//  then maps column positions by name. This means the script works
//  regardless of whether a sheet has a LOWPASS RATE column or not,
//  and regardless of how many extra columns are inserted.
// ================================================================
var SUMMARY_HEADER_MAP_ = {
  'FORENAME':     'first',
  'FIRST NAME':   'first',
  'SURNAME':      'last',
  'LAST NAME':    'last',
  'SHOW RATE':    'show',
  'TRAVEL RATE':  'travel',
  'LOWPASS RATE': 'lowpass',
  'LOWPASS':      'lowpass',
  'PER DIEM':     'perDiem',
};

// Safe fallback if auto-detection finds nothing
var SUMMARY_COL_FALLBACK_ = { first: 2, last: 3, show: 4, travel: 5, lowpass: 0, perDiem: 7 };

function detectSummaryColumns_(sh) {
  if (!sh) return SUMMARY_COL_FALLBACK_;
  var last = Math.min(sh.getLastRow(), 20);
  var maxC = 15;
  var data = sh.getRange(1, 1, last, maxC).getDisplayValues();

  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    // Only process the row that contains the FORENAME header
    if (!row.some(function(c) { return normalize_(c).toUpperCase() === 'FORENAME'; })) continue;

    var map = {};
    row.forEach(function(cell, i) {
      var key = SUMMARY_HEADER_MAP_[normalize_(cell).toUpperCase()];
      if (key && !map[key]) map[key] = i + 1; // 1-based; first match wins
    });

    return {
      first:   map.first   || SUMMARY_COL_FALLBACK_.first,
      last:    map.last    || SUMMARY_COL_FALLBACK_.last,
      show:    map.show    || SUMMARY_COL_FALLBACK_.show,
      travel:  map.travel  || SUMMARY_COL_FALLBACK_.travel,
      lowpass: map.lowpass || 0,    // 0 = column not present in this sheet
      perDiem: map.perDiem || SUMMARY_COL_FALLBACK_.perDiem,
    };
  }

  return SUMMARY_COL_FALLBACK_;
}

// ================================================================
//  CURRENCY AUTO-DETECTION
//  Reads the first 30 rows of SUMMARY and returns 'GBP' if any cell
//  starts with £, 'USD' if any starts with $, or 'USD' as default.
//  The first symbol found wins, so put your primary currency rows first.
// ================================================================
function detectCurrency_(sh) {
  if (!sh) return 'USD';
  var last = Math.min(sh.getLastRow(), 30);
  var maxC = Math.min(sh.getLastColumn(), 15);
  if (last < 1 || maxC < 1) return 'USD';
  var data = sh.getRange(1, 1, last, maxC).getDisplayValues();
  for (var r = 0; r < data.length; r++) {
    for (var c = 0; c < data[r].length; c++) {
      var v = String(data[r][c]).trim();
      if (v.charAt(0) === '£') return 'GBP';
      if (v.charAt(0) === '$') return 'USD';
    }
  }
  return 'USD';
}

// ================================================================
//  ROSTER BUILDER
//  Returns an array of person objects; skips blank and legend rows.
// ================================================================
var SKIP_NAMES_ = ['FORENAME', 'SURNAME', 'SHOW DAY', 'OFF/TRAVEL DAY', 'NO TOUR', 'ACL PER DIEM'];

function buildRoster_(sheet, rows, dates, venues, locations, ratesMap) {
  var lastRow  = sheet.getLastRow();
  var rowCount = lastRow - rows.firstDataRow + 1;
  if (rowCount < 1) return [];

  var width = LAYOUT.col.advance;
  var disp  = sheet.getRange(rows.firstDataRow, 1, rowCount, width).getDisplayValues();
  var raw   = sheet.getRange(rows.firstDataRow, 1, rowCount, width).getValues();

  return disp.reduce(function(acc, row, i) {
    var first = normalize_(row[LAYOUT.col.first - 1]);
    var last  = normalize_(row[LAYOUT.col.last  - 1]);
    if (!first && !last) return acc;

    var nameUp = (first + ' ' + last).toUpperCase();
    if (SKIP_NAMES_.some(function(s) { return nameUp.indexOf(s) !== -1; })) return acc;

    var rates   = ratesMap[nameKey_(first, last)];
    var advance = Number(raw[i][LAYOUT.col.advance - 1]) || 0;
    var weekCells = row.slice(LAYOUT.col.dayStart - 1, LAYOUT.col.dayEnd);

    acc.push({
      first:     first,
      last:      last,
      role:      normalize_(row[LAYOUT.col.role - 1]),
      advance:   advance,
      rates:     rates || { show: 0, travel: 0, lowpass: 0, perDiem: 0 },
      hasRates:  !!rates,
      weekCells: weekCells,
      dates:     dates,
      venues:    venues,
      locations: locations,
    });
    return acc;
  }, []);
}

// Explicit display strings for day types — avoids the 2-letter uppercase
// rule in toTitleCase_() turning "No" into "NO".
var TYPE_DISPLAY_ = {
  'SHOW DAY':        'Show Day',
  'OFF/TRAVEL DAY':  'Off/Travel Day',
  'NO TOUR':         'No Tour',
};

// ================================================================
//  LINE ITEM COMPUTATION  (pure — no sheet access)
//  useLowpass = true  → combined PDF uses lowpass rate when available
//  useLowpass = false → individual PDFs use show / travel rates
// ================================================================
function computeLineItems_(person, useLowpass) {
  var rates      = person.rates;
  var showRate   = (useLowpass && rates.lowpass > 0) ? rates.lowpass : rates.show;
  var travelRate = (useLowpass && rates.lowpass > 0) ? rates.lowpass : rates.travel;

  var subtotal = 0;
  var lineItems = person.weekCells.map(function(cell, d) {
    var text = String(cell || '').toUpperCase();

    // type stays uppercase for perDiemOn matching; converted to title case for display later
    var type = 'NO TOUR', rate = 0, pd = 0;

    if (containsAny_(text, LAYOUT.showKeys)) {
      type = 'SHOW DAY';
      rate = showRate;
      pd   = LAYOUT.perDiemOn.indexOf(type) !== -1 ? rates.perDiem : 0;
    } else if (containsAny_(text, LAYOUT.travelKeys)) {
      type = 'OFF/TRAVEL DAY';
      rate = travelRate;
      pd   = LAYOUT.perDiemOn.indexOf(type) !== -1 ? rates.perDiem : 0;
    } else if (LAYOUT.aclPerDiemText && text.indexOf(LAYOUT.aclPerDiemText.toUpperCase()) !== -1) {
      type = LAYOUT.aclPerDiemText;
      pd   = LAYOUT.aclPerDiemAmount;
    }

    // Build city and venue display values separately (different columns in the PDF).
    // City = geographic location from header row (for tax purposes).
    // Venue = event/festival abbreviation (ZEYZEY, BOTTLEROCK…) from city row.
    var venueRaw = normalize_(person.venues[d]    || '');
    var locRaw   = normalize_(person.locations[d] || '');
    var venueDisp = (venueRaw && venueRaw !== '-' &&
                     venueRaw.toUpperCase() !== locRaw.toUpperCase()) ? toTitleCase_(venueRaw) : '';
    var locDisp   = (locRaw   && locRaw   !== '-') ? toTitleCase_(locRaw)   : '';

    var dayTotal = rate + pd;
    subtotal += dayTotal;
    return {
      date:    toTitleCase_(person.dates[d] || ''),
      city:    locDisp,
      venue:   venueDisp,
      dayType: TYPE_DISPLAY_[type] || toTitleCase_(type),   // "Show Day", "Off/Travel Day", "No Tour"
      rate:    rate,
      perDiem: pd,
      dayTotal: dayTotal,
    };
  });

  return { lineItems: lineItems, subtotal: subtotal, grandTotal: subtotal + person.advance };
}

// ================================================================
//  RATES LOADER  (from SUMMARY sheet)
// ================================================================
function loadRates_(sh, cols) {
  if (!sh) return {};
  var S    = cols;
  var last = sh.getLastRow();

  // Find the first real data row (skip branding / header rows)
  var start = 7;
  var scanEnd = Math.min(last, 30);
  if (scanEnd >= 4) {
    var scan = sh.getRange(4, 1, scanEnd - 3, Math.max(S.last, S.first, 3)).getDisplayValues();
    for (var r = 0; r < scan.length; r++) {
      var f = normalize_(scan[r][S.first - 1]).toUpperCase();
      var l = normalize_(scan[r][S.last  - 1]).toUpperCase();
      if (f && l && f !== 'FORENAME' && l !== 'SURNAME') { start = r + 4; break; }
    }
  }

  var span = Math.max(S.perDiem, S.lowpass || 0, S.travel, S.show, S.last, 1);
  var data = sh.getRange(start, 1, last - start + 1, span).getValues();

  return data.reduce(function(map, row) {
    var first = normalize_(row[S.first - 1]);
    var last  = normalize_(row[S.last  - 1]);
    if (!first && !last) return map;
    map[nameKey_(first, last)] = {
      show:    toNum_(row[S.show             - 1]),
      travel:  toNum_(row[S.travel           - 1]),
      lowpass: S.lowpass ? toNum_(row[S.lowpass - 1]) : 0,
      perDiem: toNum_(row[S.perDiem          - 1]),
    };
    return map;
  }, {});
}

// ================================================================
//  IMAGE LOADING
// ================================================================
function loadImages_(artistKey) {
  var art = ARTISTS[artistKey] || {};
  return {
    logo:   driveToDataUri_(getLogoId_(artistKey)),
    header: driveToDataUri_(art.headerDriveId || ''),
  };
}

// Apps Script's HTML→PDF renderer has a payload limit; large embedded images
// cause a silent conversion failure. We try converting to JPEG first (strips
// alpha, lossy compression — usually shrinks PNGs by 60-80%), then enforce a
// 1 MB cap on whatever we end up with.
var IMAGE_EMBED_LIMIT_ = 1 * 1024 * 1024; // 1 MB after any conversion

function driveToDataUri_(id) {
  if (!id) return '';
  try {
    var blob = DriveApp.getFileById(id).getBlob();
    // Attempt PNG→JPEG conversion to reduce size.
    if ((blob.getContentType() || '').indexOf('png') !== -1) {
      try { blob = blob.getAs('image/jpeg'); } catch (ignored) {}
    }
    var bytes = blob.getBytes();
    if (bytes.length > IMAGE_EMBED_LIMIT_) {
      var kb = Math.round(bytes.length / 1024);
      SpreadsheetApp.getActive().toast(
        'Logo skipped (' + kb + ' KB — limit is 1 MB). ' +
        'Compress it at squoosh.app or tinypng.com, re-upload to Drive, then update the logoDriveId.',
        'Payroll', 12
      );
      console.warn('Logo ' + id + ' is ' + kb + ' KB after conversion — too large to embed.');
      return '';
    }
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(bytes);
  } catch (e) {
    console.warn('Could not load Drive image ' + id + ': ' + e.message);
    return '';
  }
}

// ================================================================
//  HTML RENDERING
// ================================================================
function renderFullPage_(person, lineItems, subtotal, grandTotal, weekTitle, images, currency, artistKey) {
  return '<!doctype html><html><head><meta charset="utf-8"/>' +
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap"/>' +
         '<style>' + sharedCss_(artistKey) + '</style></head><body>' +
         pageBody_(person, lineItems, subtotal, grandTotal, weekTitle, images, currency, artistKey) +
         '</body></html>';
}

function renderSection_(person, lineItems, subtotal, grandTotal, weekTitle, images, currency, artistKey) {
  return '<section class="page">' +
         pageBody_(person, lineItems, subtotal, grandTotal, weekTitle, images, currency, artistKey) +
         '</section>';
}

function wrapCombinedHtml_(sections, currency, artistKey) {
  return '<!doctype html><html><head><meta charset="utf-8"/>' +
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap"/>' +
         '<style>@page{size:A4;margin:14mm}.page{page-break-after:always}' +
         sharedCss_(artistKey) + '</style></head><body>' +
         sections.join('\n') + '</body></html>';
}

function pageBody_(person, lineItems, subtotal, grandTotal, weekTitle, images, currency, artistKey) {
  var art = ARTISTS[artistKey] || { name: '', brandHex: '#333' };
  var fmt = function(n) { return money_(n, currency); };

  var rows = lineItems.map(function(li) {
    return '<tr>' +
      '<td>' + escHtml_(li.date)    + '</td>' +
      '<td>' + escHtml_(li.city)    + '</td>' +
      '<td>' + escHtml_(li.venue)   + '</td>' +
      '<td>' + escHtml_(li.dayType) + '</td>' +
      '<td class="r">' + fmt(li.rate)    + '</td>' +
      '<td class="r">' + fmt(li.perDiem) + '</td>' +
      '<td class="r"><strong>' + fmt(li.dayTotal) + '</strong></td>' +
      '</tr>';
  }).join('');

  var headerHtml = images.header
    ? '<div class="hero"><img src="' + images.header + '" alt="' + escHtml_(art.name) + '"/></div>'
    : '<div class="artist-name">' + escHtml_(art.name) + '</div>';

  var footerHtml = images.logo
    ? '<div class="footer"><img src="' + images.logo + '" alt="' + escHtml_(art.name) + '"/></div>'
    : '';

  return headerHtml +
    '<h1>Weekly Invoice Breakdown <span class="badge">' + escHtml_(weekTitle) + '</span></h1>' +
    '<h2><strong>' + escHtml_(person.first) + ' ' + escHtml_(person.last) + '</strong>' +
    ' <span class="role">' + escHtml_(person.role) + '</span></h2>' +
    '<table><thead><tr>' +
    '<th>Date</th><th>City</th><th>Venue</th><th>Type</th><th>Rate</th><th>Per Diem</th><th>Total</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<table class="totals">' +
    '<tr><td>Subtotal (week salary):</td><td class="r">' + fmt(subtotal)        + '</td></tr>' +
    '<tr><td>Advance this week:</td>      <td class="r">' + fmt(person.advance)  + '</td></tr>' +
    '<tr><td class="grand"><strong>Total due:</strong></td>' +
    '<td class="r grand val"><strong>' + fmt(grandTotal) + '</strong></td></tr>' +
    '</table>' + footerHtml;
}

function sharedCss_(artistKey) {
  // All colour values are inlined as plain hex — no CSS variables or color-mix(),
  // which are not supported by the Apps Script HTML→PDF renderer.
  var brand      = (ARTISTS[artistKey] || { brandHex: '#333333' }).brandHex;
  var headerBg   = tintHex_(brand, 0.85);   // brand at ~15% opacity on white
  var headerBord = tintHex_(brand, 0.65);   // brand at ~35% opacity on #ddd
  var totalBord  = brand;                   // solid brand colour on the totals rule

  return 'body{font:13px "Avenir Next","Avenir Next LT Pro","Avenir","DM Sans",Arial,sans-serif;color:#111;margin:24px}' +
    'h1{font-size:18px;margin:0 0 6px}h2{font-size:14px;margin:0 0 14px;color:#444}' +
    '.role{color:#666;margin-left:6px}' +
    '.badge{display:inline-block;background:' + brand + ';color:#fff;font-weight:600;' +
    '       padding:2px 8px;border-radius:6px;font-size:11px;margin-left:6px}' +
    '.artist-name{font-size:22px;font-weight:700;color:' + brand + ';margin:0 0 12px;text-align:center}' +
    '.hero{margin:0 0 12px;text-align:center}' +
    '.hero img{max-height:' + LAYOUT.headerMaxHeightPx + 'px;width:auto;height:auto;display:inline-block}' +
    'table{width:100%;border-collapse:collapse;margin:0 0 8px}' +
    'th,td{border:1px solid #ddd;padding:8px}th{background:#fafafa;text-align:left;border-color:#e8e8e8}' +
    'thead th{background:' + headerBg + ';border-color:' + headerBord + '}' +
    '.r{text-align:right}' +
    '.totals{margin-top:12px;border-top:4px solid ' + totalBord + ';padding-top:10px}' +
    '.totals td{border:none;padding:4px 0}' +
    '.grand{font-size:16px;color:#000}.val{color:' + brand + '}' +
    '.footer{margin-top:22px;text-align:center}' +
    '.footer img{width:' + LAYOUT.footerLogoWidthPx + 'px;height:auto;opacity:.95}';
}

/**
 * Mix a hex colour with white.
 * pct = fraction to shift toward white (0 = original colour, 1 = pure white).
 */
function tintHex_(hex, pct) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
  var r = parseInt(hex.slice(0, 2), 16);
  var g = parseInt(hex.slice(2, 4), 16);
  var b = parseInt(hex.slice(4, 6), 16);
  r = Math.round(r + (255 - r) * pct);
  g = Math.round(g + (255 - g) * pct);
  b = Math.round(b + (255 - b) * pct);
  return '#' + [r, g, b].map(function(v) { return ('0' + v.toString(16)).slice(-2); }).join('');
}

// ================================================================
//  FOLDER MANAGEMENT
// ================================================================
function setOutputFolder() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt('Set output folder', 'Paste a Google Drive folder URL or ID:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var id = parseDriveFolderId_(resp.getResponseText());
  if (!id) return ui.alert('Could not read a folder ID from that input.');
  try {
    DriveApp.getFolderById(id);
    PropertiesService.getUserProperties().setProperty(FOLDER_PROP_, id);
    ui.alert('Default folder saved. It will be used automatically from now on.');
  } catch (e) {
    ui.alert('That folder is not accessible — check the share permissions.');
  }
}

function pickFolder_() {
  var props  = PropertiesService.getUserProperties();
  var lastId = props.getProperty(FOLDER_PROP_) || '';
  if (lastId) {
    try { return DriveApp.getFolderById(lastId); } catch (e) { /* folder gone; re-prompt */ }
  }
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Choose output folder',
    'Paste a Google Drive folder URL or ID.\nThis will be remembered for next time.',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  var id = parseDriveFolderId_(resp.getResponseText().trim());
  if (!id) { ui.alert('Could not read a folder ID.'); return null; }
  try {
    var folder = DriveApp.getFolderById(id);
    props.setProperty(FOLDER_PROP_, id);
    return folder;
  } catch (e) {
    ui.alert('That folder is not accessible — check the share permissions.');
    return null;
  }
}

function parseDriveFolderId_(s) {
  var m = String(s || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

function parseDriveFileId_(s) {
  if (!s) return '';
  var m;
  m = String(s).match(/\/d\/([-\w]{25,})/);         if (m) return m[1];
  m = String(s).match(/open\?id=([-\w]{25,})/);     if (m) return m[1];
  m = String(s).match(/[?&]id=([-\w]{25,})/);       if (m) return m[1];
  m = String(s).match(/[-\w]{25,}/);                return m ? m[0] : '';
}

function getOrCreate_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ================================================================
//  UTILITIES
// ================================================================
function normalize_(s)    { return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
function nameKey_(f, l)   { return normalize_(f + ' ' + l).toUpperCase(); }
function toNum_(x)        { var n = Number(String(x == null ? '' : x).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function containsAny_(t, keys) { var u = String(t || '').toUpperCase(); return keys.some(function(k) { return u.indexOf(k.toUpperCase()) !== -1; }); }
function money_(n, cur)   { return (cur === 'GBP' ? '£' : '$') + Number(n || 0).toFixed(2); }
function escHtml_(s)      { return String(s || '').replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

function dialogLink_(url, label) {
  return '<a href="#" data-url="' + escHtml_(url) + '" style="color:#1a73e8;cursor:pointer">' + escHtml_(label) + '</a>';
}

function toTitleCase_(s) {
  return String(s || '').toLowerCase().replace(/\b\w+/g, function(w) {
    return (w.length <= 2) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
  });
}

var DAY_TYPE_PREFIXES_ = ['SHOW', 'TRAVEL', 'REHEARSAL', 'NO TOUR', 'OFF/TRAVEL'];
function isDayTypeLabel_(s) {
  var t = (s || '').toString().replace(/\s+/g, ' ').trim().toUpperCase();
  if (!t || t === '-') return true;
  return DAY_TYPE_PREFIXES_.some(function(k) { return t.indexOf(k) === 0; });
}

function showDialog_(bodyHtml, title, width, height) {
  var fullHtml =
    '<!DOCTYPE html><html><head><base target="_top"></head><body>' +
    '<div style="font:14px system-ui,sans-serif;padding:4px">' + bodyHtml + '</div>' +
    '<scr' + 'ipt>' +
    'document.querySelectorAll("a[data-url]").forEach(function(a){' +
    '  a.addEventListener("click",function(e){' +
    '    e.preventDefault();' +
    '    google.script.host.openUrl(a.getAttribute("data-url"));' +
    '  });' +
    '});' +
    '<\/scr' + 'ipt>' +
    '</body></html>';

  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutput(fullHtml).setWidth(width).setHeight(height),
    title
  );
}
