const https = require('https');

// ==========================================
// CONFIGURACIÓN DEL TEST
// ==========================================

// 1. Reemplazá esto con el ID de un pedido real que esté en estado "Pendiente"
const ORDER_ID = "4EL0VU8Z"; 

// 2. Esta es tu URL pública del webhook
const WEBHOOK_URL = "https://us-central1-el-ropero-8989a.cloudfunctions.net/ualaWebhook";

// ==========================================

console.log(`🚀 Iniciando prueba de webhook para el pedido: ${ORDER_ID}...`);

// Este es el formato de datos simulado que enviaría Ualá Bis cuando un pago se aprueba
const payload = JSON.stringify({
  status: "APPROVED",
  external_reference: ORDER_ID,
  payment_id: "test_payment_123456",
  amount: 1000
});

const url = new URL(WEBHOOK_URL);

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log(`\n✅ Respuesta del Servidor (Status Code: ${res.statusCode}):`);
    console.log(responseData);
    
    if (res.statusCode === 200) {
      console.log('\n🎉 ¡El test se envió correctamente!');
      console.log('👉 Entrá a tu panel de administrador de la tienda y verificá si el pedido pasó a estado "Confirmado" y si la venta se registró en caja.');
    } else {
      console.log('\n❌ Hubo un error en el servidor.');
    }
  });
});

req.on('error', (e) => {
  console.error(`\n❌ Error de red: ${e.message}`);
});

req.write(payload);
req.end();
