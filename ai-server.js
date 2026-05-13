const http = require("http");

const API_KEY = process.env.GROQ_API_KEY;
const PORT = Number(process.env.AI_COACH_PORT || 8787);
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const REQUEST_TIMEOUT_MS = Number(process.env.AI_COACH_TIMEOUT_MS || 25000);

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function callGroq(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.55,
        max_tokens: 700,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error?.message || `Groq request failed with ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data.choices?.[0]?.message?.content || "AI did not return text.";
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });
  if (req.url === "/api/health" && req.method === "GET") {
    return send(res, 200, {
      ok: true,
      model: MODEL,
      hasKey: Boolean(API_KEY),
    });
  }
  if (req.url !== "/api/coach" || req.method !== "POST") {
    return send(res, 404, { error: "Not found" });
  }
  if (!API_KEY) {
    return send(res, 500, { error: "Set GROQ_API_KEY before starting ai-server.js" });
  }

  try {
    const body = JSON.parse(await readBody(req));
    const question = String(body.question || "").trim();
    const gameContext = JSON.stringify(body, null, 2).slice(0, 5000);
    const messages = [
      {
        role: "system",
        content:
          "You are Morning Sudoku Arena AI Coach. Answer any user question clearly and helpfully. If the question is about Sudoku, teach logic step by step without dumping the full solution unless the user explicitly asks. Prefer Russian when the user writes Russian. Be concise, practical, and friendly.",
      },
      {
        role: "user",
        content: [
          `Question: ${question || "Give a useful coaching recommendation."}`,
          "Available app/player context:",
          gameContext,
        ].join("\n"),
      },
    ];
    const answer = await callGroq(messages);
    return send(res, 200, {
      answer,
      model: MODEL,
    });
  } catch (error) {
    const status = error.name === "AbortError" ? 504 : error.status || 500;
    return send(res, status, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AI Coach server listening on http://127.0.0.1:${PORT}`);
});
