# TRP — Nielsen Norman Heuristic Audit — 2026-09-19

## Scope
Product-wide UX audit added to the TRP release program. Human QA remains intentionally deferred until the autonomous remediation blocks are complete.

## Heuristics and TRP interpretation
1. Visibility of system status — every save, transition, upload, approval, payment and lifecycle action must expose progress, success, failure and resulting state.
2. Match with the real world — language follows workshop/asset operations: receive, diagnose, quote, approve, repair, test, charge, deliver; internal platform vocabulary stays out of operator UI.
3. User control and freedom — safe cancel/back/close paths; destructive or lifecycle actions require clear consequence and recovery path.
4. Consistency and standards — same action names, state badges, button hierarchy, tables, filters and feedback across roles.
5. Error prevention — prevent invalid transitions, duplicate submissions, wrong-tenant/branch actions, destructive ambiguity and impossible form states before submit.
6. Recognition rather than recall — preserve OT/client/asset context, expose next action and relevant history; do not force users to remember IDs or previous-screen details.
7. Flexibility and efficiency — role-focused Mi Día, shortcuts for frequent work, progressive disclosure for advanced controls, minimal repeated data entry.
8. Aesthetic and minimalist design — remove redundant controls, decorative dashboard noise and information that does not help the current decision.
9. Error recognition and recovery — errors say what failed, what was preserved and the safe next action; never expose raw backend/platform language.
10. Help and documentation — contextual guidance for uncommon/high-risk actions, onboarding that gets the user to the first real job quickly.

## Priority surfaces
P0: auth/identity/impersonation; reception and OT creation; technician lifecycle; quote approval; POS/payment; delivery; inventory mutation; Super Admin tenant actions.
P1: Mi Día by role; Expediente; CRM/customer 360; operation dashboard; finance; settings/users/branches; onboarding.
P2: analytics, secondary admin tools, portals and long-tail workflows.

## Autonomous remediation gate
A screen can leave the remediation block only when it has: explicit status feedback, clear primary action, no redundant competing CTA, contextual labels, safe destructive actions, consistent terminology, responsive baseline, keyboard/focus baseline, empty/loading/error states and no raw platform jargon.

## Human QA deferred
Human validation will happen after autonomous product + website remediation. It must use realistic role journeys rather than page-by-page visual inspection only.


## Remediation checkpoint — 2026-09-19
- Native browser dialogs: CLOSED. Full `src` sweep has zero `alert()`, `confirm()` or `prompt()` usages; high-risk decisions use designed dialogs and contextual feedback.
- Responsive density pass: improved high-density tabs/KPI grids and quote/diagnostic row grids for mobile/tablet breakpoints.
- Public website: removed duplicated role-section heading discovered during consistency sweep.
- Super Admin visible terminology: replaced platform-internal `multi-tenant`, `SUPER_ADMIN` and `ORG_ADMIN` labels with operator-facing language while preserving canonical role identifiers in authorization code.
- Automated build/lint and role/navigation contracts remain release gates.
- Human role-journey QA remains deferred until autonomous remediation is complete.

- State/CTA pass: CRM now uses prospect-facing language, responsive primary-action/filter layout and an actionable true-empty state; inventory empty/form states are clearer and mobile-safe; user management exposes human role labels and specific loading context.
- Super Admin active-user metric now reads canonical `UserAccount.status` instead of legacy `active`, aligning visible system status with authorization truth.
