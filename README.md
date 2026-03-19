# DocDoc

This repository now contains:

- The original Streamlit implementation (`docdoc.py` and helpers).
- A browser-resident React implementation in `webapp/`.
- A stateless FastAPI backend proxy in `backend_main.py` that stores only the OpenAI API key.

## Backend setup

Set the backend OpenAI key in your environment:

```bash
export OPENAI_API_KEY=your_key_here
```

Then run the backend from the repository root:

```bash
pip install -r requirements.txt
uvicorn backend_main:app --reload --port 8000
```

## Run the React web app

In a second terminal:

```bash
cd /workspace/docdoc/webapp
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`).

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

The browser prepares the LLM request payload, sends it to the backend, and the backend forwards it to OpenAI without storing interaction state.

## Build and preview

```bash
cd /workspace/docdoc/webapp
npm run build
npm run preview
```
