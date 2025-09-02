const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

// Create tables if they don't exist
async function initializeDatabase() {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255),
        subscription_status VARCHAR(50) DEFAULT 'free',
        subscription_id VARCHAR(255),
        subscription_period_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
        amount INTEGER,
        currency VARCHAR(10),
        status VARCHAR(50),
        extensionpay_payment_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Usage tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
        action VARCHAR(100),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// User operations
async function upsertUser(userId, email, subscriptionStatus, subscriptionId = null) {
  try {
    const result = await pool.query(
      `INSERT INTO users (id, email, subscription_status, subscription_id, updated_at) 
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) 
       ON CONFLICT (id) 
       DO UPDATE SET 
         email = EXCLUDED.email,
         subscription_status = EXCLUDED.subscription_status,
         subscription_id = EXCLUDED.subscription_id,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, email, subscriptionStatus, subscriptionId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error upserting user:', error);
    throw error;
  }
}

async function getUserById(userId) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

async function checkUserPremium(userId) {
  try {
    const result = await pool.query(
      'SELECT subscription_status FROM users WHERE id = $1',
      [userId]
    );
    return result.rows.length > 0 && result.rows[0].subscription_status === 'active';
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}

// Payment operations
async function createPayment(userId, amount, currency, status, extensionpayPaymentId) {
  try {
    const result = await pool.query(
      `INSERT INTO payments (user_id, amount, currency, status, extensionpay_payment_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, amount, currency, status, extensionpayPaymentId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating payment:', error);
    throw error;
  }
}

// Usage tracking
async function logUsage(userId, action, metadata = {}) {
  try {
    await pool.query(
      'INSERT INTO usage_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [userId, action, metadata]
    );
  } catch (error) {
    console.error('Error logging usage:', error);
    // Don't throw - logging shouldn't break the app
  }
}

module.exports = {
  pool,
  initializeDatabase,
  upsertUser,
  getUserById,
  checkUserPremium,
  createPayment,
  logUsage
};