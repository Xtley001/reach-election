# Security Policy

## Supported versions

REACH Election is deployed as a single rolling release from the `main` branch. Only the currently deployed `main` is supported; there are no maintained release branches.

| Version | Supported |
|---|---|
| `main` (deployed) | Yes |
| Any older commit | No |

## Reporting a vulnerability

Do not open a public GitHub issue for a suspected vulnerability. Report it privately to the project owners:

- Use GitHub's [private vulnerability reporting](https://github.com/Xtley001/reach-election/security/advisories/new) on this repository, or
- Contact the repository owner directly.

Please include a description of the issue, the affected endpoint or component, reproduction steps, and the impact you observed. You will receive an acknowledgement, and fixes for confirmed issues are rolled into `main` and redeployed.

## Security model

- **No self-registration.** Every account is provisioned by a director (via SQL) or through a single-use invite link. Unknown contacts receive `404` on login, not a new account.
- **OTP authentication.** Login codes are 6-digit CSPRNG values, bcrypt-hashed at rest in `otp_sessions`. Five failed attempts trigger a 30-minute lockout.
- **Token handling.** Access tokens are short-lived HS256 JWTs held in memory only. Refresh tokens are rotating, httpOnly cookies; logout revokes the active refresh token.
- **Invite tokens.** Only `sha256(token)` is stored; the raw token is returned once at creation and never persisted.
- **Role enforcement.** Every request is scoped server-side by role (`require_director`, `require_coordinator`, `require_agent`); list endpoints filter results to the caller's campaign and zone.
- **Transport and headers.** HSTS, a same-origin Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, and a restrictive `Permissions-Policy` are applied to every response. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#security-headers).
- **Rate limiting.** Per-IP limits via SlowAPI, backed by Redis when `REDIS_URL` is set; `429` responses include `Retry-After`.
- **Secrets.** Credentials are supplied only through environment variables and are never committed. See [`SETUP.md`](SETUP.md).

## Production startup guards

The application refuses to start in `ENVIRONMENT=production` unless a real OTP provider is configured — `OTP_PROVIDER=console` is blocked in production, so login codes can never be exposed in server logs.
