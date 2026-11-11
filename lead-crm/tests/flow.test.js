/**
 * End-to-end flow against the in-memory mock (see gas-mock.js):
 * setup -> example leads -> sync -> follow-up -> maintenance -> dashboard.
 */
const test = require('node:test');
const assert = require('node:assert');
const { createEnvironment } = require('./gas-mock');

const env = createEnvironment();
const g = env.gas;
const D = 24 * 3600000;
// Dates created inside the script sandbox belong to another realm, so instanceof is not usable.
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';

function setSetting(key, value) {
  const sheet = env.sheets.SETTINGS;
  const r = sheet.data.findIndex((row) => row[0] === key);
  assert.ok(r > 0, 'setting ' + key);
  sheet.data[r][1] = value;
}
function addRaw(lead) {
  const sheet = env.sheets.RAW_LEADS;
  const row = sheet.data[0].map((h) => (h in lead ? lead[h] : ''));
  sheet.data.push(row);
}
const crm = () => env.rows('CRM');
const byName = (name) => crm().find((l) => l['Full Name'] === name);

test('setup creates every tab with the documented structure and can be re-run', () => {
  g.setupSpreadsheet();
  assert.deepStrictEqual(Object.keys(env.sheets).sort(),
    ['CRM', 'DASHBOARD', 'FOLLOW_UP_LOG', 'LEAD_SCORING', 'RAW_LEADS', 'SETTINGS', 'SYSTEM_LOG']);
  assert.deepStrictEqual([...env.sheets.CRM.data[0]], [...g.CRM_HEADERS]);
  assert.deepStrictEqual([...env.sheets.RAW_LEADS.data[0]], [...g.RAW_HEADERS]);
  assert.strictEqual(env.rows('LEAD_SCORING').length, 4);
  setSetting('Client Name', 'Acme BV');
  env.sheets.LEAD_SCORING.data[1][5] = 55; // client changed a weight
  g.setupSpreadsheet();
  assert.strictEqual(env.sheets.SETTINGS.data.find((r) => r[0] === 'Client Name')[1], 'Acme BV');
  assert.strictEqual(env.sheets.LEAD_SCORING.data[1][5], 55);
  assert.strictEqual(env.rows('LEAD_SCORING').length, 4);
  env.sheets.LEAD_SCORING.data[1][5] = 60;
  assert.match(String(env.sheets.DASHBOARD.data[0][0]), /LEAD DASHBOARD/);
});

test('sync moves example leads to the CRM exactly once', () => {
  g.insertExampleLeads();
  assert.strictEqual(g.syncNewLeads(), 3);
  assert.strictEqual(crm().length, 3);

  const jan = byName('Jan Voorbeeld');
  assert.strictEqual(jan['Phone'], '+31612345678');
  assert.strictEqual(jan['WhatsApp Link'], 'Open WhatsApp');
  const row = env.sheets.CRM.data.findIndex((r) => r[2] === 'Jan Voorbeeld') + 1;
  assert.strictEqual(env.sheets.CRM.links[`${row}:${env.col('CRM', 'WhatsApp Link')}`], 'https://wa.me/31612345678');
  assert.strictEqual(jan['Lead Quality'], 'HOT');
  assert.strictEqual(jan['Lead Status'], 'New');
  assert.strictEqual(jan['Lead Priority'], 'HIGH');
  assert.strictEqual(jan['Assigned Salesperson'], 'Salesperson 1');
  assert.ok(isDate(jan['Lead Created Date']));

  const maria = byName('Maria Exemplo');
  assert.strictEqual(maria['Phone'], '+351912345678');
  assert.strictEqual(maria['Country'], 'PT');
  assert.strictEqual(maria['Lead Quality'], 'COLD');
  assert.strictEqual(maria['Assigned Salesperson'], 'Salesperson 2');

  const bad = byName('Invalid Phone Example');
  assert.strictEqual(bad['Phone'], '12345');
  assert.strictEqual(bad['WhatsApp Link'], '');
  assert.match(bad['Data Warnings'], /Invalid phone/);
  assert.match(bad['Data Warnings'], /Invalid email/);

  env.rows('RAW_LEADS').forEach((r) => {
    assert.strictEqual(r['Processing Status'], 'PROCESSED');
    assert.ok(isDate(r['Processed At']));
  });
  assert.strictEqual(g.syncNewLeads(), 0);
  assert.strictEqual(crm().length, 3);
});

test('sync handles manual rows, duplicates, empty rows and custom columns', () => {
  // Custom question column added by the client + a scoring rule that uses it.
  const raw = env.sheets.RAW_LEADS;
  raw.data[0].push('Budget');
  env.sheets.LEAD_SCORING.appendRow(['YES', 'Budget', 'Budget', 'contains', '10k', 20, 'Budget above 10k']);
  env.sheets.LEAD_SCORING.appendRow(['YES', 'Fit', 'Budget', 'equals', 'none', 'DISQUALIFY', 'No budget']);

  addRaw({ 'Full Name': 'Manual Lead', Email: 'JAN.voorbeeld@example.com', Phone: '0031 6 8765 4321', Budget: 'More than 10k', 'Campaign Name': '=EVIL()' });
  addRaw({ 'Lead ID': crm()[0]['Lead ID'], 'Full Name': 'Same ID again' });
  addRaw({ 'Lead ID': 'DQ-1', 'Full Name': 'No Budget', Phone: '0611111111', Budget: 'None' });
  addRaw({ 'Lead ID': 'ONLY-ID' });
  assert.strictEqual(g.syncNewLeads(), 2);

  const manual = byName('Manual Lead');
  assert.match(manual['Lead ID'], /^MAN-\d{14}-\d+$/);
  assert.match(manual['Data Warnings'], /Possible duplicate of TEST-/);
  assert.match(manual['Score Explanation'], /\+20 Budget above 10k/);
  assert.strictEqual(manual['Campaign'], '=EVIL()'); // stored as text (apostrophe-prefixed), not as a formula
  assert.strictEqual(byName('No Budget')['Lead Quality'], 'DISQUALIFIED');

  const statuses = env.rows('RAW_LEADS').map((r) => r['Processing Status']);
  assert.deepStrictEqual(statuses.slice(3), ['PROCESSED_POSSIBLE_DUPLICATE', 'SKIPPED_ALREADY_IN_CRM', 'PROCESSED', 'ERROR_NO_CONTACT_DATA']);
  assert.strictEqual(env.rows('RAW_LEADS')[3]['Lead ID'], manual['Lead ID']);
  assert.strictEqual(crm().length, 5);
});

test('follow-up dialog flow updates the lead and writes the log', () => {
  const jan = byName('Jan Voorbeeld');
  env.activeSheet = env.sheets.CRM;
  env.sheets.CRM.active = [2, 5];
  g.showFollowUpDialog();
  assert.strictEqual(env.dialogs.length, 1);
  const payload = JSON.parse(env.dialogs[0].html.template.payload);
  assert.strictEqual(payload.leadId, jan['Lead ID']);
  assert.ok(payload.types.includes('Phone Call') && payload.results.includes('No Answer'));

  const msg = g.submitFollowUp({ leadId: jan['Lead ID'], type: 'Phone Call', result: 'No Answer', notes: 'Rang twice', salesperson: 'Salesperson 1' });
  assert.match(msg, /Status: No Response\. Contact attempts: 1/);
  let after = byName('Jan Voorbeeld');
  assert.strictEqual(after['Lead Status'], 'No Response');
  assert.strictEqual(after['Contact Attempts'], 1);
  assert.ok(isDate(after['First Contact Date']));
  assert.ok(isDate(after['Next Follow-up Date']));
  assert.strictEqual(after['Next Follow-up Date'].getUTCHours(), 0);
  assert.strictEqual(after['Next Action'], 'Try to contact again');
  assert.strictEqual(after['Lead Priority'], 'MEDIUM');

  g.submitFollowUp({ leadId: jan['Lead ID'], type: 'Phone Call', result: 'Reached - Interested', nextAction: 'Send proposal', nextFollowUpDate: '2027-01-15' });
  after = byName('Jan Voorbeeld');
  assert.strictEqual(after['Lead Status'], 'Contacted');
  assert.strictEqual(after['Contact Attempts'], 2);
  assert.strictEqual(after['Next Follow-up Date'].toISOString(), '2027-01-15T00:00:00.000Z');

  const log = env.rows('FOLLOW_UP_LOG');
  assert.strictEqual(log.length, 2);
  assert.strictEqual(log[0]['Lead ID'], jan['Lead ID']);
  assert.strictEqual(log[0]['Notes'], 'Rang twice');
  assert.match(log[0]['Activity ID'], /^ACT-/);
  assert.throws(() => g.submitFollowUp({ leadId: 'NOPE', type: 'Email' }), /not found/);
  assert.throws(() => g.submitFollowUp({ leadId: jan['Lead ID'], type: '' }), /activity type/);
});

test('editing the CRM tab: contact result logs an attempt, status alone does not', () => {
  const sheet = env.sheets.CRM;
  const rowNumber = sheet.data.findIndex((r) => r[2] === 'Maria Exemplo') + 1;
  const edit = (header, value) => {
    const col = env.col('CRM', header);
    sheet.set(rowNumber, col, value);
    g.onEdit({ range: sheet.getRange(rowNumber, col) });
  };
  edit('Last Contact Result', 'Voicemail');
  let maria = byName('Maria Exemplo');
  assert.strictEqual(maria['Contact Attempts'], 1);
  assert.strictEqual(maria['Lead Status'], 'No Response');
  assert.ok(isDate(maria['Last Contact Date']));
  assert.strictEqual(env.rows('FOLLOW_UP_LOG').length, 3);

  edit('Lead Status', 'Negotiation');
  maria = byName('Maria Exemplo');
  assert.strictEqual(maria['Contact Attempts'], 1); // a status change is not a contact
  assert.strictEqual(env.rows('FOLLOW_UP_LOG').length, 3);

  edit('Sales Qualification', 'HOT');
  assert.strictEqual(byName('Maria Exemplo')['Lead Quality'], 'HOT');
  edit('Sales Qualification', '');
  assert.strictEqual(byName('Maria Exemplo')['Lead Quality'], 'COLD');

  edit('Lead Status', 'Sold');
  maria = byName('Maria Exemplo');
  assert.strictEqual(maria['Sale Status'], 'Won');
  assert.strictEqual(maria['Next Follow-up Date'], '');
  assert.strictEqual(maria['Lead Priority'], 'LOW');
  assert.ok(isDate(maria['Last Updated']));
});

test('maintenance closes exhausted leads, refreshes priorities and the dashboard', () => {
  const sheet = env.sheets.CRM;
  const r = sheet.data.findIndex((row) => row[2] === 'Invalid Phone Example');
  sheet.data[r][env.col('CRM', 'Lead Status') - 1] = 'No Response';
  sheet.data[r][env.col('CRM', 'Contact Attempts') - 1] = 6;
  const m = sheet.data.findIndex((row) => row[2] === 'Manual Lead');
  sheet.data[m][env.col('CRM', 'Lead Created Date') - 1] = new Date(Date.now() - 3 * 3600000);

  g.runMaintenance();
  const closed = byName('Invalid Phone Example');
  assert.strictEqual(closed['Lead Status'], 'Lost');
  assert.strictEqual(closed['Lost Reason'], 'No Response');
  assert.strictEqual(closed['Sale Status'], 'Lost');
  assert.strictEqual(closed['Lead Priority'], 'LOW');
  assert.strictEqual(byName('Manual Lead')['Lead Priority'], 'URGENT');

  const dash = env.sheets.DASHBOARD;
  const find = (label) => { for (const row of dash.data) { const i = (row || []).indexOf(label); if (i !== -1) return row[i + 1]; } };
  assert.strictEqual(find('Total Leads'), 5);
  assert.strictEqual(find('Sold'), 1);
  assert.strictEqual(find('Lost'), 1);
  assert.strictEqual(find('Lead-to-Sale Conversion Rate'), 0.2);
  assert.ok(dash.data.some((row) => (row || []).includes('CAMPAIGN ANALYSIS')));
  assert.strictEqual(dash.charts.length, 3);

  const overdue = g.checkOverdueFollowUps();
  assert.deepStrictEqual(Array.from(overdue, (o) => o.name), ['Manual Lead']);
});

test('notifications are off by default and respect the settings', () => {
  assert.strictEqual(env.mails.length, 0);
  assert.strictEqual(env.fetches.length, 0);
  setSetting('Email Notifications', 'YES');
  setSetting('Manager Email', 'manager@example.com');
  setSetting('Telegram Notifications', 'YES');
  setSetting('Telegram Chat ID', '-100123');
  setSetting('Daily Report', 'YES');
  env.scriptProps.setProperty('TELEGRAM_BOT_TOKEN', 'TESTTOKEN');
  addRaw({ 'Lead ID': 'N-1', 'Full Name': 'Notify Me', Phone: '+31622222222', 'Campaign Name': 'NL | Example Campaign' });
  assert.strictEqual(g.syncNewLeads(), 1);
  assert.strictEqual(env.mails.length, 1);
  assert.strictEqual(env.mails[0].to, 'manager@example.com');
  assert.match(env.mails[0].body, /Name: Notify Me/);
  assert.match(env.mails[0].body, /Assigned Salesperson: Salesperson/);
  assert.strictEqual(env.fetches.length, 1);
  assert.strictEqual(env.fetches[0].opts.payload.chat_id, '-100123');
  g.sendDailyReport();
  assert.strictEqual(env.mails.length, 2);
  assert.match(env.mails[1].body, /Leads needing attention: 1/);
  g.installTriggers();
  assert.deepStrictEqual(env.triggers, ['syncNewLeads', 'runMaintenance', 'sendDailyReport']);
});

test('anonymisation erases personal data of old Lost leads only', () => {
  const sheet = env.sheets.CRM;
  const r = sheet.data.findIndex((row) => row[2] === 'Invalid Phone Example');
  const leadId = sheet.data[r][0];
  env.alerts.length = 0;
  g.anonymiseExpiredLeads();
  assert.match(env.alerts[0][0], /Nothing to anonymise/);

  sheet.data[r][env.col('CRM', 'Last Updated') - 1] = new Date(Date.now() - 400 * D);
  g.anonymiseExpiredLeads();
  const lead = crm().find((l) => l['Lead ID'] === leadId);
  assert.strictEqual(lead['Full Name'], '[ANONYMISED]');
  assert.strictEqual(lead['Phone'], '');
  assert.strictEqual(lead['Email'], '');
  assert.strictEqual(lead['Lead Status'], 'Lost');
  assert.strictEqual(lead['Campaign'], 'NL | Example Campaign');
  const raw = env.rows('RAW_LEADS').find((x) => x['Lead ID'] === leadId);
  assert.strictEqual(raw['Full Name'], '[ANONYMISED]');
  assert.strictEqual(raw['Phone'], '');
  assert.strictEqual(raw['Email'], '');
  assert.strictEqual(raw['Hot Lead Answer'], '');
  assert.strictEqual(raw['Campaign Name'], 'NL | Example Campaign');
  assert.strictEqual(byName('Jan Voorbeeld')['Phone'], '+31612345678');
});
