# URLs analisadas

Este documento descreve as URLs auditadas pelo projeto quando se usa o template **`config/urls.example.json`**. Mantenha-o coerente com esse ficheiro ao alterar slugs ou caminhos.

A navegação do protótipo **Web Vitals & A11y** (Google AI Studio) usa rótulos curtos; o relatório HTML gera **uma secção por URL** com a URL completa. A ordem de expansão vem de `expandTargetUrls` em `src/config.ts`.

## `staticPaths`

| Rótulo (UI) | URL auditada |
|-------------|--------------|
| `/` | `https://www.reclameaqui.com.br/` |
| `/detector-site-confiavel` | `https://www.reclameaqui.com.br/detector-site-confiavel` |
| `/descontos` | `https://www.reclameaqui.com.br/descontos` |
| `/compare` | `https://www.reclameaqui.com.br/compare` |
| `blog.reclameaqui.com.br` | `https://blog.reclameaqui.com.br/` |
| Reclamação Nubank | `https://www.reclameaqui.com.br/nubank/insatisfacao-com-limite-de-credito-e-solicitacao-de-reducao-drastica-para-r100-na-nubank_hLo2aV8oAYzrzFCb` |
| Reclamação Fatal Model | `https://www.reclameaqui.com.br/fatal-model/site-obriga-a-enviar-foto-do-rosto_1mto_uREn40N9gpZ` |

## `companySlugs`: `nubank`, `fatal-model`

Por slug são acrescentadas:

- `/empresa/{slug}`
- `/empresa/{slug}/sobre`
- `/empresa/{slug}/leitura-de-reclamacao`

`baseUrl`: `https://www.reclameaqui.com.br`.

## Secção geral (monetização / ads)

No HTML, após as secções por URL: bloco **Monetização / anúncios** (mapeamento interno + riscos comuns), equivalente ao **Inventário de Ads & Riscos** no painel de referência.

## Referências no repositório

- [README.md](../README.md) — configuração e execução
- `src/config.ts` — `expandTargetUrls`
- `config/urls.example.json` — fonte de verdade da lista padrão
