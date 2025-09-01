// Drip Check Backend API
// This handles AI humanization requests securely

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests from LinkedIn, Chrome extensions, and localhost
    const allowedOrigins = [
      'https://www.linkedin.com',
      'https://linkedin.com',
      'http://localhost:3000',
      'http://localhost:5000'
    ];
    
    // Allow Chrome extension requests (no origin) and allowed origins
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Handle preflight requests
app.options('*', cors());

// Rate limiting (simple in-memory version)
const rateLimits = new Map();
const RATE_LIMIT = 50; // requests per day per user

// Premium check (integrate with ExtensionPay)
async function checkPremium(userId) {
  // TODO: Integrate with ExtensionPay API
  // For now, return true for testing
  return true;
}

// Main humanization endpoint
app.post('/api/humanize', async (req, res) => {
  try {
    const { text, userId, currentScore } = req.body;
    
    if (!text || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Check premium status
    const isPremium = await checkPremium(userId);
    if (!isPremium) {
      return res.status(403).json({ 
        success: false, 
        error: 'Premium subscription required' 
      });
    }
    
    // Rate limiting
    const userKey = `rate:${userId}:${new Date().toDateString()}`;
    const currentCount = rateLimits.get(userKey) || 0;
    if (currentCount >= RATE_LIMIT) {
      return res.status(429).json({ 
        success: false, 
        error: 'Daily limit reached (50 humanizations)' 
      });
    }
    rateLimits.set(userKey, currentCount + 1);
    
    // Create the humanization prompt for Claude
    const prompt = `Rewrite this LinkedIn post to score 80%+ on a humanity scale. Current score: ${currentScore}% (100% = perfectly human, 0% = corporate robot).

Original post:
${text}

Rewrite for 80%+ humanity score by:
1. Replace buzzwords (momentum, transformation, flywheel, leverage, synergy) with simple words
2. Remove formatting tricks (arrows, em dashes, excessive emojis)
3. Combine short sentences into natural paragraphs
4. Write like you're talking to a friend over coffee
5. Keep all facts and core message the same
6. Make it the same length or shorter

Start your response with the first sentence of the rewritten post. Output only the rewritten post text.`;
    
    // Call Claude
    const completion = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const humanizedText = completion.content[0].text;
    
    // Track usage for analytics
    console.log(`Humanization request: User ${userId}, Input: ${text.length} chars, Output: ${humanizedText.length} chars`);
    
    res.json({
      success: true,
      humanizedText: humanizedText,
      usage: {
        inputTokens: completion.usage.input_tokens,
        outputTokens: completion.usage.output_tokens,
        totalTokens: completion.usage.input_tokens + completion.usage.output_tokens
      }
    });
    
  } catch (error) {
    console.error('Humanization error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to humanize post' 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'drip-check-api' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Drip Check API running on port ${PORT}`);
});

// Clean up rate limits every hour
setInterval(() => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toDateString();
  
  for (const [key] of rateLimits) {
    if (key.includes(yesterdayKey)) {
      rateLimits.delete(key);
    }
  }
}, 60 * 60 * 1000);