import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendNotificationEmail,
  sendSaleConfirmationEmail,
  sendGiftCardEmail,
  SaleConfirmationData,
} from '../services/emailService';

// Mock Firestore addDoc & collection
const mockAddDoc = vi.fn();
const mockCollection = vi.fn((_db, path) => path);

vi.mock('firebase/firestore', () => ({
  collection: (...args: any[]) => (mockCollection as any)(...args),
  addDoc: (...args: any[]) => (mockAddDoc as any)(...args),
}));

vi.mock('../services/firebase', () => ({
  db: {},
}));

describe('emailService - Notificaciones y Envíos de Correos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddDoc.mockResolvedValue({ id: 'mail-doc-123' });
  });

  describe('sendNotificationEmail', () => {
    it('encola un correo generico a la coleccion mail de Firestore con destinatario por defecto', async () => {
      await sendNotificationEmail('Asunto Test', 'Cuerpo de prueba');

      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'mail');
      expect(mockAddDoc).toHaveBeenCalledWith('mail', {
        to: 'elropero.informacion@gmail.com',
        message: {
          subject: 'Asunto Test',
          text: 'Cuerpo de prueba',
          html: 'Cuerpo de prueba',
        },
      });
    });

    it('permite especificar destinatario personalizado', async () => {
      await sendNotificationEmail('Notificacion', 'Mensaje', '<p>Mensaje</p>', 'cliente@test.com');

      expect(mockAddDoc).toHaveBeenCalledWith('mail', {
        to: 'cliente@test.com',
        message: {
          subject: 'Notificacion',
          text: 'Mensaje',
          html: '<p>Mensaje</p>',
        },
      });
    });

    it('no revienta la app si Firestore falla al encolar', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockAddDoc.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(sendNotificationEmail('Fail Test', 'Text')).resolves.not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('sendSaleConfirmationEmail', () => {
    const mockSale: SaleConfirmationData = {
      id: 'sale_web_ORD-777',
      fecha: '2026-07-28T14:30:00.000Z',
      metodoPago: 'Tarjeta Ualá',
      costoEnvio: 1500,
      pago: { tarjeta: 100 },
      items: [
        {
          descripcion: 'Vestido Floreado',
          talle: 'M',
          color: 'Rojo',
          cantidad: 1,
          precioUnitario: 8000,
        },
        {
          descripcion: 'Remera Basica',
          talle: 'S',
          color: 'Blanco',
          cantidad: 2,
          precioUnitario: 3000,
          descuento: 10,
        },
      ],
      total: 14000,
      giftCardUsada: {
        codigo: 'GIFT-2000',
        montoUsado: 1500,
      },
    };

    it('envia confirmacion de venta con desglose detallado a tienda y cliente', async () => {
      await sendSaleConfirmationEmail(mockSale, 'María Pérez', 'maria@cliente.com', 'web');

      expect(mockAddDoc).toHaveBeenCalledTimes(1);

      const addedPayload = mockAddDoc.mock.calls[0][1];
      expect(addedPayload.to).toContain('elropero.informacion@gmail.com');
      expect(addedPayload.to).toContain('maria@cliente.com');

      const { subject, text, html } = addedPayload.message;
      expect(subject).toContain('🛍️ Compra Web Confirmada - María Pérez');
      
      // Verificación de detalles en texto plano
      expect(text).toContain('ID de Pedido: #ORD-777');
      expect(text).toContain('Vestido Floreado [Talle: M] [Color: Rojo]');
      expect(text).toContain('Remera Basica [Talle: S] [Color: Blanco]');
      expect(text).toContain('🚚 Costo de Envío: +$1.500');
      expect(text).toContain('🎁 Gift Card (GIFT-2000): -$1.500');

      // Verificación de detalles en HTML
      expect(html).toContain('Vestido Floreado');
      expect(html).toContain('Remera Basica');
      expect(html).toContain('María Pérez');
      expect(html).toContain('GIFT-2000');
    });

    it('genera asunto apropiado para ventas locales en Showroom', async () => {
      await sendSaleConfirmationEmail(mockSale, 'Juan', undefined, 'local');

      const addedPayload = mockAddDoc.mock.calls[0][1];
      expect(addedPayload.message.subject).toContain('🛍️ Nueva Venta en Showroom - Juan');
      expect(addedPayload.to).toEqual(['elropero.informacion@gmail.com']);
    });
  });

  describe('sendGiftCardEmail', () => {
    it('encola el correo de envio de tarjeta de regalo virtual', async () => {
      await sendGiftCardEmail(
        'amiga@gmail.com',
        'Lucía',
        'Valentina',
        10000,
        'GIFT-LUCIA-2026',
        '¡Felices Fiestas!'
      );

      expect(mockAddDoc).toHaveBeenCalledWith('mail', {
        to: 'amiga@gmail.com',
        message: {
          subject: expect.stringContaining('Gift Card'),
          text: expect.stringContaining('GIFT-LUCIA-2026'),
          html: expect.stringContaining('GIFT-LUCIA-2026'),
        },
      });

      const payload = mockAddDoc.mock.calls[0][1];
      expect(payload.message.html).toContain('Lucía');
      expect(payload.message.html).toContain('Valentina');
      expect(payload.message.html).toContain('$10.000');
    });

    it('encola correctamente el correo de gift card generada por cambio a favor del cliente', async () => {
      await sendGiftCardEmail(
        'cliente@gmail.com',
        'María',
        'El Ropero Showroom',
        4500,
        'GIFT-CAMBIO-999',
        'Crédito a favor generado por cambio de prendas.'
      );

      const payload = mockAddDoc.mock.calls[0][1];
      expect(payload.to).toBe('cliente@gmail.com');
      expect(payload.message.subject).toContain('Gift Card');
      expect(payload.message.text).toContain('GIFT-CAMBIO-999');
      expect(payload.message.text).toContain('Crédito a favor generado por cambio de prendas.');
      expect(payload.message.html).toContain('GIFT-CAMBIO-999');
      expect(payload.message.html).toContain('$4.500');
    });
  });

  describe('sendTransferReservationEmail', () => {
    const mockOrder = {
      orderId: 'ORD-TRANSFER-8888',
      customerNombre: 'Valentina Rossi',
      customerEmail: 'valentina@cliente.com',
      customerTelefono: '1155443322',
      fecha: '2026-08-28T18:00:00.000Z',
      items: [
        {
          descripcion: 'Blusa de Seda',
          talle: 'S',
          color: 'Blanco',
          cantidad: 2,
          precioUnitario: 12000,
        },
        {
          descripcion: 'Pantalón Lino',
          talle: 'M',
          color: 'Beige',
          cantidad: 1,
          precioUnitario: 20000,
        }
      ],
      total: 41000,
      costoEnvio: 2000,
      giftCardUsada: {
        codigo: 'GIFT-5000',
        montoUsado: 5000,
      }
    };

    const mockSettings = {
      storeName: 'EL ROPERO',
      contactWhatsapp: '5492346685836',
      bankTitular: 'Danisa Guzman',
      bankCbu: '0000003100037658598052',
      bankAlias: 'Danisa.guz.03',
      bankName: 'Mercado Pago'
    };

    it('envía email de reserva por transferencia con prendas completas, datos bancarios y aviso de 24 hs', async () => {
      const { sendTransferReservationEmail } = await import('../services/emailService');
      await sendTransferReservationEmail(mockOrder, mockSettings);

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      const [col, payload] = mockAddDoc.mock.calls[0];
      expect(col).toBe('mail');

      // Recipients
      expect(payload.to).toContain('elropero.informacion@gmail.com');
      expect(payload.to).toContain('valentina@cliente.com');

      // Subject
      expect(payload.message.subject).toContain('Reserva de Pedido');
      expect(payload.message.subject).toContain('Datos para Transferencia');

      // 1. Detalle del pedido con talle, color, cantidad y precio
      expect(payload.message.text).toContain('Blusa de Seda');
      expect(payload.message.text).toContain('[Talle: S]');
      expect(payload.message.text).toContain('[Color: Blanco]');
      expect(payload.message.text).toContain('Pantalón Lino');
      expect(payload.message.text).toContain('[Talle: M]');
      expect(payload.message.text).toContain('[Color: Beige]');

      expect(payload.message.html).toContain('Blusa de Seda');
      expect(payload.message.html).toContain('S');
      expect(payload.message.html).toContain('Blanco');
      expect(payload.message.html).toContain('Pantalón Lino');
      expect(payload.message.html).toContain('M');
      expect(payload.message.html).toContain('Beige');

      // 2. Total a transferir con envío y Gift Card
      expect(payload.message.text).toContain('Costo de Envío: +$2.000');
      expect(payload.message.text).toContain('Gift Card (GIFT-5000): -$5.000');
      expect(payload.message.text).toContain('TOTAL A TRANSFERIR: $41.000');

      expect(payload.message.html).toContain('+$2.000');
      expect(payload.message.html).toContain('-$5.000');
      expect(payload.message.html).toContain('$41.000');

      // 3. Datos de la cuenta bancaria
      expect(payload.message.text).toContain('Titular: Danisa Guzman');
      expect(payload.message.text).toContain('Banco / Entidad: Mercado Pago');
      expect(payload.message.text).toContain('Alias: Danisa.guz.03');
      expect(payload.message.text).toContain('CBU / CVU: 0000003100037658598052');

      expect(payload.message.html).toContain('Danisa Guzman');
      expect(payload.message.html).toContain('Mercado Pago');
      expect(payload.message.html).toContain('Danisa.guz.03');
      expect(payload.message.html).toContain('0000003100037658598052');

      // 4. Alerta de expiración de 24 horas
      const expirationNotice = 'Tenés un plazo de 24 horas para realizar la transferencia y adjuntar tu comprobante. Pasado ese tiempo, la reserva de las prendas se cancela automáticamente y vuelven al stock disponible.';
      expect(payload.message.text).toContain(expirationNotice);
      expect(payload.message.html).toContain('Tenés un plazo de <strong>24 horas</strong> para realizar la transferencia');
    });
  });
});
