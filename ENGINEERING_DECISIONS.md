# Engineering decisions

This document records the five decisions that carry the most correctness and operational risk in OpsFlow. Each decision describes the problem, the selected design, the alternatives considered, its failure behavior, and how the implementation is verified.

## 1. Use three product roles and enforce authorization at the resource boundary

### Problem

Authorization is not only a navigation concern. A user can call the API directly, reuse an old browser session, change a department identifier, or request a work item through a bookmarked URL. Hiding a button in React therefore cannot protect department data. The system also needs both global access for Admin and department-specific access for Manager and Employee.

### Decision

The product exposes exactly three roles:

- **Admin** has organization-wide access and can perform department-management actions in every department.
- **Manager** can view and manage every work item in departments where they are a Manager.
- **Employee** can view and comment on work in their department, claim eligible work, and change workflow state only for work assigned to them.

The database uses two layers because global and department access answer different questions. The user record stores whether an account is a global Admin. Department memberships store whether a non-admin account acts as a Manager or Employee in each department. This supports a person belonging to multiple departments without granting accidental global access. API responses and UI labels translate the storage representation into only the three product role names.

Every protected request first validates the signed token, then reloads the current user from PostgreSQL. An inactive or deleted user is rejected even if their token has not expired, and the current database role wins over a stale role embedded in the token. Each work-item endpoint then resolves the resource's department and checks current membership before reading or writing it.

The disclosure policy is deliberate: a nonexistent work item returns `404`; an existing work item outside the caller's department returns `403`. List endpoints also require access to the requested department. The same rule is applied to list, search, detail, comment, comment deletion, claim, assignment, edit, resolution, and approval routes.

### Migration impact

The previous read-only role did not belong in the final product model. The migration converts those memberships to Employee access and removes the obsolete enum value. It preserves user IDs, credentials, department memberships, work items, comments, notifications, and audit history. Legacy seeded email addresses remain usable and are presented as Employee accounts.

### Trade-off and verification

A permission-table design would be more flexible, but it would add policy complexity that the current three-role product does not need. Centralized department checks are easier to review and test. API tests prove Admin cross-department access, complete Manager visibility inside a department, Manager denial outside it, Employee department boundaries, inactive-user rejection, comment permissions, assignment permissions, and Employee ownership rules. Frontend visibility remains a usability feature, never the security boundary.

## 2. Make each logical create submission idempotent

### Problem

Create requests have an ambiguous failure mode. The database may commit a work item while the response is delayed or lost. If the user clicks Create again with a new request identity, the server cannot distinguish a retry from a genuinely new item and duplicates are created.

### Decision

Each opening of the Create Work Item form starts one logical submission and generates one `Idempotency-Key`. The frontend stores that key in a ref, so rerendering does not change it. Every retry for that still-open logical submission sends the same key. The key is cleared only after a successful response. Closing and reopening the form starts a different logical submission and therefore creates a new key.

The server requires a nonempty bounded key and scopes it by creator and department. PostgreSQL enforces a unique constraint over `(creator, department, idempotency key)`. Before inserting, the API checks for an existing matching item and returns it with `replayed: true`. This check improves the common replay path but is not the concurrency guarantee. If two identical requests pass that check simultaneously, the unique constraint allows only one insert. The losing request catches only the unique-conflict case, reads the committed item, and returns that same item rather than creating another.

The work item and its `CREATED` audit record are written in one transaction. A successful first request therefore cannot create an item without creation history. A replay does not append another creation event.

### Alternatives and trade-off

Disabling the button is retained as a UX improvement but is insufficient: double clicks can race before a rerender, browsers retry, proxies retry, and users reload after a timeout. Content-based deduplication was rejected because two legitimate tasks can have the same title and description. A client-generated logical request key combined with a database uniqueness rule provides deterministic behavior without guessing user intent.

### Verification

API tests cover an ordinary first creation, a sequential replay, and two concurrent requests with the same key. They assert `201` for the winner, `200` for replays, the same returned item ID, one database row, and no duplicate creation side effects.

## 3. Prevent stale frontend responses from replacing newer dashboard state

### Problem

HTTP responses are not guaranteed to finish in request order. A slow request for Department A can complete after a fast request for Department B. Without coordination, the older response can replace the new items, totals, page number, error, or loading state. Work-item details have the same problem when users open two items quickly.

### Decision

Dashboard list loading uses both cancellation and a monotonically increasing request sequence:

1. Changing department, search, status, priority, page, or view starts a new sequence.
2. The previous `AbortController` is canceled.
3. The request captures its sequence number.
4. Items, totals, pagination, department overview, errors, and loading state are updated only if that sequence is still current.

Cancellation reduces unnecessary server and browser work. The sequence check remains necessary because cancellation is cooperative: a response may already be complete, a mocked transport may ignore the signal, or code between awaits may continue. Treating both controls as required makes the result ordering explicit.

Work-item detail requests use a separate controller and sequence. Opening a second item invalidates the first detail request, so late comments or history from the first item cannot appear in the second item's modal. Switching to User Management invalidates active dashboard loading, and unmounting the page cancels both list and detail requests.

Canceled requests are normal control flow. They do not show an error toast and cannot reset the latest request's loading state. Network failures and actual API errors are still displayed, but only when they belong to the current request.

### Alternatives and trade-off

A data-fetching library could provide query keys, cancellation, caching, and stale-time policies. For this assessment, the explicit sequence/controller implementation is small, dependency-free, and makes the race policy visible during review. If the application grows, migrating this behavior to a query library would reduce repeated fetching code while preserving the same request-key rules.

### Dashboard count semantics

The API paginates on the server and never loads the full matching dataset into the browser. Summary cards are therefore calculated from the currently loaded page, not from all matching database rows. Their labels explicitly say “on this page,” and the first card displays how many matching items are loaded out of the server-reported total. This avoids presenting page-local counts as organization-wide metrics.

## 4. Model workflow transitions explicitly and make concurrent state changes atomic

### Problem

Accepting any status string turns workflow into uncontrolled CRUD. Users could skip approval, close unfinished work, reopen a terminal item, approve their own task, or overwrite a newer update based on stale screen data. Claim and assignment also race when multiple people act at nearly the same time.

### Decision

The backend owns the state machine. The supported transitions are:

- `Open -> In Progress`: an Employee atomically claims an open unassigned item, or a Manager/Admin assigns it to an active Employee in the same department.
- `Changes Requested -> In Progress`: the assigned Employee or department Manager/Admin resumes work.
- `In Progress -> Awaiting Approval`: the assigned Employee submits an approval-required item with completion notes.
- `Changes Requested -> Awaiting Approval`: the assigned Employee resubmits corrected work.
- `Awaiting Approval -> Approved`: a Manager/Admin in the department who is not the assignee approves it.
- `Awaiting Approval -> Changes Requested`: a Manager/Admin in the department who is not the assignee rejects it with a reason.
- `Approved -> Closed`: the assigned Employee or department Manager/Admin closes approved work.
- `In Progress -> Resolved`: the assigned Employee or department Manager/Admin resolves work that does not require approval.

`Closed` and `Resolved` are terminal and immutable. An item awaiting approval is frozen for task-field/status edits, although department users may continue commenting. Approval requirements cannot be removed after creation to bypass a pending control.

Claim and assignment use a single conditional database update requiring the item to still be `Open` and unassigned. Only one concurrent request can match. All other mutable operations include `expectedVersion` in the database `WHERE` clause and increment the version in the same statement. Reading the version first and updating later would leave a time-of-check/time-of-use race; compare-and-swap keeps the decision at the write boundary.

Every successful workflow write and its audit record commit in one transaction. Failed authorization, invalid transitions, lost claims, and stale versions create no audit event. This keeps history trustworthy rather than merely verbose.

### Verification

Tests cover concurrent claim winners/losers, assignment permissions, owner-only Employee updates, approval-required resolution denial, submission by the assignee, decision by a different department Manager, cross-department denial, request changes, resumption, resubmission, approval, close, direct resolution, stale versions, invalid transitions, terminal-item rejection, and audit records existing only for successful writes.

## 5. Return safe actionable errors and test the risks rather than implementation details

### Problem

Raw database or exception messages can disclose schema details, secrets, internal paths, or stack traces. At the other extreme, a generic “Something went wrong” gives the user no recovery path. Error handling must also survive non-JSON proxy responses, empty responses, network failures, and intentional request cancellation.

### Decision

Expected API failures return a stable machine-readable `error` code and a safe human-readable `message`. Examples include:

- `STALE_DATA`: “This work item changed. Refresh it and try again.”
- `TEAM_ACCESS_DENIED`: “You do not have access to this department.”
- `INVALID_WORKFLOW_TRANSITION`: “That workflow transition is not allowed.”
- `ALREADY_CLAIMED`: identifies that the item is already assigned or no longer eligible.

Validation responses may include field-level details because they describe the caller's own submitted data. Unexpected exceptions always return `INTERNAL_SERVER_ERROR` with a generic message. They never return exception text, SQL/database details, request bodies, tokens, passwords, or stack traces. Maintainer logs include the HTTP method, path, and diagnostic error metadata; production client responses remain sanitized.

The frontend uses one response parser for dashboard and authentication requests. It safely handles valid JSON, empty `204` responses, non-JSON error pages, unreachable servers, and aborted requests. Each create, claim, update, assignment, comment, approval, list, and detail action displays the server's safe actionable message rather than replacing it with an unrelated generic failure.

### Testing strategy

Tests run through Express/API routes wherever practical so they exercise authentication, current active status, department authorization, validation, workflow rules, transactions, database constraints, and response codes together. The suite includes both success and failure cases for the rules most dangerous to get wrong: global Admin access, Manager boundaries and full department visibility, Employee boundaries, comment permissions, assignment, concurrent claim, status ownership, approval permissions, duplicate-create replay, stale updates, terminal states, invalid transitions, and audit integrity. Test data is isolated with unique identifiers and removed afterward.

Database-primitive tests remain only as focused lower-level demonstrations of the compare-and-swap and uniqueness mechanisms; they supplement rather than replace API tests.

### Deliberate scope boundary

Approval decisions create synchronous in-app notification records, but reliable external delivery remains out of scope. There is no notification queue, email/push integration, outbox worker, retry scheduler, or background-job runtime. Adding these safely would require idempotent consumers, retry and dead-letter policies, operational monitoring, and ownership of delayed/duplicate delivery behavior. The project prioritizes correctness of the primary synchronous workflow instead of adding an incomplete asynchronous subsystem.
