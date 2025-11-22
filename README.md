📄 PDF Rule Checker

A full-stack application that allows users to upload a PDF document, apply custom rule checks, and receive AI-powered validation, including:

Evidence found inside the PDF

Pass/Fail status

Explanation

Confidence score

The project consists of:

Frontend (Vite + React) — deployed on Render

Backend (Node.js + Express) — deployed on Render

PDF text extraction + OpenAI rule evaluation

🚀 Live Demo

Frontend: https://pdf-checker-rer-1.onrender.com

Backend API: https://pdf-checker-rer.onrender.com




🏗 Project Structure
project/
│
├── frontend/             
│   ├── src/
│   │   ├── App.jsx
│   │   └── style.css
│   ├── index.html
│   └── package.json
│
└── backend/              
    ├── index.js
    ├── extrack.js
    ├── uploads/
    └── package.json

🔥 Features
✔ Upload PDF

Users upload any PDF file up to 10 MB.

✔ Select rules

3 dropdown rules included by default.

✔ AI-powered rule checking

If no sentence matches locally, the backend calls OpenAI with smart prompts.

✔ Evidence Extraction

Shows the exact sentence supporting the rule.

✔ Confidence Score

Helps users understand how reliable the match is.



📦 Future Improvements

Add rule editor

PDF previews

More advanced evidence visualization

Multi-rule batch processing
