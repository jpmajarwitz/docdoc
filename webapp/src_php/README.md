# PHP backend mirror for DocDoc

This directory contains a PHP implementation of the backend API so the existing frontend can target a PHP-hosted environment instead of the FastAPI backend.

## Included endpoints

The folder mirrors the current backend contract:

- `api/health/`
- `api/critique/`
- `api/apply-change-items/`
- `api/critique-changed-document/`
- `api/auth/register/`
- `api/auth/verify-email/`
- `api/auth/login/`
- `api/auth/logout/`
- `api/auth/session/`
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
4. Update `cors_allow_origins` for your real frontend origin(s).
5. Upload the contents of `src_php/` so the host serves the `api/` folder.
6. Build the React frontend with `npm run build` and upload only the generated `webapp/dist/` files to your web root (not the JSX source files).
7. Point the frontend `VITE_API_BASE_URL` at the deployed PHP backend root.

## Important behavior

- Multipart endpoints expect the same form field names as the FastAPI backend:
  - `request`
  - `primary_document`
  - `supporting_document`
  - `prior_response_document`
  - `original_document`
- JSON endpoint `api/critique-changed-document/` expects the same JSON request body used by the current React frontend.
- The PHP backend uploads files to OpenAI Files first, then calls the Responses API.
