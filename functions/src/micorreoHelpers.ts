import * as functions from 'firebase-functions/v1';

/**
 * Obtain an authentication token from MiCorreo.
 */
export async function getMiCorreoToken(url: string, username: string, password: string): Promise<string> {
  if (!username || !password) {
    throw new Error('Faltan credenciales de MiCorreo (MICORREO_USERNAME o MICORREO_PASSWORD) en las variables de entorno del servidor.');
  }

  const authString = Buffer.from(`${username}:${password}`).toString('base64');
  const tokenResponse = await fetch(`${url}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authString}`,
      'Content-Type': 'application/json',
    },
  });

  if (!tokenResponse.ok) {
    const errTxt = await tokenResponse.text();
    console.error('Error al obtener token de MiCorreo:', errTxt);
    throw new Error(`Error de autenticación con Correo Argentino (${tokenResponse.status}): ${errTxt}`);
  }

  const tokenData: any = await tokenResponse.json();
  const token = tokenData.token;
  if (!token) {
    throw new Error('La respuesta de autenticación de MiCorreo no contiene token.');
  }
  return token;
}

/** Fetch rates from MiCorreo */
export async function fetchMiCorreoRates(url: string, token: string, payload: any): Promise<any> {
  const response = await fetch(`${url}/rates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errTxt = await response.text();
    console.error('Error al cotizar con MiCorreo:', errTxt);
    throw new functions.https.HttpsError('internal', `Error al calcular tarifas con Correo Argentino: ${errTxt}`);
  }
  return await response.json();
}

/** Fetch agencies (sucursales) */
export async function fetchMiCorreoAgencies(url: string, token: string, customerId: string, provinceCode: string): Promise<any> {
  const agenciesUrl = new URL(`${url}/agencies`);
  agenciesUrl.searchParams.append('customerId', customerId);
  agenciesUrl.searchParams.append('provinceCode', provinceCode);

  const response = await fetch(agenciesUrl.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errTxt = await response.text();
    console.error('Error al obtener sucursales con MiCorreo:', errTxt);
    throw new functions.https.HttpsError('internal', `Error al obtener sucursales de Correo Argentino: ${errTxt}`);
  }
  return await response.json();
}

/** Import shipping to MiCorreo */
interface ImportResult {
  importData: any;
  duplicate: boolean;
}
export async function fetchMiCorreoImport(url: string, token: string, payload: any, cleanOrderId: string): Promise<ImportResult> {
  const response = await fetch(`${url}/shipping/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errTxt = await response.text();
    if (response.status === 400 && (errTxt.includes('importada con anterioridad') || errTxt.includes('anterioridad'))) {
      return { importData: null, duplicate: true };
    }
    console.error('Error al importar envío a MiCorreo:', errTxt);
    throw new functions.https.HttpsError('internal', `Error al importar envío en MiCorreo (${response.status}): ${errTxt}`);
  }

  const importData = await response.json();
  return { importData, duplicate: false };
}

/** Fetch label PDF (or Base64) */
export async function fetchMiCorreoLabel(url: string, token: string, cleanOrderId: string): Promise<{ labelBase64: string }> {
  const response = await fetch(`${url}/orders/${cleanOrderId}/labels`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errTxt = await response.text();
    console.error('Error al obtener etiqueta de MiCorreo:', errTxt);
    throw new functions.https.HttpsError('not-found', 'La etiqueta de envío no se encuentra disponible por API. Podés imprimirla directamente ingresando al panel de Mi Correo Argentino.');
  }

  const contentType = response.headers.get('content-type') || '';
  let labelBase64 = '';
  if (contentType.includes('application/pdf')) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    labelBase64 = buffer.toString('base64');
  } else {
    const text = await response.text();
    try {
      const labelData = JSON.parse(text);
      labelBase64 = labelData.pdf || labelData.file || labelData.base64 || labelData.label || labelData.pdfBase64 || labelData.content || (typeof labelData === 'string' ? labelData : text);
    } catch {
      labelBase64 = text;
    }
  }
  return { labelBase64 };
}

/** Fetch tracking information */
export async function fetchMiCorreoTracking(url: string, token: string, customerId: string, trackingNumber: string): Promise<any> {
  const trackingUrl = new URL(`${url}/orders/tracking`);
  trackingUrl.searchParams.append('customerId', customerId);
  trackingUrl.searchParams.append('trackingNumber', trackingNumber);

  const response = await fetch(trackingUrl.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errTxt = await response.text();
    console.error('Error al consultar tracking con MiCorreo:', errTxt);
    throw new functions.https.HttpsError('internal', `Error al consultar el seguimiento en Correo Argentino: ${errTxt}`);
  }
  return await response.json();
}
