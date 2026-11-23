# Security policy

This repository holds the code of a SaaS that calculates taxes for accounting offices and their client
companies. It handles fiscal data and API keys. Please report any vulnerability privately so it can be
fixed before it is exposed.

## Supported branch

| Branch    | Purpose                      | Supported |
| --------- | ---------------------------- | --------- |
| `main`    | Production releases          | Yes       |
| `develop` | Integration branch (staging) | Yes       |

Fixes land on `develop` and reach production through `main`. Other branches and old tags are not
supported.

## Reporting a vulnerability

Use GitHub private vulnerability reporting:
[open a private report](https://github.com/thalesreiser/tax-reform-saas/security/advisories/new).

This is the only reporting channel at the moment. **Do not open a public issue, pull request or
discussion about a vulnerability.**

Include, in English or Portuguese:

- the affected component, URL or file;
- the steps to reproduce it, and the impact you expect;
- the commit or date on which you observed it.

Never include real fiscal data, CNPJs of real companies, credentials or API keys in a report. Describe
them instead, for example by saying which field was exposed.

## Scope

In scope:

- **API:** `apps/api`, the public `/v1` API, API keys, rate limits and usage metering.
- **Web app:** `apps/web`, the accountant dashboard and the business owner share links.
- **Browser extension:** `apps/extension` and the data it reads from the invoice issuer.
- **Tenant isolation:** any way for one accounting office to read or change another office's data.
- **Calculation integrity:** any way to make the API return tax values different from the official
  engines' result.
- **Workflows:** `.github/workflows` and anything that could expose secrets or alter a release.

Out of scope:

- flaws in the Receita Federal engines themselves (report them upstream at
  <https://github.com/ReceitaFederal>, and tell us only if our use of them makes the problem worse);
- flaws in third-party services (report them to the provider);
- denial of service, spam and social engineering;
- reports from automated tools with no demonstrated impact.

## Testing rules

- Use only your own test accounts and data.
- Stop as soon as you reach data that is not yours, do not keep a copy, and mention it in the report.
- Do not disrupt the service or run load tests against it.
- Keep the details private until a fix has been released.

## Response

Responses are **best effort**, with no guaranteed deadline. Reports are reviewed in the advisory
thread, where we will discuss the impact and any fix with you and tell you when it has been released.
Reports affecting tenant isolation, API keys or fiscal data come first.

There is no bug bounty programme.
