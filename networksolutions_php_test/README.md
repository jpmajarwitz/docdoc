# Network Solutions PHP Test Harness

This folder is a **standalone test kit** for checking whether your Network Solutions basic hosting account can run a very small PHP-based OpenAI proxy and connect to a MySQL database.

It is intentionally separate from the React/FastAPI app in the rest of the repository.

## Files in this folder

- `index.html` — simple browser test screen for both OpenAI and database connectivity.
- `proxy_test.php` — PHP endpoint supporting two POST test modes:
  - `test_type=openai`
  - `test_type=db_connection`
- `config.example.php` — template for local server-side OpenAI configuration.

## What to deploy to Network Solutions

Upload these files to a **separate test folder** on your Network Solutions hosting account, for example:

- `/openai-php-test/index.html`
- `/openai-php-test/proxy_test.php`
- `/openai-php-test/config.php` ← create this from `config.example.php`

You should **not** need to deploy the React app, FastAPI backend, or any Node/Python files for this test.

## Required setup

1. Copy `config.example.php` to `config.php`.
2. Edit `config.php` and paste your real OpenAI API key.
3. Upload `index.html`, `proxy_test.php`, and `config.php` to the same directory on Network Solutions.
4. Visit that directory in the browser, for example:
   - `https://yourdomain.com/openai-php-test/`

## What this test verifies

If it works, that strongly suggests your hosting account supports:

- PHP execution
- form POST handling
- file uploads
- outbound HTTPS requests via cURL
- server-side secret storage in a PHP config file
- MySQL connectivity via `mysqli`

## What success looks like

### OpenAI test

A successful run returns JSON that includes:

- `ok: true`
- `test_type: "openai"`
- the chosen `model`
- optional `uploaded_file_id`
- `output_text`
- `raw_response`

### Database test

A successful run returns JSON that includes:

- `ok: true`
- `test_type: "db_connection"`
- `connected: true`
- `message: "Database connection succeeded and was closed cleanly."`

## Notes

- Keep `config.php` private and do **not** commit it to version control.
- If Network Solutions disables cURL, outbound API calls, or `mysqli` on your plan, the script reports this in the JSON response.
- For the database test, credentials are submitted only for connectivity verification and the connection is closed immediately on success.
- This is only a **test harness**; it is not meant to replace the main app yet.
