const router = require("express").Router();
const { authenticate } = require("../middleware/auth");

// POST /api/ai/rewrite  — professionally rewrite service notes using Claude
router.post("/rewrite", authenticate, async (req, res) => {
  const { text, context = "plumbing service" } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "No text provided" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "AI not configured — add ANTHROPIC_API_KEY to your .env file",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `You are a professional ${context} service writer. Rewrite the following technician notes to sound clear, professional, and well-written — the kind of notes a customer would see on an invoice or estimate. Keep all specific technical details, part names, and findings. Fix grammar, improve clarity, and use complete sentences. Return ONLY the rewritten notes with no preamble, explanation, or quotation marks.\n\nOriginal notes:\n${text.trim()}`,
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || "AI request failed" });
    }

    const rewritten = data.content?.[0]?.text?.trim() || text;
    res.json({ text: rewritten });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
