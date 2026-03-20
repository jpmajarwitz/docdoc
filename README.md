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

## Build and preview

```bash
cd /workspace/docdoc/webapp
npm run build
npm run preview
```
