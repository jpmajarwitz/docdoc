# DocDoc

This repository now contains:

- The original Streamlit implementation (`docdoc.py` and helpers).
- A browser-resident React implementation in `webapp/`.
- A stateless FastAPI backend proxy in `backend_main.py` that stores only the OpenAI API key.

## One-command local development

From `webapp/`, the default dev script now starts **both** the FastAPI backend and the Vite frontend:

```bash
cd /workspace/docdoc/webapp
npm install
npm run dev
```

That command launches:

- the backend proxy on `http://127.0.0.1:8000`
- the Vite frontend on `http://localhost:5173`

Before starting, make sure the backend key is available in your environment:

```bash
export OPENAI_API_KEY=your_key_here
```

## Run the backend by itself

If you want to run the backend separately from the repo root:

```bash
pip install -r requirements.txt
python -m uvicorn backend_main:app --reload --host 127.0.0.1 --port 8000
```

Optional backend health check:

```bash
curl http://127.0.0.1:8000/api/health
```

## Run the frontend by itself

If you already have the backend running elsewhere:

```bash
cd /workspace/docdoc/webapp
export VITE_API_BASE_URL=http://your-backend-host:8000
npm install
npm run dev:frontend
```

## Troubleshooting `ECONNREFUSED 127.0.0.1:8000`

If you still see that error, it means the frontend could not reach the backend proxy. Usually one of these is true:

1. `OPENAI_API_KEY` was not set before starting `npm run dev`, so the backend process exited.
2. Python dependencies were not installed (`pip install -r requirements.txt`).
3. The backend is running on a different host or port, so you need `VITE_API_BASE_URL` and `npm run dev:frontend` instead of the combined dev script.

## Mode-based page flow

The React webapp follows the Streamlit UI flow as separate page states:

1. `doc_define_mode` for document definition.
2. `invoke_model_mode` while the browser waits for the backend proxy and model.
3. `llm_result_saved_mode` once a critique or changed document is available.
4. `critique_review_mode` for reviewing the critique and creating change items.
5. `view_changed_document_mode` for viewing the changed document and optionally critiquing it again.

## API proxy endpoints

The backend is stateless and exposes:

- `POST /api/critique`
- `POST /api/apply-change-items`
- `POST /api/critique-changed-document`
- `GET /api/health`

The browser prepares the LLM request payload, sends it to the backend, and the backend forwards it to OpenAI without storing interaction state.

## Deploy the React frontend to basic hosting (Network Solutions)

If your frontend is hosted on a basic shared host, you cannot upload JSX source files directly.
Shared hosting serves static assets only, so you must first transpile/build the React app.

Use this flow:

```bash
cd /workspace/docdoc/webapp
npm install
npm run build
```

Then upload the generated `webapp/dist/` contents to your hosting web root (or subdirectory).
Those built files are production-ready HTML/CSS/JavaScript that browsers can run directly.

The build now emits separate HTML entry points so each app shell can be linked directly:

- `index-ai.html` (A-Ideation suite home)
- `index-dd.html` (Document Doctor)
- `index-dm.html` (Deck Mate)
- `index-d2d.html` (Doc 2 Deck)

Deployment checklist for `/dd` style hosting:

1. Ensure `webapp/.env.production` contains `VITE_API_BASE_URL=/dd` (or your HTTPS backend base URL).
2. Set `VITE_DEPLOY_BASE_PATH` to the URL path where the static files are hosted (for example `/dd/`) so generated HTML references `/dd/assets/...` instead of `/assets/...`. If `VITE_DEPLOY_BASE_PATH` is omitted, the build now falls back to a path-like `VITE_API_BASE_URL` value (for example `/dd`).
3. Run `npm run build` from `webapp/`.
4. Verify built assets do not contain `http://` backend URLs (for example: `rg -n "http://" webapp/dist/assets`).
5. Upload the new `webapp/dist/*` files (overwrite old files).
6. Hard refresh the site (or clear cache) so the browser loads the latest JS bundle.

Example production env file:

```env
VITE_API_BASE_URL=/dd
VITE_DEPLOY_BASE_PATH=/dd/
```

You can also override the prefix per build command:

```bash
cd /workspace/docdoc/webapp
npm run build -- --base=/dd/
```

> Important: do **not** upload `webapp/src/*.jsx` expecting the host to compile it.

## Optional browser-side Google Docs export

RESUnator can create Google Docs directly from the browser using Google Identity Services and a Google Drive API multipart conversion upload. This keeps the generated resume or cover letter and the user's Google access token in the browser; the DocDoc backend is not involved in the Google Docs export.

To enable the button, create a Google OAuth **Web application** client ID, enable the Google Drive API, add your local/prod origins to the OAuth client, and set:

```bash
export VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
```

For production builds, add the same value to `webapp/.env.production` before running `npm run build`. The export requests the `https://www.googleapis.com/auth/drive.file` scope and uploads generated HTML as a Google Docs file (`application/vnd.google-apps.document`).


## Build and preview

```bash
cd /workspace/docdoc/webapp
npm run build
npm run preview
```

## Registration admin SQL updates

New `users` table definition should include:

```sql
user_type VARCHAR(40) NOT NULL DEFAULT 'regular'
```

Alter statement for existing tables:

```sql
ALTER TABLE users
  ADD COLUMN user_type VARCHAR(40) NOT NULL DEFAULT 'regular';
```
