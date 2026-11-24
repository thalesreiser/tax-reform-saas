# Spike EXT-01.1 - Emissor Nacional da NFS-e (web issuer) for the extension

- **Task:** EXT-01.1 (RF-16, Q-07)
- **Date:** 2026-11-24
- **Method:** public official sources only. No login, no account, nothing submitted. Everything
  that needs a logged-in session is listed under [Open points](#open-points-for-a-hands-on-session).
- **Decision record:** [ADR 009](../adr/009-nfse-extension-approach.md) (proposed)

## Sources

All accessed on 2026-11-24. Official sources first; secondary sources are marked.

| # | Source | URL |
|---|---|---|
| S1 | Guia do Emissor Público Nacional Web da NFS-e, v1.2 (27/07/2026, "adequação do guia aos novos campos de IBS/CBS"), 125 pages | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/guia_emissor_publico_nacional_web_snnfse-ern_versao_1-2-1.pdf |
| S2 | Documentação técnica RTC (index of NT 001-010 and annexes; page updated 23/11/2026) | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc |
| S3 | Nota Técnica SE/CGNFS-e nº 009, v1.01 (11/09/2026) | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nota-tecnica-009-se-cgnfs-e-v-1-01.pdf |
| S4 | AnexoVI-LeiautesRN_RTC_IBSCBS v1.04.01 (DPS/NFS-e layout and rules, NT 009) | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexovi-leiautesrn_rtc_ibscbs-v1-04-01-nt009.xlsx |
| S5 | AnexoVII-IndOp_IBSCBS v1.03.00 (cIndOp table) | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexovii-indop_ibscbs_v1-03-00-nt009.xlsx |
| S6 | Anexo VIII - correlation Item de serviço x NBS x cClassTrib x cIndOp v1.02.00 (26/10/2026) | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx |
| S7 | APIs - Produção Restrita e Produção (Sefin Nacional, ADN, Parâmetros Municipais, DANFSe Swagger links) | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao |
| S8 | Manual Contribuintes - Emissor Público API do Sistema Nacional NFS-e v1.2 (out/2025) | https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf |
| S9 | Ato Conjunto RFB/CGIBS nº 4, de 30/07/2026 (schedule of IBS/CBS fields in DF-e) | https://www.cgibs.gov.br/upload/arquivos/202607/31091735-20260730-16h30-ato-conjunto-rfb-cgibs-na-c2-ba-4-260731-090909.pdf |
| S10 | CGIBS news on the schedule | https://cgibs.gov.br/receita-federal-e-comite-gestor-do-ibs-publicam-o-cronograma-de-implementacao-dos-documentos-fiscais-eletronicos |
| S11 | Perguntas frequentes NFS-e v1.3 (06/11/2026) | https://www.gov.br/nfse/pt-br/perguntas-frequentes/perguntas-frequentes-nfs-e-v1-3-20261106.pdf |
| S12 | Official engine OpenAPI (calculadora-rtc-regime-regular, pinned in this repo) | `packages/engine-client/openapi/regime-regular.json` |
| S13 | (secondary) LegisWeb on Ato Conjunto nº 7/2026 postponing the 01/12/2026 dates | https://legisweb.com.br/noticia/?id=34845 |
| S14 | (secondary) KPMG, IBS/CBS e-invoicing implementation calendar | https://kpmg.com/us/en/taxnewsflash/news/2026/08/brazil-ibs-cbs-e-invoicing-implementation-calendar-consumption-tax-reform.html |

The PDFs were read as text. S4-S6 are spreadsheets and were only indexed, not parsed field by field;
EXT-01.3 must pin the version it uses.

## How the Emissor Web is organised (S1)

- URL: `https://www.nfse.gov.br/EmissorNacional`. Access by user/password, ICP-Brasil certificate
  or gov.br (S1 §1.1, §10.6). Same Sefin Nacional backend as the API: the web issuer builds the DPS
  XML and posts it to the Sefin Nacional generation service (S1 §4.1.4).
- Two issuing flows: **complete** (all taxpayers, §4.1) and **simplified** (MEI, §4.2, with
  "serviços favoritos"). Drafts are kept as "Rascunho DPS" (§7).
- The complete flow is a **4-step wizard** with "Avançar" between steps and a review step with
  "Editar Pessoas / Editar Serviço / Editar Tributação":

| Step | Screen | Fields relevant to the IBS/CBS group |
|---|---|---|
| 1 | Pessoas | Data de competência, número/série da DPS, **"Preencher as informações IBS/CBS?" (Sim/Não, required)**, compra governamental, emitente, prestador, tomador/adquirente, destinatário. With "Sim", competência must be >= 01/01/2026 |
| 2 | Serviço | Local da prestação (país, município with 3-char type-ahead), **Código de Tributação Nacional** (combo, Anexo B), **Item da NBS** (combo, required), **Código indicador da operação - cIndOp** (combo, required when IBS/CBS is filled, Anexo VII), descrição; conditional blocks (imóvel for cIndOp 020101/020201/020301, obra for subitems 07.02/07.05, eventos, comércio exterior). The código de tributação nacional drives which fields appear and whether the **local de incidência** of ISSQN is derived or asked |
| 3 | Valores | Valor do serviço, valor recebido pelo intermediário, desconto incondicionado/condicionado, tributação municipal (pre-filled from earlier steps and municipal parameters; some fields locked for Simples Nacional), federal taxes, and the **IBS/CBS block: CST (combo) and cClassTrib (combo filtered by the chosen CST)**, plus documents for reembolso/repasse/ressarcimento (NF-e/NFS-e/CT-e/outro, key, dates, value) that enter the IBS/CBS base |
| 4 | Emitir NFS-e | Summary with the prior calculation of taxes; "Emitir NFS-e" sends the DPS |

Notes from the layout (S3, S4): NT 009 repositions `CST` and `cClassTrib`, merges `vDedRed` and
`gReeRepRes`, reinstates `indFinal`, adds `gIBSCBSAjuste` (adjustment notes), `verCalcIBSCBS`
(calculator version recorded in the NFS-e) and the alphanumeric CNPJ. The engine version we call
must match what the Sefin expects in `verCalcIBSCBS` (open point).

## Are the IBS/CBS fields live, and when are they mandatory

- **Present in the Emissor Web:** yes. Guide v1.2 (27/07/2026) documents the IBS/CBS opt-in,
  cIndOp, CST and cClassTrib fields (S1).
- **Mandatory dates (conflicting sources, to confirm with the accountant):**
  - S1 states that from **03/08/2026** issuing without the IBS/CBS fields is not allowed for
    companies in the **regime regular**, and that **Simples Nacional** starts for taxable events
    from **01/01/2027**.
  - Ato Conjunto RFB/CGIBS nº 4/2026 (S9, S10) sets the NFS-e schedule by service category: a
    general date of 01/10/2026 for services under the LC 116/2003 list, with some activities on
    01/12/2026; until 31/12/2026 a missing IBS/CBS group does **not** cause rejection but is a
    non-compliance subject to sanctions (S11, S14).
  - Ato Conjunto nº 7/2026 (13/11/2026) postponed the 01/12/2026 dates to between 01/01/2027 and
    01/03/2027 (S13, secondary; the act text was not retrieved).
  - MEI and Simples Nacional: 01/01/2027 (S1; Resolução CGSN 191/2026 cited by secondary sources).
- **Consequence for the product:** in 2026 the group is accepted but not enforced; from 2027 it is
  enforced for most issuers. The extension is most useful exactly when the issuer starts
  rejecting, so the 2027 date is the target, not the 2026 one.

## How the page is built (publicly documented)

The guide documents screens, not implementation. Publicly verifiable: the issuer is a
server-hosted web application under `nfse.gov.br/EmissorNacional` with login pages and a multi-step
wizard; combos with type-ahead (município, código de tributação nacional, NBS) and dependent combos
(cClassTrib filtered by CST). Whether it is an SPA or server-rendered pages, whether there are
iframes, the CSP, element ids/names and how combos are implemented are **not documented** and
need a logged-in session.

## What the extension would read and fill

Read (steps 1-3): competência, prestador regime (Simples or not), município of prestação, código de
tributação nacional, NBS, cIndOp if already chosen, tomador (to know if final consumer / government
purchase), valor do serviço, descontos, ISSQN/PIS/COFINS values, reembolso documents.

Compute via our API (official engine, S12):

| Need | Engine endpoint |
|---|---|
| Valid CST/cClassTrib for the NBS | `GET /calculadora/nfse/situacoes-classificacoes-tributarias`, `GET .../classificacoes-tributarias/nbs` |
| Validate cIndOp x NBS x cTribNac x cClassTrib | `POST /calculadora/nfse/indicador-operacao/validate` |
| Local de incidência / fornecimento | `GET /calculadora/nfse/local-operacao`, `.../locais-incidencia` |
| Base de cálculo | `POST /calculadora/nfse/base-calculo`, `POST /calculadora/base-calculo/base-calculo-unificada-nfse` (EXPERIMENTAL) |
| Rates and amounts | `POST /calculadora/regime-geral` |
| XML of the group, check against XSD | `POST /calculadora/xml/generate` (DF-e type NFS-e), `POST /calculadora/xml/validate` |

Fill (steps 2-3): cIndOp, CST, cClassTrib, and (if the screen allows editing) the IBS/CBS
amounts; otherwise only check that the issuer's own "cálculo prévio" in step 4 matches ours and
warn on divergence.

## Feasibility and alternatives

| Criterion | (a) Extension fills the form | (b) Official API (Sefin Nacional) from our API/SDK | (c) Copy-paste helper |
|---|---|---|---|
| User effort | Lowest | None in the issuer; needs integration or our UI | Medium (copy 3-5 values) |
| DOM changes | High risk; selectors as remote config (EXT-01.5) | None (versioned XSD/NT) | Low (only optional reading) |
| Gov site terms / anti-automation | Must stay user-initiated, no auto-submit, no credential handling; terms not found publicly (open point) | Sanctioned channel | No automation of the site |
| CSP / iframes | Content scripts are not bound by page CSP, but iframes or shadow DOM may block reading; unknown | N/A | N/A |
| Security | Runs in an authenticated gov session; store review and minimal permissions (one host) | Needs the taxpayer's ICP-Brasil certificate (mTLS and signed DPS per S8 and community libraries; to confirm): we would hold certificates, which is high risk and out of MVP scope | Lowest |
| LGPD | Reads tomador data in the page; send only what the calculation needs, never log it | We would process full invoices and certificates | Only what the user types |
| Accessibility | Must set values through events the framework listens to; hidden field rules | N/A | Plain page, easy to make AA |
| Effort | 21 h left in EXT-01.2-01.6 plus maintenance | Issuing: large (signature, certificates, events, retries); validation only: small (we already have `xml/validate`) | Small; already planned as fallback in EXT-01.5 |

## Recommendation

Build (c) first as the guaranteed path and the base of (a): a calculation panel (web page and
extension popup) that, from NBS, código de tributação nacional, município, competência and
values, returns cIndOp, CST, cClassTrib and the IBS/CBS amounts with copy buttons. Then add (a)
as an assisted fill: user-initiated, reads and fills only steps 2-3, never clicks "Emitir NFS-e",
selectors served remotely, and falls back to (c) on any mismatch. Use (b) only for **validation**
(our `xml/validate` against the official XSD), not for issuing, until a customer asks and the
certificate custody question is decided.

## Open points for a hands-on session

Only a logged-in session (Thales or the partner accountant, with a test company in Produção
Restrita if possible) can confirm:

1. Whether the Emissor Web is an SPA (and which framework), uses iframes, shadow DOM or full page
   loads between the 4 steps; the URL of each step.
2. Element ids/names/labels of: IBS/CBS opt-in, código de tributação nacional, NBS, cIndOp, CST,
   cClassTrib, valor do serviço, descontos, IBS/CBS amount fields.
3. How the combos are built (native `select` or custom widgets with type-ahead and async lists)
   and which events make a programmatic value stick.
4. Whether IBS/CBS amounts are editable or only computed by the issuer (and shown in step 4).
5. The page's CSP and any anti-automation (captcha, rate limits, session timeouts).
6. Whether Produção Restrita offers the web issuer with test data.
7. Terms of use of the Emissor Nacional regarding third-party tools; none found publicly.
8. The `verCalcIBSCBS` value the Sefin expects versus our engine tag.
9. The exact mandatory date for the target customers' services after Ato Conjunto nº 7/2026
   (accountant).
10. Whether the DPS must be XMLDSig-signed in addition to mTLS for API issuing (only relevant to
    option b).
