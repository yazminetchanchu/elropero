import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUalaEnvironment,
  setUalaEnvironment,
  getUalaAccessToken,
  createUalaPayment,
  testUalaConnection,
} from './ualaApi';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = axios as unknown as { post: ReturnType<typeof vi.fn> };

// Mock firebase auth
vi.mock('./firebase', () => ({
  auth: {
    currentUser: null,
  },
}));

import { auth } from './firebase';

describe('ualaApi Service - Integracion de Pasarela de Pagos Ualá Bis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (auth as any).currentUser = null;
  });

  describe('Reglas de Entorno y Seguridad (getUalaEnvironment)', () => {
    it('fuerza entorno Produccion para usuarios generales (sin permisos de test)', () => {
      (auth as any).currentUser = { email: 'cliente.comun@gmail.com' };
      localStorage.setItem('ropero_uala_env', 'stage');

      const env = getUalaEnvironment();
      expect(env).toBe('production');
    });

    it('permite entorno Stage unicamente para yazminetchanchu@gmail.com cuando esta configurado en localStorage', () => {
      (auth as any).currentUser = { email: 'yazminetchanchu@gmail.com' };
      localStorage.setItem('ropero_uala_env', 'stage');

      const env = getUalaEnvironment();
      expect(env).toBe('stage');
    });

    it('impide a usuarios no autorizados guardar entorno Stage mediante setUalaEnvironment', () => {
      (auth as any).currentUser = { email: 'otro@gmail.com' };
      setUalaEnvironment('stage');

      expect(localStorage.getItem('ropero_uala_env')).toBe('production');
    });
  });

  describe('getUalaAccessToken', () => {
    it('retorna token protegido por servidor sin exponer claves en el cliente', async () => {
      const token = await getUalaAccessToken();
      expect(token).toBe('SERVER_SECURED_TOKEN');
    });
  });

  describe('createUalaPayment', () => {
    it('envia el pedido a la Cloud Function y retorna paymentId y paymentUrl', async () => {
      const mockOrder = {
        id: 'ord_100',
        total: 5500,
        customerEmail: 'comprador@gmail.com',
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          paymentId: 'pay_999',
          paymentUrl: 'https://checkout.uala.com.ar/pay_999',
        },
      });

      const res = await createUalaPayment(
        mockOrder,
        'http://localhost:3000/exito',
        'http://localhost:3000/error'
      );

      expect(res.paymentId).toBe('pay_999');
      expect(res.paymentUrl).toBe('https://checkout.uala.com.ar/pay_999');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('createUalaCheckout'),
        expect.objectContaining({
          successUrl: 'https://elropero.ar/exito',
          failUrl: 'https://elropero.ar/error',
        })
      );
    });

    it('captura y relanza errores descriptivos provistos por el backend', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          data: { error: 'Monto de pago inválido o menor al mínimo.' },
        },
      });

      await expect(
        createUalaPayment({ total: 0 }, 'https://elropero.ar/ok', 'https://elropero.ar/err')
      ).rejects.toThrow('Monto de pago inválido o menor al mínimo.');
    });
  });

  describe('testUalaConnection', () => {
    it('retorna resultado exitoso al validar la conexion', async () => {
      (auth as any).currentUser = { email: 'yazminetchanchu@gmail.com' };
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          paymentId: 'pay_test',
          paymentUrl: 'https://checkout.uala.com.ar/test',
        },
      });

      const res = await testUalaConnection('stage');
      expect(res.success).toBe(true);
      expect(res.environment).toBe('stage');
      expect(res.paymentUrl).toBe('https://checkout.uala.com.ar/test');
    });
  });
});
