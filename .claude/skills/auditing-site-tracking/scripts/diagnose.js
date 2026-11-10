// Nivel 1 - Diagnostico. Uso: node diagnose.js <url> <pasta-de-saida> [maxPaginas=8]
// So carrega paginas (nao clica, nao envia formularios). Grava <pasta>/diagnose.json (um objeto por URL, mesmos campos do resumo,
// com inlineTracking completo e hitsBeforeConsent detalhado) e imprime um resumo.
const { chromium } = require('playwright');
const fs = require('fs');
const [start, out, maxArg] = process.argv.slice(2);
if (!start || !out) { console.error('uso: node diagnose.js <url> <pasta-de-saida> [maxPaginas]'); process.exit(2); }
const MAX = Number(maxArg || 8);
const TRACK = /googletagmanager|google-analytics|analytics\.google|doubleclick|googleadservices|googlesyndication|facebook\.(com|net)|on\.aws\/events|tiktok|linkedin|snap|pinterest|clarity\.ms|hotjar|bing\.com|bat\.bing|criteo|taboola|hubspot|klaviyo/;
const COOKIE = /^(_ga|_gid|_gcl|_fbp|_fbc|fr$|_ttp|_uet|_clck|_clsk|_hj|li_|_pin|IDE$|hubspotutk)/;
const extract = () => {
  const q = s => [...document.querySelectorAll(s)];
  const ctx = (window.Static && Static.SQUARESPACE_CONTEXT) || null;
  const has = k => { try { return k in window; } catch (e) { return false; } };
  return {
    title: document.title, lang: document.documentElement.lang,
    platform: [ctx && 'squarespace', has('Shopify') && 'shopify', has('wixBiSession') && 'wix', (has('wp') || q('link[href*="wp-content"]').length) && 'wordpress', has('Webflow') && 'webflow', q('meta[name=generator]').map(m => m.content).join('|')].filter(Boolean),
    globals: ['gtag', 'fbq', 'ttq', 'pintrk', 'clarity', 'hj', 'lintrk', 'uetq', '_hsq'].filter(has),
    cmp: ['Cookiebot', 'OneTrust', 'OnetrustActiveGroups', '_iub', 'CookieConsent', 'cookieyes', 'complianz', 'cmplz_banner', '__tcfapi', 'Didomi', 'UC_UI', 'klaro', 'CookieFirst', 'axeptioSDK', 'tarteaucitron'].filter(has),
    squarespaceCookieSettings: ctx && ctx.cookieSettings ? { banner: ctx.cookieSettings.isCookieBannerEnabled, restrictive: ctx.cookieSettings.isRestrictiveCookiePolicyEnabled, type: ctx.cookieSettings.cookieBannerAcceptType } : null,
    containers: Object.keys(window.google_tag_manager || {}).filter(k => /^(GTM-|G-|AW-|DC-)/.test(k)),
    pixelIds: [...new Set((document.documentElement.innerHTML.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/g) || []).map(m => m.match(/(\d{6,})/)[1]))],
    consentDefault: (window.dataLayer || []).some(e => e && e[0] === 'consent' && e[1] === 'default'),
    dataLayerEvents: (window.dataLayer || []).map(e => (e && (e.event || (e[0] && [e[0], e[1]].join(':')))) || '?').slice(0, 40),
    inlineTracking: q('script:not([src])').map(s => s.textContent).filter(t => /gtag\(|fbq\(|dataLayer\.push|addEventListener\(['"]submit/.test(t) && t.length < 6000).map(t => t.replace(/\s+/g, ' ').slice(0, 2500)),
    banner: q('[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i]').filter(e => e.offsetHeight > 20).slice(0, 1).map(e => ({ cls: e.className.toString().slice(0, 80), text: e.innerText.replace(/\s+/g, ' ').slice(0, 200), buttons: [...e.querySelectorAll('button,a')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 6) })),
    forms: q('form').map(f => ({ id: f.id, cls: f.className.toString().slice(0, 80), action: f.getAttribute('action'), fields: [...f.elements].map(e => e.type + ':' + (e.name || e.id)).slice(0, 15) })),
    iframes: q('iframe').map(f => (f.src || '').slice(0, 120)).filter(Boolean),
    ctas: [...new Set(q('a[href^="mailto:"],a[href^="tel:"],a[href*="wa.me"],a[href*="whatsapp"],a[href*="calendly"],a[href*="acuity"],a[href*="booking"],a[href*="#book"]').map(a => a.getAttribute('href').slice(0, 100) + ' | ' + a.textContent.trim().slice(0, 40)))],
    privacyLinks: [...new Set(q('a[href]').map(a => a.href).filter(h => /privacy|privacidade|cookie-policy|datenschutz|privacybeleid|confidentialite|privacidad/i.test(h)))],
    links: [...new Set(q('a[href]').map(a => a.href.split('#')[0]).filter(h => h.startsWith(location.origin) && !/\.(jpg|png|pdf|zip)$|\/cart|\/account|\/login/i.test(h)))],
  };
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(); const pages = {}; const queue = [start]; const seen = new Set();
  while (queue.length && Object.keys(pages).length < MAX) {
    const url = queue.shift(); const key = url.replace(/\/$/, ''); if (seen.has(key)) continue; seen.add(key);
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const hits = [];
    p.on('request', r => { const u = r.url(); if (TRACK.test(new URL(u).hostname + new URL(u).pathname)) { const s = new URL(u).searchParams; hits.push({ host: new URL(u).hostname, type: r.resourceType(), ev: s.get('en') || s.get('ev') || s.get('event') || '', gcs: s.get('gcs') || '', gcd: s.get('gcd') || '', id: s.get('tid') || s.get('id') || '' }); } });
    try {
      const resp = await p.goto(url, { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(6000);
      const info = await p.evaluate(extract);
      const cookies = (await ctx.cookies()).map(c => c.name);
      const eventsBeforeConsent = [...new Set(hits.filter(h => h.ev).map(h => `${h.host}:${h.ev}${h.gcs ? ':gcs=' + h.gcs : ''}${h.gcd ? ':gcd=' + h.gcd : ''}`))];
      pages[url] = { status: resp.status(), ...info, cookiesBeforeConsent: cookies, trackingCookiesBeforeConsent: cookies.filter(n => COOKIE.test(n)), eventsBeforeConsent, trackerHosts: [...new Set(hits.map(h => h.host))], hitsBeforeConsent: hits };
      if (Object.keys(pages).length === 1) await p.screenshot({ path: out + '/home.png' });
      info.links.sort((a, b) => (/(contact|contato|book|agend|kontakt)/i.test(b) ? 1 : 0) - (/(contact|contato|book|agend|kontakt)/i.test(a) ? 1 : 0)).forEach(l => queue.push(l));
    } catch (e) { pages[url] = { error: String(e).slice(0, 200) }; }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(out + '/diagnose.json', JSON.stringify(pages, null, 1));
  for (const [u, d] of Object.entries(pages)) {
    console.log('\n=== ' + u + (d.error ? '  ERRO ' + d.error : '  ' + d.status));
    if (d.error) continue;
    console.log(JSON.stringify({ platform: d.platform, containers: d.containers, pixelIds: d.pixelIds, globals: d.globals, cmp: d.cmp, squarespaceCookieSettings: d.squarespaceCookieSettings, consentDefault: d.consentDefault, banner: d.banner, trackingCookiesBeforeConsent: d.trackingCookiesBeforeConsent, eventsBeforeConsent: d.eventsBeforeConsent, trackerHosts: d.trackerHosts, forms: d.forms, iframes: d.iframes, ctas: d.ctas, privacyLinks: d.privacyLinks, inlineTracking: d.inlineTracking.map(t => t.slice(0, 400)) }, null, 1));
  }
})().catch(e => { console.error(e); process.exit(1); });
