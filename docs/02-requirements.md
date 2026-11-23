# 02 - Requirements

Priorities: **M** must for the MVP, **S** should (right after launch), **C** could (backlog).

## Functional

| ID | Requirement | Prio. |
|---|---|---|
| RF-01 | An office signs up, invites members and assigns roles (owner, accountant) | M |
| RF-02 | The office registers client companies; CNPJ lookup fills name, address, CNAE and regime | M |
| RF-03 | Each client has a fiscal profile: regime, CNAEs, UF and municipality, revenue (12 months), sales mix by NCM/NBS with cClassTrib, purchases eligible for credit | M |
| RF-04 | A simulation computes current and reform burden per year 2026-2033, per tax | M |
| RF-05 | A simulation compares Simples Nacional, regular regime and Simples with IBS/CBS outside the DAS | M |
| RF-06 | Simulations are stored with the engine version and rule table version used, and can be compared | M |
| RF-07 | Each result shows its calculation memory and the provisional-rate disclaimer | M |
| RF-08 | The accountant exports a PDF report with the office's branding | M |
| RF-09 | The accountant shares a simplified, mobile-first view with the business owner through an expiring link | M |
| RF-10 | The office creates API keys per client, with scopes and rotation | M |
| RF-11 | The API calculates IBS/CBS/IS for an invoice, using the client profile for defaults | M |
| RF-12 | The API returns the XML group for NF-e/NFC-e/NFS-e and validates XML against the XSD | M |
| RF-13 | The API exposes reference data (CST, cClassTrib, NCM, NBS, reference rates) | M |
| RF-14 | API usage is rate-limited and metered per office and per key | M |
| RF-15 | A TypeScript SDK is published | M |
| RF-16 | The browser extension reads the invoice form in the target issuer, calls the API and fills the IBS/CBS fields | M |
| RF-17 | The office subscribes to a plan with Pix, boleto or card; plan limits are enforced | M |
| RF-18 | Actions on clients, simulations and keys are written to an audit log | M |
| RF-19 | A client's data can be exported and deleted on request (LGPD) | M |
| RF-20 | A PHP SDK is published | S |
| RF-21 | IPI in the current-tax engine | S |
| RF-22 | ICMS-ST, DIFAL and state benefits | C |

## Non-functional

| ID | Requirement | Prio. |
|---|---|---|
| RNF-01 | New taxes come only from the official engines, unmodified, pinned to a release tag | M |
| RNF-02 | Office data is isolated with row-level security; secrets never in the repository | M |
| RNF-03 | Calculation API p95 below 500 ms for a 20-item invoice | M |
| RNF-04 | Money uses decimal arithmetic (no floating point); rounding follows the official engine | M |
| RNF-05 | Rule tables are versioned by validity date; a past simulation can be reproduced | M |
| RNF-06 | Domain logic coverage at least 80%; golden cases from the accountant block merges | M |
| RNF-07 | Interface in pt-BR, accessible (WCAG 2.1 AA), mobile-first for the business owner view | M |
| RNF-08 | Build, test and preview run in CI; nothing depends on the developer's machine | M |
| RNF-09 | Structured logs, error tracking and uptime monitoring in production | M |
| RNF-10 | API versioned (`/v1`) with a deprecation policy | M |
