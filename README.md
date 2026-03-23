# Performance Web Vitals + Acessibilidade (ReclameAQUI)

Auditoria automatizada com **Playwright** (axe-core), **Lighthouse** (performance + acessibilidade) e relatório em Markdown.

## Pré-requisitos

- Node.js 20+
- Após `npm install`, o Chromium do Playwright é baixado (script `postinstall`).

## Configuração

1. Copie o template e ajuste slugs e caminhos:

   ```bash
   cp config/urls.example.json config/urls.json
   ```

2. Em `config/urls.json`:

   - `baseUrl`: normalmente `https://www.reclameaqui.com.br`
   - `companySlugs`: slugs de empresa na URL, ex. `["nubank"]` → `/empresa/nubank`, `/empresa/nubank/sobre`, etc.
   - `staticPaths`: rotas fixas e URLs absolutas (ex. blog)
   - `cookieConsentSelectors`: seletores Playwright para tentar aceitar cookies (opcional)
   - `pagespeedInsights.enabled`: quando `true`, tenta buscar **dados de campo (CrUX)** via [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) — precisa de `PAGESPEED_API_KEY` (ver abaixo).
   - `lighthouse.labThrottling`: `default` (throttling de laboratório completo) ou `devtools-lite` (mais leve; ainda é laboratório, não substitui o CrUX).

## URLs analisadas

A lista abaixo corresponde ao template **`config/urls.example.json`** (o mesmo conjunto que passa a usar quando copia para `config/urls.json`). O relatório HTML (`reports/relatorio-*.html`) gera **uma secção por URL** (ligações na tabela resumo); a ordem segue a expansão em `expandTargetUrls` em `src/config.ts`.

No protótipo **Web Vitals & A11y** (Google AI Studio), a navegação lateral usa rótulos curtos (caminho ou host); na tabela, a coluna **URL completa** é a que o audit usa.

### `staticPaths` (rotas no `baseUrl` e URLs absolutas)

| Rótulo (UI) | URL auditada |
|-------------|--------------|
| `/` | `https://www.reclameaqui.com.br/` |
| `/detector-site-confiavel` | `https://www.reclameaqui.com.br/detector-site-confiavel` |
| `/descontos` | `https://www.reclameaqui.com.br/descontos` |
| `/compare` | `https://www.reclameaqui.com.br/compare` |
| `blog.reclameaqui.com.br` | `https://blog.reclameaqui.com.br/` |
| Reclamação Nubank (título longo) | `https://www.reclameaqui.com.br/nubank/insatisfacao-com-limite-de-credito-e-solicitacao-de-reducao-drastica-para-r100-na-nubank_hLo2aV8oAYzrzFCb` |
| Reclamação Fatal Model (título longo) | `https://www.reclameaqui.com.br/fatal-model/site-obriga-a-enviar-foto-do-rosto_1mto_uREn40N9gpZ` |

### `companySlugs`: `nubank`, `fatal-model`

Para **cada** slug são acrescentadas três páginas:

| Slug | Rotas geradas |
|------|----------------|
| `nubank` | `/empresa/nubank`, `/empresa/nubank/sobre`, `/empresa/nubank/leitura-de-reclamacao` |
| `fatal-model` | `/empresa/fatal-model`, `/empresa/fatal-model/sobre`, `/empresa/fatal-model/leitura-de-reclamacao` |

URLs completas: `https://www.reclameaqui.com.br` + caminho acima (sem duplicar barra).

### Secção geral no HTML (monetização)

Fora da lista por URL, o relatório inclui o bloco **Monetização / anúncios** (trecho de `doc_ mapeamentoADS/Mapeamento ADS ReclameAQUI.txt` e tabela de riscos ads × Web Vitals), alinhado ao item **Inventário de Ads & Riscos** no painel de referência.

Documentação espelhada: [docs/urls-analisadas.md](docs/urls-analisadas.md).

### Alinhar com o PageSpeed Insights (“utilizadores reais”)

No PSI, a secção **“Discover what your real users are experiencing”** vem do **Chrome UX Report (CrUX)** — percentis agregados (~28 dias), não de um único Lighthouse.

O **Lighthouse local** no seu PC é outra coisa: um carregamento sintético, rede/CPU simuladas e, muitas vezes, ambiente mais lento que os servidores do Google. Por isso **LCP/TBT/FCP podem parecer “péssimos”** enquanto o CrUX no PSI está verde — não é bug, são **fontes diferentes**.

Para o relatório incluir uma tabela **CrUX** parecida com a do PSI:

1. Crie um projeto na Google Cloud e ative **PageSpeed Insights API**.
2. Crie uma chave de API e exporte no shell antes do audit:

   ```bash
   export PAGESPEED_API_KEY="sua-chave"
   npm run audit
   ```

Sem a chave, o relatório mostra só Lighthouse em laboratório e um aviso no stderr.

## Execução

```bash
npm run audit
```

São gerados:

- `reports/relatorio-AAAA-MM-DD.md`
- `reports/relatorio-AAAA-MM-DD.html` (visual, abre no navegador ao fim)

Durante a execução aparece no **stderr** um **spinner**, a **percentagem** global e o **tempo na etapa atual** (Lighthouse pode demorar vários minutos).

Para ver o Markdown completo no terminal: `PRINT_MD=1 npm run audit`

Para **não** abrir o browser automaticamente: `SKIP_OPEN_HTML=1 npm run audit` (ou `CI=true`).

### Limitar quantidade de URLs (teste rápido)

```bash
AUDIT_URL_LIMIT=3 npm run audit
```

### Chrome customizado

Por padrão o Lighthouse usa o mesmo executável do Chromium instalado pelo Playwright. Para forçar outro binário:

```bash
CHROME_PATH=/usr/bin/google-chrome-stable npm run audit
```

## O que o relatório cobre

- **Dados de campo (CrUX):** quando `PAGESPEED_API_KEY` está definida e `pagespeedInsights.enabled` é `true`, o relatório traz LCP, INP, CLS, FCP e TTFB no estilo PSI (utilizadores reais).
- **Web Vitals em laboratório (Lighthouse):** LCP, CLS, TBT (o PSI mostra **INP** em campo; TBT é só proxy em lab). Ver [Web Vitals](https://web.dev/articles/vitals?hl=pt-br) e [Core Web Vitals no Search](https://developers.google.com/search/docs/appearance/core-web-vitals).
- **Acessibilidade:** regras axe (tags `wcag2a`, `wcag2aa`) + auditorias Lighthouse. [WCAG 2.1](https://www.w3.org/TR/WCAG21/) exige também revisão manual.
- **Monetização:** trecho do arquivo `doc_ mapeamentoADS/Mapeamento ADS ReclameAQUI.txt` e tabela de riscos comuns (ads × Core Web Vitals).

## Estrutura

| Caminho | Descrição |
|---------|-----------|
| `src/index.ts` | CLI |
| `src/config.ts` | Carga de config e expansão de URLs |
| `src/runner.ts` | Playwright + orquestração |
| `src/axe-audit.ts` | axe-core |
| `src/lighthouse-audit.ts` | Lighthouse mobile/desktop |
| `src/pagespeed-field.ts` | CrUX via PageSpeed Insights API |
| `src/report/markdown.ts` | Geração do Markdown |
| `src/report/html.ts` | Relatório HTML visual |
| `src/progress.ts` | Spinner e % no stderr |
| `src/open-report.ts` | Abrir HTML no SO |

## Observações

- Sites podem bloquear automação, exibir CAPTCHA ou falhar intermitentemente; esses casos aparecem como erros no relatório.
- Espaçamento de ~2 s entre URLs reduz pressão sobre o servidor; ajuste se necessário.
- `reports/*.md` e `reports/*.html` estão no `.gitignore`; guarde artefatos no CI ou copie manualmente.
