import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';

interface WebhookPayload {
  status?: string;
  payment_status?: string;
  state?: string;
  external_reference?: string;
  order_id?: string;
  amount?: number;
  total_amount?: number;
  data?: any;
  payment?: any;
  checkout?: any;
}

interface InventoryItem {
  id: string;
  descripcion: string;
  cantidad: number;
  stockPorVariante?: Record<string, number>;
  coloresStock?: Record<string, number>;
}

interface OrderRecord {
  orderId: string;
  showroomId: string;
  total: number;
  estado: string;
  items: Array<{ productId: string; descripcion: string; cantidad: number; precioUnitario: number; talle?: string; color?: string }>;
}

function processWebhookRequest(
  req: { method: string; headers: Record<string, string>; body: WebhookPayload; rawBody?: string },
  webhookSecret: string | undefined,
  ordersDb: Record<string, OrderRecord>,
  salesDb: any[],
  inventoryDb: Record<string, InventoryItem> = {}
): { statusCode: number; body: string } {
  if (req.method !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (webhookSecret) {
    const receivedSecret = req.headers['x-webhook-secret'] || req.headers['authorization'] || '';
    const receivedSig = req.headers['x-uala-signature'] || req.headers['x-signature'] || '';

    let isValid = false;

    if (receivedSecret === webhookSecret || receivedSecret === `Bearer ${webhookSecret}`) {
      isValid = true;
    }

    if (!isValid && receivedSig) {
      try {
        const raw = req.rawBody || JSON.stringify(req.body || {});
        const calculatedSig = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
        
        const bufReceived = Buffer.from(receivedSig.toLowerCase(), 'utf8');
        const bufCalculated = Buffer.from(calculatedSig.toLowerCase(), 'utf8');
        if (bufReceived.length === bufCalculated.length && crypto.timingSafeEqual(bufReceived, bufCalculated)) {
          isValid = true;
        }
      } catch (err) {
        // ignore
      }
    }

    if (!isValid) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  const rawBody = req.body || {};
  const payload = rawBody.data || rawBody.payment || rawBody.checkout || rawBody;

  const status = (payload.status || payload.payment_status || payload.state || rawBody.status || '').toString().toUpperCase();
  const externalRef = (payload.external_reference || payload.order_id || payload.orderId || rawBody.external_reference || '').toString();

  if (!externalRef || typeof externalRef !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(externalRef)) {
    return { statusCode: 200, body: 'OK - Invalid or missing external reference' };
  }

  const order = ordersDb[externalRef];
  if (!order) {
    return { statusCode: 200, body: 'OK - Order not found' };
  }

  if (status !== 'APPROVED' && status !== 'SUCCESS' && status !== 'PAID') {
    if (['REJECTED', 'CANCELLED', 'FAILED', 'EXPIRED', 'REFUNDED'].includes(status)) {
      if (order.estado !== 'Cancelado') {
        // Si la orden estaba pendiente de pago, devolvemos el stock al inventario
        if (order.estado === 'PENDING_PAYMENT' || order.estado === 'Pendiente') {
          for (const oi of order.items) {
            const item = inventoryDb[oi.productId];
            if (item) {
              const returnQty = oi.cantidad || 1;
              if (item.stockPorVariante && oi.talle && oi.color) {
                const varKey = `${oi.talle}-${oi.color}`;
                item.stockPorVariante[varKey] = (item.stockPorVariante[varKey] || 0) + returnQty;
              }
              item.cantidad += returnQty;
            }
          }
        }
        order.estado = 'Cancelado';
      }
    }
    return { statusCode: 200, body: 'OK - Not approved' };
  }

  // Verificación de idempotencia
  if (['Confirmado', 'Enviado', 'Entregado', 'PAID'].includes(order.estado)) {
    return { statusCode: 200, body: 'OK - Already processed' };
  }

  // Verificación estricta anti-fraude de montos
  const orderTotal = Number(order.total || 0);
  const webhookAmount = Number(payload.amount || payload.total_amount || rawBody.amount || 0);

  if (webhookAmount > 0 && Math.abs(webhookAmount - orderTotal) > 1.0) {
    return { statusCode: 400, body: 'Error: Payment amount does not match order total' };
  }

  // Confirmación exitosa y registro de la venta
  order.estado = 'Confirmado';
  salesDb.push({
    id: `sale_web_${externalRef}`,
    total: orderTotal,
    items: order.items,
  });

  return { statusCode: 200, body: 'OK - Payment confirmed' };
}

describe('Uala Webhook - Confirmacion de Pagos, Errores y Validaciones Anti-Fraude', () => {
  let ordersDb: Record<string, OrderRecord>;
  let salesDb: any[];
  let inventoryDb: Record<string, InventoryItem>;

  beforeEach(() => {
    inventoryDb = {
      'p1': {
        id: 'p1',
        descripcion: 'Vestido',
        cantidad: 5,
        stockPorVariante: { 'M-Rojo': 2 }
      }
    };

    ordersDb = {
      'ORD-100': {
        orderId: 'ORD-100',
        showroomId: 'ROPERO',
        total: 15000,
        estado: 'PENDING_PAYMENT',
        items: [{ productId: 'p1', descripcion: 'Vestido', cantidad: 1, precioUnitario: 15000, talle: 'M', color: 'Rojo' }],
      },
    };
    salesDb = [];
  });

  it('rechaza metodos distintos de POST con codigo 405', () => {
    const req = { method: 'GET', headers: {}, body: {} };
    const res = processWebhookRequest(req, undefined, ordersDb, salesDb);
    expect(res.statusCode).toBe(405);
  });

  it('valida el secreto del webhook retornando 401 si no coincide', () => {
    const req = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secret-incorrecto' },
      body: { status: 'APPROVED', external_reference: 'ORD-100', amount: 15000 },
    };
    const res = processWebhookRequest(req, 'secreto-oficial', ordersDb, salesDb);
    expect(res.statusCode).toBe(401);
  });

  it('valida firma HMAC SHA-256 usando x-uala-signature', () => {
    const secret = 'secreto-oficial';
    const bodyObj = { status: 'APPROVED', external_reference: 'ORD-100', amount: 15000 };
    const rawBody = JSON.stringify(bodyObj);
    const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const req = {
      method: 'POST',
      headers: { 'x-uala-signature': validSig },
      body: bodyObj,
      rawBody
    };
    const res = processWebhookRequest(req, secret, ordersDb, salesDb);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK - Payment confirmed');
  });

  it('procesa payload anidado (data.status, data.external_reference) correctamente', () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        event: 'payment.approved',
        data: { status: 'APPROVED', external_reference: 'ORD-100', amount: 15000 }
      }
    };
    const res = processWebhookRequest(req, undefined, ordersDb, salesDb);
    expect(res.statusCode).toBe(200);
    expect(ordersDb['ORD-100'].estado).toBe('Confirmado');
  });

  it('ALERTA DE SEGURIDAD / ANTI-FRAUDE: bloquea confirmacion si el monto pagado difiere del total de la orden', () => {
    const req = {
      method: 'POST',
      headers: {},
      body: { status: 'APPROVED', external_reference: 'ORD-100', amount: 100 },
    };
    const res = processWebhookRequest(req, undefined, ordersDb, salesDb);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('does not match order total');
    expect(ordersDb['ORD-100'].estado).toBe('PENDING_PAYMENT');
    expect(salesDb).toHaveLength(0);
  });

  it('cancela la orden y DEVUELVE EL STOCK al inventario si el pago es REJECTED o CANCELLED', () => {
    const req = {
      method: 'POST',
      headers: {},
      body: { status: 'REJECTED', external_reference: 'ORD-100' },
    };
    const res = processWebhookRequest(req, undefined, ordersDb, salesDb, inventoryDb);
    expect(res.statusCode).toBe(200);
    expect(ordersDb['ORD-100'].estado).toBe('Cancelado');
    expect(inventoryDb['p1'].cantidad).toBe(6); // 5 + 1 devuelto
    expect(inventoryDb['p1'].stockPorVariante!['M-Rojo']).toBe(3); // 2 + 1 devuelto
    expect(salesDb).toHaveLength(0);
  });

  it('es idempotente: si la orden ya esta confirmada, responde OK sin duplicar ventas', () => {
    ordersDb['ORD-100'].estado = 'Confirmado';
    const req = {
      method: 'POST',
      headers: {},
      body: { status: 'APPROVED', external_reference: 'ORD-100', amount: 15000 },
    };
    const res = processWebhookRequest(req, undefined, ordersDb, salesDb);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK - Already processed');
    expect(salesDb).toHaveLength(0);
  });
});

