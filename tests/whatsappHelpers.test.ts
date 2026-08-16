import { describe, it, expect } from 'vitest';
import { buildOrderWhatsAppMessage } from '../utils/whatsappHelpers';

describe('buildOrderWhatsAppMessage', () => {
  it('genera un mensaje completo con prendas, cliente, envio y total', () => {
    const sampleOrder = {
      orderId: 'order_1700000000123',
      customerNombre: 'Sofía Pérez',
      customerTelefono: '1112345678',
      customerEmail: 'sofia@ejemplo.com',
      tipoEnvio: 'envio',
      direccionEnvio: {
        calle: 'Av. San Martín',
        numero: '382',
        localidad: 'Chivilcoy',
        provincia: 'Buenos Aires',
      },
      costoEnvio: 3500,
      metodoPago: 'Ualá Bis (Tarjeta)',
      items: [
        {
          descripcion: 'Remera Lino Floral',
          talle: 'M',
          color: 'Blanco',
          cantidad: 2,
          precioUnitario: 15000,
        },
        {
          descripcion: 'Pantalón Jean Slouchy',
          talle: '38',
          color: 'Azul',
          cantidad: 1,
          precioUnitario: 32000,
        },
      ],
      total: 65500,
    };

    const result = buildOrderWhatsAppMessage(sampleOrder, 'El Ropero');

    expect(result).toContain('🛍️ *Pedido Web #000123 — El Ropero Showroom*');
    expect(result).toContain('*Cliente:* SOFÍA PÉREZ');
    expect(result).toContain('*Teléfono:* 1112345678');
    expect(result).toContain('*Entrega:* Envío a domicilio');
    expect(result).toContain('*Dirección:* Av. San Martín 382 (Chivilcoy, Buenos Aires)');
    expect(result).toContain('*Método de Pago:* Ualá Bis (Tarjeta)');
    expect(result).toContain('1. REMERA LINO FLORAL (T: M) (C: Blanco) × 2 · $15.000');
    expect(result).toContain('2. PANTALÓN JEAN SLOUCHY (T: 38) (C: Azul) × 1 · $32.000');
    expect(result).toContain('*Subtotal Prendas:* $62.000');
    expect(result).toContain('*Costo Envío:* $3.500');
    expect(result).toContain('*TOTAL A PAGAR: $65.500*');
  });

  it('incluye una nota personalizada si se provee', () => {
    const sampleOrder = {
      orderId: 'order_999',
      customerNombre: 'Juan',
      items: [{ descripcion: 'Camisa', cantidad: 1, precioUnitario: 10000 }],
      total: 10000,
    };

    const result = buildOrderWhatsAppMessage(
      sampleOrder,
      'El Ropero',
      'Tuve un problema al realizar el pago. ¿Me podrías ayudar a completarlo?'
    );

    expect(result).toContain('💬 Tuve un problema al realizar el pago. ¿Me podrías ayudar a completarlo?');
  });
});
