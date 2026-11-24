# 009 - Approach for the Emissor Nacional da NFS-e integration

- **Status:** proposed
- **Date:** 2026-11-24
- **Decided by:** pending (Thales)
- **Reference:** DEC-04, Q-07, EXT-01.1, RF-16

## Context

Q-07 made the Emissor Nacional da NFS-e (web issuer at `nfse.gov.br/EmissorNacional`) the first
target of the browser extension. The spike
[EXT-01.1](../spikes/ext-01.1-emissor-nacional-nfse.md) mapped it from public official sources:

- A 4-step wizard (Pessoas, Serviço, Valores, Emitir NFS-e). The IBS/CBS inputs are an opt-in on
  step 1, NBS, código de tributação nacional and cIndOp on step 2, and CST plus cClassTrib (filtered
  by CST) on step 3.
- The fields are live since guide v1.2 (27/07/2026). Until 31/12/2026 a missing IBS/CBS group is
  not rejected. Enforcement for most issuers, Simples Nacional included, starts in 2027 (the
  schedule is Ato Conjunto RFB/CGIBS nº 4/2026, amended by nº 7/2026).
- The DOM, iframes, CSP, the site's terms for third-party tools and whether amounts can be edited
  cannot be checked without a logged-in session. They are listed as open points in the spike.
- The official Sefin Nacional API accepts the same DPS. Issuing through it needs the taxpayer's
  ICP-Brasil certificate.

## Options considered

1. **(a) Extension that fills the form.** Lowest user effort and the original RF-16 intent. Risks:
   the DOM can change without notice, combos may be custom widgets, the site's terms for automating
   a government page are unknown, and the extension runs inside an authenticated session with
   taxpayer data (LGPD). Breakage has to be mitigated with remote selectors and telemetry.
2. **(b) Official API from our API/SDK.** No DOM risk and a sanctioned channel. Issuing requires
   holding or using the clients' certificates and handling signature, events and retries. That is
   a large security and effort cost and a different product (an issuer). Validation only is cheap,
   because we already expose the engine's `xml/validate`.
3. **(c) Copy-paste helper.** A web page or extension popup computes cIndOp, CST, cClassTrib and the
   amounts, and the user copies them. No automation of the government site, low effort, and
   accessible. It costs more user effort per invoice.

## Decision

Proposed, pending Thales:

- Ship (c) first, as the guaranteed path and the base of (a).
- Then (a) as an assisted, user-initiated fill of steps 2 and 3 only. It never submits the DPS,
  loads selectors from remote config and falls back to (c).
- Use (b) only for XSD validation. Issuing through the API is out of the MVP until customers ask
  for it and certificate custody is decided.

## Consequences

- EXT-01.3 to EXT-01.5 are re-ordered: the copy-paste panel (part of EXT-01.5) moves first.
- A hands-on session (Thales or the partner accountant) must close the spike's open points before
  EXT-01.4 starts.
- The extension requests a single host permission (`www.nfse.gov.br`), sends only the fields the
  calculation needs and never logs them.
- The extension shows the engine tag, and the expected `verCalcIBSCBS` is confirmed before
  EXT-01.4.
