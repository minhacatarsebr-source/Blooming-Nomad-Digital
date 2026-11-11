/**
 * 03_Setup.gs — Spreadsheet helpers, settings reader, menu, one-time setup
 * and trigger installation.
 *
 * The script is bound to the spreadsheet (Extensions > Apps Script), so no
 * spreadsheet ID has to be configured: each client copy works on its own file.
 */

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Returns a tab or throws a clear error when the setup has not been run. */
function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Tab "' + name + '" not found. Run "Lead CRM > Setup > Run initial setup" first.');
  }
  return sheet;
}

/** Maps each header of row 1 to its 0-based column index. */
function headerMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var map = {};
  if (lastCol < 1) return map;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  headers.forEach(function (h, i) {
    var key = String(h).trim();
    if (key && !(key in map)) map[key] = i;
  });
  return map;
}

/** Throws when a required column was renamed or deleted. */
function requireColumns_(sheetName, map, headers) {
  var missing = headers.filter(function (h) { return !(h in map); });
  if (missing.length) {
    throw new Error('Tab "' + sheetName + '" is missing column(s): ' + missing.join(', '));
  }
}

/** Writes individual cells of one row. `values` is keyed by column header. */
function setCells_(sheet, row, map, values) {
  for (var header in values) {
    if (!(header in map)) continue;
    var v = values[header];
    sheet.getRange(row, map[header] + 1).setValue(v === null || v === undefined ? '' : v);
  }
}

/** Reads a cell as a Date, or null when it is empty or not a date. */
function cellDate_(value) {
  return parseDate(value);
}

/** Midnight of the given moment in the spreadsheet time zone. */
function toSheetDate_(date) {
  if (!date) return null;
  var tz = getSpreadsheet_().getSpreadsheetTimeZone();
  return Utilities.parseDate(Utilities.formatDate(date, tz, 'yyyy-MM-dd'), tz, 'yyyy-MM-dd');
}

/** Writes a line to SYSTEM_LOG. Never include personal data: use Lead IDs. */
function logSystem_(level, fn, message) {
  try {
    var sheet = getSpreadsheet_().getSheetByName(SHEETS.SYSTEM_LOG);
    if (sheet) sheet.appendRow([new Date(), level, fn, String(message).substring(0, 1000)]);
  } catch (err) {
    // Logging must never break the automation.
  }
  console.log('[' + level + '] ' + fn + ': ' + message);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/** Reads the SETTINGS tab into a typed object used by all functions. */
function readSettings_() {
  var sheet = getSheet_(SHEETS.SETTINGS);
  var values = sheet.getDataRange().getValues();
  var kv = {};
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0]).trim();
    if (key) kv[key] = String(values[r][1] == null ? '' : values[r][1]).trim();
  }
  var defaults = {};
  SETTINGS_DEFAULTS.forEach(function (d) { defaults[d[0]] = d[1]; });
  var get = function (key) { return kv[key] !== undefined && kv[key] !== '' ? kv[key] : defaults[key]; };
  var num = function (key) {
    var n = Number(get(key));
    return isNaN(n) ? Number(defaults[key]) : n;
  };
  var yes = function (key) { return String(get(key)).toUpperCase() === 'YES'; };

  var headerRow = values[0] || [];
  var column = function (header) {
    var idx = headerRow.indexOf(header);
    var out = [];
    if (idx === -1) return out;
    for (var i = 1; i < values.length; i++) out.push(String(values[i][idx] == null ? '' : values[i][idx]).trim());
    return out;
  };
  var compact = function (list) { return list.filter(function (x) { return x; }); };

  var people = column('Salespeople');
  var emails = column('Salesperson Email');
  var salespersonEmails = {};
  people.forEach(function (p, i) { if (p && emails[i]) salespersonEmails[p] = emails[i]; });

  var matchTexts = column('Assignment Match Text');
  var matchPeople = column('Assignment Salesperson');
  var assignmentRules = [];
  matchTexts.forEach(function (m, i) {
    if (m && matchPeople[i]) assignmentRules.push({ match: m, salesperson: matchPeople[i] });
  });

  var statuses = compact(column('Lead Statuses'));
  return {
    clientName: get('Client Name'),
    clientId: get('Client ID'),
    defaultCountry: String(get('Default Country Code')).toUpperCase(),
    currency: get('Currency'),
    timeZone: get('Time Zone'),
    assignmentMethod: get('Assignment Method'),
    firstResponseSlaMinutes: num('First Response SLA (minutes)'),
    maxAttempts: num('Max Contact Attempts'),
    followUpIntervals: String(get('Follow-up Intervals (days)')).split(/[^0-9]+/)
      .filter(function (x) { return x; }).map(Number),
    autoClose: yes('Auto-close After Max Attempts'),
    hotThreshold: num('Hot Score Threshold'),
    warmThreshold: num('Warm Score Threshold'),
    emailNotifications: yes('Email Notifications'),
    managerEmail: get('Manager Email'),
    telegramNotifications: yes('Telegram Notifications'),
    telegramChatId: get('Telegram Chat ID'),
    dailyReport: yes('Daily Report'),
    retentionMonths: num('Retention Months (Lost Leads)'),
    salespeople: compact(people),
    salespersonEmails: salespersonEmails,
    statuses: statuses.length ? statuses : SETTINGS_LISTS[2].values,
    contactResults: compact(column('Contact Results')),
    activityTypes: compact(column('Activity Types')),
    assignmentRules: assignmentRules
  };
}

/** Reads the LEAD_SCORING tab into rule objects. */
function readScoringRules_() {
  var sheet = getSheet_(SHEETS.SCORING);
  var values = sheet.getDataRange().getValues();
  var map = headerMap_(sheet);
  requireColumns_(SHEETS.SCORING, map, SCORING_HEADERS);
  var rules = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!String(row[map['Source Field']]).trim()) continue;
    rules.push({
      active: String(row[map['Active']]).trim().toUpperCase() === 'YES',
      criterion: row[map['Criterion']],
      field: String(row[map['Source Field']]).trim(),
      operator: row[map['Operator']],
      value: row[map['Match Value']],
      points: row[map['Points']],
      explanation: row[map['Explanation']]
    });
  }
  return rules;
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

/** Simple trigger: adds the "Lead CRM" menu when the spreadsheet opens. */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Lead CRM')
    .addItem('Log follow-up for selected lead', 'showFollowUpDialog')
    .addItem('Sync new leads now', 'menuSyncNewLeads')
    .addItem('Refresh priorities and dashboard', 'menuRunMaintenance')
    .addSeparator()
    .addSubMenu(ui.createMenu('Setup')
      .addItem('Run initial setup', 'setupSpreadsheet')
      .addItem('Install automatic triggers', 'installTriggers')
      .addItem('Insert example leads', 'insertExampleLeads')
      .addItem('Set Telegram bot token', 'setTelegramToken'))
    .addSubMenu(ui.createMenu('Privacy')
      .addItem('Anonymise expired lost leads', 'anonymiseExpiredLeads'))
    .addToUi();
}

function menuSyncNewLeads() {
  var count = syncNewLeads();
  SpreadsheetApp.getActiveSpreadsheet().toast(count + ' new lead(s) added to the CRM.', 'Lead CRM');
}

function menuRunMaintenance() {
  runMaintenance();
  SpreadsheetApp.getActiveSpreadsheet().toast('Priorities and dashboard refreshed.', 'Lead CRM');
}

/* ------------------------------------------------------------------ */
/* One-time setup                                                      */
/* ------------------------------------------------------------------ */

/**
 * Creates every tab, header, dropdown and formatting rule.
 * Safe to run again: existing data and settings are never overwritten.
 */
function setupSpreadsheet() {
  var ss = getSpreadsheet_();

  var settingsSheet = ensureSheet_(ss, SHEETS.SETTINGS, null);
  setupSettingsSheet_(settingsSheet);

  var raw = ensureSheet_(ss, SHEETS.RAW, RAW_HEADERS);
  var crm = ensureSheet_(ss, SHEETS.CRM, CRM_HEADERS);
  var scoring = ensureSheet_(ss, SHEETS.SCORING, SCORING_HEADERS);
  var log = ensureSheet_(ss, SHEETS.LOG, LOG_HEADERS);
  ensureSheet_(ss, SHEETS.DASHBOARD, null);
  ensureSheet_(ss, SHEETS.SYSTEM_LOG, SYSTEM_LOG_HEADERS);

  setupRawSheet_(raw);
  setupCrmSheet_(crm, settingsSheet);
  setupScoringSheet_(scoring);
  setupLogSheet_(log);

  // Apply the client's time zone so dates are shown and compared correctly.
  try {
    ss.setSpreadsheetTimeZone(readSettings_().timeZone);
  } catch (err) {
    logSystem_('WARN', 'setupSpreadsheet', 'Invalid Time Zone in SETTINGS: ' + err.message);
  }

  updateDashboard();
  logSystem_('INFO', 'setupSpreadsheet', 'Setup completed');
  ss.toast('Setup completed. Review the SETTINGS tab, then install the triggers.', 'Lead CRM', 8);
}

/** Creates a tab when missing and writes its header row when the tab is empty. */
function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  if (headers) {
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn()))
      .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  }
  return sheet;
}

function setupSettingsSheet_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Description']]);
    // Values are stored as plain text so "1;2;2;3;6" or "NO" are never reinterpreted.
    sheet.getRange(2, 2, SETTINGS_DEFAULTS.length, 1).setNumberFormat('@');
    sheet.getRange(2, 1, SETTINGS_DEFAULTS.length, 3).setValues(SETTINGS_DEFAULTS);
    SETTINGS_LISTS.forEach(function (list) {
      sheet.getRange(1, list.col).setValue(list.header);
      if (list.values.length) {
        sheet.getRange(2, list.col, list.values.length, 1)
          .setValues(list.values.map(function (v) { return [v]; }));
      }
    });
    sheet.setColumnWidth(1, 230);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 420);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');

  // Dropdowns for the settings that only accept fixed values.
  var keys = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).trim(); });
  var dropdown = function (key, options) {
    var row = keys.indexOf(key) + 1;
    if (row < 2) return;
    sheet.getRange(row, 2).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(options, true).setAllowInvalid(false).build());
  };
  dropdown('Assignment Method', ['Round Robin', 'Manual', 'Campaign-Based', 'Product-Based']);
  ['Auto-close After Max Attempts', 'Email Notifications', 'Telegram Notifications',
    'Daily Report', 'Meta CAPI Enabled (Phase 2)'].forEach(function (key) { dropdown(key, ['YES', 'NO']); });
}

function setupRawSheet_(sheet) {
  var map = headerMap_(sheet);
  var rows = sheet.getMaxRows() - 1;
  // Long Meta IDs lose digits and "+31..." phones turn into numbers unless stored as text.
  RAW_TEXT_COLUMNS.forEach(function (h) {
    if (h in map) sheet.getRange(2, map[h] + 1, rows, 1).setNumberFormat('@');
  });
  sheet.getRange(1, 1).setNote('Original data from Meta. Filled by Make.com or pasted by the agency. Salespeople must not edit this tab.');
  if (!sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sheet.protect().setDescription('RAW_LEADS: original data, do not edit manually').setWarningOnly(true);
  }
}

function setupCrmSheet_(sheet, settingsSheet) {
  var map = headerMap_(sheet);
  requireColumns_(SHEETS.CRM, map, CRM_HEADERS);
  var rows = sheet.getMaxRows() - 1;
  var col = function (h) { return sheet.getRange(2, map[h] + 1, rows, 1); };

  col('Lead ID').setNumberFormat('@');
  col('Phone').setNumberFormat('@');
  ['Lead Created Date', 'First Contact Date', 'Last Contact Date', 'Appointment Date', 'Last Updated']
    .forEach(function (h) { col(h).setNumberFormat('dd/mm/yyyy hh:mm'); });
  col('Next Follow-up Date').setNumberFormat('dd/mm/yyyy');
  col('Sales Opportunity Value').setNumberFormat('#,##0.00');

  // Dropdowns fed by the lists in SETTINGS (edit the lists there, not here).
  var listRange = function (header) {
    var def = SETTINGS_LISTS.filter(function (l) { return l.header === header; })[0];
    return settingsSheet.getRange(2, def.col, 200, 1);
  };
  var fromList = function (crmHeader, settingsHeader) {
    col(crmHeader).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(listRange(settingsHeader), true).setAllowInvalid(false).build());
  };
  fromList('Assigned Salesperson', 'Salespeople');
  fromList('Lead Status', 'Lead Statuses');
  fromList('Last Contact Result', 'Contact Results');
  fromList('Visit Status', 'Visit Statuses');
  fromList('Sale Status', 'Sale Statuses');
  fromList('Lost Reason', 'Lost Reasons');
  col('Sales Qualification').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(QUALITY_VALUES, true).setAllowInvalid(false).build());
  ['Next Follow-up Date', 'Appointment Date'].forEach(function (h) {
    col(h).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  });

  CRM_AUTO_COLUMNS.forEach(function (h) {
    sheet.getRange(1, map[h] + 1).setNote('Automatic column. Filled by the system; do not edit.');
  });
  sheet.getRange(1, map['Sales Qualification'] + 1)
    .setNote('Set by the salesperson after a real conversation. Overrides the automatic Lead Quality.');
  sheet.getRange(1, map['Last Contact Result'] + 1)
    .setNote('Choosing a result here records one contact attempt. For full details use Lead CRM > Log follow-up.');

  // Highlighting. Rules use built-in conditions only, so they work in every locale.
  var rule = function (header, build) {
    return build(SpreadsheetApp.newConditionalFormatRule()).setRanges([col(header)]).build();
  };
  var textRule = function (header, text, background, fontColor) {
    return rule(header, function (b) {
      return b.whenTextEqualTo(text).setBackground(background).setFontColor(fontColor || '#000000');
    });
  };
  sheet.setConditionalFormatRules([
    textRule('Lead Priority', PRIORITY.URGENT, '#dc2626', '#ffffff'),
    textRule('Lead Priority', PRIORITY.HIGH, '#fb923c'),
    textRule('Lead Priority', PRIORITY.MEDIUM, '#fde68a'),
    textRule('Lead Quality', QUALITY.HOT, '#fecaca'),
    textRule('Lead Quality', QUALITY.WARM, '#fef3c7'),
    textRule('Lead Quality', QUALITY.COLD, '#dbeafe'),
    textRule('Lead Quality', QUALITY.DISQUALIFIED, '#e5e7eb'),
    textRule('Lead Status', STATUS.NEW, '#bbf7d0'),          // new, not contacted yet
    textRule('Lead Status', STATUS.NO_RESPONSE, '#fde68a'),  // waiting for a response
    textRule('Lead Status', STATUS.APPOINTMENT, '#ddd6fe'),  // appointment scheduled
    textRule('Lead Status', STATUS.SOLD, '#86efac'),
    textRule('Lead Status', STATUS.LOST, '#d1d5db'),
    rule('Next Follow-up Date', function (b) {               // overdue follow-up
      return b.whenDateBefore(SpreadsheetApp.RelativeDate.TODAY).setBackground('#dc2626').setFontColor('#ffffff');
    }),
    rule('Next Follow-up Date', function (b) {               // due today
      return b.whenDateEqualTo(SpreadsheetApp.RelativeDate.TODAY).setBackground('#fb923c');
    })
  ]);
  sheet.setFrozenColumns(3);
}

function setupScoringSheet_(sheet) {
  var map = headerMap_(sheet);
  if (sheet.getLastRow() === 1) {
    sheet.getRange(2, 1, SCORING_DEFAULT_RULES.length, SCORING_HEADERS.length).setValues(SCORING_DEFAULT_RULES);
  }
  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, map['Active'] + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['YES', 'NO'], true).setAllowInvalid(false).build());
  sheet.getRange(2, map['Operator'] + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(SCORING_OPERATORS, true).setAllowInvalid(false).build());
  sheet.getRange(1, map['Source Field'] + 1).setNote(
    'Exact column name of RAW_LEADS (custom question columns included), or the derived fields "Phone Valid" / "Email Valid".');
  sheet.getRange(1, map['Points'] + 1).setNote(
    'Number of points added when the rule matches, or the word DISQUALIFY. The total is limited to 0-100.');
  sheet.getRange(1, map['Match Value'] + 1).setNote('For "is one of", separate the accepted answers with ";".');
}

function setupLogSheet_(sheet) {
  var map = headerMap_(sheet);
  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, map['Lead ID'] + 1, rows, 1).setNumberFormat('@');
  sheet.getRange(2, map['Activity Date'] + 1, rows, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sheet.getRange(2, map['Next Follow-up Date'] + 1, rows, 1).setNumberFormat('dd/mm/yyyy');
}

/* ------------------------------------------------------------------ */
/* Triggers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Installs the time-driven triggers. Run once per client spreadsheet, logged
 * in as the account that should own the automation. Safe to run again.
 */
function installTriggers() {
  var managed = ['syncNewLeads', 'runMaintenance', 'sendDailyReport'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (managed.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncNewLeads').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('runMaintenance').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendDailyReport').timeBased().everyDays(1).atHour(8).create();
  logSystem_('INFO', 'installTriggers', 'Triggers installed: sync every 5 minutes, maintenance hourly, daily report at 08:00');
  getSpreadsheet_().toast('Automatic triggers installed.', 'Lead CRM');
}

/** Adds three fictional leads to RAW_LEADS so the flow can be tested end to end. */
function insertExampleLeads() {
  var sheet = getSheet_(SHEETS.RAW);
  var map = headerMap_(sheet);
  var stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmmss');
  var created = new Date().toISOString();
  var examples = [
    { 'Lead ID': 'TEST-' + stamp + '-1', 'Created Time': created, 'Form Name': 'Example Form NL',
      'Campaign Name': 'NL | Example Campaign', 'Ad Set Name': 'Example Ad Set', 'Ad Name': 'Example Ad A',
      'Full Name': 'Jan Voorbeeld', 'Email': 'jan.voorbeeld@example.com', 'Phone': '06 12345678', 'Country': 'NL',
      'Product / Service Interest': 'Example Service', 'Hot Lead Answer': 'Ja', 'Contact Consent': 'Yes', 'Source': 'Test' },
    { 'Lead ID': 'TEST-' + stamp + '-2', 'Created Time': created, 'Form Name': 'Example Form PT',
      'Campaign Name': 'PT | Example Campaign', 'Ad Set Name': 'Example Ad Set', 'Ad Name': 'Example Ad B',
      'Full Name': 'Maria Exemplo', 'Email': 'maria.exemplo@example.com', 'Phone': '912 345 678', 'Country': 'Portugal',
      'Product / Service Interest': '', 'Hot Lead Answer': 'Não', 'Contact Consent': 'Yes', 'Source': 'Test' },
    { 'Lead ID': 'TEST-' + stamp + '-3', 'Created Time': created, 'Form Name': 'Example Form NL',
      'Campaign Name': 'NL | Example Campaign', 'Ad Set Name': 'Example Ad Set', 'Ad Name': 'Example Ad A',
      'Full Name': 'Invalid Phone Example', 'Email': 'not-an-email', 'Phone': '12345', 'Country': 'NL',
      'Product / Service Interest': 'Example Service', 'Hot Lead Answer': '', 'Contact Consent': '', 'Source': 'Test' }
  ];
  var width = sheet.getLastColumn();
  var rows = examples.map(function (lead) {
    var row = [];
    for (var i = 0; i < width; i++) row.push('');
    for (var header in lead) if (header in map) row[map[header]] = sanitizeCell(lead[header]);
    return row;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  getSpreadsheet_().toast('3 example leads added to RAW_LEADS. Run "Sync new leads now".', 'Lead CRM');
}
