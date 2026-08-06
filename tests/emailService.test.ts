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
  collection: (...args: any[]) => mockCollection(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
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
  });
});
