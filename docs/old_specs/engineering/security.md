# Security

Apply least privilege and defense in depth.

Review at minimum:

- authentication/session security
- object-level authorization / IDOR
- CSRF
- CORS
- XSS and HTML sanitization
- CSP/security headers
- SQL injection
- rate limiting/abuse controls
- brute-force controls
- file upload validation
- object storage access
- signed/controlled download URLs where appropriate
- secrets management
- dependency vulnerability management
- backups and restore testing
- audit integrity

Never:

- store plaintext passwords;
- commit production secrets;
- place secrets in React bundles;
- rely on frontend route guards for authorization;
- execute administrator-provided JS/HTML;
- trust uploaded filenames or MIME claims blindly;
- log passwords, tokens, or session secrets.

Public e-IFU endpoints should have rate/abuse protection appropriate to real traffic.

Storage-specific controls (bucket policy, key derivation, upload validation, signed-URL TTLs) are in `object-storage.md`. Personal-data and residency controls are in `privacy-data-residency.md`.
