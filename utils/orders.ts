export interface SaleBreakdownParams {
  items: Array<{ price: number; quantity: number }>;
  appliedCreditNoteValue?: number; // Saldo de devolución/nota de crédito
  appliedGiftCardValue?: number;   // Saldo de Gift Card aplicado
  paymentMethodDiscount?: number;  // Porcentaje de descuento (ej: 10 para 10%)
}

export interface SaleBreakdownResult {
  grossTotal: number;
  totalCredited: number;
  discountAmount: number;
  finalAmountToPay: number;
  netRevenue: number;
}

/**
 * Calcula el desglose contable de una venta o cambio (Bug #9).
 * - Resta saldos a favor (Notas de Crédito y Gift Cards) antes de cobrar.
 * - Aplica descuentos por medio de pago exclusivamente sobre el excedente a abonar.
 * - Evita inflar falsamente los ingresos de caja.
 */
export const computeSaleBreakdown = ({
  items,
  appliedCreditNoteValue = 0,
  appliedGiftCardValue = 0,
  paymentMethodDiscount = 0
}: SaleBreakdownParams): SaleBreakdownResult => {
  // 1. Subtotal bruto de las prendas
  const grossTotal = (items || []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );

  // 2. Restar saldos a favor (Notas de Crédito y Gift Cards)
  const totalCredited = Math.max(0, (Number(appliedCreditNoteValue) || 0) + (Number(appliedGiftCardValue) || 0));
  const netBeforeDiscounts = Math.max(0, grossTotal - totalCredited);

  // 3. Aplicar descuento por medio de pago SOLO sobre el excedente a abonar
  const discountRate = Math.max(0, Number(paymentMethodDiscount) || 0) / 100;
  const discountAmount = Math.round(netBeforeDiscounts * discountRate);
  const finalAmountToPay = Math.max(0, netBeforeDiscounts - discountAmount);

  return {
    grossTotal: Math.round(grossTotal),
    totalCredited: Math.round(totalCredited),
    discountAmount,
    finalAmountToPay,
    netRevenue: finalAmountToPay
  };
};
