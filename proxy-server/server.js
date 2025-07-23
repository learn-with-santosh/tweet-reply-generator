// proxy-server/server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
const OLLAMA_BASE_URL = "http://localhost:11434/api";

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use(limiter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Get available models
app.get("/models", async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/tags`);
    if (!response.ok) throw new Error("Failed to fetch models");
    const data = await response.json();
    res.json(data.models || []);
  } catch (err) {
    console.error("Error fetching models:", err);
    res.status(500).json({ error: "Failed to fetch available models" });
  }
});

// Generate endpoint with streaming support
app.post("/generate", async (req, res) => {
  try {
    const { model, prompt, stream = false } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({ error: "Missing model or prompt" });
    }

    console.log("Requested prompt:", prompt);
    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        }
      }),
    });

    if (!ollamaRes.ok) {
      const error = await ollamaRes.text();
      throw new Error(`Ollama API error: ${error}`);
    }

    if (stream) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Pipe the Ollama stream to the client
      ollamaRes.body.pipe(res);
    } else {
      const data = await ollamaRes.json();
      res.json(data);
    }
  } catch (err) {
    console.error("Error in /generate:", err);
    res.status(500).json({ 
      error: "Failed to generate response",
      details: err.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
  console.log("Available endpoints:");
  console.log(`- POST /generate`);
  console.log(`- GET /models`);
  console.log(`- GET /health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});