# DocDoc

This repository now contains:

- The original Streamlit implementation (`docdoc.py` and helpers).
- A regenerated browser-resident React implementation in `webapp/`.

## Run the React web app

```bash
cd /workspace/docdoc/webapp
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`).

## Mode-based page flow

The React webapp now follows the Streamlit UI flow as separate page states:

1. `doc_define_mode` for API-key entry and document definition.
2. `invoke_model_mode` while the browser uploads files and waits for the model.
3. `llm_result_saved_mode` once a critique or changed document is available.
4. `critique_review_mode` for reviewing the critique and creating change items.
5. `view_changed_document_mode` for viewing the changed document and optionally critiquing it again.

## Build and preview

```bash
cd /workspace/docdoc/webapp
npm run build
npm run preview
```

## Notes

- The React app performs OpenAI calls directly from the browser using the official OpenAI JavaScript SDK.
- This is useful for prototyping. For production, move OpenAI API calls to a backend so API keys are not exposed in the browser.
