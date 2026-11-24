# @nujum/shared

Single source of truth shared by `apps/bot` and `apps/dashboard`.

## Exports

| Import                     | Environment | Contents                                                                                                    |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `@nujum/shared`            | any         | constants, module registry, command permissions, DTOs, zod schemas, sanitization, rate limiting, audit diff |
| `@nujum/shared/zod`        | any         | all zod contracts                                                                                           |
| `@nujum/shared/prisma`     | server      | Prisma client singleton + `Prisma` namespace                                                                |
| `@nujum/shared/hmac`       | server      | HMAC signing/verification + nonce cache                                                                     |
| `@nujum/shared/env`        | server      | env schemas/parsing + `NEXT_PUBLIC_` guard                                                                  |
| `@nujum/shared/rate-limit` | any         | token-bucket limiters                                                                                       |

The root export is free of `node:crypto` and Prisma on purpose, so React client components can
import schemas without pulling server code into the bundle.

## Database

```bash
pnpm db:generate   # after schema changes
pnpm db:migrate    # development
pnpm db:deploy     # CI/production
```

See [`../../docs/database.md`](../../docs/database.md).

## Tests

```bash
pnpm test
```

78 tests cover HMAC, env validation, rate limits, permissions, audit diff/revert, zod contracts and
Prisma enum parity.
