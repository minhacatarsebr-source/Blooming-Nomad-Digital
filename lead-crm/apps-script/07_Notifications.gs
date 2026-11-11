/**
 * 07_Notifications.gs — Optional email and Telegram notifications.
 *
 * Everything here is switched on or off in the SETTINGS tab. The Telegram bot
 * token is a secret: it is stored in Script Properties (menu "Lead CRM > Setup >
 * Set Telegram bot token"), never in the spreadsheet or in the code.
 */

/**
 * Notifies the manager and the assigned salesperson about a new lead.
 * @param {Object} lead CRM record keyed by column header.
 * @param {Object} settings Result of readSettings_().
 */
function sendNewLeadNotification(lead, settings) {
  if (!settings.emailNotifications && !settings.telegramNotifications) return;
  var lines = [
    'New lead — ' + settings.clientName,
    '',
    'Name: ' + (lead['Full Name'] || '-'),
    'Phone: ' + (lead['Phone'] || '-'),
    'Email: ' + (lead['Email'] || '-'),
    'Product / Service Interest: ' + (lead['Product / Service Interest'] || '-'),
    'Campaign: ' + (lead['Campaign'] || '-'),
    'Lead Priority: ' + (lead['Lead Priority'] || '-'),
    'Lead Quality: ' + (lead['Lead Quality'] || '-') + ' (score ' + lead['Lead Score'] + ')',
    'Assigned Salesperson: ' + (lead['Assigned Salesperson'] || 'Not assigned')
  ];
  if (lead['WhatsApp Link']) lines.push('WhatsApp: ' + lead['WhatsApp Link']);
  lines.push('', 'Open the CRM: ' + getSpreadsheet_().getUrl());
  var body = lines.join('\n');

  if (settings.emailNotifications) {
    var recipients = [settings.managerEmail, settings.salespersonEmails[lead['Assigned Salesperson']]]
      .filter(function (x, i, all) { return x && all.indexOf(x) === i; });
    if (recipients.length) {
      MailApp.sendEmail(recipients.join(','), 'New lead: ' + (lead['Full Name'] || lead['Lead ID']), body);
    }
  }
  if (settings.telegramNotifications) sendTelegramMessage_(settings, body);
}

function sendTelegramMessage_(settings, text) {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token || !settings.telegramChatId) {
    logSystem_('WARN', 'sendTelegramMessage_', 'Telegram is enabled but the bot token or the chat ID is missing');
    return;
  }
  var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    payload: { chat_id: settings.telegramChatId, text: text, disable_web_page_preview: 'true' },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    logSystem_('ERROR', 'sendTelegramMessage_', 'Telegram returned HTTP ' + response.getResponseCode());
  }
}

/** Menu action: stores the Telegram bot token in Script Properties. */
function setTelegramToken() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Telegram bot token',
    'Paste the token given by @BotFather. It is stored in Script Properties, not in the sheet.',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var token = answer.getResponseText().trim();
  if (!token) return;
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_BOT_TOKEN', token);
  ui.alert('Token saved.');
}

/**
 * Time-driven (daily, 08:00): emails the manager a summary and the list of
 * leads that need attention. Does nothing unless "Daily Report" is YES.
 */
function sendDailyReport() {
  try {
    var settings = readSettings_();
    if (!settings.dailyReport) return;
    if (!settings.managerEmail) {
      logSystem_('WARN', 'sendDailyReport', 'Daily Report is enabled but Manager Email is empty');
      return;
    }
    var tz = getSpreadsheet_().getSpreadsheetTimeZone();
    var fmt = function (date, pattern) { return Utilities.formatDate(date, tz, pattern); };
    var m = computeDashboardMetrics(readCrmLeadsForDashboard_(), settings.statuses, new Date(), fmt);
    var overdue = checkOverdueFollowUps();

    var lines = ['Daily lead report — ' + settings.clientName, ''];
    m.overview.forEach(function (row) { lines.push(row[0] + ': ' + row[1]); });
    lines.push('', 'Pipeline:');
    m.pipeline.forEach(function (row) { lines.push('  ' + row[0] + ': ' + row[1]); });
    lines.push('', 'Leads needing attention: ' + overdue.length);
    overdue.slice(0, 50).forEach(function (o) {
      lines.push('  - ' + o.name + ' (' + (o.salesperson || 'not assigned') + '): ' + o.reason);
    });
    if (overdue.length > 50) lines.push('  ... and ' + (overdue.length - 50) + ' more');
    lines.push('', 'Open the CRM: ' + getSpreadsheet_().getUrl());

    MailApp.sendEmail(settings.managerEmail, 'Daily lead report — ' + settings.clientName, lines.join('\n'));
  } catch (err) {
    logSystem_('ERROR', 'sendDailyReport', err.message);
    throw err;
  }
}
