import { doc, collection } from 'firebase/firestore';
import { db } from './services/firebase';
import { reserveWebOrderStock, fulfillWebOrder } from './services/webOrderFulfillment';
import { sendNotificationEmail } from './services/emailService';

async function run() {
  // Corregido el showroomId para que apunte al entorno de pruebas / default local
  const showroomId = 'EL-ROPERO-TEST';
  const orderId = `order_${Date.now()}`;
  
  const orderData = {
    customerId: 'GUEST',
    customerEmail: 'yazminetchanchu@gmail.com',
    customerNombre: 'YAZMIN ETCHANCHU',
    customerTelefono: '1112345678',
    fecha: new Date().toISOString(),
    items: [
      {
        productId: 'inv_1769798198738',
        descripcion: 'short pollera',
        sku: 'E2023',
        cantidad: 1,
        precioUnitario: 51000,
        talle: 'Único',
        color: 'Estándar',
        payMethod: 'tarjeta'
      }
    ],
    total: 37500, // 34000 + 3500 envio
    tipoEnvio: 'envio',
    direccionEnvio: {
      id: 'addr_sim',
      provincia: 'Ciudad Autónoma de Buenos Aires',
      localidad: 'CABA',
      calle: 'Av. Siempre Viva',
      numero: '742',
      pisoDepto: 'PB',
      codigoPostal: '1000',
      esPrincipal: true
    },
    costoEnvio: 3500,
    metodoPago: 'Ualá Bis',
    estado: 'Pendiente'
  };

  console.log(`1. Reservando stock para la orden ${orderId} en showroom ${showroomId}...`);
  await reserveWebOrderStock(showroomId, orderId, orderData);
  console.log('Stock reservado correctamente.');

  console.log(`2. Confirmando la orden (impacta en caja)...`);
  const saleId = await fulfillWebOrder(showroomId, orderId, orderData as any);
  console.log(`Orden confirmada con Sale ID: ${saleId}`);

  console.log(`3. Enviando email de confirmación con formato real...`);
  
  // Utilizar la función que tiene el template HTML real ("pedacito de la web")
  const { sendSaleConfirmationEmail } = await import('./services/emailService');
  
  const saleDataToEmail = {
    id: saleId,
    fecha: orderData.fecha,
    metodoPago: orderData.metodoPago,
    costoEnvio: orderData.costoEnvio,
    total: orderData.total,
    items: orderData.items,
    pago: { efectivo: 0, tarjeta: 100 }
  };
  
  await sendSaleConfirmationEmail(saleDataToEmail, orderData.customerNombre, orderData.customerEmail, 'web');
  
  console.log('Email estético (HTML) encolado correctamente.');

  process.exit(0);
}

run().catch((e) => {
  console.error('Error durante la simulación:', e);
  process.exit(1);
});
