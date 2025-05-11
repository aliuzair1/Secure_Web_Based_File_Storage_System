const jwt = require('jsonwebtoken');
const { client } = require('../pg');
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to protect routes
const authMiddleware = async (req, res, next) => {
  try {
    console.log('Auth middleware processing request to:', req.originalUrl);

    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.log('No token provided in authorization header');

      // Check if token is in query parameter (for downloads)
      if (req.query.token) {
        console.log('Found token in query parameter');
        req.headers.authorization = `Bearer ${req.query.token}`;
      } else {
        return res.status(401).json({ message: 'No token provided, access denied' });
      }
    }

    // Get token again in case it was in query parameter
    const tokenToVerify = req.headers.authorization?.split(' ')[1];

    // Verify token
    let decoded;
    try {
      console.log('Verifying token...');
      decoded = jwt.verify(tokenToVerify, JWT_SECRET);
      console.log('Token verified for user ID:', decoded.id);
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check if session exists and is active
    console.log('Checking session for user ID:', decoded.id);
    const session = await client.query(
      'SELECT * FROM user_sessions WHERE user_id = $1 AND token = $2 AND expires_at > CURRENT_TIMESTAMP AND is_active = true',
      [decoded.id, tokenToVerify]
    );

    if (session.rows.length === 0) {
      console.log('No active session found for token');
      return res.status(401).json({ message: 'Invalid or expired session' });
    }

    // Get user info
    console.log('Getting user info for ID:', decoded.id);
    const user = await client.query(
      'SELECT user_id, username, email, is_admin FROM users WHERE user_id = $1',
      [decoded.id]
    );

    if (user.rows.length === 0) {
      console.log('User not found for ID:', decoded.id);
      return res.status(401).json({ message: 'User not found' });
    }

    // Add user object to request
    console.log('User authenticated:', user.rows[0].username);
    req.user = user.rows[0];
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(401).json({ message: 'Authentication failed: ' + error.message });
  }
};

module.exports = authMiddleware;