import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, isLocalMode } from '../config/db.js';

const TaxProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  financialYear: { type: String, default: '2025-26' },
  grossSalary: { type: Number, default: 0 },
  otherIncome: { type: Number, default: 0 },
  deduction80C: { type: Number, default: 0 },
  deduction80D: { type: Number, default: 0 },
  deduction80CCD: { type: Number, default: 0 }, // NPS
  section24: { type: Number, default: 0 },      // Home Loan Interest
  hraRentPaid: { type: Number, default: 0 },
  hraBasicSalary: { type: Number, default: 0 },
  hraCityType: { type: String, default: 'metro' }, // metro or non-metro
  hraReceived: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

const TaxProfileModel = mongoose.model('TaxProfile', TaxProfileSchema);
const localFilePath = path.join(DATA_DIR, 'taxProfiles.json');

const getDefaultProfile = (userId) => ({
  userId: userId.toString(),
  financialYear: '2025-26',
  grossSalary: 0,
  otherIncome: 0,
  deduction80C: 0,
  deduction80D: 0,
  deduction80CCD: 0,
  section24: 0,
  hraRentPaid: 0,
  hraBasicSalary: 0,
  hraCityType: 'metro',
  hraReceived: 0
});

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
    console.error('Error reading tax profiles file:', err);
    return [];
  }
};

// Write local file helper
const writeLocalFile = (data) => {
  try {
    fs.writeFileSync(localFilePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing tax profiles file:', err);
  }
};

// Export repository interface
export const getTaxProfile = async (userId) => {
  if (isLocalMode()) {
    const profiles = readLocalFile();
    const profile = profiles.find(p => p.userId === userId.toString());
    return profile || getDefaultProfile(userId);
  } else {
    const profile = await TaxProfileModel.findOne({ userId });
    return profile || new TaxProfileModel(getDefaultProfile(userId));
  }
};

export const saveTaxProfile = async (userId, profileData) => {
  const updatedData = {
    userId: userId.toString(),
    financialYear: profileData.financialYear || '2025-26',
    grossSalary: Number(profileData.grossSalary || 0),
    otherIncome: Number(profileData.otherIncome || 0),
    deduction80C: Number(profileData.deduction80C || 0),
    deduction80D: Number(profileData.deduction80D || 0),
    deduction80CCD: Number(profileData.deduction80CCD || 0),
    section24: Number(profileData.section24 || 0),
    hraRentPaid: Number(profileData.hraRentPaid || 0),
    hraBasicSalary: Number(profileData.hraBasicSalary || 0),
    hraCityType: profileData.hraCityType || 'metro',
    hraReceived: Number(profileData.hraReceived || 0),
    updatedAt: new Date()
  };

  if (isLocalMode()) {
    const profiles = readLocalFile();
    const index = profiles.findIndex(p => p.userId === userId.toString());
    if (index > -1) {
      profiles[index] = { ...profiles[index], ...updatedData };
    } else {
      profiles.push({ _id: new Date().getTime().toString(), ...updatedData });
    }
    writeLocalFile(profiles);
    return updatedData;
  } else {
    // Upsert user's profile
    let profile = await TaxProfileModel.findOne({ userId });
    if (profile) {
      Object.assign(profile, updatedData);
      return await profile.save();
    } else {
      profile = new TaxProfileModel(updatedData);
      return await profile.save();
    }
  }
};
