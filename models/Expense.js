import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, isLocalMode } from '../config/db.js';

const ExpenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  taxCategory: { type: String, default: 'none' }, // 'none', '80C', '80D', '80CCD', 'section24', 'hra'
  date: { type: Date, default: Date.now }
});

const ExpenseModel = mongoose.model('Expense', ExpenseSchema);
const localFilePath = path.join(DATA_DIR, 'expenses.json');

// Read local file helper
const readLocalFile = () => {
  if (!fs.existsSync(localFilePath)) {
    fs.writeFileSync(localFilePath, JSON.stringify([], null, 2));
    return [];
  }
  try {
    const data = fs.readFileSync(localFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading expenses file:', err);
    return [];
  }
};

// Write local file helper
const writeLocalFile = (data) => {
  try {
    fs.writeFileSync(localFilePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing expenses file:', err);
  }
};

// Export repository interface
export const getExpenses = async (userId) => {
  if (isLocalMode()) {
    const expenses = readLocalFile();
    return expenses
      .filter(item => item.userId === userId.toString())
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } else {
    return await ExpenseModel.find({ userId }).sort({ date: -1 });
  }
};

export const addExpense = async (userId, expenseData) => {
  if (isLocalMode()) {
    const localDb = readLocalFile();
    const newExpense = {
      _id: new Date().getTime().toString(),
      userId: userId.toString(),
      description: expenseData.description,
      amount: Number(expenseData.amount),
      category: expenseData.category,
      taxCategory: expenseData.taxCategory || 'none',
      date: expenseData.date || new Date().toISOString()
    };
    localDb.push(newExpense);
    writeLocalFile(localDb);
    return newExpense;
  } else {
    const expense = new ExpenseModel({
      userId,
      description: expenseData.description,
      amount: expenseData.amount,
      category: expenseData.category,
      taxCategory: expenseData.taxCategory || 'none',
      date: expenseData.date
    });
    return await expense.save();
  }
};

export const deleteExpense = async (userId, id) => {
  if (isLocalMode()) {
    let localDb = readLocalFile();
    const lengthBefore = localDb.length;
    // Ensure the expense belongs to the user
    localDb = localDb.filter(item => !(item._id === id && item.userId === userId.toString()));
    if (localDb.length === lengthBefore) {
      throw new Error('Expense not found or unauthorized');
    }
    writeLocalFile(localDb);
    return { message: 'Expense deleted successfully' };
  } else {
    const result = await ExpenseModel.findOneAndDelete({ _id: id, userId });
    if (!result) {
      throw new Error('Expense not found or unauthorized');
    }
    return result;
  }
};
