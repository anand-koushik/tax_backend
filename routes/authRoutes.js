import express from 'express';
import jwt from 'jsonwebtoken';
import { findUserByEmail, createUser, verifyPassword, findUserById } from '../models/User.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

const generateToken = (userId, email) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'indian_tax_planner_pro_jwt_secret_998811';
  return jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

// Register User
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please enter all fields' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user exists
    const userExists = await findUserByEmail(email);
    if (userExists) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Create user
    const newUser = await createUser({ name, email, password });
    
    // Generate JWT
    const token = generateToken(newUser._id, newUser.email);

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login User
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter all fields' });
    }

    // Find user by email
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = generateToken(user._id, user.email);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Current User Profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
