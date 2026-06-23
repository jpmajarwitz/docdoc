# PHP backend mirror for DocDoc

This directory contains a PHP implementation of the backend API so the existing frontend can target a PHP-hosted environment instead of the FastAPI backend.

## Included endpoints

The folder mirrors the current backend contract:

- `api/health/`
- `api/critique/`
- `api/apply-change-items/`
- `api/critique-changed-document/`
- `api/resunator/job-req-url/`
- `api/auth/register/`
- `api/auth/verify-email/`
- `api/auth/login/`
- `api/auth/logout/`
- `api/auth/session/`
- `api/auth/profile/`
- `api/auth/forgot-password/`
- `api/auth/reset-password/`

Each endpoint returns JSON shaped to match the current frontend expectations.

## Files

- `config.example.php` — template for API key and CORS configuration.
- `lib/bootstrap.php` — shared helpers for request parsing, file upload to OpenAI, Responses API invocation, CORS, and JSON output.
- `api/.../index.php` — endpoint implementations.
- `.gitignore` — prevents a real `config.php` from being committed.

## Deployment notes

1. Copy `config.example.php` to `config.php`.
2. Set `openai_api_key` in `config.php`.
3. Set database values in `config.php`: `db_servername`, `db_username`, `db_password`, `db_name`, and optional `db_port`.
4. For SMTP email delivery, set `smtp_enabled`, `phpmailer_src_path`, `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_secure`, optional `smtp_timeout_seconds`, `smtp_from_email`, and `smtp_from_name`.
5. For RESUnator job requisition URL parsing, confirm the PHP host has these standard extensions enabled: `curl`, `json`, `filter`, `mbstring`, and DNS functions such as `dns_get_record`. No Composer package is required. Optional `config.php` tuning values are `resunator_job_req_max_bytes`, `resunator_job_req_timeout_seconds`, and `resunator_job_req_max_redirects`.
6. (Optional) set `auth_return_tokens_in_response=true` only for local testing if you want verification/reset tokens returned in API responses.
7. Set `auth_session_timeout_seconds` (default `43200`, i.e. 12 hours) to control inactivity timeout.
8. Ensure auth schema includes a `user_sessions` table with columns:
   - `session_id` (string primary key)
   - `user_id` (int)
   - `created_at` (datetime)
   - `last_activity_at` (datetime)
   - `session_timeout_duration` (int seconds)
   - `session_status` (enum/string: `active` or `terminated`)
   - `revoked_at` (datetime nullable, optional)
9. LLM operation endpoints (`critique`, `apply-change-items`, `critique-changed-document`) and the RESUnator URL parser now require an active auth session and will return a session-expired response when timeout rules fail.
10. Ensure auth schema includes a `user_profile` table with `user_id` and JSON settings storage.
11. Update `cors_allow_origins` for your real frontend origin(s).
12. Upload the contents of `src_php/` so the host serves the `api/` folder.
13. Build the React frontend with `npm run build` and upload only the generated `webapp/dist/` files to your web root (not the JSX source files).
14. Point the frontend `VITE_API_BASE_URL` at the deployed PHP backend root.
15. Enable the API gateway front module (`api/index.php`) with rewrite rules so all `/api/*` requests are routed through the gateway:
    - Apache `.htaccess` in `api/`:
      - `RewriteEngine On`
      - `RewriteCond %{REQUEST_FILENAME} !-f`
      - `RewriteCond %{REQUEST_FILENAME} !-d`
      - `RewriteRule ^ index.php [QSA,L]`
16. Configure these additional values in `config.php` for gateway host/origin enforcement:
    - `app_host` (example: `enddne.com`)
    - `app_origin` (example: `https://enddne.com`)

SMTP diagnostics are written to:
- server `error_log`
- `src_php/logs/a-ideation.log` (auto-created on first log write)

## Important behavior

- `api/resunator/job-req-url/` accepts JSON `{ "url": "https://..." }`, fetches only public HTTPS URLs with redirect, timeout, size, content-type, DNS, and private-IP protections, and returns extracted job requisition JSON for user acceptance.
- Multipart endpoints expect the same form field names as the FastAPI backend:
  - `request`
  - `primary_document`
  - `supporting_document`
  - `prior_response_document`
  - `original_document`
- JSON endpoint `api/critique-changed-document/` expects the same JSON request body used by the current React frontend.
- The PHP backend uploads files to OpenAI Files first, then calls the Responses API.
- API gateway enforcement (implemented in `api/index.php`) includes:
  - HTTPS-only access
  - host allowlist enforcement
  - origin allowlist enforcement
  - secure session cookie policy (`Secure`, `HttpOnly`, `SameSite=Lax`)
  - authenticated-session requirement for non-public routes
  - CSRF token validation (`X-CSRF-Token`) for state-changing authenticated routes
