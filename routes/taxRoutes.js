import express from 'express';
import { getTaxProfile, saveTaxProfile } from '../models/TaxProfile.js';
import { getExpenses } from '../models/Expense.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply auth middleware to all tax routes
router.use(authMiddleware);

// Get current user's tax profile
router.get('/profile', async (req, res) => {
  try {
    const profile = await getTaxProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update/Save tax profile
router.post('/profile', async (req, res) => {
  try {
    const profile = await saveTaxProfile(req.user.id, req.body);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Calculate HRA exemption (Rule: Minimum of the three)
const calculateHRAExemption = (rentPaid, basicSalary, cityType, hraReceived) => {
  if (!rentPaid || !basicSalary || !hraReceived) return 0;
  // 1) Actual Rent Paid minus 10% of Basic Salary
  const rentMinus10PercentBasic = Math.max(0, rentPaid - (0.10 * basicSalary));
  // 2) 50% of Basic Salary (Metro) or 40% (Non-metro)
  const percentLimit = cityType === 'metro' ? (0.50 * basicSalary) : (0.40 * basicSalary);
  // 3) Actual HRA received
  return Math.min(hraReceived, rentMinus10PercentBasic, percentLimit);
};

// Helper: Calculate tax based on slabs
const calculateTaxSlabs = (taxableIncome, slabs) => {
  let remaining = taxableIncome;
  let totalTax = 0;
  const breakdown = [];

  for (let i = 0; i < slabs.length; i++) {
    const { min, max, rate } = slabs[i];
    const slabMax = max === null ? Infinity : max;
    const range = slabMax - min;

    if (remaining > 0) {
      const taxableInSlab = Math.min(remaining, range);
      const taxInSlab = taxableInSlab * (rate / 100);
      totalTax += taxInSlab;
      remaining -= taxableInSlab;
      breakdown.push({
        slab: `${min === 0 ? '0' : min / 100000 + 'L'} - ${max ? max / 100000 + 'L' : 'Above'}`,
        rate,
        taxableInSlab,
        taxInSlab
      });
    } else {
      breakdown.push({
        slab: `${min === 0 ? '0' : min / 100000 + 'L'} - ${max ? max / 100000 + 'L' : 'Above'}`,
        rate,
        taxableInSlab: 0,
        taxInSlab: 0
      });
    }
  }

  return { totalTax, breakdown };
};

// Calculate tax comparing Old vs New Regime, integrating expenses
router.get('/calculate', async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await getTaxProfile(userId);
    const expenses = await getExpenses(userId);

    // Aggregate tax-tagged expenses
    let auto80C = 0;
    let auto80D = 0;
    let auto80CCD = 0;
    let autoSec24 = 0;
    let autoHraRent = 0;

    expenses.forEach(exp => {
      if (exp.taxCategory === '80C') auto80C += exp.amount;
      if (exp.taxCategory === '80D') auto80D += exp.amount;
      if (exp.taxCategory === '80CCD') auto80CCD += exp.amount;
      if (exp.taxCategory === 'section24') autoSec24 += exp.amount;
      if (exp.taxCategory === 'hra') autoHraRent += exp.amount;
    });

    const {
      financialYear,
      grossSalary,
      otherIncome,
      deduction80C,
      deduction80D,
      deduction80CCD,
      section24,
      hraRentPaid,
      hraBasicSalary,
      hraCityType,
      hraReceived
    } = profile;

    const totalGross = grossSalary + otherIncome;

    // Combine profile manual deductions with auto-detected expenses
    const combined80C = deduction80C + auto80C;
    const combined80D = deduction80D + auto80D;
    const combined80CCD = deduction80CCD + auto80CCD;
    const combinedSection24 = section24 + autoSec24;
    const combinedHraRent = hraRentPaid + autoHraRent;

    // --- OLD REGIME ---
    const oldStandardDeduction = grossSalary > 0 ? 50000 : 0;
    const hraExemption = calculateHRAExemption(combinedHraRent, hraBasicSalary, hraCityType, hraReceived);
    
    // Limits
    const capped80C = Math.min(150000, combined80C);
    const capped80D = Math.min(25000, combined80D); // Assuming general 25k limit
    const capped80CCD = Math.min(50000, combined80CCD); // NPS extra limit
    const cappedSection24 = Math.min(200000, combinedSection24);

    const oldTotalDeductions = oldStandardDeduction + hraExemption + capped80C + capped80D + capped80CCD + cappedSection24;
    const oldTaxableIncome = Math.max(0, totalGross - oldTotalDeductions);

    // Old Slabs
    const oldSlabs = [
      { min: 0, max: 250000, rate: 0 },
      { min: 250000, max: 500000, rate: 5 },
      { min: 500000, max: 1000000, rate: 20 },
      { min: 1000000, max: null, rate: 30 }
    ];

    const oldTaxResult = calculateTaxSlabs(oldTaxableIncome, oldSlabs);
    let oldRebate = 0;
    // Section 87A: Rebate up to 12.5k for income <= 5L
    if (oldTaxableIncome <= 500000) {
      oldRebate = Math.min(oldTaxResult.totalTax, 12500);
    }
    const oldTaxAfterRebate = Math.max(0, oldTaxResult.totalTax - oldRebate);
    const oldCess = oldTaxAfterRebate * 0.04;
    const oldFinalTax = oldTaxAfterRebate + oldCess;

    // --- NEW REGIME ---
    // Standard deduction in New Regime:
    // FY 24-25 and FY 25-26 standard deduction is 75,000 for salaried employees
    const newStandardDeduction = grossSalary > 0 ? 75000 : 0;
    const newTotalDeductions = newStandardDeduction;
    const newTaxableIncome = Math.max(0, totalGross - newTotalDeductions);

    let newSlabs = [];
    let newRebateLimit = 0;
    let newMaxRebate = 0;

    if (financialYear === '2025-26') {
      // Budget 2025 restructuring (FY 2025-26)
      newSlabs = [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 5 },
        { min: 800000, max: 1200000, rate: 10 },
        { min: 1200000, max: 1600000, rate: 15 },
        { min: 1600000, max: 2000000, rate: 20 },
        { min: 2000000, max: 2400000, rate: 25 },
        { min: 2400000, max: null, rate: 30 }
      ];
      newRebateLimit = 1200000;
      newMaxRebate = 60000;
    } else {
      // FY 2024-25 (Budget 2024 slabs)
      newSlabs = [
        { min: 0, max: 300000, rate: 0 },
        { min: 300000, max: 700000, rate: 5 },
        { min: 700000, max: 1000000, rate: 10 },
        { min: 1000000, max: 1200000, rate: 15 },
        { min: 1200000, max: 1500000, rate: 20 },
        { min: 1500000, max: null, rate: 30 }
      ];
      newRebateLimit = 700000;
      newMaxRebate = 25000; // Under revised slabs: 3-7L is 5% of 4L = 20,000 + rebate? It is up to 25k (covering tax up to 7L taxable income).
    }

    const newTaxResult = calculateTaxSlabs(newTaxableIncome, newSlabs);
    let newRebate = 0;
    let newMarginalRelief = 0;

    if (newTaxableIncome <= newRebateLimit) {
      newRebate = newTaxResult.totalTax;
    } else {
      // Marginal Relief: Tax liability cannot exceed excess income above the rebate limit
      const excessIncome = newTaxableIncome - newRebateLimit;
      if (newTaxResult.totalTax > excessIncome) {
        newMarginalRelief = newTaxResult.totalTax - excessIncome;
      }
    }

    const newTaxAfterRebateAndRelief = Math.max(0, newTaxResult.totalTax - newRebate - newMarginalRelief);
    const newCess = newTaxAfterRebateAndRelief * 0.04;
    const newFinalTax = newTaxAfterRebateAndRelief + newCess;

    // --- Recommendation & Optimization Tips ---
    const diff = Math.abs(oldFinalTax - newFinalTax);
    const recommendation = oldFinalTax < newFinalTax
      ? { regime: 'old', savings: diff, text: `Old Tax Regime is better. You save ₹${Math.round(diff).toLocaleString('en-IN')} annually.` }
      : { regime: 'new', savings: diff, text: `New Tax Regime is better. You save ₹${Math.round(diff).toLocaleString('en-IN')} annually.` };

    // Optimize suggestions for Old Regime if New is selected or if Old can be improved
    const suggestions = [];
    if (combined80C < 150000) {
      const remaining80C = 150000 - combined80C;
      suggestions.push({
        section: '80C',
        title: 'Maximize Section 80C',
        description: `Invest ₹${remaining80C.toLocaleString('en-IN')} more in PPF, ELSS, or NPS to save up to ₹${Math.round(remaining80C * 0.3).toLocaleString('en-IN')} in tax (at the 30% slab).`
      });
    }
    if (combined80D < 25000) {
      const remaining80D = 25000 - combined80D;
      suggestions.push({
        section: '80D',
        title: 'Health Insurance Premium',
        description: `Pay up to ₹${remaining80D.toLocaleString('en-IN')} in health insurance premiums for self/family to lower your taxable income.`
      });
    }
    if (combined80CCD < 50000) {
      const remainingCCD = 50000 - combined80CCD;
      suggestions.push({
        section: '80CCD(1B)',
        title: 'NPS Voluntary Contribution',
        description: `Contribute ₹${remainingCCD.toLocaleString('en-IN')} more to National Pension System (NPS) for exclusive deductions.`
      });
    }
    if (hraReceived > 0 && combinedHraRent === 0) {
      suggestions.push({
        section: 'HRA',
        title: 'Claim House Rent Allowance',
        description: 'Submit rent receipts to claim HRA tax exemption if you are staying in rented accommodation.'
      });
    }

    res.json({
      profile: {
        ...profile.toObject ? profile.toObject() : profile,
        // Send auto-detected values for visibility in frontend
        auto80C,
        auto80D,
        auto80CCD,
        autoSec24,
        autoHraRent
      },
      oldRegime: {
        grossIncome: totalGross,
        standardDeduction: oldStandardDeduction,
        hraExemption,
        capped80C,
        capped80D,
        capped80CCD,
        cappedSection24,
        totalDeductions: oldTotalDeductions,
        taxableIncome: oldTaxableIncome,
        taxBreakdown: oldTaxResult.breakdown,
        baseTax: oldTaxResult.totalTax,
        rebate: oldRebate,
        cess: oldCess,
        finalTax: oldFinalTax
      },
      newRegime: {
        grossIncome: totalGross,
        standardDeduction: newStandardDeduction,
        totalDeductions: newTotalDeductions,
        taxableIncome: newTaxableIncome,
        taxBreakdown: newTaxResult.breakdown,
        baseTax: newTaxResult.totalTax,
        rebate: newRebate,
        marginalRelief: newMarginalRelief,
        cess: newCess,
        finalTax: newFinalTax
      },
      recommendation,
      suggestions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
