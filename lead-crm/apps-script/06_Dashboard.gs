/**
 * 06_Dashboard.gs — Executive dashboard.
 *
 * The figures are calculated by the script and written as plain values, so the
 * tab works in any spreadsheet language/locale. It is refreshed after each sync
 * that adds leads, every hour, and on demand from the menu.
 *
 * Cost metrics (Cost per Lead, Cost per Qualified Lead, Cost per Sale) need ad
 * spend data from Meta, which is not imported yet: they are shown as pending.
 */

var DASHBOARD_LAYOUT_ = {
  overview: { row: 4, col: 1 },
  pipeline: { row: 4, col: 4 },
  performance: { row: 4, col: 7 },
  months: { row: 16, col: 1 },
  weeks: { row: 16, col: 6 },
  days: { row: 16, col: 9 },
  campaigns: { row: 34, col: 1 }
};

function updateDashboard() {
  var ss = getSpreadsheet_();
  var sheet = getSheet_(SHEETS.DASHBOARD);
  var settings = readSettings_();
  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var fmt = function (date, pattern) { return Utilities.formatDate(date, tz, pattern); };
  var m = computeDashboardMetrics(readCrmLeadsForDashboard_(), settings.statuses, now, fmt);
  var p = m.performance;
  var L = DASHBOARD_LAYOUT_;

  sheet.clearContents();
  sheet.getRange(1, 1).setValue('LEAD DASHBOARD — ' + settings.clientName).setFontSize(14).setFontWeight('bold');
  sheet.getRange(2, 1).setValue('Last refreshed: ' + fmt(now, 'dd/MM/yyyy HH:mm') + ' (' + tz + ')');

  writeBlock_(sheet, L.overview, 'LEAD OVERVIEW', ['Metric', 'Leads'], m.overview);
  writeBlock_(sheet, L.pipeline, 'SALES PIPELINE', ['Status', 'Leads'], m.pipeline);
  writeBlock_(sheet, L.performance, 'PERFORMANCE METRICS', ['Metric', 'Value'], [
    ['Lead-to-Contact Rate', p.contactRate],
    ['Lead-to-Appointment Rate', p.appointmentRate],
    ['Lead-to-Visit Rate', p.visitRate],
    ['Lead-to-Sale Conversion Rate', p.saleRate],
    ['Follow-up Completion Rate', p.followUpCompletionRate],
    ['Average Lead Score (0-100)', Math.round(p.averageScore * 10) / 10],
    ['Average First Response Time (hours)', Math.round(p.averageFirstResponseHours * 10) / 10]
  ]);
  sheet.getRange(L.performance.row + 2, L.performance.col + 1, 5, 1).setNumberFormat('0.0%');
  sheet.getRange(L.performance.row + 7, L.performance.col + 1, 2, 1).setNumberFormat('0.0');

  writeBlock_(sheet, L.months, 'LEADS AND SALES PER MONTH', ['Month', 'Leads', 'Sales', 'Conversion Rate'], m.months);
  sheet.getRange(L.months.row + 2, L.months.col + 3, m.months.length, 1).setNumberFormat('0.0%');
  writeBlock_(sheet, L.weeks, 'LEADS PER WEEK', ['Week Starting', 'Leads'], m.weeks);
  writeBlock_(sheet, L.days, 'LEADS PER DAY (LAST 14 DAYS)', ['Date', 'Leads'], m.days);

  var pending = 'Requires ad spend data';
  var campaignRows = m.campaigns.map(function (c) { return c.concat([pending, pending, pending]); });
  if (!campaignRows.length) campaignRows = [['(no leads yet)', 0, 0, 0, 0, pending, pending, pending]];
  writeBlock_(sheet, L.campaigns, 'CAMPAIGN ANALYSIS',
    ['Campaign', 'Leads', 'Qualified Leads', 'Sales', 'Conversion Rate', 'Cost per Lead', 'Cost per Qualified Lead', 'Cost per Sale'],
    campaignRows);
  sheet.getRange(L.campaigns.row + 2, L.campaigns.col + 4, campaignRows.length, 1).setNumberFormat('0.0%');

  ensureDashboardCharts_(sheet, m);
}

/** Writes a titled table: title row, header row, then the data rows. */
function writeBlock_(sheet, position, title, headers, rows) {
  sheet.getRange(position.row, position.col).setValue(title).setFontWeight('bold');
  sheet.getRange(position.row + 1, position.col, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#e5e7eb');
  if (rows.length) {
    // Month / week / date keys are text so they are never reformatted by the locale.
    var data = rows.map(function (r) {
      return r.map(function (v, i) { return i === 0 ? "'" + v : v; });
    });
    sheet.getRange(position.row + 2, position.col, data.length, headers.length).setValues(data);
  }
}

/** Reads only the non-personal CRM columns needed for the dashboard. */
function readCrmLeadsForDashboard_() {
  var sheet = getSheet_(SHEETS.CRM);
  var map = headerMap_(sheet);
  requireColumns_(SHEETS.CRM, map, CRM_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var leads = [];
  sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues().forEach(function (row) {
    if (!String(row[map['Lead ID']]).trim()) return;
    var score = row[map['Lead Score']];
    leads.push({
      createdAt: cellDate_(row[map['Lead Created Date']]),
      status: String(row[map['Lead Status']]).trim(),
      quality: String(row[map['Lead Quality']]).trim(),
      score: score === '' ? NaN : Number(score),
      firstContactAt: cellDate_(row[map['First Contact Date']]),
      nextFollowUpAt: cellDate_(row[map['Next Follow-up Date']]),
      appointmentAt: cellDate_(row[map['Appointment Date']]),
      visitStatus: String(row[map['Visit Status']]).trim(),
      campaign: String(row[map['Campaign']]).trim()
    });
  });
  return leads;
}

/** Creates the charts once. They read fixed ranges, so refreshes update them. */
function ensureDashboardCharts_(sheet, m) {
  try {
    if (sheet.getCharts().length) return;
    var L = DASHBOARD_LAYOUT_;
    var add = function (builder, position, columns, rows, title, anchorRow) {
      sheet.insertChart(builder
        .addRange(sheet.getRange(position.row + 1, position.col, rows + 1, columns))
        .setNumHeaders(1)
        .setOption('title', title)
        .setPosition(anchorRow, 12, 0, 0)
        .build());
    };
    add(sheet.newChart().asColumnChart(), L.pipeline, 2, m.pipeline.length, 'Sales Pipeline', 2);
    add(sheet.newChart().asColumnChart(), L.months, 3, m.months.length, 'Leads and Sales per Month', 21);
    add(sheet.newChart().asLineChart(), L.days, 2, m.days.length, 'Leads per Day (last 14 days)', 40);
  } catch (err) {
    logSystem_('WARN', 'ensureDashboardCharts_', 'Charts could not be created: ' + err.message);
  }
}
