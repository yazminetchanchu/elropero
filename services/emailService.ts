import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface EmailData {
  to: string | string[];
  message: {
    subject: string;
    text?: string;
    html?: string;
  };
}

/**
 * Agrega un documento a la colección 'mail' de Firestore.
 * Requiere que la extensión "Trigger Email from Firestore" esté instalada
 * en Firebase Console con credenciales SMTP válidas para que los correos
 * sean enviados automáticamente.
 *
 * IMPORTANTE: No incluir el campo `from` aquí; la extensión usa el
 * remitente configurado en Firebase Console (evita rechazos silenciosos).
 */
export const sendNotificationEmail = async (subject: string, bodyText: string, htmlBody?: string, toEmail?: string | string[]) => {
  try {
    const mailData: EmailData = {
      to: toEmail || 'elropero.informacion@gmail.com',
      message: {
        subject,
        text: bodyText,
        html: htmlBody || bodyText.replace(/\n/g, '<br>'),
      },
    };
    const docRef = await addDoc(collection(db, 'mail'), mailData);
    console.log('[Email] Correo encolado para envío a:', mailData.to, '| Doc ID:', docRef.id);
  } catch (error: any) {
    // Loguear el error completo para diagnóstico (puede ser permisos de Firestore
    // o la extensión no instalada/configurada en Firebase Console).
    console.error('[Email] ERROR al encolar el correo en Firestore:', error?.code || error?.message || error);
    console.error('[Email] Destino intentado:', toEmail || 'elropero.informacion@gmail.com', '| Asunto:', subject);
  }
};

export interface SaleConfirmationData {
  id: string;
  fecha?: string;
  metodoPago?: string;
  costoEnvio?: number;
  pago?: { efectivo?: number; tarjeta?: number };
  items: Array<{
    descripcion?: string;
    talle?: string;
    color?: string;
    cantidad?: number;
    precioUnitario?: number;
    precioEfectivo?: number;
    precioTarjeta?: number;
    descuento?: number;
  }>;
  total: number;
  giftCardUsada?: {
    codigo: string;
    montoUsado: number;
  };
  descuento?: number;
}

/**
 * Genera y envía automáticamente un correo detallado de confirmación con la estética de la web
 * ("pedacito de la web"), incluyendo desglose ítem por ítem: prenda, talle, color, cantidad,
 * cómo pagó, hora, ID, descuentos, gift card y total final.
 */
export const sendSaleConfirmationEmail = async (
  sale: SaleConfirmationData,
  customerName?: string,
  customerEmail?: string,
  origen: 'web' | 'local' = 'local'
) => {
  try {
    const storeEmail = 'elropero.informacion@gmail.com';
    const recipients: string[] = [storeEmail];
    
    if (customerEmail && customerEmail.trim() && customerEmail.trim().toLowerCase() !== storeEmail) {
      recipients.push(customerEmail.trim().toLowerCase());
    }

    const cleanId = sale.id.replace(/^sale_web_/, '').replace(/^sale_/, '');
    const title = origen === 'web' 
      ? `🛍️ Compra Web Confirmada - ${customerName || 'Cliente'}`
      : `🛍️ Nueva Venta en Showroom - ${customerName || 'Cliente'}`;

    // Formateo de Fecha y Hora exactas
    const dateObj = new Date(sale.fecha || Date.now());
    const fechaFormatted = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : String(sale.fecha || '');
    const horaFormatted = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs'
      : '';
    const fechaHoraTexto = `${fechaFormatted}${horaFormatted ? ` - ${horaFormatted}` : ''}`;

    // Determinación precisa de "Cómo pagó"
    let comoPagoTexto = sale.metodoPago || '';
    if (!comoPagoTexto) {
      if (sale.pago?.tarjeta === 100) comoPagoTexto = 'Tarjeta de Crédito / Débito';
      else if (sale.pago?.efectivo === 100) comoPagoTexto = 'Efectivo / Transferencia';
      else if (sale.pago && (sale.pago.efectivo || sale.pago.tarjeta)) {
        comoPagoTexto = `Efectivo (${sale.pago.efectivo || 0}%) + Tarjeta (${sale.pago.tarjeta || 0}%)`;
      } else {
        comoPagoTexto = 'Pago Online';
      }
    }

    // Cuerpo de Texto Plano (para clientes sin HTML o vista previa)
    let textBody = `${title}\n`;
    textBody += `ID de Pedido: #${cleanId}\n`;
    textBody += `Fecha y Hora: ${fechaHoraTexto}\n`;
    textBody += `Cómo pagó: ${comoPagoTexto}\n\n`;
    textBody += `--- DETALLE DE PRENDAS ---\n`;

    let subtotalItems = 0;
    sale.items.forEach((item, index) => {
      const descripcion = item.descripcion || 'Prenda';
      const talleStr = item.talle ? ` [Talle: ${item.talle}]` : ' [Talle: Único]';
      const colorStr = item.color ? ` [Color: ${item.color}]` : ' [Color: Estándar]';
      const precioUnit = item.precioUnitario ?? item.precioEfectivo ?? item.precioTarjeta ?? 0;
      const subtotalItem = precioUnit * (item.cantidad || 1);
      subtotalItems += subtotalItem;
      
      textBody += `${index + 1}. ${descripcion}${talleStr}${colorStr}\n`;
      textBody += `   Cantidad: ${item.cantidad || 1} x $${precioUnit.toLocaleString('es-AR')} = $${subtotalItem.toLocaleString('es-AR')}\n`;
      
      if (item.descuento && item.descuento > 0) {
        textBody += `   ✨ Descuento en ítem: ${item.descuento}%\n`;
      }
    });

    textBody += `\n--------------------------\n`;
    if (sale.costoEnvio && sale.costoEnvio > 0) {
      textBody += `🚚 Costo de Envío: +$${sale.costoEnvio.toLocaleString('es-AR')}\n`;
    }
    if (sale.descuento && sale.descuento > 0) {
      textBody += `✨ Descuento Aplicado: -$${sale.descuento.toLocaleString('es-AR')}\n`;
    }
    if (sale.giftCardUsada) {
      textBody += `🎁 Gift Card (${sale.giftCardUsada.codigo}): -$${sale.giftCardUsada.montoUsado.toLocaleString('es-AR')}\n`;
    }
    textBody += `💰 TOTAL FINAL PAGADO: $${sale.total.toLocaleString('es-AR')}\n`;
    textBody += `--------------------------\n`;
    textBody += `¡Gracias por elegir El Ropero Showroom!`;

    // Formato HTML Luxury Boutique ("Pedacito de la Web") - Superior Aesthetic
    let itemsHtmlRows = '';
    sale.items.forEach((item) => {
      const descripcion = item.descripcion || 'Prenda';
      const precioUnit = item.precioUnitario ?? item.precioEfectivo ?? item.precioTarjeta ?? 0;
      const subtotalItem = precioUnit * (item.cantidad || 1);
      const discText = item.descuento && item.descuento > 0 ? `<br><span style="color: #2e7d32; font-size: 11px; font-weight: 600;">✨ Desc. ${item.descuento}%</span>` : '';
      const talleVal = item.talle || 'Único';
      const colorVal = item.color || 'Estándar';

      itemsHtmlRows += `
        <tr style="border-bottom: 1px solid #eaeaea;">
          <td style="padding: 16px 12px; color: #111111; font-weight: 600; font-size: 13px;">${descripcion}${discText}</td>
          <td style="padding: 16px 8px; text-align: center;">
            <span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${talleVal}</span>
          </td>
          <td style="padding: 16px 8px; text-align: center;">
            <span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${colorVal}</span>
          </td>
          <td style="padding: 16px 8px; text-align: center; color: #444444; font-weight: 600; font-size: 13px;">${item.cantidad || 1}</td>
          <td style="padding: 16px 12px; text-align: right; color: #111111; font-weight: 600; font-size: 13px;">$${subtotalItem.toLocaleString('es-AR')}</td>
        </tr>
      `;
    });

    let htmlBody = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
        <!-- Header Principal de la Web -->
        <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
          <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
          <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
        </div>

        <!-- Contenido Superior -->
        <div style="padding: 40px 32px; background-color: #ffffff;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 24px 0; letter-spacing: 0.5px;">🛍️ Compra Confirmada</h2>

          <div style="background-color: #f8f9fa; border: 1px solid #eaeaea; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
            <div style="font-size: 16px; color: #111111; font-weight: 700;">
              🖤 ¡Gracias por tu compra, ${customerName || 'Cliente'}!
            </div>
            <div style="font-size: 13px; color: #555555; margin-top: 6px; font-weight: 500;">
              Tu pago fue acreditado y tu pedido confirmado con éxito.
            </div>
          </div>

          <!-- Grid Resumen: ID, Fecha/Hora, Cómo Pagó -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 32px;">
            <tr>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #888888; font-weight: 600; margin-bottom: 6px;">ID Pedido</div>
                <div style="font-size: 15px; font-weight: 700; color: #111111;">#${cleanId}</div>
              </td>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #888888; font-weight: 600; margin-bottom: 6px;">Hora / Fecha</div>
                <div style="font-size: 13px; font-weight: 600; color: #111111; line-height: 1.3;">${fechaHoraTexto}</div>
              </td>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #888888; font-weight: 600; margin-bottom: 6px;">Cómo Pagó</div>
                <div style="font-size: 13px; font-weight: 600; color: #111111; line-height: 1.3;">${comoPagoTexto}</div>
              </td>
            </tr>
          </table>

          <!-- Tabla de Prendas -->
          <h3 style="font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #111111; font-weight: 700; margin: 0 0 16px 0; border-bottom: 2px solid #111111; padding-bottom: 8px;">
            Detalle de Prendas Seleccionadas
          </h3>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 32px;">
            <thead>
              <tr style="background-color: #f8f9fa; text-align: left; border-bottom: 2px solid #e0e0e0;">
                <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666;">Prenda</th>
                <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Talle</th>
                <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Color</th>
                <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Cant.</th>
                <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtmlRows}
            </tbody>
          </table>

          <!-- Tarjeta de Totales -->
          <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 24px;">
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666666;">Subtotal de Productos:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333333;">$${subtotalItems.toLocaleString('es-AR')}</td>
              </tr>
              ${sale.costoEnvio && sale.costoEnvio > 0 ? `
              <tr>
                <td style="padding: 8px 0; color: #666666;">🚚 Costo de Envío:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333333;">+$${sale.costoEnvio.toLocaleString('es-AR')}</td>
              </tr>
              ` : ''}
              ${sale.descuento && sale.descuento > 0 ? `
              <tr>
                <td style="padding: 8px 0; color: #2e7d32; font-weight: 500;">✨ Descuento Aplicado:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #2e7d32;">-$${sale.descuento.toLocaleString('es-AR')}</td>
              </tr>
              ` : ''}
              ${sale.giftCardUsada ? `
              <tr>
                <td style="padding: 8px 0; color: #d32f2f; font-weight: 500;">🎁 Gift Card (${sale.giftCardUsada.codigo}):</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #d32f2f;">-$${sale.giftCardUsada.montoUsado.toLocaleString('es-AR')}</td>
              </tr>
              ` : ''}
            </table>

            <div style="margin-top: 16px; border-top: 2px solid #111111; padding-top: 16px; display: flex; justify-content: space-between; align-items: center;">
              <table style="width: 100%;">
                <tr>
                  <td style="font-size: 16px; font-weight: 700; color: #111111; letter-spacing: 0.5px;">TOTAL ABONADO:</td>
                  <td style="text-align: right;">
                    <span style="background-color: #0a0a0a; color: #ffffff; padding: 10px 18px; border-radius: 8px; font-size: 18px; font-weight: 700; display: inline-block;">
                      $${sale.total.toLocaleString('es-AR')}
                    </span>
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </div>

        <!-- Pie de página Luxury -->
        <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
          <p style="font-size: 13px; color: #333333; font-weight: 600; margin: 0 0 6px 0;">EL ROPERO SHOWROOM</p>
          <p style="font-size: 11px; color: #777777; margin: 0 0 4px 0;">
            📍 San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web
          </p>
          <p style="font-size: 11px; color: #999999; margin: 8px 0 0 0; border-top: 1px solid #eeeeee; padding-top: 10px;">
            Notificación automática del sistema de ventas · Todos los derechos reservados
          </p>
        </div>
      </div>
    `;

    const mailData: EmailData = {
      to: recipients,
      message: {
        subject: title,
        text: textBody,
        html: htmlBody,
      },
    };

    const docRef = await addDoc(collection(db, 'mail'), mailData);
    console.log('[Email] Correo de confirmación (Web Aesthetic) encolado para:', recipients, '| Doc ID:', docRef.id);
  } catch (error: any) {
    console.error('[Email] ERROR al encolar correo detallado de venta:', error?.code || error?.message || error);
  }
};

/**
 * Genera y envía el correo de recuperación de contraseña con la estética de la web y el botón
 * exclusivo del sistema que redirige directo al portal de restablecimiento.
 */
export const sendCustomPasswordResetNotification = async (
  email: string,
  resetLink: string,
  userName?: string
) => {
  try {
    const targetEmail = email.trim().toLowerCase();
    const nombre = userName || 'Cliente';
    const title = '🔐 Recuperación de Contraseña';

    const textBody = `Hola ${nombre},\n\nHa solicitado restablecer su contraseña en El Ropero Showroom.\nPara continuar, ingrese al siguiente enlace:\n${resetLink}\n\nSi usted no realizó esta solicitud, puede ignorar este mensaje de seguridad.\n\nEl Ropero Showroom`;

    const htmlBody = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
        <!-- Banner del Encabezado -->
        <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
          <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
          <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
        </div>

        <!-- Contenido -->
        <div style="padding: 40px 32px; background-color: #ffffff;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 16px 0; letter-spacing: 0.5px;">${title}</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
            Hola <strong style="color: #111111;">${nombre}</strong>,<br><br>
            Recibimos una solicitud para restablecer la contraseña de tu cuenta asociada a este correo electrónico (<span style="color: #111111; font-weight: 500;">${targetEmail}</span>) en <strong>El Ropero Showroom</strong>.
          </p>

          <!-- Tarjeta con Botón de Restablecimiento del Sistema -->
          <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
            <p style="font-size: 13px; color: #666666; margin: 0 0 20px 0;">
              Haz clic en el siguiente botón seguro para crear una nueva contraseña y recuperar tu acceso de inmediato:
            </p>
            <a href="${resetLink}" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
              Restablecer mi contraseña
            </a>
            <p style="font-size: 11px; color: #888888; margin: 24px 0 0 0;">
              ¿El botón no responde? Copia y pega el siguiente enlace en tu navegador:<br>
              <span style="color: #4a4a4a; word-break: break-all; font-size: 11px;">${resetLink}</span>
            </p>
          </div>

          <!-- Aviso de seguridad -->
          <div style="border-left: 3px solid #e0e0e0; padding-left: 16px; margin-top: 28px;">
            <p style="font-size: 12px; line-height: 1.5; color: #777777; margin: 0;">
              🔒 <strong>Nota de Seguridad:</strong> Este enlace de recuperación se genera de forma única por nuestro sistema y expirará en 24 horas. Si no realizaste esta solicitud, puedes ignorar este mensaje; tu contraseña no será modificada.
            </p>
          </div>
        </div>

        <!-- Pie de página -->
        <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
          <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
          <p style="font-size: 11px; color: #999999; margin: 0;">
            San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web
          </p>
        </div>
      </div>
    `;

    const mailData: EmailData = {
      to: targetEmail,
      message: {
        subject: title + ' - El Ropero Showroom',
        text: textBody,
        html: htmlBody,
      },
    };

    const docRef = await addDoc(collection(db, 'mail'), mailData);
    console.log('[PasswordReset] Correo de recuperación con estética web encolado para:', targetEmail, '| Doc ID:', docRef.id);
  } catch (error: any) {
    console.error('[PasswordReset] ERROR al encolar correo de recuperación:', error?.code || error?.message || error);
  }
};

/**
 * Genera y envía el correo de bienvenida para nuevos usuarios/clientes con la estética
 * de la web ("pedacito de la web") de El Ropero Showroom.
 */
export const sendWelcomeEmail = async (
  email: string,
  userName?: string
) => {
  try {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) return;

    const nombre = userName || 'Cliente';
    const title = '✨ ¡Te damos la bienvenida a El Ropero Showroom!';

    const textBody = `Hola ${nombre},\n\n¡Bienvenido/a a la familia de El Ropero Showroom!\nYa podés disfrutar de promociones exclusivas, seguimiento de pedidos en tiempo real y guardar tus prendas favoritas en tu wishlist.\n\nVisitá nuestra tienda: https://elropero.ar\n\nShowroom: San Martín 382, Chivilcoy, Buenos Aires.\n¡Gracias por sumarte!`;

    const htmlBody = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
        <!-- Banner del Encabezado -->
        <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
          <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
          <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
        </div>

        <!-- Hero de Bienvenida -->
        <div style="padding: 40px 32px; background-color: #ffffff;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 24px 0; letter-spacing: 0.5px;">✨ ¡Bienvenido/a a la familia!</h2>

          <div style="background-color: #f8f9fa; border: 1px solid #eaeaea; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
            <div style="font-size: 16px; color: #111111; font-weight: 700;">
              🖤 ¡Nos alegra tenerte acá, ${nombre}!
            </div>
            <div style="font-size: 13px; color: #555555; margin-top: 6px; font-weight: 500;">
              Tu cuenta ha sido creada y activada con éxito en El Ropero Showroom.
            </div>
          </div>

          <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
            Te damos una cálida bienvenida a nuestro espacio de moda. Al registrarte, desbloqueás beneficios pensados exclusivamente para vos y una experiencia de compra diseñada para hacerte brillar:
          </p>

          <!-- Beneficios Grid 3 Cajas -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 32px;">
            <tr>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 20px; margin-bottom: 6px;">🏷️</div>
                <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Descuentos VIP</div>
                <div style="font-size: 12px; color: #666666; line-height: 1.4;">Acceso a promociones por pago en efectivo o transferencia.</div>
              </td>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 20px; margin-bottom: 6px;">📦</div>
                <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Seguimiento en Vivo</div>
                <div style="font-size: 12px; color: #666666; line-height: 1.4;">Consultá el estado de tus compras y guardá tus direcciones fácilmente.</div>
              </td>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 20px; margin-bottom: 6px;">💖</div>
                <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Tu Wishlist</div>
                <div style="font-size: 12px; color: #666666; line-height: 1.4;">Guardá tus prendas favoritas en tu lista de deseos personalizada.</div>
              </td>
            </tr>
          </table>

          <!-- Tarjeta con Botón de Tienda -->
          <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
            <p style="font-size: 14px; color: #333333; font-weight: 600; margin: 0 0 20px 0;">
              Descubrí las últimas tendencias que entraron al showroom hoy mismo:
            </p>
            <a href="https://elropero.ar" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
              Explorar Colección
            </a>
          </div>

          <!-- Dirección / Showroom Presencial -->
          <div style="border-left: 3px solid #8f8d85; padding-left: 16px; margin-top: 28px;">
            <p style="font-size: 12px; line-height: 1.5; color: #555555; margin: 0;">
              📍 <strong>¿Preferís probarte las prendas?</strong> Te invitamos a vivir la experiencia presencial en nuestro exclusivo showroom ubicado en <strong>San Martín 382, Chivilcoy, Buenos Aires</strong>. ¡Te esperamos!
            </p>
          </div>
        </div>

        <!-- Pie de página -->
        <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
          <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
          <p style="font-size: 11px; color: #999999; margin: 0;">
            San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web
          </p>
        </div>
      </div>
    `;

    const mailData: EmailData = {
      to: targetEmail,
      message: {
        subject: title,
        text: textBody,
        html: htmlBody,
      },
    };

    const docRef = await addDoc(collection(db, 'mail'), mailData);
    console.log('[WelcomeEmail] Correo de bienvenida con estética web encolado para:', targetEmail, '| Doc ID:', docRef.id);
  } catch (error: any) {
    console.error('[WelcomeEmail] ERROR al encolar correo de bienvenida:', error?.code || error?.message || error);
  }
};

/**
 * Genera y envía el correo de pedido cancelado, buscando alentar al cliente
 * a que vuelva a realizar su compra en la tienda web con estética luxury.
 */
export const sendOrderCancelledEmail = async (
  orderId: string,
  customerName?: string,
  customerEmail?: string,
  items: Array<{ descripcion?: string; talle?: string; color?: string; cantidad?: number; precioUnitario?: number }> = [],
  total?: number
) => {
  try {
    if (!customerEmail || !customerEmail.trim()) return;
    const targetEmail = customerEmail.trim().toLowerCase();
    const nombre = customerName || 'Cliente';
    const cleanId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '').replace(/^ORD-/, '');
    const title = `⚠️ Pedido Cancelado #${cleanId.substring(0, 8).toUpperCase()}`;

    const textBody = `Hola ${nombre},\n\nQueremos informarte que tu pedido #${cleanId.toUpperCase()} ha sido cancelado en El Ropero Showroom.\n¿Tuviste algún problema al procesar el pago o expiró el tiempo de reserva? ¡No te preocupes! Podés volver a realizar tu pedido ahora mismo antes de que se agote el stock en https://elropero.ar\n\nEl Ropero Showroom`;

    let itemsHtmlRows = '';
    items.forEach((item) => {
      const descripcion = item.descripcion || 'Prenda';
      const talleVal = item.talle || 'Único';
      const colorVal = item.color || 'Estándar';
      const subtotalItem = (item.precioUnitario || 0) * (item.cantidad || 1);

      itemsHtmlRows += `
        <tr style="border-bottom: 1px solid #eaeaea;">
          <td style="padding: 14px 12px; color: #111111; font-weight: 600; font-size: 13px;">${descripcion}</td>
          <td style="padding: 14px 8px; text-align: center;">
            <span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${talleVal}</span>
          </td>
          <td style="padding: 14px 8px; text-align: center;">
            <span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${colorVal}</span>
          </td>
          <td style="padding: 14px 8px; text-align: center; color: #444444; font-weight: 600; font-size: 13px;">${item.cantidad || 1}</td>
          <td style="padding: 14px 12px; text-align: right; color: #111111; font-weight: 600; font-size: 13px;">$${subtotalItem.toLocaleString('es-AR')}</td>
        </tr>
      `;
    });

    const htmlBody = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
        <!-- Banner del Encabezado -->
        <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
          <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
          <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
        </div>

        <!-- Contenido Superior -->
        <div style="padding: 40px 32px; background-color: #ffffff;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 24px 0; letter-spacing: 0.5px;">${title}</h2>

          <div style="background-color: #fffbfb; border: 1px solid #f8d7da; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
            <div style="font-size: 16px; color: #b71c1c; font-weight: 700;">
              ⚠️ Estado de tu pedido #${cleanId.substring(0, 8).toUpperCase()}
            </div>
            <div style="font-size: 13px; color: #c62828; margin-top: 6px; font-weight: 500;">
              Tu pedido figura como cancelado o expiró el tiempo de reserva.
            </div>
          </div>

          <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
            Hola <strong style="color: #111111;">${nombre}</strong>,<br><br>
            Te escribimos porque tu pedido ha sido cancelado en nuestro sistema. ¿Tuviste algún inconveniente con el pago o no llegaste a completar la compra? ¡No te preocupes! Tus prendas favoritas te están esperando en nuestra tienda:
          </p>

          ${items.length > 0 ? `
          <h3 style="font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #111111; font-weight: 700; margin: 0 0 16px 0; border-bottom: 2px solid #111111; padding-bottom: 8px;">
            Prendas que habías seleccionado
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 32px;">
            <thead>
              <tr style="background-color: #f8f9fa; text-align: left; border-bottom: 2px solid #e0e0e0;">
                <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666;">Prenda</th>
                <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Talle</th>
                <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Color</th>
                <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Cant.</th>
                <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtmlRows}
            </tbody>
          </table>
          ` : ''}

          <!-- Tarjeta con Botón de Re-compra -->
          <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
            <p style="font-size: 14px; color: #333333; font-weight: 600; margin: 0 0 20px 0;">
              Podés volver a realizar tu compra ahora mismo con un solo clic antes de que se agote el stock:
            </p>
            <a href="https://elropero.ar" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
              Volver a comprar
            </a>
          </div>

          <!-- Asistencia personalizada -->
          <div style="border-left: 3px solid #8f8d85; padding-left: 16px; margin-top: 28px;">
            <p style="font-size: 12px; line-height: 1.5; color: #555555; margin: 0;">
              💬 <strong>¿Preferís coordinar el pago por WhatsApp o en el local?</strong> Escribinos o visitanos en nuestro showroom en <strong>San Martín 382, Chivilcoy, Buenos Aires</strong> para apartar tus prendas. ¡Te esperamos!
            </p>
          </div>
        </div>

        <!-- Pie de página -->
        <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
          <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
          <p style="font-size: 11px; color: #999999; margin: 0;">
            San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web
          </p>
        </div>
      </div>
    `;

    const mailData: EmailData = {
      to: targetEmail,
      message: {
        subject: title + ' - El Ropero Showroom',
        text: textBody,
        html: htmlBody,
      },
    };

    const docRef = await addDoc(collection(db, 'mail'), mailData);
    console.log('[OrderCancelled] Correo de pedido cancelado encolado para:', targetEmail, '| Doc ID:', docRef.id);
  } catch (error: any) {
    console.error('[OrderCancelled] ERROR al encolar correo de pedido cancelado:', error?.code || error?.message || error);
  }
};

/**
 * Genera y envía un correo premium con el código de la Gift Card regalada.
 */
export const sendGiftCardEmail = async (
  email: string,
  destinatario: string,
  deParteDe: string,
  monto: number,
  codigo: string,
  mensaje: string
) => {
  try {
    const targetEmail = email.trim().toLowerCase();
    const title = `¡Tenés una Gift Card de regalo de ${deParteDe}!`;

    const textBody = `¡Hola ${destinatario}!\n\n${deParteDe} te envió una Gift Card de El Ropero Showroom por un valor de $${monto.toLocaleString('es-AR')}.\n\nTu código es: ${codigo}\n\nMensaje: ${mensaje}\n\nPodés usarla en nuestra tienda online: https://elropero.ar o presencialmente en nuestro showroom.\n\nEl Ropero Showroom`;

    const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
      <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
        <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
      </div>
      <div style="padding: 40px 32px; background-color: #ffffff;">
        <h2 style="font-size: 22px; font-weight: 600; color: #111111; margin: 0 0 16px 0; letter-spacing: 0.5px;">¡Tenés un regalo de ${deParteDe}!</h2>
        <p style="font-size: 15px; color: #555555; margin: 0 0 32px 0;">
          Hola <strong>${destinatario}</strong>, ${deParteDe} te envió una Gift Card para usar en nuestra tienda.
        </p>
        ${mensaje ? `
        <div style="background-color: #f8f9fa; border-left: 4px solid #8f8d85; padding: 16px 20px; margin-bottom: 32px; border-radius: 0 8px 8px 0; font-style: italic;">
          <p style="font-size: 15px; color: #4a4a4a; margin: 0;">"${mensaje}"</p>
        </div>` : ''}
        <div style="background: linear-gradient(135deg, #111111 0%, #2a2a2a 100%); border-radius: 16px; padding: 32px; position: relative; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); margin-bottom: 32px;">
          <div style="position: relative; z-index: 10;">
            <p style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #a3a3a3; font-weight: 600; margin: 0 0 8px 0;">Monto Disponible</p>
            <div style="font-size: 36px; font-weight: 700; color: #ffffff; margin-bottom: 24px; letter-spacing: -1px;">
              $${monto.toLocaleString('es-AR')}
            </div>
            <p style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #a3a3a3; font-weight: 600; margin: 0 0 8px 0;">Código de Canje</p>
            <div style="background-color: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 12px 20px; display: inline-block; font-size: 20px; font-family: monospace; font-weight: 700; color: #ffffff; letter-spacing: 2px;">
              ${codigo}
            </div>
          </div>
        </div>
        <p style="font-size: 14px; color: #555555; margin: 0 0 24px 0; line-height: 1.6; text-align: center;">
          Podés canjear tu Gift Card en nuestra tienda online agregando el código al momento de realizar la compra.
        </p>
        <div style="text-align: center; margin-top: 32px;">
          <a href="https://elropero.ar/" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">Ir a la Tienda</a>
        </div>
      </div>
    </div>
    `;

    const mailData: EmailData = {
      to: targetEmail,
      message: {
        subject: title,
        text: textBody,
        html: htmlBody,
      },
    };

    const docRef = await addDoc(collection(db, 'mail'), mailData);
    console.log('[GiftCardEmail] Correo de Gift Card encolado para:', targetEmail, '| Doc ID:', docRef.id);
  } catch (error: any) {
    console.error('[GiftCardEmail] ERROR al encolar correo de Gift Card:', error?.code || error?.message || error);
  }
};

