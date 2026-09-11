async function testAuth() {
  const username = process.env.MICORREO_USERNAME;
  const password = process.env.MICORREO_PASSWORD;
  const baseUrl = process.env.MICORREO_BASE_URL || "https://api.correoargentino.com.ar/micorreo/v1";
  const customerId = process.env.MICORREO_CUSTOMER_ID || process.env.MICORREO_CLIENTE_ID;

  if (!username || !password || !customerId) {
    console.error("❌ Error: Faltan variables de entorno para la prueba.");
    console.error("Uso: MICORREO_USERNAME=... MICORREO_PASSWORD=... MICORREO_CUSTOMER_ID=... node test_micorreo.js");
    process.exit(1);
  }

  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const response = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`
      }
    });

    const data = await response.json();
    const token = data.token;
    
    // Now let's try rates
    const payload = {
      customerId: customerId,
      postalCodeOrigin: "6620",
      postalCodeDestination: "1000",
      deliveredType: "D", 
      dimensions: {
        weight: 1000,
        height: 10,
        width: 20,
        length: 30
      }
    };

    const apiRes = await fetch(`${baseUrl}/rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log("Rates Status:", apiRes.status);
    if (!apiRes.ok) {
        console.log("Rates error:", await apiRes.text());
    } else {
        console.log("Rates Data:", await apiRes.json());
    }

  } catch (err) {
    console.error("Fetch error:", err);
  }
}

testAuth();
