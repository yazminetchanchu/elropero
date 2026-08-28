import { describe, it, expect } from 'vitest';
import { 
  transferLineTotal, 
  sumTransferLines, 
  calcExchangeLineTotal, 
  sumExchangeLines,
  generateFriendlyGiftCardCode,
  calculateExchangeBreakdown,
  extractProductModelKey,
  FRIENDLY_GIFT_CHARS
} from './exchangePricing';
import { SaleItem } from '../types';

describe('exchangePricing service', () => {
  it('transferLineTotal: sin descuento extra', () => {
    const total = transferLineTotal({
      precioEfectivo: 100,
      precioTarjeta: 120,
      cantidad: 2,
      descuento: 20 // Mismo que el base
    });
    expect(total).toBe(200);
  });

  it('transferLineTotal: con descuento extra', () => {
    const total = transferLineTotal({
      precioEfectivo: 100,
      precioTarjeta: 120,
      cantidad: 2,
      descuento: 30 // 10% extra por encima del base
    });
    expect(total).toBe(180);
  });

  it('sumTransferLines: suma varios items', () => {
    const items: SaleItem[] = [
      { id: '1', sku: 'A', descripcion: 'A', costo: 50, precioEfectivo: 100, precioTarjeta: 120, cantidad: 1, descuento: 20 },
      { id: '2', sku: 'B', descripcion: 'B', costo: 40, precioEfectivo: 200, precioTarjeta: 240, cantidad: 2, descuento: 30 },
    ];
    const sum = sumTransferLines(items);
    expect(sum).toBe(460);
  });

  it('calcExchangeLineTotal y sumExchangeLines: soporta tarjeta (isTransferencia = false)', () => {
    const items: SaleItem[] = [
      { id: '1', sku: 'A', descripcion: 'A', costo: 50, precioEfectivo: 1000, precioTarjeta: 1270, cantidad: 2, descuento: 10 },
    ];
    const lineTotal = calcExchangeLineTotal(items[0], false);
    expect(lineTotal).toBe(2286);

    const totalSum = sumExchangeLines(items, false);
    expect(totalSum).toBe(2286);
  });

  describe('generateFriendlyGiftCardCode', () => {
    it('genera códigos con formato GC-XXXX-XXXX y caracteres legibles sin 0, O, 1, I', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateFriendlyGiftCardCode();
        expect(code).toMatch(/^GC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
        expect(code).not.toContain('0');
        expect(code).not.toContain('O');
        expect(code).not.toContain('1');
        expect(code).not.toContain('I');
      }
    });

    it('respeta la lista de existentes garantizando unicidad', () => {
      const existing = ['GC-AAAA-BBBB', 'GC-CCCC-DDDD'];
      const newCode = generateFriendlyGiftCardCode(existing);
      expect(existing).not.toContain(newCode);
    });
  });

  describe('calculateExchangeBreakdown - Ley de Defensa del Consumidor & Multi-ítem', () => {
    it('Caso 1.1: Mismo producto (talle/color) tras aumento de precio -> Diferencia $0', () => {
      // Comprado en promo a 8.000, ahora cuesta 10.000
      const devuelto: SaleItem = {
        id: 'prod_remera_1',
        productId: 'prod_remera_1',
        sku: 'REM-1',
        descripcion: 'Remera Negra (Talle M)',
        costo: 3000,
        precioEfectivo: 8000,
        precioTarjeta: 10000,
        cantidad: 1,
        descuento: 20
      };

      const nuevo = {
        id: 'prod_remera_1',
        productId: 'prod_remera_1',
        descripcion: 'Remera Negra (Talle L)',
        cantidad: 1,
        precioUnitario: 10000
      };

      const res = calculateExchangeBreakdown({
        itemsDevueltos: [devuelto],
        itemsNuevos: [nuevo],
        isTransferenciaDev: true,
        isTransferenciaNuevo: true
      });

      expect(res.matchedPairsCount).toBe(1);
      expect(res.diferenciaSinEnvio).toBe(0);
      expect(res.diferenciaTotal).toBe(0);
      expect(res.montoAPagar).toBe(0);
      expect(res.montoGiftCard).toBe(0);
    });

    it('Caso 1.2: Distinto modelo tras aumento de promo -> Cliente abona diferencia ($2.000)', () => {
      // Comprado a 8.000 neto, nueva prenda cuesta 10.000
      const devuelto: SaleItem = {
        id: 'prod_remera_1',
        productId: 'prod_remera_1',
        sku: 'REM-1',
        descripcion: 'Remera Negra (Talle M)',
        costo: 3000,
        precioEfectivo: 8000,
        precioTarjeta: 10000,
        cantidad: 1,
        descuento: 20
      };

      const nuevoDistinto = {
        id: 'prod_pantalon_2',
        productId: 'prod_pantalon_2',
        descripcion: 'Pantalón Cargo (Talle 40)',
        cantidad: 1,
        precioUnitario: 10000
      };

      const res = calculateExchangeBreakdown({
        itemsDevueltos: [devuelto],
        itemsNuevos: [nuevoDistinto],
        isTransferenciaDev: true,
        isTransferenciaNuevo: true
      });

      expect(res.matchedPairsCount).toBe(0);
      expect(res.totalNewUnmatchedCost).toBe(10000);
      expect(res.totalReturnedUnmatchedCredit).toBe(8000);
      expect(res.diferenciaSinEnvio).toBe(2000);
      expect(res.montoAPagar).toBe(2000);
      expect(res.montoGiftCard).toBe(0);
    });

    it('Caso 2.1: Mismo producto cuando entra en promo -> Mano a mano directo ($0)', () => {
      // Comprado a 10.000, hoy cuesta 8.000
      const devuelto: SaleItem = {
        id: 'prod_remera_1',
        productId: 'prod_remera_1',
        sku: 'REM-1',
        descripcion: 'Remera Negra (Talle M)',
        costo: 3000,
        precioEfectivo: 10000,
        precioTarjeta: 12000,
        cantidad: 1,
        descuento: 20
      };

      const nuevoMismo = {
        id: 'prod_remera_1',
        productId: 'prod_remera_1',
        descripcion: 'Remera Negra (Talle XL)',
        cantidad: 1,
        precioUnitario: 8000
      };

      const res = calculateExchangeBreakdown({
        itemsDevueltos: [devuelto],
        itemsNuevos: [nuevoMismo],
        isTransferenciaDev: true,
        isTransferenciaNuevo: true
      });

      expect(res.matchedPairsCount).toBe(1);
      expect(res.diferenciaSinEnvio).toBe(0);
      expect(res.diferenciaTotal).toBe(0);
      expect(res.montoGiftCard).toBe(0);
      expect(res.montoAPagar).toBe(0);
    });

    it('Caso 2.2: Distinto producto cuando entra en promo -> Saldo a favor / Gift Card ($2.000)', () => {
      // Comprado a 10.000, nueva prenda cuesta 8.000
      const devuelto: SaleItem = {
        id: 'prod_remera_1',
        productId: 'prod_remera_1',
        sku: 'REM-1',
        descripcion: 'Remera Negra (Talle M)',
        costo: 3000,
        precioEfectivo: 10000,
        precioTarjeta: 12000,
        cantidad: 1,
        descuento: 20
      };

      const nuevoDistinto = {
        id: 'prod_short_3',
        productId: 'prod_short_3',
        descripcion: 'Short Lino (Talle S)',
        cantidad: 1,
        precioUnitario: 8000
      };

      const res = calculateExchangeBreakdown({
        itemsDevueltos: [devuelto],
        itemsNuevos: [nuevoDistinto],
        isTransferenciaDev: true,
        isTransferenciaNuevo: true
      });

      expect(res.matchedPairsCount).toBe(0);
      expect(res.totalNewUnmatchedCost).toBe(8000);
      expect(res.totalReturnedUnmatchedCredit).toBe(10000);
      expect(res.diferenciaSinEnvio).toBe(-2000);
      expect(res.montoGiftCard).toBe(2000);
      expect(res.montoAPagar).toBe(0);
    });

    it('Multi-ítem: Devuelve 2 unidades de A y elige 1 de A (nuevo talle) + 1 de B -> 1 matching 1:1 ($0) y 1 crédito neto vs B', () => {
      // 2 unidades de A compradas a 8.000 cada una (total abonado original: 16.000)
      const devuelto2A: SaleItem = {
        id: 'prod_A',
        productId: 'prod_A',
        sku: 'PROD-A',
        descripcion: 'Remera Tokio (Negro - M)',
        costo: 3000,
        precioEfectivo: 8000,
        precioTarjeta: 10000,
        cantidad: 2,
        descuento: 20
      };

      // 1 de A nuevo talle (hoy cuesta 10.000) + 1 de B distinta prenda (cuesta 10.000)
      const nuevoA = {
        id: 'prod_A',
        productId: 'prod_A',
        descripcion: 'Remera Tokio (Negro - XL)',
        quantity: 1,
        precioUnitario: 10000
      };

      const nuevoB = {
        id: 'prod_B',
        productId: 'prod_B',
        descripcion: 'Pantalón Lino (Blanco - 42)',
        quantity: 1,
        precioUnitario: 10000
      };

      const res = calculateExchangeBreakdown({
        itemsDevueltos: [devuelto2A],
        itemsNuevos: [nuevoA, nuevoB],
        isTransferenciaDev: true,
        isTransferenciaNuevo: true
      });

      // 1 unidad de A emparejada con nuevo A ($0)
      expect(res.matchedPairsCount).toBe(1);
      // La segunda unidad de A ($8.000 crédito) va contra nuevo B ($10.000)
      expect(res.unmatchedReturnedUnits.length).toBe(1);
      expect(res.unmatchedReturnedUnits[0].paidAmount).toBe(8000);
      expect(res.unmatchedNewUnits.length).toBe(1);
      expect(res.unmatchedNewUnits[0].currentPrice).toBe(10000);

      // Diferencia = 10.000 (B) - 8.000 (A2) = 2.000
      expect(res.diferenciaSinEnvio).toBe(2000);
      expect(res.montoAPagar).toBe(2000);
      expect(res.montoGiftCard).toBe(0);
    });

    it('Multi-ítem con saldo a favor: 2 de A (pagados 10k c/u) cambiados por 1 de A (hoy 8k) + 1 de B (5k) -> Gift Card de $5.000', () => {
      const devuelto2A: SaleItem = {
        id: 'prod_A',
        productId: 'prod_A',
        sku: 'PROD-A',
        descripcion: 'Remera Tokio (Negro - M)',
        costo: 3000,
        precioEfectivo: 10000,
        precioTarjeta: 12000,
        cantidad: 2,
        descuento: 20
      };

      const nuevoA = {
        id: 'prod_A',
        productId: 'prod_A',
        descripcion: 'Remera Tokio (Negro - L)',
        quantity: 1,
        precioUnitario: 8000
      };

      const nuevoB = {
        id: 'prod_B',
        productId: 'prod_B',
        descripcion: 'Top Rib (Rosa - S)',
        quantity: 1,
        precioUnitario: 5000
      };

      const res = calculateExchangeBreakdown({
        itemsDevueltos: [devuelto2A],
        itemsNuevos: [nuevoA, nuevoB],
        isTransferenciaDev: true,
        isTransferenciaNuevo: true
      });

      expect(res.matchedPairsCount).toBe(1); // 1:1 mano a mano A -> $0
      expect(res.totalNewUnmatchedCost).toBe(5000); // B
      expect(res.totalReturnedUnmatchedCredit).toBe(10000); // A2 crédito original
      expect(res.diferenciaSinEnvio).toBe(-5000);
      expect(res.montoGiftCard).toBe(5000);
      expect(res.montoAPagar).toBe(0);
    });
  });
});
