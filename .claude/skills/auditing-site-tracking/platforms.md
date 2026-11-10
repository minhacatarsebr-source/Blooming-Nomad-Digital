# Notas por plataforma

Só entram aqui fatos verificados em um site real; acrescente ao fim de cada trabalho, com a data.

## Squarespace (verificado em 2026-11)

- Configuração legível em `Static.SQUARESPACE_CONTEXT.cookieSettings`: `isCookieBannerEnabled`, `isRestrictiveCookiePolicyEnabled`, `cookieBannerAcceptType`.
- Cookies de consentimento do banner nativo: `ss_performanceCookiesAllowed`, `ss_marketingCookiesAllowed` (`true`/`false`).
- Com o banner ativo, a integração nativa de GA4 define só `analytics_storage` no Consent Mode; `ad_storage`, `ad_user_data` e `ad_personalization` precisam da ponte no header. O Pixel nativo usa `fbq('consent','revoke')` até o aceite.
- `gtag.js` e `fbevents.js` carregam antes do aceite (sem cookies e sem eventos). Bloqueio total exige abandonar as integrações nativas.
- Sucesso do formulário: aparece `.form-submission-text` (novo nó, ou perde a classe `hidden`). O evento `submit` dispara mesmo com erro de validação.
- Banner nativo: `.gdpr-cookie-banner`, botões "Accept all" / "Decline all" / "Manage cookies".
- Injeção de código: Pages > Website Tools > Code Injection; link direto `https://account.squarespace.com/project-picker?client_id=helpcenter&redirect_url=%2Fpages%2Fwebsite-tools%2Fcode-injection`. Planos Core, Plus, Advanced e alguns antigos; exige permissão de administrador.
- Banner de cookies: Settings > Cookies & Visitor Data (nome das opções não verificado).
- Agendamento Acuity/Squarespace Scheduling roda em iframe de `app.acuityscheduling.com`: invisível de fora e fora do alcance do banner. Opções: integrações do Acuity (atribuição fraca) ou redirecionar para página de obrigado no site (não verificado por plano).
- Exemplo completo (config, snippets, README): `clients/chiara-barraco-photography/`.

## Outras plataformas

Sem notas verificadas ainda (WordPress, Shopify, Wix, Webflow, sistemas próprios). Descubra pelo `diagnose.js` e registre aqui.
