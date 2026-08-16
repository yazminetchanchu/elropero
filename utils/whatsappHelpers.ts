/**
 * Genera el texto estructurado para el mensaje de WhatsApp de una orden de compra web.
 * Incluye datos del cliente, método de entrega, prendas (descripción, talle, color, cantidad, precio),
 * subtotal, costo de envío, gift card y total a pagar.
 */
export function buildOrderWhatsAppMessage(
  order: any,
  storeName: string = 'El Ropero',
  customNote?: string
): string {
  const store = (storeName || 'El Ropero').trim();
  const rawId = order?.orderId || order?.id || '';
  const shortId = rawId ? rawId.replace(/^sale_web_/, '').replace(/^sale_/, '').slice(-6).toUpperCase() : '';

  let msg = `🛍️ *Pedido Web${shortId ? ` #${shortId}` : ''} — ${store} Showroom*\n\n`;

  if (order?.customerNombre) {
    msg += `*Cliente:* ${String(order.customerNombre).trim().toUpperCase()}\n`;
  }
  if (order?.customerTelefono) {
    msg += `*Teléfono:* ${String(order.customerTelefono).trim()}\n`;
  }
  if (order?.customerEmail) {
    msg += `*Email:* ${String(order.customerEmail).trim()}\n`;
  }

  if (order?.tipoEnvio) {
    const entregaLabel =
      order.tipoEnvio === 'envio'
        ? 'Envío a domicilio'
        : order.tipoEnvio === 'envio_sucursal'
        ? 'Envío a Sucursal'
        : 'Retiro por local';
    msg += `*Entrega:* ${entregaLabel}\n`;
  }

  if (order?.tipoEnvio === 'envio' && order?.direccionEnvio) {
    const addr = order.direccionEnvio;
    msg += `*Dirección:* ${addr.calle || ''} ${addr.numero || ''}`;
    if (addr.pisoDepto) msg += ` - ${addr.pisoDepto}`;
    if (addr.localidad || addr.provincia) {
      msg += ` (${[addr.localidad, addr.provincia].filter(Boolean).join(', ')})`;
    }
    msg += '\n';
    if (addr.indicaciones) msg += `*Indicaciones:* ${addr.indicaciones}\n`;
  } else if (order?.tipoEnvio === 'envio_sucursal' && order?.sucursalCorreoArgentino) {
    const suc = order.sucursalCorreoArgentino;
    const nameOrCode = suc.name || suc.code || '';
    msg += `*Sucursal Elegida:* ${nameOrCode}${suc.code ? ` (${suc.code})` : ''}\n`;
    if (suc.location?.address) {
      const a = suc.location.address;
      msg += `*Dirección:* ${a.streetName || ''} ${a.streetNumber || ''}, ${a.locality || ''}, ${a.province || ''}\n`;
    }
  }

  if (order?.metodoPago) {
    msg += `*Método de Pago:* ${order.metodoPago}\n`;
  }

  const items = order?.items || [];
  if (Array.isArray(items) && items.length > 0) {
    msg += '\n*Detalle de prendas:*\n';
    items.forEach((item: any, i: number) => {
      const desc = item.descripcion || item.product?.descripcion || 'Prenda';
      msg += `${i + 1}. ${String(desc).toUpperCase()}`;
      const talle = item.talle || item.selectedTalle;
      if (talle) msg += ` (T: ${talle})`;
      const color = item.color || item.selectedColor;
      if (color) msg += ` (C: ${color})`;
      const qty = item.cantidad || item.quantity || 1;
      const unitPrice = item.precioUnitario !== undefined ? item.precioUnitario : (item.price || 0);
      msg += ` × ${qty} · $${Number(unitPrice).toLocaleString('es-AR')}\n`;
    });
  }

  if (order?.costoEnvio !== undefined && Number(order.costoEnvio) > 0) {
    const subtotalPrendas = (items || []).reduce((acc: number, it: any) => {
      const q = it.cantidad || it.quantity || 1;
      const p = it.precioUnitario !== undefined ? it.precioUnitario : (it.price || 0);
      return acc + Number(p) * Number(q);
    }, 0);
    if (subtotalPrendas > 0) {
      msg += `\n*Subtotal Prendas:* $${subtotalPrendas.toLocaleString('es-AR')}`;
    }
    msg += `\n*Costo Envío:* $${Number(order.costoEnvio).toLocaleString('es-AR')}`;
  }

  if (order?.giftCardUsada) {
    const gcCode = order.giftCardUsada.codigo || '';
    const gcMonto = order.giftCardUsada.montoUsado || 0;
    msg += `\n*Gift Card Aplicada:* ${gcCode} (-$${Number(gcMonto).toLocaleString('es-AR')})`;
  }

  const totalFinal = order?.total !== undefined ? Number(order.total) : 0;
  msg += `\n━━━━━━━━━━━━━━━\n*TOTAL A PAGAR: $${Math.round(totalFinal).toLocaleString('es-AR')}*`;

  if (customNote) {
    msg += `\n\n💬 ${customNote}`;
  }

  return msg;
}
