import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulación de la lógica de procesamiento del Webhook de Uala Bis
interface WebhookPayload {
  status?: string;
  payment_status?: string;
  state?: string;
  external_reference?: string;
  order_id?: string;
  amount?: number;
  total_amount?: number;
}

interface OrderRecord {
  orderId: string;
  showroomId: string;
  total: number;
  estado: string;
  items: Array<{ productId: string; descripcion: string; cantidad: number; precioUnitario: number }>;
}

function processWebhookRequest(
  req: { method: string; headers: Record<string, string>; body: WebhookPayload },
  webhookSecret: string | undefined,
  ordersDb: Record<string, OrderRecord>,
  salesDb: any[]
): { statusCode: number; body: string } {
  if (req.method !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (webhookSecret) {
    const receivedSecret = req.headers['x-webhook-secret'] || req.headers['authorization'] || '';
    if (receivedSecret !== webhookSecret && receivedSecret !== `Bearer ${webhookSecret}`) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  const payload = req.body || {};
  const status = (payload.status || payload.payment_status || payload.state || '').toUpperCase();
  const externalRef = payload.external_reference || payload.order_id || '';

  if (!externalRef || typeof externalRef !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(externalRef)) {
    return { statusCode: 200, body: 'OK - Invalid or missing external reference' };
  }

  const order = ordersDb[externalRef];
  if (!order) {
    return { statusCode: 200, body: 'OK - Order not found' };
  }

  if (status !== 'APPROVED' && status !== 'SUCCESS') {
    if (['REJECTED', 'CANCELLED', 'FAILED'].includes(status)) {
      if (order.estado !== 'Cancelado') {
        order.estado = 'Cancelado';
      }
    }
    return { statusCode: 200, body: 'OK - Not approved' };
  }

  // Verificación de idempotencia
  if (['Confirmado', 'Enviado', 'Entregado'].includes(order.estado)) {
    return { statusCode: 200, body: 'OK - Already processed' };
  }

  // Verificación estricta anti-fraude de montos
  const orderTotal = Number(order.total || 0);
  const webhookAmount = Number(payload.amount || payload.total_amount || 0);

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

  beforeEach(() => {
    ordersDb = {
      'ORD-100': {
        orderId: 'ORD-100',
        showroomId: 'ROPERO',
        total: 15000,
        estado: 'Pendiente',
        items: [{ productId: 'p1', descripcion: 'Vestido', cantidad: 1, precioUnitario: 15000 }],
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

  it('procesa pago APROBADO correctamente actualizando orden y creando venta', () => {
    const req = {
      method: 'POST',
      headers: { 'x-webhook-secret': 'secreto-oficial' },
      body: { status: 'APPROVED', external_reference: 'ORD-100', amount: 15000 },
    };
    const res = processWebhookRequest(req, 'secreto-oficial', ordersDb, salesDb);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK - Payment confirmed');
    expect(ordersDb['ORD-100'].estado).toBe('Confirmado');
    expect(salesDb).toHaveLength(1);
    expect(salesDb[0].id).toBe('sale_web_ORD-100');
  });

  it('ALERTA DE SEGURIDAD / ANTI-FRAUDE: bloquea confirmacion si el monto pagado difiere del total de la orden', () => {
    const req = {
      method: 'POST',
      headers: {},
      body: { status: 'APPROVED', external_reference: 'ORD-100', amount: 100 }, // Intento de alteracion de monto ($100 vs $15000)
    };
    const res = processWebhookRequest(req, undefined, ordersDb, salesDb);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('does not match order total');
    expect(ordersDb['ORD-100'].estado).toBe('Pendiente');
    expect(salesDb).toHaveLength(0);
  });

  it('cancela la orden si el estado del pago es REJECTED o CANCELLED', () => {
    const req = {
      method: 'POST',
      headers: {},
      body: { status: 'REJECTED', external_reference: 'ORD-100' },
    };
    const res = processWebhookRequest(req, undefined, ordersDb, salesDb);
    expect(res.statusCode).toBe(200);
    expect(ordersDb['ORD-100'].estado).toBe('Cancelado');
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
