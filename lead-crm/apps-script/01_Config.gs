/**
 * 01_Config.gs — Static configuration: tab names, column names, default values.
 *
 * Nothing client-specific lives here. Everything a client can change is stored
 * in the SETTINGS and LEAD_SCORING tabs of the spreadsheet.
 */

var SHEETS = {
  RAW: 'RAW_LEADS',
  CRM: 'CRM',
  SCORING: 'LEAD_SCORING',
  LOG: 'FOLLOW_UP_LOG',
  DASHBOARD: 'DASHBOARD',
  SETTINGS: 'SETTINGS',
  SYSTEM_LOG: 'SYSTEM_LOG'
};

/**
 * RAW_LEADS — original data, written by Make.com (or pasted manually).
 * Extra columns may be added to the right for custom form questions; scoring
 * rules can reference any column by its header name.
 */
var RAW_HEADERS = [
  'Lead ID', 'Created Time', 'Form ID', 'Form Name', 'Page ID',
  'Campaign ID', 'Campaign Name', 'Ad Set ID', 'Ad Set Name', 'Ad ID', 'Ad Name',
  'Full Name', 'Email', 'Phone', 'Country',
  'Product / Service Interest', 'Hot Lead Answer', 'Contact Consent',
  'Source', 'Client ID',
  'Processing Status', 'Processing Notes', 'Processed At'
];

/** RAW_LEADS columns that must be stored as plain text (long IDs, phone numbers). */
var RAW_TEXT_COLUMNS = [
  'Lead ID', 'Form ID', 'Page ID', 'Campaign ID', 'Ad Set ID', 'Ad ID', 'Phone'
];

/** RAW_LEADS columns that are NOT custom form answers (used by anonymisation). */
var RAW_SYSTEM_COLUMNS = [
  'Lead ID', 'Created Time', 'Form ID', 'Form Name', 'Page ID',
  'Campaign ID', 'Campaign Name', 'Ad Set ID', 'Ad Set Name', 'Ad ID', 'Ad Name',
  'Country', 'Source', 'Client ID',
  'Processing Status', 'Processing Notes', 'Processed At'
];

/** CRM — the salesperson's working tab. */
var CRM_HEADERS = [
  'Lead ID', 'Lead Created Date', 'Full Name', 'Phone', 'WhatsApp Link', 'Email',
  'Country', 'Product / Service Interest', 'Campaign', 'Ad Set', 'Advertisement',
  'Lead Source', 'Assigned Salesperson', 'Lead Priority',
  'Lead Score', 'Lead Quality', 'Sales Qualification', 'Score Explanation',
  'Lead Status', 'First Contact Date', 'Last Contact Date', 'Contact Attempts',
  'Last Contact Result', 'Next Follow-up Date', 'Next Action', 'Appointment Date',
  'Visit Status', 'Sales Opportunity Value', 'Sale Status', 'Lost Reason',
  'Notes', 'Data Warnings', 'Last Updated'
];

/** CRM columns filled by the script. Salespeople should not edit them. */
var CRM_AUTO_COLUMNS = [
  'Lead ID', 'Lead Created Date', 'WhatsApp Link', 'Lead Priority', 'Lead Score',
  'Lead Quality', 'Score Explanation', 'First Contact Date', 'Last Contact Date',
  'Contact Attempts', 'Data Warnings', 'Last Updated'
];

var SCORING_HEADERS = [
  'Active', 'Criterion', 'Source Field', 'Operator', 'Match Value', 'Points', 'Explanation'
];

var SCORING_OPERATORS = ['equals', 'contains', 'is one of', 'not empty'];

var LOG_HEADERS = [
  'Activity ID', 'Lead ID', 'Activity Date', 'Salesperson', 'Activity Type',
  'Contact Result', 'Notes', 'Next Action', 'Next Follow-up Date'
];

var SYSTEM_LOG_HEADERS = ['Timestamp', 'Level', 'Function', 'Message'];

var QUALITY = { HOT: 'HOT', WARM: 'WARM', COLD: 'COLD', DISQUALIFIED: 'DISQUALIFIED' };
var QUALITY_VALUES = ['HOT', 'WARM', 'COLD', 'DISQUALIFIED'];
var PRIORITY = { URGENT: 'URGENT', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

/**
 * Core status names used by the automation. More statuses can be added in
 * SETTINGS, but these names must be kept because the rules depend on them.
 */
var STATUS = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  NO_RESPONSE: 'No Response',
  APPOINTMENT: 'Appointment Scheduled',
  VISITED: 'Visited',
  NEGOTIATION: 'Negotiation',
  SOLD: 'Sold',
  LOST: 'Lost'
};

/** Activity types that do not count as a contact attempt. */
var NON_CONTACT_ACTIVITY_TYPES = ['Other'];

/** SETTINGS key/value block (columns A:C). [key, default value, description] */
var SETTINGS_DEFAULTS = [
  ['Client Name', 'Example Client', 'Business name shown in notifications and reports.'],
  ['Client ID', 'CLIENT-001', 'Short unique identifier for this client.'],
  ['Business Type', '', 'Industry or business model (free text).'],
  ['Country', 'NL', 'Main country of the business (ISO 2-letter code, e.g. NL, PT).'],
  ['Default Country Code', 'NL', 'ISO 2-letter country used to normalise phone numbers when the lead has no country.'],
  ['Currency', 'EUR', 'Currency of Sales Opportunity Value.'],
  ['Time Zone', 'Europe/Amsterdam', 'IANA time zone, e.g. Europe/Amsterdam or Europe/Lisbon.'],
  ['Assignment Method', 'Round Robin', 'Round Robin, Manual, Campaign-Based or Product-Based.'],
  ['First Response SLA (minutes)', '60', 'A New lead not contacted within this time becomes URGENT.'],
  ['Max Contact Attempts', '6', 'Attempts without an answer before the lead is closed as Lost.'],
  ['Follow-up Intervals (days)', '1;2;2;3;6', 'Days to wait after attempt 1, 2, 3... when the lead did not answer.'],
  ['Auto-close After Max Attempts', 'YES', 'YES = a No Response lead is set to Lost automatically at the maximum.'],
  ['Hot Score Threshold', '70', 'Lead Score at or above this value is HOT.'],
  ['Warm Score Threshold', '40', 'Lead Score at or above this value is WARM. Below is COLD.'],
  ['Email Notifications', 'NO', 'YES = email the manager and the assigned salesperson on each new lead.'],
  ['Manager Email', '', 'Receives new lead notifications and the daily report.'],
  ['Telegram Notifications', 'NO', 'YES = send new lead alerts to Telegram. The bot token is set from the menu.'],
  ['Telegram Chat ID', '', 'Chat or group ID that receives Telegram alerts.'],
  ['Daily Report', 'NO', 'YES = email a daily summary with overdue follow-ups to the manager.'],
  ['Retention Months (Lost Leads)', '12', 'Lost leads older than this can be anonymised from the menu.'],
  ['Meta Dataset ID (Phase 2)', '', 'Reserved for the Conversions API phase. Not used yet.'],
  ['Meta CAPI Enabled (Phase 2)', 'NO', 'Reserved for the Conversions API phase. Not used yet.']
];

/** SETTINGS list columns. `col` is the 1-based column number. */
var SETTINGS_LISTS = [
  { header: 'Salespeople', col: 5, values: ['Salesperson 1', 'Salesperson 2'] },
  { header: 'Salesperson Email', col: 6, values: [] },
  { header: 'Lead Statuses', col: 7, values: ['New', 'Contacted', 'No Response', 'Appointment Scheduled', 'Visited', 'Negotiation', 'Sold', 'Lost'] },
  { header: 'Contact Results', col: 8, values: ['Reached - Interested', 'Reached - Call Back Later', 'Reached - Not Interested', 'No Answer', 'Voicemail', 'Message Sent - No Reply', 'Wrong Number'] },
  { header: 'Activity Types', col: 9, values: ['Phone Call', 'WhatsApp Message', 'Email', 'Appointment Scheduled', 'Meeting', 'Proposal Sent', 'Follow-up', 'Other'] },
  { header: 'Lost Reasons', col: 10, values: ['No Response', 'Not Interested', 'Budget', 'Chose Competitor', 'Outside Service Area', 'Wrong Number', 'Duplicate', 'Other'] },
  { header: 'Visit Statuses', col: 11, values: ['Scheduled', 'Attended', 'No-show', 'Cancelled', 'Rescheduled'] },
  { header: 'Sale Statuses', col: 12, values: ['Open', 'Won', 'Lost'] },
  { header: 'Assignment Match Text', col: 14, values: [] },
  { header: 'Assignment Salesperson', col: 15, values: [] }
];

/** Default scoring rules written to LEAD_SCORING on first setup. Edit per client. */
var SCORING_DEFAULT_RULES = [
  ['YES', 'Purchase intent', 'Hot Lead Answer', 'is one of', 'Yes;Ja;Sim', 60, 'Answered the qualifying form question positively.'],
  ['YES', 'Contactability', 'Phone Valid', 'equals', 'TRUE', 15, 'Valid phone number provided.'],
  ['YES', 'Contactability', 'Email', 'not empty', '', 10, 'Email address provided.'],
  ['YES', 'Product or service fit', 'Product / Service Interest', 'not empty', '', 15, 'Named a specific product or service.']
];
