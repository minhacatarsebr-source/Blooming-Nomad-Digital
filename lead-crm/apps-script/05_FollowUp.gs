/**
 * 05_FollowUp.gs — Follow-up tracking, status management and priorities.
 *
 * Two ways to record a contact attempt:
 *   1. Menu "Lead CRM > Log follow-up for selected lead" (full details, desktop).
 *   2. Choosing a value in the CRM column "Last Contact Result" (quick, works on mobile).
 * Both write a line to FOLLOW_UP_LOG and update the lead in the CRM.
 * Changing "Lead Status" alone is never counted as a contact with the customer.
 */

/* ------------------------------------------------------------------ */
/* CRM row <-> state                                                   */
/* ------------------------------------------------------------------ */

function rowToState_(row, map) {
  return {
    status: String(row[map['Lead Status']]).trim(),
    firstContactAt: cellDate_(row[map['First Contact Date']]),
    lastContactAt: cellDate_(row[map['Last Contact Date']]),
    attempts: Number(row[map['Contact Attempts']]) || 0,
    lastContactResult: String(row[map['Last Contact Result']]).trim(),
    nextFollowUpAt: cellDate_(row[map['Next Follow-up Date']]),
    nextAction: String(row[map['Next Action']]).trim(),
    lostReason: String(row[map['Lost Reason']]).trim(),
    saleStatus: String(row[map['Sale Status']]).trim()
  };
}

var STATE_COLUMNS_ = {
  status: 'Lead Status',
  firstContactAt: 'First Contact Date',
  lastContactAt: 'Last Contact Date',
  attempts: 'Contact Attempts',
  lastContactResult: 'Last Contact Result',
  nextFollowUpAt: 'Next Follow-up Date',
  nextAction: 'Next Action',
  lostReason: 'Lost Reason',
  saleStatus: 'Sale Status'
};

function sameValue_(a, b) {
  var norm = function (v) {
    if (v === null || v === undefined || v === '') return '';
    return v instanceof Date ? v.getTime() : v;
  };
  return norm(a) === norm(b);
}

/** Writes only the state fields that changed. */
function writeState_(sheet, rowNumber, map, before, after) {
  var changes = {};
  for (var key in STATE_COLUMNS_) {
    if (sameValue_(before[key], after[key])) continue;
    var value = after[key];
    if (key === 'nextFollowUpAt' && value) value = toSheetDate_(value);
    changes[STATE_COLUMNS_[key]] = value;
  }
  setCells_(sheet, rowNumber, map, changes);
}

/** Automatic quality before any salesperson override. */
function formQuality_(row, map, settings) {
  if (String(row[map['Score Explanation']]).indexOf('DISQUALIFIED:') !== -1) return QUALITY.DISQUALIFIED;
  return classifyScore(Number(row[map['Lead Score']]) || 0, settings);
}

/** Computes Lead Quality and Lead Priority of a row for the given state. */
function computeQualityAndPriority_(row, map, state, settings, now) {
  var quality = resolveLeadQuality(formQuality_(row, map, settings), row[map['Sales Qualification']]);
  var priority = calculateLeadPriority({
    status: state.status,
    quality: quality,
    createdAt: cellDate_(row[map['Lead Created Date']]),
    firstContactAt: state.firstContactAt,
    nextFollowUpAt: state.nextFollowUpAt ? toSheetDate_(state.nextFollowUpAt) : null,
    appointmentAt: cellDate_(row[map['Appointment Date']])
  }, now, settings);
  return { quality: quality, priority: priority };
}

/* ------------------------------------------------------------------ */
/* Edits made directly in the CRM tab                                  */
/* ------------------------------------------------------------------ */

/**
 * Simple trigger: runs on every manual edit. Only single-cell edits in the CRM
 * tab are handled; everything else is caught by the hourly maintenance.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEETS.CRM) return;
    var rowNumber = e.range.getRow();
    if (rowNumber < 2 || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

    var map = headerMap_(sheet);
    var row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    var leadId = String(row[map['Lead ID']]).trim();
    if (!leadId) return;

    var editedIndex = e.range.getColumn() - 1;
    var settings = readSettings_();
    var now = new Date();
    var before = rowToState_(row, map);
    var after;

    var result = String(row[map['Last Contact Result']]).trim();
    if (editedIndex === map['Last Contact Result'] && result) {
      // A contact result was chosen: record one contact attempt.
      after = applyFollowUp(before, { type: 'Follow-up', result: result }, settings, now);
      appendFollowUpLog_({
        leadId: leadId,
        date: now,
        salesperson: row[map['Assigned Salesperson']],
        type: 'Follow-up',
        result: result,
        notes: 'Recorded from the CRM tab',
        nextAction: after.nextAction,
        nextFollowUpAt: after.nextFollowUpAt
      });
    } else {
      after = closeIfExhausted(before, settings);
    }

    writeState_(sheet, rowNumber, map, before, after);
    var computed = computeQualityAndPriority_(row, map, after, settings, now);
    setCells_(sheet, rowNumber, map, {
      'Lead Quality': computed.quality,
      'Lead Priority': computed.priority,
      'Last Updated': now
    });
  } catch (err) {
    logSystem_('ERROR', 'onEdit', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Follow-up dialog                                                    */
/* ------------------------------------------------------------------ */

/** Opens the follow-up form for the lead in the selected CRM row. */
function showFollowUpDialog() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var rowNumber = sheet.getActiveCell().getRow();
  if (sheet.getName() !== SHEETS.CRM || rowNumber < 2) {
    ui.alert('Select a lead first', 'Open the CRM tab and click any cell in the row of the lead.', ui.ButtonSet.OK);
    return;
  }
  var map = headerMap_(sheet);
  var row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  var leadId = String(row[map['Lead ID']]).trim();
  if (!leadId) {
    ui.alert('No lead in this row', 'The selected row has no Lead ID.', ui.ButtonSet.OK);
    return;
  }
  var settings = readSettings_();
  var template = HtmlService.createTemplateFromFile('FollowUpDialog');
  template.payload = JSON.stringify({
    leadId: leadId,
    name: String(row[map['Full Name']]),
    status: String(row[map['Lead Status']]),
    salesperson: String(row[map['Assigned Salesperson']]),
    salespeople: settings.salespeople,
    statuses: settings.statuses,
    results: settings.contactResults,
    types: settings.activityTypes
  });
  ui.showModalDialog(template.evaluate().setWidth(440).setHeight(600), 'Log follow-up');
}

/** Called by the dialog when the salesperson presses Save. */
function submitFollowUp(form) {
  if (!form || !String(form.leadId || '').trim()) throw new Error('Missing Lead ID.');
  if (!String(form.type || '').trim()) throw new Error('Choose an activity type.');
  var nextDate = null;
  if (form.nextFollowUpDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.nextFollowUpDate)) throw new Error('Invalid next follow-up date.');
    nextDate = Utilities.parseDate(form.nextFollowUpDate, getSpreadsheet_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return logFollowUp(String(form.leadId).trim(), {
    salesperson: String(form.salesperson || ''),
    type: String(form.type),
    result: String(form.result || ''),
    notes: String(form.notes || ''),
    nextAction: String(form.nextAction || ''),
    nextFollowUpAt: nextDate,
    newStatus: String(form.newStatus || '')
  });
}

/**
 * Records one sales activity: adds it to FOLLOW_UP_LOG and updates the lead
 * (attempts, first/last contact date, status, next follow-up, priority).
 * @param {string} leadId
 * @param {Object} activity {salesperson, type, result, notes, nextAction, nextFollowUpAt, newStatus}
 * @return {string} Short confirmation text.
 */
function logFollowUp(leadId, activity) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) throw new Error('The system is busy. Please try again in a few seconds.');
  try {
    var sheet = getSheet_(SHEETS.CRM);
    var map = headerMap_(sheet);
    requireColumns_(SHEETS.CRM, map, CRM_HEADERS);
    var rowNumber = findLeadRow_(sheet, map, leadId);
    if (!rowNumber) throw new Error('Lead ' + leadId + ' was not found in the CRM.');

    var row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    var settings = readSettings_();
    var now = new Date();
    var before = rowToState_(row, map);
    var after = applyFollowUp(before, activity, settings, now);

    appendFollowUpLog_({
      leadId: leadId,
      date: now,
      salesperson: activity.salesperson || row[map['Assigned Salesperson']],
      type: activity.type,
      result: activity.result,
      notes: activity.notes,
      nextAction: after.nextAction,
      nextFollowUpAt: after.nextFollowUpAt
    });

    writeState_(sheet, rowNumber, map, before, after);
    var computed = computeQualityAndPriority_(row, map, after, settings, now);
    setCells_(sheet, rowNumber, map, {
      'Lead Quality': computed.quality,
      'Lead Priority': computed.priority,
      'Last Updated': now
    });
    return 'Follow-up saved. Status: ' + after.status + '. Contact attempts: ' + after.attempts + '.';
  } finally {
    lock.releaseLock();
  }
}

function findLeadRow_(sheet, map, leadId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var ids = sheet.getRange(2, map['Lead ID'] + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === leadId) return i + 2;
  }
  return 0;
}

function appendFollowUpLog_(entry) {
  var sheet = getSheet_(SHEETS.LOG);
  var map = headerMap_(sheet);
  var activityId = 'ACT-' + Utilities.formatDate(entry.date, 'UTC', 'yyyyMMddHHmmss') + '-' +
    Math.floor(1000 + Math.random() * 9000);
  var values = {
    'Activity ID': activityId,
    'Lead ID': "'" + entry.leadId,
    'Activity Date': entry.date,
    'Salesperson': sanitizeCell(String(entry.salesperson || '')),
    'Activity Type': sanitizeCell(String(entry.type || '')),
    'Contact Result': sanitizeCell(String(entry.result || '')),
    'Notes': sanitizeCell(String(entry.notes || '')),
    'Next Action': sanitizeCell(String(entry.nextAction || '')),
    'Next Follow-up Date': entry.nextFollowUpAt ? toSheetDate_(entry.nextFollowUpAt) : ''
  };
  var row = [];
  for (var i = 0; i < sheet.getLastColumn(); i++) row.push('');
  for (var header in values) if (header in map) row[map[header]] = values[header];
  sheet.appendRow(row);
}

/* ------------------------------------------------------------------ */
/* Hourly maintenance                                                  */
/* ------------------------------------------------------------------ */

/**
 * Time-driven (hourly): closes exhausted leads, recalculates quality and
 * priority for every lead (priority changes as time passes) and refreshes the
 * dashboard.
 */
function runMaintenance() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    logSystem_('WARN', 'runMaintenance', 'Another run is in progress; this run was skipped');
    return;
  }
  try {
    var sheet = getSheet_(SHEETS.CRM);
    var map = headerMap_(sheet);
    requireColumns_(SHEETS.CRM, map, CRM_HEADERS);
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var settings = readSettings_();
      var now = new Date();
      var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      var closed = 0;
      rows.forEach(function (row, i) {
        if (!String(row[map['Lead ID']]).trim()) return;
        var rowNumber = i + 2;
        var before = rowToState_(row, map);
        var after = closeIfExhausted(before, settings);
        if (before.status !== after.status) closed++;
        writeState_(sheet, rowNumber, map, before, after);
        var computed = computeQualityAndPriority_(row, map, after, settings, now);
        var updates = {};
        if (row[map['Lead Quality']] !== computed.quality) updates['Lead Quality'] = computed.quality;
        if (row[map['Lead Priority']] !== computed.priority) updates['Lead Priority'] = computed.priority;
        setCells_(sheet, rowNumber, map, updates);
      });
      if (closed) logSystem_('INFO', 'runMaintenance', closed + ' lead(s) closed as Lost after the maximum contact attempts');
    }
  } catch (err) {
    logSystem_('ERROR', 'runMaintenance', err.message);
    throw err;
  } finally {
    lock.releaseLock();
  }
  updateDashboard();
}

/**
 * Lists the open leads that need attention now: follow-up date in the past, or
 * new leads not contacted within the first-response SLA.
 * @return {Array<Object>} {leadId, name, salesperson, reason}
 */
function checkOverdueFollowUps() {
  var sheet = getSheet_(SHEETS.CRM);
  var map = headerMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var settings = readSettings_();
  var now = new Date();
  var overdue = [];
  sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues().forEach(function (row) {
    var leadId = String(row[map['Lead ID']]).trim();
    if (!leadId) return;
    var state = rowToState_(row, map);
    if (isClosedStatus(state.status)) return;
    var reason = '';
    var created = cellDate_(row[map['Lead Created Date']]);
    if (state.status === STATUS.NEW && !state.firstContactAt && created &&
        (now.getTime() - created.getTime()) / 60000 > settings.firstResponseSlaMinutes) {
      reason = 'New lead not contacted yet';
    } else if (state.nextFollowUpAt && now.getTime() >= state.nextFollowUpAt.getTime() + DAY_MS) {
      reason = 'Follow-up overdue';
    }
    if (reason) {
      overdue.push({
        leadId: leadId,
        name: String(row[map['Full Name']]),
        salesperson: String(row[map['Assigned Salesperson']]),
        reason: reason
      });
    }
  });
  return overdue;
}
