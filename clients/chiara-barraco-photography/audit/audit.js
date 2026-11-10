// Auditoria de tracking/consentimento. Uso: node audit.js [--simulate-fix]
// --simulate-fix: troca o snippet antigo pelos de ../fix só dentro do navegador de teste (o site real não muda).
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const BASE = 'https://www.chiarabarracophotography.com';
const SIM = process.argv.includes('--simulate-fix');
const fix = f => fs.readFileSync(path.join(__dirname, '..', 'fix', f), 'utf8');
const isHit = u => /(google-analytics|analytics\.google)\.com\/g\/collect|doubleclick\.net\/g\/collect|facebook\.com\/tr|on\.aws\/events/.test(u);
const results = [];
const check = (id, ok, detail) => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`); };

async function open(browser, cookies) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  if (cookies) await ctx.addCookies(cookies);
  const page = await ctx.newPage(); const hits = [];
  await page.addInitScript(() => { let real; window.__fbqCalls = [];
    Object.defineProperty(window, 'fbq', { configurable: true, get() { return real; },
      set(v) { real = typeof v === 'function' ? new Proxy(v, { apply(t, th, a) { window.__fbqCalls.push(Array.from(a).slice(0, 2).join(':')); return Reflect.apply(t, th, a); } }) : v; } }); });
  page.on('request', r => { if (isHit(r.url())) hits.push({ u: r.url(), b: r.postData() || '' }); });
  if (SIM) await page.route(u => u.origin === BASE && !/\.\w{2,4}$/.test(u.pathname), async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    let html = execFileSync('curl', ['-sS', '-L', '-m', '40', route.request().url()], { maxBuffer: 1 << 26 }).toString();
    html = html.replace(/<script>document\.addEventListener\('submit'[\s\S]*?<\/script>/, fix('footer-injection.html'));
    html = html.replace('<head>', '<head>' + fix('header-injection.html'));
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  const fbq = () => page.evaluate(() => window.__fbqCalls || []);
  const dl = () => page.evaluate(() => (window.dataLayer || []).filter(e => e && e[0] === 'event').map(e => e[1]));
  return { ctx, page, hits, fbq, dl };
}
var isMeta = h => /facebook\.com\/tr|on\.aws\/events/.test(h.u);
const ev = h => { const u = new URL(h.u); const m = h.b.match(/(?:^|&|\s)en=([^&\s]+)/g); if (m && !u.searchParams.get('en')) return m.map(x => x.replace(/^.*en=/, '')).join('+'); return u.searchParams.get('en') || u.searchParams.get('ev') || (h.b.match(/"event_name":"([^"]+)"/) || [])[1] || '?'; };

(async () => {
  console.log(`Alvo: ${BASE}  modo: ${SIM ? 'SIMULACAO DA CORRECAO' : 'SITE REAL'}  ${new Date().toISOString()}\n`);
  const browser = await chromium.launch();

  // A) visitante novo, sem consentimento
  let s = await open(browser);
  await s.page.goto(BASE + '/contact', { waitUntil: 'load' }); await s.page.waitForTimeout(6000);
  const cfg = await s.page.evaluate(() => (window.Static && Static.SQUARESPACE_CONTEXT && Static.SQUARESPACE_CONTEXT.cookieSettings) || {});
  const html = await s.page.content();
  check('A1 banner de cookies ativo', cfg.isCookieBannerEnabled === true);
  check('A2 politica restritiva (bloqueia tags ate o aceite)', cfg.isRestrictiveCookiePolicyEnabled === true);
  check('A3 banner em opt-in', cfg.cookieBannerAcceptType === 'OPT_IN' && cfg.isCookieBannerEnabled === true);
  const ck = (await s.ctx.cookies()).map(c => c.name).filter(n => /^(_ga|_fbp|_gcl|fr$)/.test(n));
  check('A4 nenhum cookie de analytics/ads antes do consentimento', ck.length === 0, ck.join(', '));
  // Consent Mode avancado: pings GA4 sem cookies (gcs=G100) sao esperados; qualquer outro hit e falha
  const bad = s.hits.filter(h => isMeta(h) || new URL(h.u).searchParams.get('gcs') !== 'G100');
  check('A5 antes do consentimento: nenhum hit Meta e GA4 so em modo negado (gcs=G100, sem cookies)', bad.length === 0,
    [...new Set(s.hits.map(h => new URL(h.u).hostname + ':' + ev(h) + ':gcs=' + (new URL(h.u).searchParams.get('gcs') || '-')))].join(', '));
  check('A6 link de politica de privacidade na pagina', /href="[^"]*(privacy|privacidade|cookie-policy)[^"]*"/i.test(html));
  check('A7 snippet antigo de generate_lead removido', SIM || !/addEventListener\('submit'[^<]*generate_lead/.test(html));
  check('A8 snippets novos instalados', SIM || (html.includes('Consent Mode v2 bridge') && html.includes('__bnTracking')));
  await s.ctx.close();

  // B) visitante que aceitou tudo
  const yes = ['ss_performanceCookiesAllowed', 'ss_marketingCookiesAllowed'].map(name => ({ name, value: 'true', domain: 'www.chiarabarracophotography.com', path: '/' }));
  s = await open(browser, yes);
  await s.page.goto(BASE + '/contact', { waitUntil: 'load' }); await s.page.waitForTimeout(6000);
  const pv = s.hits.filter(h => ev(h) === 'page_view' || ev(h) === 'PageView');
  check('B1 GA4 page_view com consentimento', pv.some(h => /g\/collect/.test(h.u)));
  check('B2 Meta PageView com consentimento (chamada fbq)', (await s.fbq()).includes('track:PageView'), (await s.fbq()).join(', '));
  const gcd = (s.hits.map(h => new URL(h.u).searchParams.get('gcd')).filter(Boolean)[0]) || '';
  const sig = (gcd.match(/^\d\d([a-z])\d([a-z])\d([a-z])\d([a-z])/) || []).slice(1);
  check('B3 Consent Mode v2: 4 sinais presentes e granted', sig.length === 4 && sig.every(c => !'lpq'.includes(c)), 'gcd=' + gcd);

  s.hits.length = 0;
  const btn = s.page.locator('form button[type=submit]').first(); await btn.scrollIntoViewIfNeeded(); await btn.click(); await s.page.waitForTimeout(4000);
  check('B4 formulario vazio/invalido NAO gera generate_lead', !s.hits.some(h => ev(h) === 'generate_lead'), s.hits.map(ev).join(', '));

  s.hits.length = 0;   // sucesso simulado: nao enviamos lead real ao cliente
  await s.page.evaluate(() => { const d = document.createElement('div'); d.className = 'form-submission-text'; d.textContent = 'Thank you!'; document.querySelector('form').parentNode.appendChild(d); });
  await s.page.waitForTimeout(4000);
  const leads = s.hits.filter(h => /g\/collect/.test(h.u) && ev(h) === 'generate_lead').length;
  check('B5 mensagem de sucesso gera 1 generate_lead (GA4) [sucesso simulado]', leads === 1, 'n=' + leads);
  check('B6 mensagem de sucesso gera Lead (Meta, chamada fbq) [sucesso simulado]', (await s.fbq()).filter(c => c === 'track:Lead').length === 1);

  s.hits.length = 0;
  await s.page.evaluate(() => document.querySelectorAll('a[href*="wa.me"]').forEach(a => a.addEventListener('click', e => e.preventDefault())));
  await s.page.locator('a[href*="wa.me"]').first().click(); await s.page.waitForTimeout(9000);
  check('B7 clique no WhatsApp gera contact (GA4)', s.hits.filter(h => /g\/collect/.test(h.u) && ev(h).split('+').includes('contact')).length === 1, s.hits.map(ev).join(', '));
  check('B8 clique no WhatsApp gera Contact (Meta, chamada fbq)', (await s.fbq()).filter(c => c === 'track:Contact').length === 1);
  if (process.argv.includes('--debug')) console.log('dataLayer events:', await s.dl(), '\nhits:', s.hits.map(h => h.u.slice(0, 90) + ' en=' + ev(h)));
  await browser.close();

  const fail = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fail}/${results.length} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
