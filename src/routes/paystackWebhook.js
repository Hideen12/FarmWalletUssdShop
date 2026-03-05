/**
 * Paystack webhook handler
 * Events: charge.success, charge.failed
 * Handles: Rice sales (SALE-*) and VSLA savings contributions (SAV-*)
 * Set URL in Paystack Dashboard: https://your-domain/api/paystack/webhook
 */
const { Op } = require('sequelize');
const db = require('../models');
const vslDb = require('../models/vsl');
const paystackService = require('../services/paystackService');

module.exports = async (req, res) => {
  try {
    const rawBody = req.body;
    const payload = Buffer.isBuffer(rawBody) ? rawBody.toString() : String(rawBody || '');
    const event = JSON.parse(payload || '{}');

    if (event.event === 'charge.success') {
      const ref = event.data?.reference || '';
      if (!ref) return res.status(200).send('OK');

      // VSLA savings contribution (SAV-*)
      if (ref.startsWith('SAV-') && vslDb.isConfigured() && vslDb.SavingsContribution && vslDb.GroupWallet) {
        const contribution = await vslDb.SavingsContribution.findOne({
          where: { reference: ref, status: 'pending' },
        });
        if (contribution) {
          const txn = await vslDb.sequelize.transaction();
          try {
            await contribution.update({ status: 'confirmed' }, { transaction: txn });
            const wallet = await vslDb.GroupWallet.findOne({
              where: { groupId: contribution.groupId },
              transaction: txn,
            });
            if (wallet) {
              const amt = Number(contribution.amount || 0);
              await wallet.increment('mainBalance', { by: amt, transaction: txn });
            }
            await txn.commit();
            console.log(`Paystack charge.success: VSLA contribution ${ref} -> confirmed, GHS ${contribution.amount} to group ${contribution.groupId}`);
          } catch (err) {
            await txn.rollback();
            console.error('VSLA webhook txn error:', err);
          }
        }
        return res.status(200).send('OK');
      }

      // Rice sale (SALE-*)
      const sale = await db.Sale.findOne({
        where: { [Op.or]: [{ mtn_reference: ref }, { momo_reference: ref }] },
        include: [{ model: db.Exhibitor, attributes: ['id', 'momo_number', 'momo_provider', 'name'] }],
      });
      if (!sale) {
        console.warn('Paystack webhook: sale not found for', ref);
        return res.status(200).send('OK');
      }

      await sale.update({ momo_status: 'completed' });

      const exhibitorReceives = Number(sale.amount) - Number(sale.farmwallet_commission || 0);
      const transfer = await paystackService.transferToExhibitor(
        sale.Exhibitor.momo_number,
        exhibitorReceives,
        `PAYOUT-${sale.momo_reference}`,
        `FarmWallet Rice sale - ${sale.Exhibitor.name}`,
        sale.Exhibitor.name,
        sale.Exhibitor.momo_provider || 'mtn'
      );
      if (transfer.success) {
        console.log(`Paystack transfer initiated: GHS ${exhibitorReceives} to ${sale.Exhibitor.momo_number}`);
      }
      console.log(`Paystack charge.success: ${ref} -> completed`);
    } else if (event.event === 'charge.failed') {
      const ref = event.data?.reference || '';
      if (ref.startsWith('SAV-') && vslDb.isConfigured() && vslDb.SavingsContribution) {
        const contribution = await vslDb.SavingsContribution.findOne({ where: { reference: ref } });
        if (contribution) await contribution.update({ status: 'failed' });
        console.log('Paystack charge.failed: VSLA contribution', ref);
      } else {
        const sale = await db.Sale.findOne({ where: { [Op.or]: [{ mtn_reference: ref }, { momo_reference: ref }] } });
        if (sale) await sale.update({ momo_status: 'failed' });
        console.log('Paystack charge.failed:', ref);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Paystack webhook error:', err);
    res.status(500).send('Error');
  }
};
