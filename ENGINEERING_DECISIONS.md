# Engineering decisions

## 1. Keep a separate Express API written in TypeScript

The frontend is Next.js, while business rules live in a separate Node.js API. Express was retained instead of rewriting the working backend in NestJS. For a one-day assessment, typed modules, validation, and clear boundaries provide more value than framework migration. A larger team could introduce NestJS later without changing the database or HTTP contracts.

## 2. Authorize through team memberships at the resource boundary

Users can belong to several teams with a different `VIEWER`, `MEMBER`, or `MANAGER` role in each. Every work-item endpoint resolves the item's team and verifies membership on the server. UI visibility is only a convenience and is never treated as authorization.

## 3. Use database compare-and-swap operations for concurrent changes

Claiming uses a single conditional `UPDATE` requiring both an unassigned owner and the `Open` state. General edits and workflow decisions require an `expectedVersion`; a conditional update increments the version only when it still matches. Losing requests receive HTTP 409 and must reconcile with the current server state.

## 4. Make work-item creation idempotent

Clients send an `Idempotency-Key`. A unique constraint over creator, team, and key prevents duplicate work when a request is retried. The API returns the original item for a replay, including when simultaneous requests race at the unique constraint.

## 5. Keep primary writes and history in one transaction

State changes and their audit record are committed together. A successful workflow change cannot silently lose its history. Comments remain available while an approval is pending, but core work fields are frozen. Approval must be performed by a manager other than the assignee.

## Scope decision

Notifications and background jobs were intentionally omitted. The first version favors a complete synchronous journey and four demonstrably correct behaviors over an incomplete queue. An outbox table plus retrying worker would be the next step for reliable notifications.
