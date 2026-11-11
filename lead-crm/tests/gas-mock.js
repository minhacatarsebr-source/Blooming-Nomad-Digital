/**
 * Minimal in-memory stand-in for the Google Apps Script services used by the
 * project. It checks the wiring between tabs (column names, row positions,
 * call order). It does NOT prove behaviour inside real Google Sheets.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** Object whose every method returns itself: used for builders and formatting calls. */
function chain(extra = {}) {
  const proxy = new Proxy(extra, {
    get: (target, prop) => (prop in target ? target[prop] : () => proxy)
  });
  return proxy;
}

class Range {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
    return new Proxy(this, { get: (t, p, r) => (p in t ? Reflect.get(t, p, r) : () => r) });
  }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.numRows; }
  getNumColumns() { return this.numCols; }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      for (let c = 0; c < this.numCols; c++) row.push(this.sheet.get(this.row + r, this.col + c));
      out.push(row);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.numRows || values.some((v) => v.length !== this.numCols)) {
      throw new Error(`setValues: data ${values.length}x${values[0] && values[0].length} does not match range ${this.numRows}x${this.numCols}`);
    }
    values.forEach((row, r) => row.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
  setRichTextValue(v) { this.sheet.set(this.row, this.col, v.text); this.sheet.links[`${this.row}:${this.col}`] = v.url; return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.links = {}; this.active = [1, 1]; this.charts = []; }
  get(r, c) { const row = this.data[r - 1]; const v = row ? row[c - 1] : ''; return v === undefined ? '' : v; }
  set(r, c, v) {
    if (r < 1 || c < 1) throw new Error(`Invalid cell ${r},${c} in ${this.name}`);
    if (v === undefined || v === null) throw new Error(`undefined/null written to ${this.name} ${r},${c}`);
    while (this.data.length < r) this.data.push([]);
    // Like Sheets: a leading apostrophe forces text and is not part of the value.
    this.data[r - 1][c - 1] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
  }
  getName() { return this.name; }
  getMaxRows() { return 1000; }
  getLastRow() {
    for (let r = this.data.length; r >= 1; r--) if ((this.data[r - 1] || []).some((v) => v !== '' && v !== undefined)) return r;
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.data.forEach((row) => row.forEach((v, i) => { if (v !== '' && v !== undefined) max = Math.max(max, i + 1); }));
    return max;
  }
  getRange(r, c, nr, nc) {
    if (nr !== undefined && nr < 1) throw new Error(`getRange: numRows ${nr} in ${this.name}`);
    if (nc !== undefined && nc < 1) throw new Error(`getRange: numColumns ${nc} in ${this.name}`);
    return new Range(this, r, c, nr, nc);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(values) { const r = this.getLastRow() + 1; values.forEach((v, i) => this.set(r, i + 1, v)); }
  clearContents() { this.data = []; }
  getActiveCell() { return new Range(this, this.active[0], this.active[1]); }
  getProtections() { return []; }
  protect() { return chain(); }
  getCharts() { return this.charts; }
  newChart() { return chain({ build: () => ({}) }); }
  insertChart(c) { this.charts.push(c); }
  setFrozenRows() {} setFrozenColumns() {} setColumnWidth() {} setConditionalFormatRules() {}
}

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function createEnvironment() {
  const sheets = {};
  const env = { sheets, mails: [], fetches: [], triggers: [], dialogs: [], alerts: [], activeSheet: null, alertAnswer: 'YES' };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new Sheet(n)),
    getSpreadsheetTimeZone: () => 'UTC',
    setSpreadsheetTimeZone: () => {},
    toast: () => {},
    getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST'
  };
  const ui = chain({
    Button: { YES: 'YES', OK: 'OK', NO: 'NO' },
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO', OK_CANCEL: 'OK_CANCEL' },
    alert: (...args) => { env.alerts.push(args); return env.alertAnswer; },
    showModalDialog: (html, title) => env.dialogs.push({ html, title })
  });
  const props = () => { const m = {}; return { getProperty: (k) => (k in m ? m[k] : null), setProperty: (k, v) => { m[k] = v; } }; };
  const docProps = props(), scriptProps = props();
  const globals = {
    console: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getActiveSheet: () => env.activeSheet,
      getUi: () => ui,
      flush: () => {},
      newDataValidation: () => chain({ build: () => ({}) }),
      newConditionalFormatRule: () => chain({ build: () => ({}) }),
      newRichTextValue: () => {
        const v = {};
        const b = { setText: (t) => { v.text = t; return b; }, setLinkUrl: (u) => { v.url = u; return b; }, build: () => v };
        return b;
      },
      RelativeDate: { TODAY: 'TODAY' },
      ProtectionType: { SHEET: 'SHEET' }
    },
    Utilities: {
      formatDate: (d, tz, p) => {
        const parts = { yyyy: d.getUTCFullYear(), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()),
          HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()), u: d.getUTCDay() || 7 };
        return p.replace(/yyyy|MM|dd|HH|mm|ss|u/g, (k) => parts[k]);
      },
      parseDate: (s) => new Date(s + 'T00:00:00Z')
    },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getDocumentProperties: () => docProps, getScriptProperties: () => scriptProps },
    MailApp: { sendEmail: (to, subject, body) => env.mails.push({ to, subject, body }) },
    UrlFetchApp: { fetch: (url, opts) => { env.fetches.push({ url, opts }); return { getResponseCode: () => 200 }; } },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: (fn) => chain({ create: () => env.triggers.push(fn) })
    },
    HtmlService: { createTemplateFromFile: (f) => { const t = { file: f, evaluate: () => chain({ template: t }) }; return t; } }
  };
  const context = vm.createContext(globals);
  const dir = path.join(__dirname, '..', 'apps-script');
  fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort().forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), context, { filename: f }));
  env.gas = context;
  env.scriptProps = scriptProps;
  /** Rows of a tab as objects keyed by header. */
  env.rows = (name) => {
    const [headers, ...rest] = sheets[name].data;
    return rest.filter((r) => r && r.some((v) => v !== '' && v !== undefined))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
  };
  env.col = (name, header) => sheets[name].data[0].indexOf(header) + 1;
  return env;
}

module.exports = { createEnvironment };
