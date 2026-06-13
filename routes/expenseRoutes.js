import express from 'express';
import { getExpenses, addExpense, deleteExpense } from '../models/Expense.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply auth middleware to all expense routes
router.use(authMiddleware);

// Get all expenses for logged-in user
router.get('/', async (req, res) => {
  try {
    const expenses = await getExpenses(req.user.id);
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add an expense
router.post('/', async (req, res) => {
  try {
    const { description, amount, category, taxCategory, date } = req.body;
    if (!description || !amount || !category) {
      return res.status(400).json({ error: 'Please provide description, amount, and category' });
    }
    const expense = await addExpense(req.user.id, { description, amount, category, taxCategory, date });
    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an expense
router.delete('/:id', async (req, res) => {
  try {
    await deleteExpense(req.user.id, req.params.id);
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

export default router;
