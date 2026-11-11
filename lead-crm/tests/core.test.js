/**
 * Unit tests for the pure business logic (01_Config.gs + 02_Core.gs).
 * Run with:  node --test lead-crm/tests
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'apps-script');
const ctx = vm.createContext({});
['01_Config.gs', '02_Core.gs'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));

const settings = {
  defaultCountry: 'NL', hotThreshold: 70, warmThreshold: 40,
  firstResponseSlaMinutes: 60, maxAttempts: 6, followUpIntervals: [1, 2, 2, 3, 6],
  autoClose: true, assignmentMethod: 'Round Robin', salespeople: ['Anna', 'Bram'],
  assignmentRules: []
};
const rules = ctx.SCORING_DEFAULT_RULES.map((r) => ({
  active: r[0] === 'YES', criterion: r[1], field: r[2], operator: r[3],
  value: r[4], points: r[5], explanation: r[6]
}));
const now = new Date('2026-11-11T10:00:00Z');
const H = 3600000, D = 24 * H;

test('normalizePhone: country-specific formats', () => {
  const cases = [
    ['06 12345678', 'NL', '+31612345678', true],
    ['+31 (0)6 1234 5678', 'PT', '+31612345678', true],
    ['0031612345678', 'PT', '+31612345678', true],
    ['912 345 678', 'PT', '+351912345678', true],
    ['351912345678', 'PT', '+351912345678', true],
    ['+351912345678', 'NL', '+351912345678', true],
    ['0470 12 34 56', 'BE', '+32470123456', true],
    ['+1 415 555 2671', 'NL', '+14155552671', true]
  ];
  for (const [raw, iso, e164, valid] of cases) {
    const r = ctx.normalizePhone(raw, iso);
    assert.strictEqual(r.e164, e164, raw);
    assert.strictEqual(r.valid, valid, raw);
  }
});

test('normalizePhone: invalid and missing numbers are flagged, not guessed', () => {
  assert.strictEqual(ctx.normalizePhone('12345', 'NL').valid, false);
  assert.match(ctx.normalizePhone('12345', 'NL').warning, /wrong length for NL/);
  assert.strictEqual(ctx.normalizePhone('', 'NL').warning, 'Missing phone');
  assert.strictEqual(ctx.normalizePhone('abc', 'NL').valid, false);
  assert.strictEqual(ctx.normalizePhone('612345678', 'XX').valid, false);
});

test('resolveCountry, email, WhatsApp link, sanitizeCell, parseDate', () => {
  assert.strictEqual(ctx.resolveCountry('Nederland', 'PT'), 'NL');
  assert.strictEqual(ctx.resolveCountry('pt', 'NL'), 'PT');
  assert.strictEqual(ctx.resolveCountry('', 'nl'), 'NL');
  assert.strictEqual(ctx.resolveCountry('Atlantis', 'PT'), 'PT');
  assert.strictEqual(ctx.normalizeEmail('  Jan@Example.NL ').email, 'jan@example.nl');
  assert.strictEqual(ctx.normalizeEmail('jan@example').valid, false);
  assert.strictEqual(ctx.generateWhatsAppLink('+31612345678'), 'https://wa.me/31612345678');
  assert.strictEqual(ctx.sanitizeCell('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.strictEqual(ctx.sanitizeCell('Jan'), 'Jan');
  assert.strictEqual(ctx.parseDate('2026-11-10T09:15:00+0000').toISOString(), '2026-11-10T09:15:00.000Z');
  assert.strictEqual(ctx.parseDate('not a date'), null);
});

test('calculateLeadScore: transparent, configurable, missing data is neutral', () => {
  const hot = ctx.calculateLeadScore(
    { 'Hot Lead Answer': 'ja', 'Phone Valid': 'TRUE', Email: 'a@b.nl', 'Product / Service Interest': 'Kitchen' },
    rules, settings);
  assert.strictEqual(hot.score, 100);
  assert.strictEqual(hot.quality, 'HOT');
  assert.match(hot.explanation, /\+60 Answered the qualifying form question/);

  const noAnswer = ctx.calculateLeadScore({ 'Phone Valid': 'TRUE', Email: 'a@b.nl', 'Product / Service Interest': 'x' }, rules, settings);
  assert.strictEqual(noAnswer.score, 40);
  assert.strictEqual(noAnswer.quality, 'WARM');

  const empty = ctx.calculateLeadScore({}, rules, settings);
  assert.strictEqual(empty.score, 0);
  assert.strictEqual(empty.quality, 'COLD');
  assert.strictEqual(empty.explanation, 'No scoring rule matched');

  const dq = ctx.calculateLeadScore({ Region: 'Outside area', 'Hot Lead Answer': 'Yes' },
    rules.concat([{ active: true, field: 'Region', operator: 'contains', value: 'outside', points: 'DISQUALIFY', explanation: 'Outside service area' }]), settings);
  assert.strictEqual(dq.quality, 'DISQUALIFIED');

  const inactive = ctx.calculateLeadScore({ 'Hot Lead Answer': 'Yes' }, [{ ...rules[0], active: false }], settings);
  assert.strictEqual(inactive.score, 0);
});

test('resolveLeadQuality: salesperson qualification overrides the form score', () => {
  assert.strictEqual(ctx.resolveLeadQuality('COLD', 'hot'), 'HOT');
  assert.strictEqual(ctx.resolveLeadQuality('WARM', ''), 'WARM');
  assert.strictEqual(ctx.resolveLeadQuality('WARM', 'nonsense'), 'WARM');
});

test('calculateLeadPriority: independent of quality', () => {
  const p = (lead) => ctx.calculateLeadPriority(lead, now, settings);
  const base = { status: 'New', quality: 'COLD', createdAt: new Date(now - 10 * 60000) };
  assert.strictEqual(p(base), 'HIGH');
  assert.strictEqual(p({ ...base, createdAt: new Date(now - 2 * H) }), 'URGENT'); // cold but urgent
  const contacted = { status: 'Contacted', quality: 'HOT', createdAt: new Date(now - 5 * D), firstContactAt: new Date(now - 4 * D) };
  assert.strictEqual(p({ ...contacted, nextFollowUpAt: new Date(now.getTime() + 3 * D) }), 'MEDIUM'); // hot but not urgent
  assert.strictEqual(p({ ...contacted, nextFollowUpAt: new Date(now - 2 * D) }), 'URGENT');
  assert.strictEqual(p({ ...contacted, quality: 'WARM', nextFollowUpAt: new Date(now - 2 * D) }), 'HIGH');
  assert.strictEqual(p({ ...contacted, quality: 'COLD', nextFollowUpAt: new Date(now - 2 * D) }), 'MEDIUM');
  assert.strictEqual(p({ ...contacted, nextFollowUpAt: new Date(now - 2 * H) }), 'HIGH'); // due today
  assert.strictEqual(p({ ...contacted }), 'MEDIUM'); // no next action
  assert.strictEqual(p({ ...contacted, quality: 'COLD', nextFollowUpAt: new Date(now.getTime() + 3 * D) }), 'LOW');
  assert.strictEqual(p({ ...contacted, status: 'Appointment Scheduled', nextFollowUpAt: new Date(now.getTime() + 5 * D), appointmentAt: new Date(now.getTime() + D) }), 'HIGH');
  assert.strictEqual(p({ ...contacted, status: 'Sold' }), 'LOW');
  assert.strictEqual(p({ ...contacted, status: 'Lost', nextFollowUpAt: new Date(now - 9 * D) }), 'LOW');
});

test('applyFollowUp: attempts, dates, status and cadence', () => {
  const start = { status: 'New', attempts: 0 };
  const a1 = ctx.applyFollowUp(start, { type: 'Phone Call', result: 'No Answer' }, settings, now);
  assert.strictEqual(a1.attempts, 1);
  assert.strictEqual(a1.status, 'No Response');
  assert.strictEqual(a1.firstContactAt.getTime(), now.getTime());
  assert.strictEqual(a1.nextFollowUpAt.getTime(), now.getTime() + 1 * D);
  assert.strictEqual(a1.nextAction, 'Try to contact again');

  const a2 = ctx.applyFollowUp(a1, { type: 'WhatsApp Message', result: 'Message Sent - No Reply' }, settings, new Date(now.getTime() + D));
  assert.strictEqual(a2.attempts, 2);
  assert.strictEqual(a2.firstContactAt.getTime(), now.getTime()); // first contact date is kept
  assert.strictEqual(a2.nextFollowUpAt.getTime(), now.getTime() + D + 2 * D);

  const reached = ctx.applyFollowUp(a2, { type: 'Phone Call', result: 'Reached - Interested', nextAction: 'Send proposal' }, settings, now);
  assert.strictEqual(reached.status, 'Contacted');
  assert.strictEqual(reached.nextAction, 'Send proposal');
  assert.strictEqual(reached.nextFollowUpAt.getTime(), a2.nextFollowUpAt.getTime()); // not rescheduled automatically

  const note = ctx.applyFollowUp(reached, { type: 'Other', result: '' }, settings, now);
  assert.strictEqual(note.attempts, 3); // an internal note is not a contact attempt
  assert.strictEqual(note.status, 'Contacted');

  const appt = ctx.applyFollowUp(reached, { type: 'Appointment Scheduled', result: 'Reached - Interested' }, settings, now);
  assert.strictEqual(appt.status, 'Appointment Scheduled');

  const explicit = ctx.applyFollowUp(reached, { type: 'Meeting', result: 'Reached - Interested', newStatus: 'Sold' }, settings, now);
  assert.strictEqual(explicit.status, 'Sold');
  assert.strictEqual(explicit.saleStatus, 'Won');
  assert.strictEqual(explicit.nextFollowUpAt, null);
});

test('applyFollowUp: lead is closed as Lost after the maximum attempts', () => {
  let s = { status: 'New', attempts: 0 };
  for (let i = 0; i < 5; i++) s = ctx.applyFollowUp(s, { type: 'Phone Call', result: 'No Answer' }, settings, now);
  assert.strictEqual(s.status, 'No Response');
  s = ctx.applyFollowUp(s, { type: 'Phone Call', result: 'No Answer' }, settings, now);
  assert.strictEqual(s.attempts, 6);
  assert.strictEqual(s.status, 'Lost');
  assert.strictEqual(s.lostReason, 'No Response');
  assert.strictEqual(s.saleStatus, 'Lost');
  assert.strictEqual(s.nextFollowUpAt, null);

  let keep = { status: 'New', attempts: 0 };
  for (let i = 0; i < 8; i++) keep = ctx.applyFollowUp(keep, { type: 'Phone Call', result: 'No Answer' }, { ...settings, autoClose: false }, now);
  assert.strictEqual(keep.status, 'No Response');
});

test('assignSalesperson: round robin, manual and campaign-based', () => {
  const state = { rrIndex: 0 };
  const names = [1, 2, 3].map(() => ctx.assignSalesperson({}, settings, state));
  assert.deepStrictEqual(names, ['Anna', 'Bram', 'Anna']);
  assert.strictEqual(ctx.assignSalesperson({}, { ...settings, assignmentMethod: 'Manual' }, state), '');
  const byCampaign = { ...settings, assignmentMethod: 'Campaign-Based', assignmentRules: [{ match: 'kitchen', salesperson: 'Bram' }] };
  assert.strictEqual(ctx.assignSalesperson({ campaign: 'NL | Kitchen | Leads' }, byCampaign, { rrIndex: 0 }), 'Bram');
  assert.strictEqual(ctx.assignSalesperson({ campaign: 'Other' }, byCampaign, { rrIndex: 0 }), 'Anna');
});

test('processNewLead: builds the CRM record and detects duplicates', () => {
  const c = { settings, rules, now, rrState: { rrIndex: 0 }, existing: { ids: {}, emails: {}, phones: {} } };
  const raw = {
    'Lead ID': '1234567890123456', 'Created Time': '2026-11-11T09:50:00+0000', 'Full Name': 'Jan Jansen',
    Email: 'Jan@Example.nl', Phone: '0612345678', Country: 'Netherlands', 'Campaign Name': 'NL Kitchens',
    'Hot Lead Answer': 'Ja', 'Product / Service Interest': 'Kitchen'
  };
  const r1 = ctx.processNewLead(raw, c);
  assert.strictEqual(r1.status, 'PROCESSED');
  assert.strictEqual(r1.record['Phone'], '+31612345678');
  assert.strictEqual(r1.record['WhatsApp Link'], 'https://wa.me/31612345678');
  assert.strictEqual(r1.record['Email'], 'jan@example.nl');
  assert.strictEqual(r1.record['Lead Quality'], 'HOT');
  assert.strictEqual(r1.record['Lead Priority'], 'HIGH');
  assert.strictEqual(r1.record['Assigned Salesperson'], 'Anna');
  assert.strictEqual(r1.record['Lead Status'], 'New');
  assert.strictEqual(r1.record['Data Warnings'], '');

  assert.strictEqual(ctx.processNewLead(raw, c).status, 'SKIPPED_ALREADY_IN_CRM');

  const r3 = ctx.processNewLead({ ...raw, 'Lead ID': '999', Phone: '+31 6 1234 5678', Email: '' }, c);
  assert.strictEqual(r3.status, 'PROCESSED_POSSIBLE_DUPLICATE');
  assert.match(r3.record['Data Warnings'], /Possible duplicate of 1234567890123456/);

  const bad = ctx.processNewLead({ 'Lead ID': '1000', 'Full Name': 'Maria Silva', Phone: '123', Country: 'PT' }, c);
  assert.strictEqual(bad.status, 'PROCESSED');
  assert.strictEqual(bad.record['Phone'], '123');
  assert.strictEqual(bad.record['WhatsApp Link'], '');
  assert.match(bad.record['Data Warnings'], /wrong length for PT/);
  assert.match(bad.record['Data Warnings'], /Missing email/);

  assert.strictEqual(ctx.processNewLead({ 'Lead ID': '1001' }, c).status, 'ERROR_NO_CONTACT_DATA');
});

test('computeDashboardMetrics', () => {
  const fmt = (d, p) => {
    const iso = d.toISOString();
    if (p === 'yyyy-MM') return iso.slice(0, 7);
    if (p === 'yyyy-MM-dd') return iso.slice(0, 10);
    if (p === 'u') return String(d.getUTCDay() || 7);
    throw new Error('pattern ' + p);
  };
  const leads = [
    { createdAt: new Date('2026-11-10T08:00:00Z'), status: 'Sold', quality: 'HOT', score: 80, firstContactAt: new Date('2026-11-10T10:00:00Z'), campaign: 'A' },
    { createdAt: new Date('2026-11-11T08:00:00Z'), status: 'New', quality: 'COLD', score: 20, campaign: 'A' },
    { createdAt: new Date('2026-10-05T08:00:00Z'), status: 'Contacted', quality: 'WARM', score: 50, firstContactAt: new Date('2026-10-05T12:00:00Z'), nextFollowUpAt: new Date('2026-11-01T00:00:00Z'), campaign: 'B' },
    { createdAt: new Date('2026-10-06T08:00:00Z'), status: 'Appointment Scheduled', quality: 'WARM', score: 50, firstContactAt: new Date('2026-10-06T08:00:00Z'), nextFollowUpAt: new Date('2026-11-20T00:00:00Z'), campaign: '' }
  ];
  const m = ctx.computeDashboardMetrics(leads, ['New', 'Contacted', 'Sold'], now, fmt);
  const ov = Object.fromEntries(m.overview);
  assert.strictEqual(ov['Total Leads'], 4);
  assert.strictEqual(ov['Qualified Leads (Hot + Warm)'], 3);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.pipeline)), [['New', 1], ['Contacted', 1], ['Sold', 1]]);
  assert.strictEqual(m.performance.contactRate, 0.75);
  assert.strictEqual(m.performance.appointmentRate, 0.5);
  assert.strictEqual(m.performance.saleRate, 0.25);
  assert.strictEqual(m.performance.averageScore, 50);
  assert.strictEqual(m.performance.averageFirstResponseHours, 2);
  assert.strictEqual(m.performance.followUpCompletionRate, 0.5);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.campaigns)), [['(no campaign)', 1, 1, 0, 0], ['A', 2, 1, 1, 0.5], ['B', 1, 1, 0, 0]]);
  assert.strictEqual(m.months.length, 12);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.months.slice(-2))), [['2026-10', 2, 0, 0], ['2026-11', 2, 1, 0.5]]);
  assert.strictEqual(m.months[0][0], '2025-12');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.weeks.slice(-1))), [['2026-11-09', 2]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.days.slice(-2))), [['2026-11-10', 1], ['2026-11-11', 1]]);
});
