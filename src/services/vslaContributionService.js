/**
 * VSLA savings contribution via MoMo (Paystack)
 * Creates SavingsContribution (pending), initiates charge; webhook confirms and updates GroupWallet
 */
const vslDb = require('../models/vsl');
const paystackService = require('../services/paystackService');

function generateReference() {
  return `SAV-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Initiate a savings contribution via MoMo
 * @param {string} phone - Payer phone (e.g. 0555227753)
 * @param {string} userId - VSLA user ID
 * @param {string} groupId - Group ID
 * @param {number} amount - Amount in GHS
 * @param {string} momoProvider - mtn | vodafone | airteltigo
 * @param {string} [recordedBy] - VBA/user ID who recorded (optional)
 * @returns {Promise<{success: boolean, contributionId?: string, reference?: string, message: string}>}
 */
async function initiateContribution(phone, userId, groupId, amount, momoProvider = 'mtn', recordedBy = null) {
  if (!vslDb.isConfigured() || !vslDb.SavingsContribution) {
    return { success: false, message: 'VSLA database not configured' };
  }

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 0.1) {
    return { success: false, message: 'Invalid amount. Minimum GHS 0.10' };
  }

  const reference = generateReference();

  try {
    const contribution = await vslDb.SavingsContribution.create({
      groupId,
      userId,
      amount: amt,
      paymentMethod: 'momo',
      reference,
      status: 'pending',
      recordedBy: recordedBy || null,
    });

    const result = await paystackService.initiatePayment(phone, amt, reference, momoProvider);

    if (!result.success) {
      await contribution.update({ status: 'failed' });
      return {
        success: false,
        contributionId: contribution.id,
        reference,
        message: result.message || 'Payment failed',
      };
    }

    return {
      success: true,
      contributionId: contribution.id,
      reference,
      status: result.status,
      message: result.message || 'MoMo prompt sent. Complete payment on your phone.',
    };
  } catch (err) {
    console.error('VSLA contribution error:', err);
    return { success: false, message: err.message || 'Could not create contribution' };
  }
}

module.exports = { initiateContribution };
