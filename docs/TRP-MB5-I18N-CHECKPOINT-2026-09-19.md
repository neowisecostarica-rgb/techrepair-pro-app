# TRP MB5 — i18n checkpoint — 2026-09-19

## Decision
Supported product locales: ES / EN / PT / FR / NO. Spanish remains fallback. Locale is a presentation preference, never an authorization or tenant boundary.

## Foundation implemented
- Central I18nProvider and `useI18n`.
- Accessible language switcher in authenticated shell.
- Browser-language bootstrap with explicit local preference persistence.
- `<html lang>` follows active locale.
- First shell/loading/retry/logout strings moved behind translation keys.
- No automatic machine-translation runtime dependency.

## Important boundary
This checkpoint does **not** claim the entire application is translated. Existing Spanish literals and hard-coded `date-fns` Spanish locales remain migration inventory. MB5 continues by migrating shared shell/navigation/status vocabulary first, then high-frequency role journeys and public/client surfaces.

No production Publish authorized.
