# Known limitations

- Team administration and invitations are seeded rather than exposed in the UI.
- The dashboard fetches up to 100 rows per page; the API returns pagination metadata, but page navigation is not yet exposed in the UI.
- Work-item comments and the full activity timeline are available from the detail API but do not yet have a dedicated frontend detail page.
- Approval and resolution endpoints are implemented and enforced by the backend; the dashboard currently focuses on creation, claiming, filtering, and stale-safe updates.
- Notifications, file attachments, real-time subscriptions, password reset, SSO, and rate limiting are outside the one-day scope.
- Cookies are suitable for local same-site development. A production deployment should add CSRF protection, HTTPS-only configuration, secret rotation, request tracing, and centralized logging.
- Search uses indexed team/status filtering plus PostgreSQL case-insensitive substring matching. At substantially larger scale, add trigram or full-text indexes.
