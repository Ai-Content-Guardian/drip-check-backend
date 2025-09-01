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

// Premium users cache (in production, use Redis or a database)
const premiumUsersCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Premium check with ExtensionPay
async function checkPremium(userId, premiumToken) {
  if (!userId || typeof userId !== 'string') {
    return false;
  }
  
  // Check cache first
  const cached = premiumUsersCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.isPremium;
  }
  
  // For ExtensionPay, we rely on client-side verification
  // The extension sends a premium token (timestamp) when user is verified as premium
  if (premiumToken) {
    const tokenAge = Date.now() - parseInt(premiumToken);
    // Token is valid for 10 minutes
    if (tokenAge < 10 * 60 * 1000) {
      // Cache the premium status
      premiumUsersCache.set(userId, {
        isPremium: true,
        expires: Date.now() + CACHE_DURATION
      });
      return true;
    }
  }
  
  // Cache non-premium status
  premiumUsersCache.set(userId, {
    isPremium: false,
    expires: Date.now() + CACHE_DURATION
  });
  
  return false;
}

// Main humanization endpoint
app.post('/api/humanize', async (req, res) => {
  try {
    const { text, userId, currentScore, premiumToken } = req.body;
    
    if (!text || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Check premium status
    const isPremium = await checkPremium(userId, premiumToken);
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
    const prompt = `Task: Rewrite this LinkedIn post to sound more human (80%+ humanity score).

Current post (${currentScore}% human):
${text}

Rules:
- Replace corporate buzzwords with simple words
- Remove excessive formatting (arrows, em dashes, too many emojis)
- Write conversationally, like talking to a friend
- Keep the same facts and message
- Same length or shorter

Output the rewritten post starting with the first word of your revision.`;
    
    // Call Claude with response prefilling
    const completion = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        },
        {
          role: 'assistant',
          content: 'I'  // Start Claude's response to prevent intro text
        }
      ]
    });
    
    // Get the text and prepend the prefilled "I"
    const humanizedText = 'I' + completion.content[0].text;
    
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