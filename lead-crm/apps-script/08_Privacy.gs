/**
 * 08_Privacy.gs — GDPR data retention.
 *
 * Lost leads older than "Retention Months (Lost Leads)" can be anonymised from
 * the menu. Personal data is erased in RAW_LEADS, CRM and FOLLOW_UP_LOG; the
 * non-personal fields (campaign, status, score, dates) are kept so statistics
 * stay correct. This cannot be undone, so it always asks for confirmation.
 */

var ANONYMISED_ = '[ANONYMISED]';

function anonymiseExpiredLeads() {
  var ui = SpreadsheetApp.getUi();
  var settings = readSettings_();
  var crm = getSheet_(SHEETS.CRM);
  var crmMap = headerMap_(crm);
  requireColumns_(SHEETS.CRM, crmMap, CRM_HEADERS);

  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - settings.retentionMonths);

  var lastRow = crm.getLastRow();
  var targets = [];
  if (lastRow >= 2) {
    crm.getRange(2, 1, lastRow - 1, crm.getLastColumn()).getValues().forEach(function (row, i) {
      var leadId = String(row[crmMap['Lead ID']]).trim();
      if (!leadId || String(row[crmMap['Lead Status']]).trim() !== STATUS.LOST) return;
      if (String(row[crmMap['Full Name']]) === ANONYMISED_) return;
      var reference = cellDate_(row[crmMap['Last Updated']]) || cellDate_(row[crmMap['Lead Created Date']]);
      if (reference && reference.getTime() < cutoff.getTime()) targets.push({ leadId: leadId, rowNumber: i + 2 });
    });
  }
  if (!targets.length) {
    ui.alert('Nothing to anonymise', 'No Lost lead is older than ' + settings.retentionMonths + ' months.', ui.ButtonSet.OK);
    return;
  }
  var answer = ui.alert('Anonymise ' + targets.length + ' lead(s)?',
    'Name, phone, email, notes and form answers of Lost leads not updated for more than ' +
    settings.retentionMonths + ' months will be permanently erased. This cannot be undone.',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    ui.alert('The system is busy. Please try again in a minute.');
    return;
  }
  try {
    var ids = {};
    targets.forEach(function (t) {
      ids[t.leadId] = true;
      setCells_(crm, t.rowNumber, crmMap, {
        'Full Name': ANONYMISED_, 'Phone': '', 'WhatsApp Link': '', 'Email': '',
        'Notes': '', 'Data Warnings': '', 'Next Action': ''
      });
    });

    // RAW_LEADS: erase identity fields and every custom form answer.
    var raw = getSheet_(SHEETS.RAW);
    var rawMap = headerMap_(raw);
    var personal = Object.keys(rawMap).filter(function (h) { return RAW_SYSTEM_COLUMNS.indexOf(h) === -1; });
    eraseRows_(raw, rawMap, ids, personal, 'Full Name');

    // FOLLOW_UP_LOG: free-text fields may contain personal data.
    var log = getSheet_(SHEETS.LOG);
    eraseRows_(log, headerMap_(log), ids, ['Notes', 'Next Action'], 'Notes');

    logSystem_('INFO', 'anonymiseExpiredLeads', targets.length + ' lead(s) anonymised (retention ' + settings.retentionMonths + ' months)');
  } finally {
    lock.releaseLock();
  }
  ui.alert(targets.length + ' lead(s) anonymised.');
}

/** Blanks the given columns for every row whose Lead ID is in `ids`. */
function eraseRows_(sheet, map, ids, headers, markerHeader) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !('Lead ID' in map)) return;
  var leadIds = sheet.getRange(2, map['Lead ID'] + 1, lastRow - 1, 1).getValues();
  leadIds.forEach(function (cell, i) {
    if (!ids[String(cell[0]).trim()]) return;
    var values = {};
    headers.forEach(function (h) { values[h] = h === markerHeader ? ANONYMISED_ : ''; });
    setCells_(sheet, i + 2, map, values);
  });
}
