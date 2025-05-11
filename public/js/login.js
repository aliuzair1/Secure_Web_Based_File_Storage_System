document.addEventListener('DOMContentLoaded', function () {
  // Toggle between sign in and sign up forms
  const showSignup = document.getElementById('showSignup');
  const showSignin = document.getElementById('showSignin');
  const formsContainer = document.getElementById('formsContainer');

  showSignup.addEventListener('click', function (e) {
    e.preventDefault();
    formsContainer.classList.add('signup-active');
  });

  showSignin.addEventListener('click', function (e) {
    e.preventDefault();
    formsContainer.classList.remove('signup-active');
  });

  // Toggle password visibility
  const togglePassword = document.getElementById('togglePassword');
  const password = document.getElementById('password');

  togglePassword.addEventListener('click', function () {
    const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
    password.setAttribute('type', type);
    this.classList.toggle('fa-eye');
    this.classList.toggle('fa-eye-slash');
  });

  const toggleNewPassword = document.getElementById('toggleNewPassword');
  const newPassword = document.getElementById('newPassword');

  toggleNewPassword.addEventListener('click', function () {
    const type = newPassword.getAttribute('type') === 'password' ? 'text' : 'password';
    newPassword.setAttribute('type', type);
    this.classList.toggle('fa-eye');
    this.classList.toggle('fa-eye-slash');
  });

  // Forms
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');

  // Error messages
  const errorMessage = document.getElementById('errorMessage');
  const signupErrorMessage = document.getElementById('signupErrorMessage');

  // API base URL
  const API_URL = '/api';

  // Login form submission
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // Simple validation
    if (username.trim() === '' || password.trim() === '') {
      errorMessage.textContent = 'Please enter both username and password';
      return;
    }

    try {
      // Clear previous error messages
      errorMessage.textContent = '';
      errorMessage.style.color = 'red';

      // Send login request
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        errorMessage.textContent = data.message || 'Login failed';
        return;
      }

      // Store token and user info in localStorage
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Display success message
      errorMessage.textContent = 'Login successful! Redirecting...';
      errorMessage.style.color = 'green';

      // Redirect to appropriate page based on user role
      setTimeout(() => {
        window.location.href = data.redirect || '/success';
      }, 1000);

    } catch (error) {
      console.error('Login error:', error);
      errorMessage.textContent = 'An error occurred. Please try again.';
    }
  });

  // Signup form submission
  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const fullname = document.getElementById('fullname').value;
    const email = document.getElementById('email').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Simple validation
    if (fullname.trim() === '' || email.trim() === '' || newPassword.trim() === '') {
      signupErrorMessage.textContent = 'Please fill out all fields';
      signupErrorMessage.style.color = 'red';
      return;
    }

    if (newPassword !== confirmPassword) {
      signupErrorMessage.textContent = 'Passwords do not match';
      signupErrorMessage.style.color = 'red';
      return;
    }

    try {
      // Clear previous error messages
      signupErrorMessage.textContent = '';
      signupErrorMessage.style.color = 'red';

      // Log the registration data for debugging
      console.log('Sending registration data:', { fullname, email, password: newPassword });

      // Send registration request
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fullname,
          email,
          password: newPassword
        })
      });

      console.log('Registration response status:', response.status);

      const data = await response.json();
      console.log('Registration response data:', data);

      if (!response.ok) {
        signupErrorMessage.textContent = data.message || 'Registration failed';
        return;
      }

      // Store token and user info in localStorage if auto-login after registration
      if (data.token) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Show success message and redirect to dashboard
        signupErrorMessage.textContent = 'Registration successful! Redirecting to your dashboard...';
        signupErrorMessage.style.color = 'green';

        setTimeout(() => {
          window.location.href = '/success';
        }, 2000);
      } else {
        // Show success message and redirect to login form
        signupErrorMessage.textContent = 'Registration successful! You can now log in.';
        signupErrorMessage.style.color = 'green';

        // Redirect to sign in form after short delay
        setTimeout(() => {
          formsContainer.classList.remove('signup-active');
        }, 2000);
      }

    } catch (error) {
      console.error('Registration error:', error);
      signupErrorMessage.textContent = 'An error occurred. Please try again.';
    }
  });

  // Check if user is already logged in
  const checkAuth = async () => {
    const token = localStorage.getItem('authToken');

    if (token) {
      try {
        const response = await fetch(`${API_URL}/auth/verify`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          // User is already logged in, redirect to appropriate page
          window.location.href = data.redirect || '/success';
        } else {
          // Token is invalid, clear storage
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Auth verification error:', error);
        // Clear token in case of error
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
      }
    }
  };

  // Check authentication status when page loads
  checkAuth();
});