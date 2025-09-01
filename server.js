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
    const prompt = `You are an expert at making LinkedIn posts sound more authentic and human. The post below scored ${currentScore}% on a humanity scale (100% = perfectly human, 0% = peak corporate cringe).

Your task: Clean up and rewrite this LinkedIn post to sound more human while preserving the original message and content.

Guidelines:
- KEEP the same core message, facts, and announcements - don't add new information
- Remove corporate buzzwords (momentum, transformation, flywheel, synergy, leverage, disrupt, compounding, etc.)
- Replace business jargon with plain English
- Remove LinkedIn formatting tricks:
  • Em dashes (—) → use commas or periods instead
  • Arrows (→, ≫, ➔) → remove completely
  • Excessive emojis → keep 1 MAX, only if it adds value
  • Single sentence paragraphs → combine into natural paragraphs
  • ALL CAPS words → use normal case (BUT keep legitimate acronyms like AI, CEO, ROI, B2B in caps)
- Make it conversational but keep the same meaning
- Turn abstract concepts into simpler explanations
- Fix the "LinkedIn voice" (starting with "Thrilled to announce", "Grateful for", etc.)
- Don't add commentary or meta-observations about the content
- Keep the tone confident and direct, just more human
- Keep any specific details, numbers, or important information
- Aim for 80%+ humanity score

IMPORTANT: 
1. Do NOT add new stories, examples, or details that weren't in the original
2. Do NOT change the fundamental message
3. Return ONLY the cleaned up post text - no introductions like "Here's a cleaned up version"
4. Use proper paragraph breaks for readability, but don't add extra blank lines
5. Keep it concise - don't make it longer than the original

Original post to humanize:
${text}`;
    
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