# 01 - Vision and scope

## Problem

The Brazilian consumption-tax reform (EC 132/2023, LC 214/2025) replaces PIS, Cofins, IPI, ICMS and
ISS with CBS, IBS and the Imposto Seletivo (IS) over a transition from 2026 to 2033. Accounting
offices must explain to each client how much the tax burden changes year by year, and every
invoice (NF-e, NFC-e, NFS-e) must carry the new IBS/CBS group.

Receita Federal published its official calculation engines as open source (MIT) at
<https://github.com/ReceitaFederal>:

| Repository | Scope | Tech |
|---|---|---|
| `calculadora-rtc-regime-regular` | CBS, IBS and IS for the regular regime; XML group generation and XSD validation for NF-e/NFC-e/NFS-e; open data (CST, cClassTrib, NCM, NBS, reference rates) | Java 25, Spring Boot 4, read-only SQLite |
| `calculadora-rtc-simples-nacional` | CBS and IBS for Simples Nacional companies | Java 25, Spring Boot 4 |
| `calculadora-rtc-gerador-danfse` | DANFSe PDF from an NFS-e XML | Go |

The engines compute only the **new** taxes. Nothing public compares the current burden with the
reformed one for a specific company.

## Product

A SaaS sold to **accounting offices**. Each office onboards its client companies and gets:

1. **Simulator (for the business owner):** current burden vs reform burden, year by year from 2026
   to 2033, per tax, including Simples Nacional vs regular regime vs Simples with IBS/CBS paid
   outside the DAS. Shared with the business owner through a branded link or PDF.
2. **Accountant dashboard:** client portfolio, fiscal profile per client, simulations, reports,
   members, API keys and usage.
3. **Invoice-time calculation:**
   - **Public API + SDK** for software houses and ERPs: returns the IBS/CBS/IS values and the
     ready XML group for the invoice, using the client's fiscal profile as defaults.
   - **Browser extension** that reads the invoice form in a web issuer (first target: Emissor
     Nacional da NFS-e, see Q-07), calls the API and fills the IBS/CBS fields.

## Scope of the MVP (about 12 weeks, one developer)

**In:**
- Official engines running unmodified as pinned containers.
- Own engine for the current consumption taxes, simplified: Simples Nacional (annexes, brackets,
  effective rate, factor R), PIS/Cofins cumulative and non-cumulative, ICMS with internal and
  interstate rates, ISS with the municipal rate, IPI from an informed rate.
- Transition schedule 2026-2033 as versioned data.
- Multi-tenant dashboard, simulator, PDF report, share link.
- Public API with keys, rate limit and metering; TypeScript SDK.
- Extension for one web issuer.
- Subscription billing.
- Beta with 2-3 accounting offices.

**Out (backlog):** ICMS-ST, DIFAL, state tax benefits, Zona Franca rules, IRPJ/CSLL/CPP in the
comparison (Q-04), ERP marketplace apps, issuing invoices ourselves, PHP SDK (after MVP).

## Users

| Persona | Needs |
|---|---|
| Accountant (office owner or staff) | Manage clients, run and explain simulations, give clients API access |
| Business owner (office client) | Understand the impact in plain language, on mobile |
| Developer at a software house or ERP | Reliable API, SDK, docs, XML group ready to embed |
| Invoice issuer operator | Fill the IBS/CBS fields without leaving the issuer |

## Principles

- **Official numbers first.** New taxes always come from the official engine, never from a port.
- **Every number is traceable.** Each result shows its calculation memory, the rule table version
  and the engine version.
- **Estimates are labelled.** Reference rates are still provisional; every screen and report says
  so.
- **Accountant validates the rules.** Current-tax rules ship only after the partner accountant
  approves the golden test cases.

## Main risks

| Risk | Mitigation |
|---|---|
| Wrong current-tax rules damage credibility | Golden cases written with the partner accountant; tests block merges (MOT-02.7, MOT-03.3) |
| Official engine changes often | Pinned tags, weekly upstream watcher, golden contract tests (MOT-01.4, MOT-01.5) |
| Web issuer DOM changes break the extension | Selectors as remote config, failure telemetry, graceful fallback to copy-paste (EXT-01.5) |
| 12 weeks is tight for one developer | Release cut by priority (M/S/C); depends on weekly hours (Q-03) |
| Tax data is sensitive (LGPD) | Row-level isolation per office, office as controller and us as operator, export and deletion (BE-05.1) |
| Liability for wrong values | Terms of use and disclaimers reviewed before launch (NEG-01.3) |
