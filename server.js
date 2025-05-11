const express = require("express");
const app = express();
const { client } = require("./pg");
const path = require("path");
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const adminRoutes = require('./routes/admin');
const authMiddleware = require('./middlewares/auth');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
 
const PORT = process.env.PORT;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.get("/", (req, res) => {
  res.render("login");
});

app.use('/api/auth', authRoutes);

app.use('/api/files', authMiddleware, fileRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);

app.use('/uploads', authMiddleware, express.static(path.join(__dirname, 'uploads')));

//user dashboard
app.get('/success', (req, res) => {
  res.render("user-dashboard");
});

// Admin dashboard
app.get('/admin', (req, res) => {
  try {
    res.render("admin-dashboard");
  } catch (error) {
    console.error('Error rendering admin dashboard:', error);
    res.redirect('/');
  }
});

// For handling 404 - page not foun
app.use((req, res, next) => {
  res.status(404).send('Page not found');
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    message: 'An unexpected error occurred', 
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}); 
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
});
