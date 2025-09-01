# Drip Check Backend Deployment Guide

## Deploying to Render

### 1. Initial Setup

1. Create account at https://render.com
2. Connect your GitHub repository
3. Create new Web Service

### 2. Service Configuration

- **Name**: drip-check-api
- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free tier (or upgrade for production)

### 3. Environment Variables

Add these in Render dashboard:

```
ANTHROPIC_API_KEY=your-claude-api-key-here
PORT=3000
NODE_ENV=production
```

### 4. Deploy

1. Click "Create Web Service"
2. Wait for deployment (takes 2-5 minutes)
3. Note your service URL: `https://drip-check-api.onrender.com`

### 5. Update Extension

Update the API URL in `content/composer-button.js`:
```javascript
const API_URL = 'https://drip-check-api.onrender.com/api/humanize';
```

## Testing Deployment

### Health Check
```bash
curl https://drip-check-api.onrender.com/health
```

Expected response:
```json
{"status":"ok","service":"drip-check-api"}
```

### Test Humanization (requires premium)
```bash
curl -X POST https://drip-check-api.onrender.com/api/humanize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I am leveraging synergies to drive growth!",
    "userId": "test_user_123",
    "currentScore": 20,
    "premiumToken": "'$(date +%s)000'"
  }'
```

## Monitoring

1. Check Render dashboard for:
   - Deploy status
   - Logs
   - Metrics
   - Errors

2. Common issues:
   - Cold starts (free tier sleeps after 15min)
   - Rate limits
   - CORS errors

## Production Considerations

1. **Security**:
   - Add request signing
   - Implement proper user verification
   - Use environment-specific API keys

2. **Performance**:
   - Upgrade to paid Render plan ($7/month)
   - Add Redis for caching
   - Implement database for user data

3. **ExtensionPay Integration**:
   - Consider implementing webhooks
   - Store premium users in database
   - Add subscription expiry handling

## Local Development

Run locally:
```bash
cd backend
npm install
npm run dev
```

Test with extension:
1. Update API_URL to `http://localhost:3000/api/humanize`
2. Ensure CORS allows localhost
3. Use test-extensionpay.html for debugging