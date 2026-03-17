# DocDoc

This repository now contains:

- The original Streamlit implementation (`docdoc.py` and helpers).
- A new browser-resident React implementation in `webapp/`.

## Run the React web app

```bash
cd webapp
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Notes

- The React app performs OpenAI calls directly from the browser using the official OpenAI JavaScript SDK.
- This is useful for prototyping, but for production use you should move API calls to a backend service so API keys are not exposed to end users.
