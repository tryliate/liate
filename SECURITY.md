# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ Active support |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub Issues.**

If you discover a security vulnerability in Liate, please report it privately:

1. **Email**: security@tryliate.com
2. **GitHub**: Use [GitHub Private Vulnerability Reporting](https://github.com/tryliate/liate/security/advisories/new)

### What to Include

- Type of issue (e.g. API key exposure, OAuth bypass, code injection, privilege escalation)
- The file(s) involved and line numbers (if applicable)
- Step-by-step reproduction instructions
- Proof-of-concept or exploit code (if possible)
- Impact assessment — which users/configurations are affected

### Response Timeline

| Stage | Timeline |
|---|---|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix & disclosure | Within 30 days (complex issues: 90 days) |
| CVE assignment | If applicable, after fix is released |

## Security-Sensitive Areas

When reviewing or contributing, pay special attention to:

- **`src/oop/Liate_MCP/LiateMcp.ts`** — OAuth 2.1 token generation and Bearer validation
- **`src/store/keys.ts`** — API key vault encryption and storage
- **`src/oop/Liate_Pillars/LiateEnv.ts` & `src/aum/`** — `E.REQUIRE_APPROVAL` gate bypass risks
- **`src/lapi/index.ts` & `src/lapi/routes/`** — Route authentication and CORS configuration
- **`src/oop/Liate_Security/LiateSandbox.ts`** — Isolated JS execution sandbox & globals stripping
- **`src/oop/Liate_Security/LiateGuard.ts`** — DPDP Act PII redaction rules
- **`.env` / `.liate/`** — Secret file handling and gitignore compliance

## Security Best Practices for Users

1. **Never commit `.env` or `*.vault` files** — both are in `.gitignore` by default
2. **Use `E.REQUIRE_APPROVAL: "true"`** in production agents for human-in-the-loop tool approval
3. **Rotate API keys regularly** — use `liate key delete` + `liate key add`
4. **Set `MAX_TURNS`** in `E` pillar to limit agent runaway costs
5. **Set `budgetInr`** in `LiateToken` to enforce hard spend limits
6. **Do not expose LAPI/v1** endpoints to the public internet without authentication

## Acknowledgments

We sincerely thank all security researchers who responsibly disclose vulnerabilities and help keep Liate and India's sovereign AI ecosystem secure. 🇮🇳
