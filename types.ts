export type Section = 'admin' | 'ventas' | 'stock' | 'gastos' | 'giftcards';

export interface InventoryItem {
  id: string;
  sku: string;
  descripcion: string;
  proveedor: string;
  cantidad: number;
  costo: number;
  fechaIngreso?: string;   // fecha en que se cargó al stock

  // Precios base
  ventaEfectivo: number;
  ventaTarjeta: number;
}

export interface SaleItem {
  id: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  precioEfectivo: number;
  precioTarjeta: number;
  descuento: number;
}

export interface Sale {
  id: string;
  fecha: string;
  items: SaleItem[];
  total: number;
  tipo: SaleType;

  giftCardUsada?: {
    codigo: string;
    montoUsado: number;
  };

  itemsDevueltos?: SaleItem[];
  itemsNuevos?: SaleItem[];
  diferencia?: number;

  pagoDevolucion?: {
    efectivo: number;
    tarjeta: number;
  };  

  pago?: {
    efectivo: number;
    tarjeta: number;
  };

  ventaOriginalId?: string;
  giftGeneradaId?: string;
  giftDestinatario?: string;  // destinatario de la gift card auto-generada en cambio
}

export interface Expense {
  id: string;
  fecha: string;
  monto: number;
  concepto: string;
}

export interface MonthlyClosure {
  id: string; // formato YYYY-MM
  month: number;
  year: number;
  gananciaNeta: number;
  cajaEfectivo: number;
  cajaTarjeta: number;
  gastos: number;
  fechaCierre: string;
}

export interface GiftCard {
  id: string;
  codigo: string;
  destinatario: string;
  montoInicial: number;
  saldo: number;
  estado: 'ACTIVA' | 'AGOTADA' | 'ANULADA';
  fechaCreacion: string;
  //saleId?: string;
}

export type SaleType = 'venta' | 'gift' | 'devolucion' | 'cambio' | 'anulacion' | 'ajuste-gift';
