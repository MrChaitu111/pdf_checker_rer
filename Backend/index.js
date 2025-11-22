// index.js
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { extractTextFromPDF } from './extrack.js';

dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const PORT = process.env.PORT || 8000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://pdf-checker-rer-1.onrender.com/';

const app = express();
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS']
  })
);
app.use(express.json());

// Ensure uploads directory exists
const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer setup
const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB limit — adjust as needed
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDFs are allowed'));
    } else {
      cb(null, true);
    }
  }
});

/** Utility: split text into sentences (simple) */
function splitIntoSentences(text) {
  if (!text) return [];
  // Basic sentence splitter — fine for most PDFs
  const cleaned = text.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  // split on ., ?, ! followed by space and capital letter OR number — keep punctuation
  const sentences = cleaned
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
    .map(s => s.trim())
    .filter(Boolean);
  return sentences;
}

/** Utility: find sentence matching rule heuristically:
 * - split rule into keywords (words longer than 2 chars)
 * - check if any sentence includes all or many keywords (case-insensitive)
 */
function findEvidenceSentence(rule, sentences) {
  const normalizedRule = rule.toLowerCase();
  const keywords = (normalizedRule.match(/\b[a-z0-9]{3,}\b/g) || []).slice(0, 8);
  if (keywords.length === 0) return null;

  // Score sentences by how many keywords they include
  let best = null;
  let bestScore = 0;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 1;
    }
    // Prefer shorter sentences if equal score (more precise)
    if (score > bestScore || (score === bestScore && best && s.length < best.length)) {
      bestScore = score;
      best = s;
    }
  }

  // Require at least 1 keyword match to accept as evidence (tunable)
  if (bestScore >= 1) return { sentence: best, score: bestScore, keywordsCount: keywords.length };
  return null;
}

/** Build a short, robust prompt for OpenAI for a single rule + context */
function buildSingleRulePrompt(rule, docSnippet, numPages) {
  // docSnippet should be a reasonably short substring (<= ~8000 chars)
  return `You are an assistant that MUST output valid JSON only.

Task:
Evaluate this single rule against the provided document text and return EXACTLY this JSON object (no array, no extra text):

{
  "rule": "<the rule string>",
  "status": "pass" or "fail",
  "evidence": "one exact sentence from the document OR 'no evidence found'",
  "reasoning": "one short sentence explaining the decision",
  "confidence": integer 0-100
}

Rule:
${rule}

Document summary:
- pages: ${numPages}
Document text (use only this text for evidence):
${docSnippet}

Important:
- Use only information from the document text.
- If you cannot find evidence, set "status":"fail" and "evidence":"no evidence found".
- Output only valid JSON and nothing else.`;

}

/** Call OpenAI to evaluate a single rule (returns parsed JSON) */
async function callOpenAIForRule(rule, docSnippet, numPages) {
  if (!OPENAI_KEY) {
    // No API key — return a fallback response saying we cannot evaluate
    return {
      rule,
      status: 'fail',
      evidence: 'no evidence found',
      reasoning: 'OpenAI API key not configured on server',
      confidence: 0
    };
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a JSON-only assistant.' },
      { role: 'user', content: buildSingleRulePrompt(rule, docSnippet, numPages) }
    ],
    max_tokens: 500,
    temperature: 0.0
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify(payload),
    timeout: 20000
  });

  const data = await r.json();

  if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid response from LLM');
  }

  // strip fences if any
  const content = (data.choices[0].message.content || '').replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(content);
    // Basic normalization check
    if (!parsed.rule) parsed.rule = rule;
    return parsed;
  } catch (e) {
    // If parsing fails, return an object describing the failure so frontend can debug
    return {
      rule,
      status: 'fail',
      evidence: 'no evidence found',
      reasoning: `LLM returned non-JSON response: ${content.slice(0, 300)}`,
      confidence: 0
    };
  }
}

/** POST /api/check: accepts multipart form with 'pdf' and rule1/2/3 (or rules_json) */
app.post('/api/check', upload.single('pdf'), async (req, res) => {
  try {
    const { file } = req;
    const rules = [];
    if (req.body.rule1) rules.push(req.body.rule1);
    if (req.body.rule2) rules.push(req.body.rule2);
    if (req.body.rule3) rules.push(req.body.rule3);
    if (req.body.rules_json) {
      try {
        const arr = JSON.parse(req.body.rules_json);
        if (Array.isArray(arr)) arr.forEach(r => rules.push(r));
      } catch (e) {
        // ignore parse error; we'll use individual fields if present
      }
    }

    if (!file) return res.status(400).json({ error: 'No PDF uploaded' });
    if (!rules.length) return res.status(400).json({ error: 'No rules provided' });

    const filePath = file.path;
    // Extract text
    const { text, numPages } = await extractTextFromPDF(filePath);

    // Preprocess: split into sentences
    const sentences = splitIntoSentences(text);

    const results = [];

    for (const rule of rules) {
      // 1) Try local heuristic search first
      const evidence = findEvidenceSentence(rule, sentences);
      if (evidence) {
        // Heuristic success => high confidence
        results.push({
          rule,
          status: 'pass',
          evidence: evidence.sentence,
          reasoning: `Found ${evidence.keywordsCount ? `${evidence.keywordsCount} keyword(s)` : 'matching text'} in the document.`,
          confidence: Math.min(90, 40 + evidence.score * 20) // heuristic confidence
        });
        continue;
      }

      // 2) Heuristic failed: call LLM for this rule with a snippet (limit length)
      // Use a window around the first 8000 chars to keep tokens in check
      const SNIPPET_MAX = 8000;
      const docSnippet = text.length > SNIPPET_MAX ? text.slice(0, SNIPPET_MAX) : text;

      try {
        const lrm = await callOpenAIForRule(rule, docSnippet, numPages);
        // Normalize fields if missing
        const out = {
          rule: lrm.rule || rule,
          status: lrm.status === 'pass' ? 'pass' : 'fail',
          evidence: lrm.evidence || 'no evidence found',
          reasoning: lrm.reasoning || '',
          confidence: typeof lrm.confidence === 'number' ? Math.max(0, Math.min(100, lrm.confidence)) : 0
        };
        results.push(out);
      } catch (err) {
        console.error('LLM call error for rule:', rule, err.message);
        results.push({
          rule,
          status: 'fail',
          evidence: 'no evidence found',
          reasoning: 'Error evaluating rule with LLM',
          confidence: 0
        });
      }
    }

    // Cleanup the uploaded file (non-blocking)
    fs.unlink(filePath, () => {});

    return res.json({ result: results });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  if (!OPENAI_KEY) {
    console.warn('WARNING: OPENAI_API_KEY not set. LLM calls will be skipped or return fallback responses.');
  }
});
