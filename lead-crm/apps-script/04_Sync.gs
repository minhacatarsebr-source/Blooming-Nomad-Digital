/**
 * 04_Sync.gs — Transfers new rows from RAW_LEADS to the CRM.
 *
 * Runs every five minutes from a time-driven trigger, because rows written by
 * an external integration (Make.com) do not fire onEdit.
 */

/**
 * Processes every RAW_LEADS row whose "Processing Status" is empty.
 * Safe against concurrent runs (lock) and against re-processing (Lead ID check).
 * @return {number} Number of leads added to the CRM.
 */
function syncNewLeads() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    logSystem_('WARN', 'syncNewLeads', 'Another run is in progress; this run was skipped');
    return 0;
  }
  try {
    var result = syncNewLeads_();
    if (result.added > 0 || result.errors > 0) {
      logSystem_('INFO', 'syncNewLeads', result.added + ' added, ' + result.skipped + ' skipped, ' + result.errors + ' error(s)');
    }
    lock.releaseLock();
    lock = null;
    if (result.added > 0) {
      result.records.forEach(function (record) {
        try {
          sendNewLeadNotification(record, result.settings);
        } catch (err) {
          logSystem_('ERROR', 'sendNewLeadNotification', 'Lead ' + record['Lead ID'] + ': ' + err.message);
        }
      });
      try {
        updateDashboard();
      } catch (err) {
        logSystem_('ERROR', 'updateDashboard', err.message);
      }
    }
    return result.added;
  } catch (err) {
    logSystem_('ERROR', 'syncNewLeads', err.message);
    throw err;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function syncNewLeads_() {
  var raw = getSheet_(SHEETS.RAW);
  var crm = getSheet_(SHEETS.CRM);
  var rawMap = headerMap_(raw);
  var crmMap = headerMap_(crm);
  requireColumns_(SHEETS.RAW, rawMap, ['Lead ID', 'Processing Status', 'Processing Notes', 'Processed At']);
  requireColumns_(SHEETS.CRM, crmMap, CRM_HEADERS);

  var out = { added: 0, skipped: 0, errors: 0, records: [], settings: null };
  var lastRow = raw.getLastRow();
  if (lastRow < 2) return out;

  var rawHeaders = Object.keys(rawMap);
  var rawValues = raw.getRange(2, 1, lastRow - 1, raw.getLastColumn()).getValues();

  // 1. Collect the rows waiting to be processed.
  var pending = [];
  rawValues.forEach(function (row, i) {
    if (String(row[rawMap['Processing Status']]).trim()) return;
    var hasData = row.some(function (cell) { return String(cell).trim() !== ''; });
    if (!hasData) return;
    var obj = {};
    rawHeaders.forEach(function (h) { obj[h] = row[rawMap[h]]; });
    pending.push({ rowNumber: i + 2, data: obj });
  });
  if (!pending.length) return out;

  var settings = readSettings_();
  var rules = readScoringRules_();
  var now = new Date();
  out.settings = settings;

  // 2. Rows without a Lead ID (manual entry) get a permanent one BEFORE the CRM
  //    is touched, so an interrupted run can never create the lead twice.
  var stamp = Utilities.formatDate(now, 'UTC', 'yyyyMMddHHmmss');
  pending.forEach(function (p) {
    if (String(p.data['Lead ID']).trim()) return;
    p.data['Lead ID'] = 'MAN-' + stamp + '-' + p.rowNumber;
    raw.getRange(p.rowNumber, rawMap['Lead ID'] + 1).setValue(p.data['Lead ID']);
  });
  SpreadsheetApp.flush();

  // 3. Index the leads already in the CRM for duplicate detection.
  var existing = { ids: {}, emails: {}, phones: {} };
  var crmLastRow = crm.getLastRow();
  if (crmLastRow >= 2) {
    crm.getRange(2, 1, crmLastRow - 1, crm.getLastColumn()).getValues().forEach(function (row) {
      var id = String(row[crmMap['Lead ID']]).trim();
      if (!id) return;
      existing.ids[id] = true;
      var email = String(row[crmMap['Email']]).trim().toLowerCase();
      var phone = String(row[crmMap['Phone']]).trim();
      if (email && !existing.emails[email]) existing.emails[email] = id;
      if (phone && !existing.phones[phone]) existing.phones[phone] = id;
    });
  }

  // 4. Build the CRM records.
  var props = PropertiesService.getDocumentProperties();
  var rrState = { rrIndex: Number(props.getProperty('ROUND_ROBIN_INDEX')) || 0 };
  var ctx = { settings: settings, rules: rules, now: now, rrState: rrState, existing: existing };
  var crmWidth = crm.getLastColumn();
  var newRows = [];

  pending.forEach(function (p) {
    try {
      p.result = processNewLead(p.data, ctx);
    } catch (err) {
      p.result = { status: 'ERROR', notes: err.message, record: null };
    }
    if (p.result.record) {
      var row = [];
      for (var i = 0; i < crmWidth; i++) row.push('');
      for (var header in p.result.record) {
        if (header in crmMap) row[crmMap[header]] = sanitizeCell(p.result.record[header]);
      }
      newRows.push(row);
      out.records.push(p.result.record);
      out.added++;
    } else if (p.result.status.indexOf('ERROR') === 0) {
      out.errors++;
    } else {
      out.skipped++;
    }
  });

  // 5. Append to the CRM in one write, then make the WhatsApp links clickable.
  if (newRows.length) {
    var firstNewRow = crm.getLastRow() + 1;
    crm.getRange(firstNewRow, 1, newRows.length, crmWidth).setValues(newRows);
    out.records.forEach(function (record, i) {
      var url = record['WhatsApp Link'];
      if (!url) return;
      crm.getRange(firstNewRow + i, crmMap['WhatsApp Link'] + 1).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText('Open WhatsApp').setLinkUrl(url).build());
    });
    props.setProperty('ROUND_ROBIN_INDEX', String(rrState.rrIndex));
  }
  SpreadsheetApp.flush();

  // 6. Mark the raw rows as processed (only the three system columns are written).
  pending.forEach(function (p) {
    setCells_(raw, p.rowNumber, rawMap, {
      'Processing Status': p.result.status,
      'Processing Notes': p.result.notes,
      'Processed At': now
    });
  });
  return out;
}
