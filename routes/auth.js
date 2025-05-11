const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { client } = require('../pg');
require("dotenv").config();

// JWT Secret - should be in environment variables in production
const JWT_SECRET = process.env.JWT_SECRET;

// Register route
router.post('/register', async (req, res) => {
  try {
    console.log('Processing registration request');
    const { fullname, email, password } = req.body;

    if (!email || !password || !fullname) {
      return res.status(400).json({ message: 'Please provide email, password, and full name' });
    }

    // Check if user already exists
    const userCheck = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate username from email
    const username = email.split('@')[0];

    // Extract first and last name from fullname
    let firstName = fullname;
    let lastName = '';

    if (fullname.includes(' ')) {
      const nameParts = fullname.split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }

    // Insert user into database (using plan_id = 1 for Standard plan)
    const result = await client.query(
      'INSERT INTO users (email, username, password_hash, first_name, last_name, plan_id) VALUES ($1, $2, $3, $4, $5, 1) RETURNING user_id, email, username',
      [email, username, hashedPassword, firstName, lastName]
    );

    // Generate JWT token
    const token = jwt.sign({ id: result.rows[0].user_id }, JWT_SECRET, {
      expiresIn: '24h'
    });

    // Log activity
    await client.query(
      'INSERT INTO activity_logs (user_id, action_type, action_details) VALUES ($1, $2, $3)',
      [result.rows[0].user_id, 'register', 'User registered successfully']
    );

    // Create session
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await client.query(
      'INSERT INTO user_sessions (user_id, token, expires_at, ip_address) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL \'24 hours\', $3)',
      [result.rows[0].user_id, token, ip]
    );

    console.log('Registration successful for user:', result.rows[0].email);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: result.rows[0].user_id,
        email: result.rows[0].email,
        username: result.rows[0].username
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    console.log('Processing login request');
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password' });
    }

    console.log('Looking up user:', username);

    // Check if user exists
    const result = await client.query(
      'SELECT user_id, username, email, password_hash, is_admin FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log('User not found:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('User found, verifying password');

    // Validate password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('Password verified, generating token');

    // Generate JWT token
    const token = jwt.sign({ id: user.user_id }, JWT_SECRET, {
      expiresIn: '24h'
    });

    // Update last login time
    await client.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
      [user.user_id]
    );

    // Get IP address
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log('User IP:', ip);

    // Log activity
    await client.query(
      'INSERT INTO activity_logs (user_id, action_type, action_details, ip_address) VALUES ($1, $2, $3, $4)',
      [user.user_id, 'login', 'User logged in successfully', ip]
    );

    // Create session - expire any existing sessions first
    await client.query(
      'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
      [user.user_id]
    );

    await client.query(
      'INSERT INTO user_sessions (user_id, token, expires_at, ip_address) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL \'24 hours\', $3)',
      [user.user_id, token, ip]
    );

    console.log('Login successful for user:', user.username);

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin
      },
      token,
      redirect: user.is_admin ? '/admin' : '/success'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Token verification route
router.get('/verify', async (req, res) => {
  try {
    console.log('Processing token verification request');
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.log('No token provided for verification');
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('Token decoded for user ID:', decoded.id);
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check if session exists and is active
    console.log('Checking session for token');
    const session = await client.query(
      'SELECT * FROM user_sessions WHERE user_id = $1 AND token = $2 AND expires_at > CURRENT_TIMESTAMP AND is_active = true',
      [decoded.id, token]
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

    console.log('Token verified for user:', user.rows[0].username);

    res.status(200).json({
      user: user.rows[0],
      redirect: user.rows[0].is_admin ? '/admin' : '/success'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ message: 'Token verification failed' });
  }
});

// Logout route
router.post('/logout', async (req, res) => {
  try {
    console.log('Processing logout request');
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.log('No token provided for logout');
      return res.status(401).json({ message: 'No token provided' });
    }

    // Invalidate session
    console.log('Invalidating session for token');
    const result = await client.query(
      'UPDATE user_sessions SET is_active = false WHERE token = $1 RETURNING user_id',
      [token]
    );

    if (result.rows.length > 0) {
      console.log('Session invalidated for user ID:', result.rows[0].user_id);

      // Log activity if user is known
      await client.query(
        'INSERT INTO activity_logs (user_id, action_type, action_details) VALUES ($1, $2, $3)',
        [result.rows[0].user_id, 'logout', 'User logged out successfully']
      );
    } else {
      console.log('No active session found for token');
    }

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

module.exports = router;