# Business Workflow Implementation Update

Date: 2026-07-05

## Completed

- Appointment statuses now support `pending`, `approved`, `rejected`, `cancelled`, `completed`, and `no_show`.
- Only `approved` appointments occupy a slot. `rejected`, `cancelled`, `completed`, and `no_show` release the slot guard.
- Customers can cancel pending or approved appointments.
- Staff can update appointment status, reschedule appointments, and view audit logs.
- Staff appointment page now includes today/tomorrow workbench, keyword/date/status filters, reschedule controls, status actions, and audit-log display.
- Booking rules now support weekly open days, same-day cutoff time, minimum advance hours, and per-date slot overrides.
- Customer booking flow now supports gallery-style note prefill, submit result state, “view my bookings”, cancellation, and arrival instructions for approved appointments.

## Verification Scope

- `npm run build:api`
- `npm run check:weapp-contract`
- `npm run check:docs`
- `npm --prefix apps/api run prisma:migrate:deploy`
- `npm run test:api`
