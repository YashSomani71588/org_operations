# Known limitations

- In-app notifications are polled and written synchronously. There is no durable delivery queue, email/push delivery, retry worker, or real-time subscription.
- Account provisioning is department-scoped, but there is no invitation/verification flow, password reset, SSO, or multi-factor authentication.
- Organization email validation checks address/domain syntax; it does not prove mailbox ownership.
- File attachments, bulk work operations, and advanced reporting are not implemented.
- Work-item status and priority are validated by the API but remain text columns in PostgreSQL; a future migration could use database enums or check constraints.
- Local cookies use same-site settings appropriate for development. Production should add HTTPS-only deployment, CSRF protection, secret rotation, request tracing, rate limiting, and centralized structured logging.
- Search uses department/status indexes plus case-insensitive substring matching. Large datasets would benefit from trigram or full-text indexes.
