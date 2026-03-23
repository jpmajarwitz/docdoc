# PHP backend mirror for DocDoc

This directory contains a PHP implementation of the backend API so the existing frontend can target a PHP-hosted environment instead of the FastAPI backend.

## Included endpoints

The folder mirrors the current backend contract:

- `api/health/`
- `api/critique/`
- `api/apply-change-items/`
- `api/critique-changed-document/`

Each endpoint returns JSON shaped to match the current frontend expectations.

## Files

- `config.example.php` — template for API key and CORS configuration.
- `lib/bootstrap.php` — shared helpers for request parsing, file upload to OpenAI, Responses API invocation, CORS, and JSON output.
- `api/.../index.php` — endpoint implementations.
- `.gitignore` — prevents a real `config.php` from being committed.

## Deployment notes

1. Copy `config.example.php` to `config.php`.
2. Set `openai_api_key` in `config.php`.
3. Update `cors_allow_origins` for your real frontend origin(s).
4. Upload the contents of `src_php/` so the host serves the `api/` folder.
5. Point the frontend `VITE_API_BASE_URL` at the deployed PHP backend root.

## Important behavior

- Multipart endpoints expect the same form field names as the FastAPI backend:
  - `request`
  - `primary_document`
  - `supporting_document`
  - `prior_response_document`
  - `original_document`
- JSON endpoint `api/critique-changed-document/` expects the same JSON request body used by the current React frontend.
- The PHP backend uploads files to OpenAI Files first, then calls the Responses API.
