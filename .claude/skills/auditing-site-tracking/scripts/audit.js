// Nivel 3 - Auditoria. Uso: node audit.js <audit.config.json> [--simulate-fix] [--debug]
// Sai com codigo 1 se algum teste falhar. Nunca envia formulario valido: o sucesso e simulado.
// config: { "base": "https://site", "page": "/contact",
//   "accept": "accept all|aceitar", "decline": "decline all|recusar",        (regex do texto dos botoes do banner)
//   "consentCookies": [{"name":"x","value":"true"}],                        (opcional: usado se o banner nao for clicavel)
//   "form": { "submit": "form button[type=submit]", "successSelector": ".form-submission-text", "successClass": "form-submission-text",
//             "ga": "generate_lead", "meta": "Lead" },                       (opcional)
//   "clicks": [{ "name": "WhatsApp", "selector": "a[href*='wa.me']", "ga": "contact", "meta": "Contact" }],
//   "simulate": { "removeRegex": "<script>...antigo...</script>", "header": "fix/header-injection.html", "footer": "fix/footer-injection.html" } }
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const cfgPath = process.argv[2]; if (!cfgPath) { console.error('uso: node audit.js <audit.config.json> [--simulate-fix]'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); const dir = path.dirname(path.resolve(cfgPath));
const SIM = process.argv.includes('--simulate-fix'); const DEBUG = process.argv.includes('--debug');
const URL0 = cfg.base.replace(/\/$/, '') + (cfg.page || '/'); const ORIGIN = new URL(URL0).origin;
const COOKIE = /^(_ga|_gid|_gcl|_fbp|_fbc|fr$|_ttp|_uet|_clck|_clsk|_hj|li_|_pin|IDE$|hubspotutk)/;
const isGA = u => /\/g\/collect/.test(u); const isMeta = u => /facebook\.com\/tr|on\.aws\/events/.test(u);
const isOther = u => /tiktok\.com\/api|px\.ads\.linkedin|bat\.bing\.com\/action|clarity\.ms\/collect|ct\.pinterest/.test(u);
const results = [];
const check = (id, ok, detail) => { results.push(ok); console.log(`${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`); };
const evs = h => { const u = new URL(h.u); const m = h.b.match(/(?:^|&|\s)en=([^&\s]+)/g); if (u.searchParams.get('en')) return [u.searchParams.get('en')]; if (m) return m.map(x => x.replace(/^.*en=/, '')); return [u.searchParams.get('ev') || (h.b.match(/"event_name":"([^"]+)"/) || [])[1] || '?']; };
// chamadas fbq('track') feitas enquanto o pixel esta com fbq('consent','revoke') ficam retidas: nao contam como envio
const metaLive = calls => { let revoked = false; const live = []; for (const c of calls) { if (c === 'consent:revoke') revoked = true; else if (c === 'consent:grant') revoked = false; else if (c.startsWith('track') && !revoked) live.push(c); } return live; };
const gaCount = (hits, name) => hits.filter(h => isGA(h.u)).flatMap(evs).filter(e => e === name).length;

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage(); const hits = [];
  await page.addInitScript(() => { let real; window.__fbqCalls = [];   // espia chamadas fbq: os hits de rede da Meta nao sao confiaveis em headless
    Object.defineProperty(window, 'fbq', { configurable: true, get() { return real; }, set(v) { real = typeof v === 'function' ? new Proxy(v, { apply(t, th, a) { window.__fbqCalls.push(Array.from(a).slice(0, 2).join(':')); return Reflect.apply(t, th, a); } }) : v; } }); });
  page.on('request', r => { const u = r.url(); if (isGA(u) || isMeta(u) || isOther(u)) hits.push({ u, b: r.postData() || '' }); });
  if (SIM && cfg.simulate) await page.route(u => u.origin === ORIGIN, async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    let html = execFileSync('curl', ['-sS', '-L', '-m', '40', route.request().url()], { maxBuffer: 1 << 26 }).toString();  // curl respeita o proxy; fetch do node nao
    const f = k => cfg.simulate[k] ? fs.readFileSync(path.join(dir, cfg.simulate[k]), 'utf8') : '';
    if (cfg.simulate.removeRegex) html = html.replace(new RegExp(cfg.simulate.removeRegex), '');
    html = html.replace('<head>', '<head>' + f('header')).replace('</body>', f('footer') + '</body>');
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  return { ctx, page, hits, fbq: () => page.evaluate(() => window.__fbqCalls || []), tc: async () => (await ctx.cookies()).map(c => c.name).filter(n => COOKIE.test(n)) };
}
const clickBanner = async (s, re) => { if (!re) return false; const b = s.page.locator('button, a[role=button], a, [role=button]').filter({ hasText: new RegExp('^\\s*(' + re + ')\\s*$', 'i') }).filter({ visible: true }).first(); if (!(await b.count())) return false; await b.click(); await s.page.waitForTimeout(7000); return true; };
const load = async s => { await s.page.goto(URL0, { waitUntil: 'load', timeout: 60000 }); await s.page.waitForTimeout(6000); };

(async () => {
  console.log(`Alvo: ${URL0}  modo: ${SIM ? 'SIMULACAO DA CORRECAO' : 'SITE REAL'}  ${new Date().toISOString()}\n`);
  const browser = await chromium.launch();

  // A) visitante novo, sem escolher
  let s = await open(browser); await load(s);
  const banner = await s.page.evaluate(() => [...document.querySelectorAll('[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[id*=onetrust i],[id*=usercentrics i]')].some(e => e.offsetHeight > 20));
  check('A1 banner de cookies visivel', banner);
  let tc = await s.tc(); check('A2 nenhum cookie de analytics/ads antes do consentimento', tc.length === 0, tc.join(', '));
  const bad = s.hits.filter(h => !(isGA(h.u) && new URL(h.u).searchParams.get('gcs') === 'G100'));
  check('A3 antes do consentimento: nenhum evento de ads e GA4 so em modo negado (gcs=G100)', bad.length === 0, [...new Set(s.hits.map(h => new URL(h.u).hostname + ':' + evs(h).join('+') + ':gcs=' + (new URL(h.u).searchParams.get('gcs') || '-')))].join(', '));
  const fbPre = metaLive(await s.fbq()); check('A4 nenhum evento Meta enviado antes do consentimento (fbq track sem revoke)', fbPre.length === 0, fbPre.join(', ') || (await s.fbq()).join(', '));
  check('A5 link de politica de privacidade na pagina', await s.page.evaluate(() => [...document.querySelectorAll('a[href]')].some(a => /privacy|privacidade|cookie-policy|datenschutz|privacybeleid|confidentialite|privacidad/i.test(a.href))));
  // B) recusa
  if (await clickBanner(s, cfg.decline)) { await load(s); tc = await s.tc(); check('B1 depois de recusar: nenhum cookie de analytics/ads', tc.length === 0, tc.join(', ')); check('B2 depois de recusar: nenhum evento Meta enviado', metaLive(await s.fbq()).length === 0 && !s.hits.some(h => isMeta(h.u))); }
  else { check('B1 botao de recusar encontrado e funcional', cfg.decline ? false : null, 'regex: ' + cfg.decline); }
  await s.ctx.close();

  // C) aceite
  s = await open(browser); await load(s);
  let accepted = await clickBanner(s, cfg.accept);
  if (!accepted && cfg.consentCookies) { await s.ctx.addCookies(cfg.consentCookies.map(c => ({ ...c, domain: new URL(URL0).hostname, path: '/' }))); accepted = 'cookies'; }
  check('C1 botao de aceitar encontrado', accepted === true, accepted === 'cookies' ? 'nao clicavel; aceite simulado por cookies' : 'regex: ' + cfg.accept);
  s.hits.length = 0; await load(s);
  check('C2 GA4 page_view depois do aceite', gaCount(s.hits, 'page_view') >= 1);
  const gcd = (s.hits.filter(h => isGA(h.u)).map(h => new URL(h.u).searchParams.get('gcd')).filter(Boolean)[0]) || '';
  const sig = (gcd.match(/^\d\d([a-z])\d([a-z])\d([a-z])\d([a-z])/) || []).slice(1);
  check('C3 Consent Mode v2: 4 sinais presentes e granted', sig.length === 4 && sig.every(c => !'lpq'.includes(c)), 'gcd=' + gcd);
  const usesMeta = await s.page.evaluate(() => typeof window.fbq === 'function');
  check('C4 Meta PageView depois do aceite (chamada fbq)', usesMeta ? (await s.fbq()).includes('track:PageView') : null, usesMeta ? '' : 'site sem Meta Pixel');

  if (cfg.form) {
    s.hits.length = 0; const before = (await s.fbq()).length;
    const btn = s.page.locator(cfg.form.submit).first(); await btn.scrollIntoViewIfNeeded(); await btn.click(); await s.page.waitForTimeout(5000);
    check(`D1 formulario vazio/invalido NAO gera ${cfg.form.ga}`, gaCount(s.hits, cfg.form.ga) === 0 && !(await s.fbq()).slice(before).includes('track:' + cfg.form.meta), s.hits.flatMap(evs).join(', '));
    s.hits.length = 0;
    await s.page.evaluate(c => { const d = document.createElement('div'); d.className = c; d.textContent = 'Thank you!'; document.querySelector('form').parentNode.appendChild(d); }, cfg.form.successClass);
    await s.page.waitForTimeout(9000);
    check(`D2 sucesso do formulario gera 1 ${cfg.form.ga} (GA4) [sucesso simulado]`, gaCount(s.hits, cfg.form.ga) === 1, 'n=' + gaCount(s.hits, cfg.form.ga));
    if (cfg.form.meta) check(`D3 sucesso do formulario gera 1 ${cfg.form.meta} (Meta, fbq) [sucesso simulado]`, usesMeta ? (await s.fbq()).filter(c => c === 'track:' + cfg.form.meta).length === 1 : null);
  }
  let i = 0;
  for (const c of cfg.clicks || []) {
    i++; s.hits.length = 0; const before = (await s.fbq()).length; const el = s.page.locator(c.selector).first();
    if (!(await el.count())) { check(`E${i} ${c.name}: elemento encontrado`, false, c.selector); continue; }
    await s.page.evaluate(sel => document.querySelectorAll(sel).forEach(a => a.addEventListener('click', e => e.preventDefault())), c.selector);  // nao sair da pagina
    await el.scrollIntoViewIfNeeded(); await el.click(); await s.page.waitForTimeout(9000);   // GA4 agrupa eventos; esperar o lote
    if (c.ga) check(`E${i}a ${c.name} gera 1 ${c.ga} (GA4)`, gaCount(s.hits, c.ga) === 1, s.hits.flatMap(evs).join(', '));
    if (c.meta) check(`E${i}b ${c.name} gera 1 ${c.meta} (Meta, fbq)`, usesMeta ? (await s.fbq()).slice(before).filter(x => x === 'track:' + c.meta).length === 1 : null);
    if (DEBUG) console.log('   hits:', s.hits.map(h => h.u.slice(0, 80) + ' ' + evs(h)));
  }
  await browser.close();
  const fail = results.filter(r => r === false).length, pass = results.filter(r => r === true).length;
  console.log(`\n${pass}/${pass + fail} PASS, ${fail} FAIL${results.includes(null) ? ', ' + results.filter(r => r === null).length + ' SKIP' : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
