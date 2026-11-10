# Chiara Barraco Photography — tracking e consentimento

Site: https://www.chiarabarracophotography.com (Squarespace, negócio em Amsterdã/NL, público UE).
Tags: GA4 `G-V23L186V6Q` e Meta Pixel `1957095161658281`, ambos pelas integrações nativas do Squarespace. Não há GTM.

## Nível 1 — Diagnóstico (2026-11-10)

| # | Problema | Evidência | Gravidade |
|---|----------|-----------|-----------|
| 1 | Sem banner de cookies | `cookieSettings.isCookieBannerEnabled: false`, `isRestrictiveCookiePolicyEnabled: false` | Crítica (GDPR/ePrivacy) |
| 2 | GA4 e Meta Pixel disparam e gravam cookies antes de qualquer consentimento | cookies `_ga`, `_ga_V23L186V6Q`, `_fbp`, `fr` e hits `page_view`/`PageView` no primeiro carregamento | Crítica |
| 3 | Sem Consent Mode v2 | `gcd=13l3l3l3l1l1` (os quatro sinais sem valor) | Alta (afeta Google Ads/remarketing no EEE) |
| 4 | `generate_lead` falso | o snippet do rodapé dispara em qualquer `submit`; um envio vazio, com 6 erros de validação, gerou `generate_lead` | Alta (conversões infladas) |
| 5 | Meta não recebe nenhum evento de lead | só `PageView` | Alta |
| 6 | WhatsApp e "Book a Photoshoot" sem evento | nenhum hit nos cliques | Média |
| 7 | Agendamento Acuity (iframe em `/family-album`) sem medição | o iframe não carrega GA4 nem Pixel | Média |
| 8 | Sem política de privacidade | `privacyPolicyUrl: null`; `/privacy`, `/privacy-policy`, `/cookie-policy` dão 404 | Alta (o formulário coleta nome e e-mail) |

## Nível 2 — Correção

Feito no painel do Squarespace (precisa de acesso de administrador):

1. **Settings > Cookies & Visitor Data**: ativar o banner de cookies, tipo **opt-in**, com botão de recusar, e ativar a opção que desativa os cookies de analytics/marketing até o aceite.
2. **Settings > Advanced > Code Injection > Header**: colar `fix/header-injection.html`.
3. **Code Injection > Footer**: apagar o snippet antigo (`document.addEventListener('submit', ... generate_lead ...)`) e colar `fix/footer-injection.html`.
4. Criar a página de política de privacidade/cookies e ligá-la no rodapé e no banner.
5. Acuity: em Integrations, informar o ID do GA4 e o Pixel da Meta, para medir o agendamento concluído (não é possível medir de fora do iframe).
6. GA4 Admin: marcar `generate_lead` como evento-chave. O evento `contact` (WhatsApp) também, se fizer sentido para o negócio.

Eventos novos: `generate_lead` + Meta `Lead` (só quando aparece a mensagem de sucesso do formulário), `contact` + Meta `Contact` (clique no WhatsApp), `book_cta_click` (CTA de agendamento).

## Nível 3 — Auditoria

```bash
node audit/audit.js                 # site real; sai com código 1 se algo falhar
node audit/audit.js --simulate-fix  # aplica os snippets só no navegador de teste
```

| Rodada | Resultado |
|--------|-----------|
| Site real, antes da correção | 1/16 |
| Simulação dos snippets | 10/16 — B1–B8, A7 e A8 passam; A1–A6 dependem dos passos 1 e 4 no painel |

Limites da auditoria: o "sucesso" do formulário é simulado inserindo o elemento `.form-submission-text` (não enviamos lead real); os eventos da Meta são verificados pela chamada `fbq`, não pelo hit de rede; o estado "aceitou" é simulado pelos cookies `ss_performanceCookiesAllowed`/`ss_marketingCookiesAllowed`. Depois de ativar o banner, repetir a auditoria e fazer um envio real de teste.
