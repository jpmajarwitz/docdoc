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

## Build and preview

```bash
cd /workspace/docdoc/webapp
npm run build
npm run preview
```

## Notes

- The React app performs OpenAI calls directly from the browser using the official OpenAI JavaScript SDK.
- This is useful for prototyping. For production, move OpenAI API calls to a backend so API keys are not exposed in the browser.
