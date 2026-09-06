/** فاتورة عيّنة لمعاينة القوالب في المصمّم وقائمة القوالب (تُحسب مجاميعها بالمحرّك المركزي). */
import type { Invoice } from '@shared/invoicing'
import type { Language } from '@shared/settings'
import { calcTotals } from '@modules/invoices/shared/calc'

export function sampleInvoice(language: Language, currency: string): Invoice {
  const items = language === 'ar'
    ? [
        { name: 'تصميم هوية بصرية', description: 'شعار + دليل استخدام', quantityMilli: 1000, unit: 'خدمة', unitPriceMinor: 4500000, discountBps: 0, taxBps: 1900 },
        { name: 'تطوير موقع إلكتروني', description: 'موقع تعريفي متجاوب', quantityMilli: 1000, unit: 'مشروع', unitPriceMinor: 12000000, discountBps: 1000, taxBps: 1900 },
        { name: 'ساعة استشارة', description: '', quantityMilli: 3500, unit: 'ساعة', unitPriceMinor: 800000, discountBps: 0, taxBps: 900 }
      ]
    : language === 'fr'
      ? [
          { name: 'Identité visuelle', description: 'Logo + charte graphique', quantityMilli: 1000, unit: 'forfait', unitPriceMinor: 4500000, discountBps: 0, taxBps: 1900 },
          { name: 'Développement site web', description: 'Site vitrine responsive', quantityMilli: 1000, unit: 'projet', unitPriceMinor: 12000000, discountBps: 1000, taxBps: 1900 },
          { name: 'Heure de conseil', description: '', quantityMilli: 3500, unit: 'h', unitPriceMinor: 800000, discountBps: 0, taxBps: 900 }
        ]
      : [
          { name: 'Brand identity design', description: 'Logo + guidelines', quantityMilli: 1000, unit: 'service', unitPriceMinor: 4500000, discountBps: 0, taxBps: 1900 },
          { name: 'Website development', description: 'Responsive showcase site', quantityMilli: 1000, unit: 'project', unitPriceMinor: 12000000, discountBps: 1000, taxBps: 1900 },
          { name: 'Consulting hour', description: '', quantityMilli: 3500, unit: 'h', unitPriceMinor: 800000, discountBps: 0, taxBps: 900 }
        ]
  const totals = calcTotals({ lines: items, paidMinor: 5000000 })
  const customer = language === 'ar'
    ? { displayName: 'شركة النور للتجارة — أحمد بن يوسف', companyName: 'شركة النور للتجارة', address: 'شارع ديدوش مراد 12', city: 'الجزائر', country: 'الجزائر', phone: '0550 12 34 56', email: 'contact@alnour.dz', taxId: '001234567890123', customerNumber: 'CUS-00012' }
    : { displayName: 'Atelier Lumière — Sarah Martin', companyName: 'Atelier Lumière', address: '12 rue de la République', city: 'Lyon', country: 'France', phone: '+33 6 12 34 56 78', email: 'contact@lumiere.fr', taxId: 'FR12345678901', customerNumber: 'CUS-00012' }
  return {
    id: 0, docType: 'invoice', number: 'INV-2026-00045', status: 'partially_paid', customerId: null, customerSnapshot: customer, companySnapshot: {},
    issueDate: '2026-09-06', dueDate: '2026-10-06', reference: 'REF-2026-09', purchaseOrder: 'PO-4471', currency, currencyPosition: 'after', paymentMethod: 'bank_transfer',
    notes: language === 'ar' ? 'شكرًا لتعاملكم معنا. يُرجى ذكر رقم الفاتورة عند الدفع.' : language === 'fr' ? 'Merci de votre confiance. Merci de rappeler le numéro de facture lors du paiement.' : 'Thank you for your business. Please quote the invoice number when paying.',
    paymentTerms: language === 'ar' ? 'الدفع خلال 30 يومًا من تاريخ الإصدار.' : language === 'fr' ? 'Paiement à 30 jours à compter de la date d\'émission.' : 'Payment due within 30 days of the issue date.',
    templateId: null, subtotalMinor: totals.subtotalMinor, discountTotalMinor: totals.discountTotalMinor, taxableMinor: totals.taxableMinor, taxTotalMinor: totals.taxTotalMinor,
    shippingMinor: 0, feesMinor: 0, grandTotalMinor: totals.grandTotalMinor, paidMinor: totals.paidMinor, remainingMinor: totals.remainingMinor, amountInWords: true, pdfPath: null,
    source: 'manual', sourceDocumentId: null, isDemo: true, deletedAt: null, createdAt: '', updatedAt: '',
    items: items.map((it, i) => ({ ...it, id: i + 1, position: i, productId: null, taxName: `TVA ${it.taxBps / 100}%`, ...totals.lines[i] })),
    payments: []
  }
}
