/**
 * 02_Core.gs — Pure business logic. No spreadsheet access happens in this file,
 * so every function can be unit-tested outside Google (see lead-crm/tests).
 */

var DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Phone, email and data quality                                       */
/* ------------------------------------------------------------------ */

/**
 * Phone rules per country: calling code, national trunk prefix (the leading 0
 * dialled inside the country) and the allowed length of the national number.
 */
var COUNTRY_PHONE_RULES = {
  NL: { cc: '31', trunk: '0', min: 9, max: 9 },
  PT: { cc: '351', trunk: '', min: 9, max: 9 },
  ES: { cc: '34', trunk: '', min: 9, max: 9 },
  BE: { cc: '32', trunk: '0', min: 8, max: 9 },
  DE: { cc: '49', trunk: '0', min: 6, max: 13 },
  FR: { cc: '33', trunk: '0', min: 9, max: 9 },
  GB: { cc: '44', trunk: '0', min: 9, max: 10 },
  IE: { cc: '353', trunk: '0', min: 7, max: 9 },
  IT: { cc: '39', trunk: '', min: 6, max: 11 },
  LU: { cc: '352', trunk: '', min: 4, max: 11 },
  AT: { cc: '43', trunk: '0', min: 4, max: 13 },
  CH: { cc: '41', trunk: '0', min: 9, max: 9 },
  DK: { cc: '45', trunk: '', min: 8, max: 8 },
  SE: { cc: '46', trunk: '0', min: 7, max: 13 },
  NO: { cc: '47', trunk: '', min: 8, max: 8 },
  FI: { cc: '358', trunk: '0', min: 5, max: 12 },
  PL: { cc: '48', trunk: '', min: 9, max: 9 },
  BR: { cc: '55', trunk: '0', min: 10, max: 11 }
};

var COUNTRY_ALIASES = {
  'netherlands': 'NL', 'the netherlands': 'NL', 'nederland': 'NL', 'holland': 'NL',
  'holanda': 'NL', 'paises baixos': 'NL', 'países baixos': 'NL',
  'portugal': 'PT', 'spain': 'ES', 'espana': 'ES', 'españa': 'ES', 'espanha': 'ES',
  'belgium': 'BE', 'belgie': 'BE', 'belgië': 'BE', 'belgique': 'BE',
  'germany': 'DE', 'deutschland': 'DE', 'duitsland': 'DE', 'alemanha': 'DE',
  'france': 'FR', 'frankrijk': 'FR', 'frança': 'FR',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB',
  'ireland': 'IE', 'italy': 'IT', 'italia': 'IT', 'luxembourg': 'LU',
  'austria': 'AT', 'switzerland': 'CH', 'denmark': 'DK', 'sweden': 'SE',
  'norway': 'NO', 'finland': 'FI', 'poland': 'PL', 'brazil': 'BR', 'brasil': 'BR'
};

/**
 * Turns a country value ("NL", "Netherlands", "Nederland"...) into an ISO code.
 * Falls back to the client's default country when the value is unknown or empty.
 */
function resolveCountry(value, defaultIso) {
  var fallback = String(defaultIso || '').trim().toUpperCase();
  var s = String(value == null ? '' : value).trim();
  if (!s) return fallback;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_ALIASES[s.toLowerCase()] || fallback;
}

/**
 * Normalises a phone number to international E.164 format (+31612345678).
 * @param {*} raw Phone as received from the form.
 * @param {string} countryIso ISO code of the lead's country (already resolved).
 * @return {{e164: string, valid: boolean, warning: string}}
 */
function normalizePhone(raw, countryIso) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return { e164: '', valid: false, warning: 'Missing phone' };

  var international = s.charAt(0) === '+';
  var digits = s.replace(/\D/g, '');
  if (!digits) return { e164: '', valid: false, warning: 'Invalid phone: no digits' };

  if (!international && digits.indexOf('00') === 0) {
    international = true;
    digits = digits.substring(2);
  }

  var rule = COUNTRY_PHONE_RULES[countryIso] || null;

  // "351912345678" typed without "+": the country code is already included.
  if (!international && rule && digits.indexOf(rule.cc) === 0) {
    var rest = digits.substring(rule.cc.length);
    var startsWithTrunk = rule.trunk && digits.indexOf(rule.trunk) === 0;
    if (!startsWithTrunk && rest.length >= rule.min && rest.length <= rule.max) {
      international = true;
    }
  }

  if (international) {
    var matched = findRuleByCallingCode_(digits);
    if (!matched) {
      var okGeneric = digits.length >= 8 && digits.length <= 15;
      return {
        e164: '+' + digits,
        valid: okGeneric,
        warning: okGeneric ? '' : 'Invalid phone: unexpected length'
      };
    }
    var national = digits.substring(matched.rule.cc.length);
    if (matched.rule.trunk && national.indexOf(matched.rule.trunk) === 0) {
      national = national.substring(matched.rule.trunk.length); // "+31 (0)6..."
    }
    return buildPhoneResult_(matched.rule, matched.iso, national);
  }

  if (!rule) {
    return { e164: digits, valid: false, warning: 'Phone not normalised: unknown country' };
  }
  var nat = digits;
  if (rule.trunk && nat.indexOf(rule.trunk) === 0) nat = nat.substring(rule.trunk.length);
  return buildPhoneResult_(rule, countryIso, nat);
}

function findRuleByCallingCode_(digits) {
  var best = null;
  for (var iso in COUNTRY_PHONE_RULES) {
    var rule = COUNTRY_PHONE_RULES[iso];
    if (digits.indexOf(rule.cc) === 0 && (!best || rule.cc.length > best.rule.cc.length)) {
      best = { iso: iso, rule: rule };
    }
  }
  return best;
}

function buildPhoneResult_(rule, iso, national) {
  var valid = national.length >= rule.min && national.length <= rule.max;
  return {
    e164: '+' + rule.cc + national,
    valid: valid,
    warning: valid ? '' : 'Invalid phone: wrong length for ' + iso
  };
}

/** Lower-cases and trims an email and checks its basic shape. */
function normalizeEmail(raw) {
  var email = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!email) return { email: '', valid: false, warning: 'Missing email' };
  var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  return { email: email, valid: valid, warning: valid ? '' : 'Invalid email' };
}

/** Returns a wa.me link for a valid E.164 number, or '' when not possible. */
function generateWhatsAppLink(e164) {
  var digits = String(e164 || '').replace(/\D/g, '');
  return digits ? 'https://wa.me/' + digits : '';
}

/**
 * Protects the sheet against formula injection: lead-supplied text starting
 * with = + - or @ is stored as plain text (leading apostrophe).
 */
function sanitizeCell(value) {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

/** Parses a date coming from Meta/Make ("2026-11-10T09:15:00+0000") or a cell. */
function parseDate(value) {
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }
  var s = String(value == null ? '' : value).trim();
  if (!s) return null;
  s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'); // +0000 -> +00:00
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Case-insensitive lookup of a field in a lead object keyed by column header. */
function getField_(lead, name) {
  if (lead == null) return '';
  if (Object.prototype.hasOwnProperty.call(lead, name)) return lead[name];
  var wanted = String(name).trim().toLowerCase();
  for (var key in lead) {
    if (String(key).trim().toLowerCase() === wanted) return lead[key];
  }
  return '';
}

function text_(value) {
  return String(value == null ? '' : value).trim();
}

/** Lists data quality problems of a raw lead. Never blocks the import. */
function validateLeadData(raw, phone, email) {
  var warnings = [];
  if (!text_(getField_(raw, 'Full Name'))) warnings.push('Missing name');
  if (phone.warning) warnings.push(phone.warning);
  if (email.warning) warnings.push(email.warning);
  if (!parseDate(getField_(raw, 'Created Time'))) warnings.push('Missing or invalid created time');
  return warnings;
}

/* ------------------------------------------------------------------ */
/* Lead scoring                                                        */
/* ------------------------------------------------------------------ */

/**
 * Calculates the form-based qualification score of a lead.
 *
 * Each active rule that matches adds its points. A rule whose Points value is
 * "DISQUALIFY" marks the lead as DISQUALIFIED. A missing answer never matches
 * a rule, so missing information adds nothing and subtracts nothing.
 *
 * @param {Object} lead Lead fields keyed by column header.
 * @param {Array<Object>} rules {active, criterion, field, operator, value, points, explanation}
 * @param {Object} settings {hotThreshold, warmThreshold}
 * @return {{score: number, quality: string, explanation: string, disqualified: boolean}}
 */
function calculateLeadScore(lead, rules, settings) {
  var score = 0;
  var disqualified = false;
  var parts = [];

  (rules || []).forEach(function (rule) {
    if (!rule || !rule.active || !text_(rule.field)) return;
    if (!ruleMatches_(getField_(lead, rule.field), rule.operator, rule.value)) return;
    var label = text_(rule.explanation) || text_(rule.criterion) || text_(rule.field);
    if (text_(rule.points).toUpperCase() === 'DISQUALIFY') {
      disqualified = true;
      parts.push('DISQUALIFIED: ' + label);
      return;
    }
    var points = Number(rule.points);
    if (isNaN(points) || points === 0) return;
    score += points;
    parts.push((points > 0 ? '+' : '') + points + ' ' + label);
  });

  score = Math.max(0, Math.min(100, score));
  var quality = QUALITY.COLD;
  if (disqualified) quality = QUALITY.DISQUALIFIED;
  else if (score >= settings.hotThreshold) quality = QUALITY.HOT;
  else if (score >= settings.warmThreshold) quality = QUALITY.WARM;

  return {
    score: score,
    quality: quality,
    explanation: parts.length ? parts.join(' | ') : 'No scoring rule matched',
    disqualified: disqualified
  };
}

function ruleMatches_(actual, operator, expected) {
  var a = text_(actual).toLowerCase();
  var e = text_(expected).toLowerCase();
  if (!a) return false; // missing information is neutral
  switch (text_(operator).toLowerCase()) {
    case 'not empty':
      return true;
    case 'equals':
      return a === e;
    case 'contains':
      return e !== '' && a.indexOf(e) !== -1;
    case 'is one of':
      return e.split(';').map(function (x) { return x.trim(); })
        .filter(function (x) { return x; }).indexOf(a) !== -1;
    default:
      return false;
  }
}

/**
 * Final quality shown in the CRM: the salesperson's qualification, when set,
 * overrides the automatic form-based classification.
 */
function resolveLeadQuality(formQuality, salesQualification) {
  var manual = text_(salesQualification).toUpperCase();
  return QUALITY_VALUES.indexOf(manual) !== -1 ? manual : formQuality;
}

/** Classifies a numeric score using the client's thresholds. */
function classifyScore(score, settings) {
  if (score >= settings.hotThreshold) return QUALITY.HOT;
  if (score >= settings.warmThreshold) return QUALITY.WARM;
  return QUALITY.COLD;
}

/* ------------------------------------------------------------------ */
/* Lead priority                                                       */
/* ------------------------------------------------------------------ */

function isClosedStatus(status) {
  return status === STATUS.SOLD || status === STATUS.LOST;
}

/**
 * Priority answers "who must be handled first?" and is independent of quality.
 * @param {Object} lead {status, quality, createdAt, firstContactAt, nextFollowUpAt, appointmentAt}
 * @param {Date} now
 * @param {Object} settings {firstResponseSlaMinutes}
 * @return {string} URGENT | HIGH | MEDIUM | LOW
 */
function calculateLeadPriority(lead, now, settings) {
  if (isClosedStatus(lead.status)) return PRIORITY.LOW;
  var t = now.getTime();
  var weak = lead.quality === QUALITY.COLD || lead.quality === QUALITY.DISQUALIFIED;

  // 1. New lead never contacted: speed matters whatever the quality.
  if (lead.status === STATUS.NEW && !lead.firstContactAt) {
    var created = lead.createdAt ? lead.createdAt.getTime() : t;
    var ageMinutes = (t - created) / 60000;
    return ageMinutes > settings.firstResponseSlaMinutes ? PRIORITY.URGENT : PRIORITY.HIGH;
  }

  // 2. Follow-up deadline.
  if (lead.nextFollowUpAt) {
    var due = lead.nextFollowUpAt.getTime();
    if (t >= due + DAY_MS) { // the planned day has fully passed
      if (weak) return PRIORITY.MEDIUM;
      return lead.quality === QUALITY.HOT ? PRIORITY.URGENT : PRIORITY.HIGH;
    }
    if (t >= due) return weak ? PRIORITY.MEDIUM : PRIORITY.HIGH; // due today
  }

  // 3. Appointment in the next 48 hours.
  if (lead.appointmentAt) {
    var appt = lead.appointmentAt.getTime();
    if (appt >= t - DAY_MS && appt <= t + 2 * DAY_MS) return PRIORITY.HIGH;
  }

  // 4. Open lead with no next action planned.
  if (!lead.nextFollowUpAt) return PRIORITY.MEDIUM;

  // 5. Follow-up planned in the future.
  return lead.quality === QUALITY.HOT ? PRIORITY.MEDIUM : PRIORITY.LOW;
}

/* ------------------------------------------------------------------ */
/* Follow-up                                                           */
/* ------------------------------------------------------------------ */

/** A contact result starting with "Reached" means the lead actually answered. */
function isReachedResult(result) {
  return /^reached/i.test(text_(result));
}

/**
 * Applies one sales activity to the state of a lead and returns the new state.
 * @param {Object} state {status, firstContactAt, lastContactAt, attempts,
 *   lastContactResult, nextFollowUpAt, nextAction, lostReason, saleStatus}
 * @param {Object} activity {type, result, nextAction, nextFollowUpAt, newStatus}
 * @param {Object} settings {maxAttempts, followUpIntervals, autoClose}
 * @param {Date} now
 */
function applyFollowUp(state, activity, settings, now) {
  var out = {};
  for (var k in state) out[k] = state[k];
  out.attempts = Number(out.attempts) || 0;

  var isContact = NON_CONTACT_ACTIVITY_TYPES.indexOf(activity.type) === -1;
  var reached = isReachedResult(activity.result);

  if (isContact) {
    out.attempts += 1;
    out.lastContactAt = now;
    if (!out.firstContactAt) out.firstContactAt = now;
    if (text_(activity.result)) out.lastContactResult = activity.result;
  }

  // Status: an explicit choice wins; otherwise derive it from the activity.
  if (text_(activity.newStatus)) {
    out.status = activity.newStatus;
  } else if (isContact) {
    var early = out.status === STATUS.NEW || out.status === STATUS.CONTACTED ||
      out.status === STATUS.NO_RESPONSE || !out.status;
    if (activity.type === 'Appointment Scheduled' && early) {
      out.status = STATUS.APPOINTMENT;
    } else if (reached && (out.status === STATUS.NEW || out.status === STATUS.NO_RESPONSE || !out.status)) {
      out.status = STATUS.CONTACTED;
    } else if (!reached && (out.status === STATUS.NEW || !out.status)) {
      out.status = STATUS.NO_RESPONSE;
    }
  }

  if (text_(activity.nextAction)) out.nextAction = activity.nextAction;

  if (activity.nextFollowUpAt) {
    out.nextFollowUpAt = activity.nextFollowUpAt;
  } else if (isContact && !reached && !isClosedStatus(out.status)) {
    // No answer: schedule the next attempt according to the cadence.
    var intervals = settings.followUpIntervals && settings.followUpIntervals.length
      ? settings.followUpIntervals : [1];
    var days = intervals[Math.min(out.attempts - 1, intervals.length - 1)];
    out.nextFollowUpAt = new Date(now.getTime() + days * DAY_MS);
    if (!text_(activity.nextAction)) out.nextAction = 'Try to contact again';
  }

  return closeIfExhausted(out, settings);
}

/**
 * Closes a lead that never answered after the maximum number of attempts and
 * keeps closed leads consistent (no pending follow-up, sale status filled).
 */
function closeIfExhausted(state, settings) {
  var out = {};
  for (var k in state) out[k] = state[k];
  var attempts = Number(out.attempts) || 0;

  if (settings.autoClose && out.status === STATUS.NO_RESPONSE && attempts >= settings.maxAttempts) {
    out.status = STATUS.LOST;
    if (!text_(out.lostReason)) out.lostReason = 'No Response';
  }
  if (isClosedStatus(out.status)) {
    out.nextFollowUpAt = null;
    if (out.status === STATUS.SOLD) out.saleStatus = 'Won';
    if (out.status === STATUS.LOST) out.saleStatus = 'Lost';
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

/**
 * Chooses the salesperson for a new lead.
 * @param {Object} lead {campaign, product}
 * @param {Object} settings {assignmentMethod, salespeople, assignmentRules}
 * @param {{rrIndex: number}} state Round-robin pointer, updated in place.
 */
function assignSalesperson(lead, settings, state) {
  var people = settings.salespeople || [];
  var method = text_(settings.assignmentMethod).toLowerCase();
  if (method === 'manual' || !people.length) return '';

  if (method === 'campaign-based' || method === 'product-based') {
    var haystack = text_(method === 'campaign-based' ? lead.campaign : lead.product).toLowerCase();
    var rules = settings.assignmentRules || [];
    for (var i = 0; i < rules.length; i++) {
      var needle = text_(rules[i].match).toLowerCase();
      if (needle && haystack.indexOf(needle) !== -1 && text_(rules[i].salesperson)) {
        return rules[i].salesperson;
      }
    }
    // No rule matched: fall through to round robin so no lead is left unassigned.
  }

  var person = people[state.rrIndex % people.length];
  state.rrIndex = (state.rrIndex + 1) % people.length;
  return person;
}

/* ------------------------------------------------------------------ */
/* New lead processing                                                 */
/* ------------------------------------------------------------------ */

/**
 * Converts one RAW_LEADS row into a CRM record.
 * @param {Object} raw Raw row keyed by column header (including custom columns).
 * @param {Object} ctx {settings, rules, now, rrState,
 *   existing: {ids: {}, emails: {}, phones: {}}}  (maps value -> Lead ID)
 * @return {{status: string, notes: string, record: Object|null}}
 */
function processNewLead(raw, ctx) {
  var settings = ctx.settings;
  var leadId = text_(getField_(raw, 'Lead ID'));

  if (ctx.existing.ids[leadId]) {
    return { status: 'SKIPPED_ALREADY_IN_CRM', notes: 'Lead ID already exists in CRM', record: null };
  }

  var countryIso = resolveCountry(getField_(raw, 'Country'), settings.defaultCountry);
  var phone = normalizePhone(getField_(raw, 'Phone'), countryIso);
  var email = normalizeEmail(getField_(raw, 'Email'));
  var name = text_(getField_(raw, 'Full Name'));

  if (!name && !phone.e164 && !email.email) {
    return { status: 'ERROR_NO_CONTACT_DATA', notes: 'Row has no name, phone or email', record: null };
  }

  var warnings = validateLeadData(raw, phone, email);

  // Secondary duplicate check: the same person may submit more than one form.
  var duplicateOf = '';
  if (email.valid && ctx.existing.emails[email.email]) duplicateOf = ctx.existing.emails[email.email];
  else if (phone.valid && ctx.existing.phones[phone.e164]) duplicateOf = ctx.existing.phones[phone.e164];
  if (duplicateOf) warnings.push('Possible duplicate of ' + duplicateOf);

  // Derived fields that scoring rules may reference.
  var scoringInput = {};
  for (var key in raw) scoringInput[key] = raw[key];
  scoringInput['Phone Valid'] = phone.valid ? 'TRUE' : '';
  scoringInput['Email Valid'] = email.valid ? 'TRUE' : '';
  var scored = calculateLeadScore(scoringInput, ctx.rules, settings);

  var createdAt = parseDate(getField_(raw, 'Created Time')) || ctx.now;
  var campaign = text_(getField_(raw, 'Campaign Name'));
  var product = text_(getField_(raw, 'Product / Service Interest'));
  var salesperson = assignSalesperson({ campaign: campaign, product: product }, settings, ctx.rrState);

  var record = {
    'Lead ID': leadId,
    'Lead Created Date': createdAt,
    'Full Name': name,
    'Phone': phone.valid ? phone.e164 : text_(getField_(raw, 'Phone')),
    'WhatsApp Link': phone.valid ? generateWhatsAppLink(phone.e164) : '',
    'Email': email.email,
    'Country': countryIso,
    'Product / Service Interest': product,
    'Campaign': campaign,
    'Ad Set': text_(getField_(raw, 'Ad Set Name')),
    'Advertisement': text_(getField_(raw, 'Ad Name')),
    'Lead Source': text_(getField_(raw, 'Source')) || 'Meta Lead Ads',
    'Assigned Salesperson': salesperson,
    'Lead Score': scored.score,
    'Lead Quality': scored.quality,
    'Sales Qualification': '',
    'Score Explanation': scored.explanation,
    'Lead Status': STATUS.NEW,
    'Contact Attempts': 0,
    'Sale Status': 'Open',
    'Data Warnings': warnings.join('; '),
    'Last Updated': ctx.now
  };
  record['Lead Priority'] = calculateLeadPriority({
    status: STATUS.NEW, quality: scored.quality, createdAt: createdAt,
    firstContactAt: null, nextFollowUpAt: null, appointmentAt: null
  }, ctx.now, settings);

  // Register the new lead so later rows of the same batch are checked against it.
  ctx.existing.ids[leadId] = true;
  if (email.valid && !ctx.existing.emails[email.email]) ctx.existing.emails[email.email] = leadId;
  if (phone.valid && !ctx.existing.phones[phone.e164]) ctx.existing.phones[phone.e164] = leadId;

  return {
    status: duplicateOf ? 'PROCESSED_POSSIBLE_DUPLICATE' : 'PROCESSED',
    notes: warnings.join('; '),
    record: record
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard metrics                                                   */
/* ------------------------------------------------------------------ */

/**
 * Computes every dashboard figure from the CRM rows.
 * @param {Array<Object>} leads {createdAt, status, quality, score, firstContactAt,
 *   nextFollowUpAt, appointmentAt, visitStatus, campaign}
 * @param {Array<string>} statuses Pipeline statuses in display order.
 * @param {Date} now
 * @param {function(Date, string): string} fmt Date formatter in the client's
 *   time zone. Must support 'yyyy-MM', 'yyyy-MM-dd' and 'u' (1 = Monday).
 */
function computeDashboardMetrics(leads, statuses, now, fmt) {
  var total = leads.length;
  var count = function (fn) { return leads.filter(fn).length; };
  var rate = function (n, d) { return d ? n / d : 0; };
  var afterAppointment = [STATUS.APPOINTMENT, STATUS.VISITED, STATUS.NEGOTIATION, STATUS.SOLD];
  var afterVisit = [STATUS.VISITED, STATUS.NEGOTIATION, STATUS.SOLD];

  var isQualified = function (l) { return l.quality === QUALITY.HOT || l.quality === QUALITY.WARM; };
  var isSold = function (l) { return l.status === STATUS.SOLD; };
  var hadAppointment = function (l) { return !!l.appointmentAt || afterAppointment.indexOf(l.status) !== -1; };
  var hadVisit = function (l) { return l.visitStatus === 'Attended' || afterVisit.indexOf(l.status) !== -1; };

  var scores = leads.filter(function (l) { return typeof l.score === 'number' && !isNaN(l.score); });
  var responded = leads.filter(function (l) { return l.firstContactAt && l.createdAt; });
  var responseHours = responded.reduce(function (sum, l) {
    return sum + Math.max(0, l.firstContactAt.getTime() - l.createdAt.getTime()) / 3600000;
  }, 0);
  var scheduled = leads.filter(function (l) { return !isClosedStatus(l.status) && l.nextFollowUpAt; });
  var onTime = scheduled.filter(function (l) { return now.getTime() < l.nextFollowUpAt.getTime() + DAY_MS; });

  var metrics = {
    overview: [
      ['Total Leads', total],
      ['New Leads', count(function (l) { return l.status === STATUS.NEW; })],
      ['Hot Leads', count(function (l) { return l.quality === QUALITY.HOT; })],
      ['Warm Leads', count(function (l) { return l.quality === QUALITY.WARM; })],
      ['Cold Leads', count(function (l) { return l.quality === QUALITY.COLD; })],
      ['Qualified Leads (Hot + Warm)', count(isQualified)],
      ['Disqualified Leads', count(function (l) { return l.quality === QUALITY.DISQUALIFIED; })]
    ],
    pipeline: statuses.map(function (s) {
      return [s, count(function (l) { return l.status === s; })];
    }),
    performance: {
      contactRate: rate(count(function (l) { return !!l.firstContactAt; }), total),
      appointmentRate: rate(count(hadAppointment), total),
      visitRate: rate(count(hadVisit), total),
      saleRate: rate(count(isSold), total),
      averageScore: scores.length ? scores.reduce(function (s, l) { return s + l.score; }, 0) / scores.length : 0,
      averageFirstResponseHours: responded.length ? responseHours / responded.length : 0,
      followUpCompletionRate: rate(onTime.length, scheduled.length)
    },
    campaigns: [],
    months: [],
    weeks: [],
    days: []
  };

  // Campaign analysis.
  var byCampaign = {};
  leads.forEach(function (l) {
    var name = l.campaign || '(no campaign)';
    var c = byCampaign[name] || (byCampaign[name] = { leads: 0, qualified: 0, sold: 0 });
    c.leads++;
    if (isQualified(l)) c.qualified++;
    if (isSold(l)) c.sold++;
  });
  metrics.campaigns = Object.keys(byCampaign).sort().map(function (name) {
    var c = byCampaign[name];
    return [name, c.leads, c.qualified, c.sold, rate(c.sold, c.leads)];
  });

  // Time analysis.
  var weekStart = function (date) {
    var weekday = Number(fmt(date, 'u')) || 1;
    return fmt(new Date(date.getTime() - (weekday - 1) * DAY_MS), 'yyyy-MM-dd');
  };
  var perMonth = {}, salesPerMonth = {}, perWeek = {}, perDay = {};
  leads.forEach(function (l) {
    if (!l.createdAt) return;
    var m = fmt(l.createdAt, 'yyyy-MM');
    perMonth[m] = (perMonth[m] || 0) + 1;
    if (isSold(l)) salesPerMonth[m] = (salesPerMonth[m] || 0) + 1;
    var w = weekStart(l.createdAt);
    perWeek[w] = (perWeek[w] || 0) + 1;
    var d = fmt(l.createdAt, 'yyyy-MM-dd');
    perDay[d] = (perDay[d] || 0) + 1;
  });

  var ym = fmt(now, 'yyyy-MM').split('-');
  var year = Number(ym[0]), month = Number(ym[1]);
  for (var i = 11; i >= 0; i--) {
    var mm = month - i, yy = year;
    while (mm <= 0) { mm += 12; yy -= 1; }
    var key = yy + '-' + (mm < 10 ? '0' + mm : '' + mm);
    var n = perMonth[key] || 0, s = salesPerMonth[key] || 0;
    metrics.months.push([key, n, s, rate(s, n)]);
  }
  for (var wk = 7; wk >= 0; wk--) {
    var wKey = weekStart(new Date(now.getTime() - wk * 7 * DAY_MS));
    metrics.weeks.push([wKey, perWeek[wKey] || 0]);
  }
  for (var dy = 13; dy >= 0; dy--) {
    var dKey = fmt(new Date(now.getTime() - dy * DAY_MS), 'yyyy-MM-dd');
    metrics.days.push([dKey, perDay[dKey] || 0]);
  }
  return metrics;
}
