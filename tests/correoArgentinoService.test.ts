import { describe, it, expect, vi } from 'vitest';
import {
  getItemWeightGrams,
  calculateCartWeightKg,
  calculateCartWeightGrams,
  calculateCartDimensions,
  CATEGORY_WEIGHTS_GRAMS,
} from '../utils/shippingHelpers';
import { InventoryItem } from '../types';
import { cotizarEnvio, generarEnvioManual, obtenerEtiquetaPdf, obtenerTracking, obtenerSucursales } from '../services/correoArgentinoService';

// Mock de firebase/functions
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn((functionsInstance, functionName) => {
    return async (data: any) => {
      if (functionName === 'cotizarEnvio') {
        if (!data.codigoPostalDestino) throw new Error('El código postal de destino es requerido.');
        return {
          data: {
            costoEnvio: data.deliveredType === 'S' ? 4200 : 5500,
            rates: { rates: [{ price: data.deliveredType === 'S' ? 4200 : 5500 }] }
          }
        };
      }
      if (functionName === 'obtenerSucursales') {
        return {
          data: {
            sucursales: [
              { agency_id: 'E0001', agency_name: 'Sucursal Central', location: { state_name: 'Buenos Aires', zip_code: '1000' } }
            ]
          }
        };
      }
      if (functionName === 'generarEnvioManual') {
        return {
          data: {
            success: true,
            trackingNumber: 'TN-123456789-AR'
          }
        };
      }
      if (functionName === 'obtenerEtiquetaPdf') {
        return {
          data: {
            labelBase64: 'JVBERi0xLjQKJS...[MOCK_PDF_BASE64]...'
          }
        };
      }
      if (functionName === 'obtenerTracking') {
        if (!data.trackingNumber) throw new Error('El número de seguimiento es requerido.');
        return {
          data: {
            success: true,
            tracking: {
              trackingNumber: data.trackingNumber,
              quantity: 1,
              event: [
                { facility: 'Centro Logístico Chivilcoy', statusId: '1', status: 'PAQUETE INGRESADO', date: '2026-08-11 10:00', sign: 'OK' },
                { facility: 'Planta CTT Monte Grande', statusId: '2', status: 'EN TRANSITO', date: '2026-08-11 15:30', sign: 'OK' }
              ]
            }
          }
        };
      }
      return { data: {} };
    };
  })
}));

describe('Calculos de Envio y Logistica (shippingHelpers)', () => {
  const baseItem: InventoryItem = {
    id: 'p1',
    sku: 'SKU1',
    descripcion: 'Remera de Algodón',
    proveedor: 'Prov A',
    cantidad: 10,
    costo: 1000,
    ventaEfectivo: 2000,
    ventaTarjeta: 2200,
    categoria: 'Remeras Manga Corta',
    talles: ['S'],
    colores: ['Blanco'],
    imagenes: [],
  };

  describe('getItemWeightGrams', () => {
    it('retorna el peso explicito en gramos si el producto tiene pesoKg', () => {
      const itemWithWeight: InventoryItem = { ...baseItem, pesoKg: 1.2 };
      expect(getItemWeightGrams(itemWithWeight)).toBe(1200);
    });

    it('determina el peso por categoria normalizada (Musculosas)', () => {
      const item: InventoryItem = { ...baseItem, categoria: 'Musculosas y Tops' };
      expect(getItemWeightGrams(item)).toBe(CATEGORY_WEIGHTS_GRAMS['musculosas']);
    });

    it('determina el peso por categoria (Jeans)', () => {
      const item: InventoryItem = { ...baseItem, categoria: 'Jeans y Denim' };
      expect(getItemWeightGrams(item)).toBe(CATEGORY_WEIGHTS_GRAMS['jeans']);
    });

    it('retorna peso por defecto (400g) para categorias no registradas', () => {
      const item: InventoryItem = { ...baseItem, categoria: 'Accesorios Raros' };
      expect(getItemWeightGrams(item)).toBe(400);
    });
  });

  describe('calculateCartWeightKg y calculateCartWeightGrams', () => {
    it('calcula el peso total del carrito en kg y en gramos', () => {
      const cart = [
        { product: { ...baseItem, categoria: 'musculosas' }, quantity: 2 }, // 150g * 2 = 300g
        { product: { ...baseItem, categoria: 'jeans' }, quantity: 1 },      // 800g * 1 = 800g
      ]; // Total = 1100g = 1.1kg

      expect(calculateCartWeightGrams(cart)).toBe(1100);
      expect(calculateCartWeightKg(cart)).toBe(1.1);
    });

    it('garantiza un peso minimo de 1000g / 1kg para carritos vacios o sin peso', () => {
      expect(calculateCartWeightGrams([])).toBe(1000);
      expect(calculateCartWeightKg([])).toBe(1);
    });
  });

  describe('calculateCartDimensions', () => {
    it('devuelve dimensiones estandar (20x25x5 cm) para pedidos livianos o pocos items pesados', () => {
      const cart = [
        { product: { ...baseItem, categoria: 'musculosas' }, quantity: 2 },
        { product: { ...baseItem, categoria: 'jeans' }, quantity: 2 }, // pesados (>300g) = 2 items
      ];

      const dims = calculateCartDimensions(cart);
      expect(dims).toEqual({ width: 20, length: 25, height: 5 });
    });

    it('devuelve dimensiones mas grandes (30x35x10 cm) cuando hay mas de 3 prendas pesadas (>300g)', () => {
      const cart = [
        { product: { ...baseItem, categoria: 'buzos_sweaters_tejidos' }, quantity: 4 }, // 750g * 4 > 3 pesados
      ];

      const dims = calculateCartDimensions(cart);
      expect(dims).toEqual({ width: 30, length: 35, height: 10 });
    });
  });
});

describe('Servicio de API Correo Argentino - Cotización, Gestión de Órdenes y Tracking', () => {
  describe('Pilar 1: Cotización (cotizarEnvio)', () => {
    it('calcula tarifa a domicilio correctamente usando CP destino, peso y dimensiones', async () => {
      const result = await cotizarEnvio({
        codigoPostalDestino: '1425',
        codigoPostalOrigen: '6620',
        pesoGramos: 1200,
        dimensiones: { height: 10, width: 20, length: 30 },
        deliveredType: 'D'
      });
      expect(result.costoEnvio).toBe(5500);
    });

    it('calcula tarifa a sucursal diferencial correctamente', async () => {
      const result = await cotizarEnvio({
        codigoPostalDestino: '5000',
        pesoGramos: 800,
        deliveredType: 'S'
      });
      expect(result.costoEnvio).toBe(4200);
    });

    it('obtiene las sucursales habilitadas para una provincia', async () => {
      const sucursales = await obtenerSucursales('B');
      expect(sucursales.length).toBeGreaterThan(0);
      expect(sucursales[0].agency_id).toBe('E0001');
    });
  });

  describe('Pilar 2: Gestión de Órdenes (generarEnvioManual y obtenerEtiquetaPdf)', () => {
    it('da de alta la orden y devuelve un número de guía oficial de seguimiento', async () => {
      const orderMock = {
        id: 'ord-123',
        customerNombre: 'Juan Pérez',
        customerEmail: 'juan@test.com',
        tipoEnvio: 'envio',
        direccionEnvio: { calle: 'San Martin', numero: '100', localidad: 'Chivilcoy', provincia: 'Buenos Aires', codigoPostal: '6620' }
      };

      const result = await generarEnvioManual('ord-123', orderMock);
      expect(result.success).toBe(true);
      expect(result.trackingNumber).toBe('TN-123456789-AR');
    });

    it('obtiene la etiqueta PDF en base64 para imprimir', async () => {
      const pdfBase64 = await obtenerEtiquetaPdf('ord-123');
      expect(pdfBase64).toContain('JVBERi0x');
    });
  });

  describe('Pilar 3: Tracking Logístico (obtenerTracking)', () => {
    it('consulta el estado logistico y devuelve el historial de eventos del paquete', async () => {
      const trackingResult = await obtenerTracking('TN-123456789-AR');
      expect(trackingResult).not.toBeNull();
      expect(trackingResult?.trackingNumber).toBe('TN-123456789-AR');
      expect(trackingResult?.event.length).toBe(2);
      expect(trackingResult?.event[0].status).toBe('PAQUETE INGRESADO');
      expect(trackingResult?.event[1].status).toBe('EN TRANSITO');
    });
  });
});
