export type Section = 'admin' | 'ventas' | 'stock' | 'gastos' | 'giftcards' | 'sitio' | 'pedidos';

export interface InventoryItem {
  id: string;
  sku: string;
  descripcion: string;
  proveedor: string;
  cantidad: number;
  costo: number;
  fechaIngreso?: string;   // fecha en que se cargó al stock

  // New fields
  categoria: string;
  talles: string[]; // e.g., ["S", "M", "L"]
  colores: string[]; // e.g., ["Negro", "Blanco"]
  coloresStock?: Record<string, number>; // Legacy color-only stock
  stockPorVariante?: Record<string, number>; // e.g., { "S-NEGRO": 5, "M-NEGRO": 2 }
  medidas?: string; // Detailed measurements text

  imagenes: string[]; // URLs of images

  // Precios base
  ventaEfectivo: number;
  ventaTarjeta: number;
  
  // Web visibility & discount
  visible?: boolean;
  descuentoWeb?: number; // discount percentage for this product (0-100)
  pesoKg?: number; // Custom weight for Correo Argentino
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
  talle?: string;   // variante seleccionada al vender
  color?: string;   // variante seleccionada al vender
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
  giftEmail?: string;         // opcional: email para enviar la gift card
  giftMensaje?: string;       // opcional: mensaje de la gift card
  giftDeParteDe?: string;     // opcional: de parte de quién
  costoEnvio?: number;
  costoEnvioDevolucion?: number;
  costoEnvioNuevo?: number;
  tipoEnvioDevolucion?: 'S' | 'D' | 'local';
  tipoEnvioNuevo?: 'S' | 'D' | 'local';
  codigoPostalCliente?: string;
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
  fechaEmision?: string;
  email?: string;
  mensaje?: string;
  medioPagoOrigen?: 'efectivo' | 'tarjeta' | 'mixto' | string;
  ventaOrigenId?: string;
  //saleId?: string;
}

export type SaleType = 'venta' | 'gift' | 'devolucion' | 'cambio' | 'anulacion' | 'ajuste-gift';

export interface WebSettings {
  heroImageUrl?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  storeName?: string;
  contactWhatsapp?: string;
  categoriesOrder?: string[];
  discountBySection?: Record<string, number>; // e.g. { "REMERAS": 20, "PANTALONES": 10 }
  instagramHandle?: string;
  /** Enlace de cobro Mercado Pago (transferencia) */
  mercadoPagoTransferUrl?: string;
  /** Alias MP para mostrar al cliente, ej. elropero.showroom */
  mercadoPagoAlias?: string;

  // Datos bancarios para transferencia
  bankTitular?: string;
  bankCbu?: string;
  bankAlias?: string;
  bankName?: string;

  announcementText?: string;
  aboutUsText?: string;
  locationShowroomAddress?: string;
  locationShowroomMapUrl?: string;
  locationPickupAddress?: string;
  locationPickupMapUrl?: string;

  // Visibility settings
  storeHidden?: boolean;
  storePausedMessage?: string;
  hiddenSections?: string[];

  // Ualá Bis Environment & Testing
  ualaEnvironment?: 'stage' | 'production';

  // Shipping fallback rates
  shippingRateCaba?: number;
  shippingRatePba?: number;
  shippingRateResto?: number;
  shippingExtraKgCost?: number;
}

export type { DatabaseState } from './services/storage';
