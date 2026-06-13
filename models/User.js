import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { DATA_DIR, isLocalMode } from '../config/db.js';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.model('User', UserSchema);
const localFilePath = path.join(DATA_DIR, 'users.json');

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
    console.error('Error reading users file:', err);
    return [];
  }
};

// Write local file helper
const writeLocalFile = (data) => {
  try {
    fs.writeFileSync(localFilePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing users file:', err);
  }
};

export const findUserByEmail = async (email) => {
  const normEmail = email.toLowerCase().trim();
  if (isLocalMode()) {
    const users = readLocalFile();
    return users.find(u => u.email.toLowerCase().trim() === normEmail) || null;
  } else {
    return await UserModel.findOne({ email: normEmail });
  }
};

export const findUserById = async (id) => {
  if (isLocalMode()) {
    const users = readLocalFile();
    const user = users.find(u => u._id === id);
    if (!user) return null;
    // Omit password for safety
    const { password, ...safeUser } = user;
    return safeUser;
  } else {
    return await UserModel.findById(id).select('-password');
  }
};

export const createUser = async (userData) => {
  const { name, email, password } = userData;
  const normEmail = email.toLowerCase().trim();
  const hashedPassword = await bcrypt.hash(password, 10);

  if (isLocalMode()) {
    const users = readLocalFile();
    const existing = users.find(u => u.email.toLowerCase().trim() === normEmail);
    if (existing) {
      throw new Error('User already exists');
    }
    const newUser = {
      _id: new Date().getTime().toString(),
      name,
      email: normEmail,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    writeLocalFile(users);
    
    // Return user without password
    const { password: _, ...safeUser } = newUser;
    return safeUser;
  } else {
    const newUser = new UserModel({
      name,
      email: normEmail,
      password: hashedPassword
    });
    const saved = await newUser.save();
    return {
      _id: saved._id,
      name: saved.name,
      email: saved.email,
      createdAt: saved.createdAt
    };
  }
};

export const verifyPassword = async (inputPassword, hashedPassword) => {
  return await bcrypt.compare(inputPassword, hashedPassword);
};
