---
name: auditing-site-tracking
description: Use when asked to diagnose, fix or audit tracking, tags, pixels, GA4, GTM, Meta Pixel, conversion events, cookie banner, GDPR or Consent Mode v2 on a client website (new or existing client), or when given a client site URL with "diagnosticar", "corrigir", "auditar", "tagueamento", "traquear", "eventos", "consentimento".
---

# Auditing Site Tracking

Três níveis, sempre nesta ordem, para um site de cliente: **1 Diagnóstico → 2 Correção → 3 Auditoria**. Toda afirmação sai de uma evidência capturada no navegador nesta sessão; a auditoria é um script que se repete, não uma opinião.

Rode tudo sem parar para perguntar. Só pare quando a próxima ação depender do painel do cliente (você não tem login) ou de uma decisão de negócio.

## Regras fixas

- **Nunca envie um formulário válido, agendamento ou compra.** Teste envio vazio/inválido e simule o sucesso (o script faz isso).
- **Nunca peça nem use senha do cliente.** Mudanças no painel são feitas pelo usuário; você entrega o passo a passo e os snippets.
- **Seus testes enviam eventos ao GA4/Meta de produção.** Rode o mínimo necessário e informe no relatório quantos eventos de teste gerou e a data.
- **Não declare "corrigido" sem rodar `audit.js` no site real depois da mudança.**
- **Pedido que viola uma regra acima** (ex.: "envia o formulário pra testar"): não faça; diga o porquê em uma linha e ofereça a alternativa (teste simulado, ou o cliente faz um envio real).
- Verifique no código/HTML do site qualquer seletor, cookie ou nome de menu antes de usá-lo; marque como "não verificado" o que não conseguiu confirmar.

## Nível 1 — Diagnóstico

```bash
node .claude/skills/auditing-site-tracking/scripts/diagnose.js <url> <scratchpad>/diag 8
```

Leia a saída e responda, com evidência, cada linha:

| Pergunta | Onde olhar |
|---|---|
| Plataforma, IDs de GA4/GTM/Ads/Pixel | `platform`, `containers`, `globals`, `inlineTracking` |
| Há banner/CMP? Bloqueia antes do aceite? | `banner`, `cmp`, `trackingCookiesBeforeConsent`, `eventsBeforeConsent` |
| Consent Mode v2? | `gcd` nos hits: `l` = sinal ausente, `p`/`q` = negado, `t`/`r` = concedido; `gcs=G100` = ping sem cookies |
| Quais conversões existem e são medidas? | `forms`, `ctas`, `iframes` (agendamento/checkout em iframe não é visível de fora) |
| Evento de lead dispara em envio inválido? | `inlineTracking` com listener de `submit`; confirme com `audit.js` (D1) |
| Política de privacidade? | `privacyLinks` |

`<slug>` = nome do negócio em minúsculas com hífens (ex.: `chiara-barraco-photography`). Para escrever seletores e nomes de evento, leia `inlineTracking` completo em `diag/diagnose.json`.

Depois copie `audit.config.example.json` para `clients/<slug>/audit.config.json`, ajuste (remova `form`/`clicks`/`simulate` que não se aplicam) e rode a auditoria de base — é ela que responde a linha do envio inválido:

```bash
node .claude/skills/auditing-site-tracking/scripts/audit.js clients/<slug>/audit.config.json
```

## Nível 2 — Correção

Escreva em `clients/<slug>/fix/` os snippets (header: ponte de Consent Mode v2; footer: eventos de conversão) e, no README, o passo a passo do painel. Padrões obrigatórios dos snippets:

- lead só no **sucesso** do formulário, nunca no `submit`;
- eventos só se `gtag`/`fbq` existirem (herdam o consentimento);
- deduplicar cliques repetidos em menos de 1 s;
- `consent default` negado antes de qualquer tag, `update` quando o banner mudar.

Valide antes de entregar: `audit.js <config> --simulate-fix` aplica os snippets só no navegador de teste. Notas por plataforma e menus já verificados: `platforms.md`.

## Nível 3 — Auditoria

Depois que o usuário disser que aplicou, rode `audit.js` no site real e teste aceitar e recusar no banner de verdade. Falhou? Volte ao Nível 2 só para o item que falhou.

## Entrega (sempre nesta forma)

Pedido de um nível só: entregue os mesmos itens, limitados ao que foi feito (README sem as seções dos níveis não executados). A mensagem ao cliente só entra quando houver pergunta para ele.

1. `clients/<slug>/README.md`: tabela de problemas com evidência e gravidade; passos de correção; tabela de resultados por rodada (antes / simulação / depois); limites do que foi verificado; pendências.
2. Commit e push na branch da sessão.
3. Resposta no chat, nesta ordem: resultado em uma frase (X/Y passam) → problemas → o que o usuário precisa fazer no painel → o que confirmar com o cliente → eventos de teste gerados (some a linha "Eventos de teste enviados" de cada rodada do `audit.js`; cada página do `diagnose.js` gera 1 pageview ou ping).
4. Mensagem curta e amigável para o cliente, **em inglês** salvo pedido contrário, com as perguntas de `client-questions.md` que se aplicarem.

## Erros comuns

| Erro | Correção |
|---|---|
| 403 do proxy no primeiro acesso | Tentar de novo uma vez; se persistir, é política de rede: informar o host bloqueado |
| `fetch`/`route.fetch` do Node dá ENOTFOUND | O Node não usa o proxy; usar `curl` ou o próprio navegador |
| "A Meta não disparou" pelo hit de rede | Não confiável em headless; usar a espia de `fbq` do `audit.js`. `track` depois de `consent:revoke` fica retido, não é envio |
| Evento GA4 "não chegou" | GA4 agrupa eventos; esperar ~9 s e ler `en=` também no corpo do POST |
| Contar pings `gcs=G100` como violação | São pings sem cookies do Consent Mode avançado; relatar como decisão do cliente, não como falha |
| Afirmar nome de menu de memória | Painéis mudam; conferir na ajuda oficial ou marcar "não verificado" |
