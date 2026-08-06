import axios from 'axios';
import { auth } from '../../services/firebase';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export type UalaEnvironment = 'stage' | 'production';

export function getUalaEnvironment(): UalaEnvironment {
  // REGLA ESTRICTA DE SEGURIDAD: El entorno de pruebas (stage/sandbox) SOLO está permitido para el perfil yazminetchanchu@gmail.com.
  // Para cualquier otro usuario (clientes reales, invitados, etc.), el entorno SIEMPRE es Producción.
  const currentUserEmail = auth?.currentUser?.email?.toLowerCase() || '';
  const isAllowedTestUser = currentUserEmail === 'yazminetchanchu@gmail.com';

  if (!isAllowedTestUser) {
    return 'production';
  }

  // 1. Prioridad: configuración en localStorage (guardado desde el Admin o consola de dev)
  const localEnv = localStorage.getItem('ropero_uala_env');
  if (localEnv === 'stage' || localEnv === 'test' || localEnv === 'sandbox') {
    return 'stage';
  }
  if (localEnv === 'production' || localEnv === 'prod') {
    return 'production';
  }

  // 2. Prioridad: variable de entorno
  const envVar = import.meta.env.VITE_UALA_ENV || import.meta.env.VITE_UALA_ENVIRONMENT;
  if (envVar && (String(envVar).toLowerCase() === 'stage' || String(envVar).toLowerCase() === 'test' || String(envVar).toLowerCase() === 'sandbox')) {
    return 'stage';
  }

  // 3. Por defecto: Producción
  return 'production';
}

export function setUalaEnvironment(env: UalaEnvironment): void {
  const currentUserEmail = auth?.currentUser?.email?.toLowerCase() || '';
  const isAllowedTestUser = currentUserEmail === 'yazminetchanchu@gmail.com';
  
  if (env === 'stage' && !isAllowedTestUser) {
    localStorage.setItem('ropero_uala_env', 'production');
    return;
  }
  localStorage.setItem('ropero_uala_env', env);
}

function getAuthUrl(): string {
  const env = getUalaEnvironment();
  if (isLocal) {
    return env === 'stage' ? '/uala-auth-stage/auth/token' : '/uala-auth-prod/auth/token';
  }
  const customUrl = env === 'stage' ? import.meta.env.VITE_UALA_AUTH_URL_STAGE : import.meta.env.VITE_UALA_AUTH_URL;
  if (customUrl) return customUrl;
  
  // URLs oficiales según especificación
  return env === 'stage'
    ? 'https://auth.stage.developers.ar.ua.la/v2/api/auth/token'
    : 'https://auth.developers.ar.ua.la/v2/api/auth/token';
}

function getCheckoutUrl(): string {
  const env = getUalaEnvironment();
  if (isLocal) {
    const path = import.meta.env.VITE_UALA_CHECKOUT_PATH || '/v2/api/checkout';
    return env === 'stage' ? `/uala-api-stage${path}` : `/uala-api-prod${path}`;
  }
  const customUrl = env === 'stage' ? import.meta.env.VITE_UALA_CHECKOUT_URL_STAGE : import.meta.env.VITE_UALA_CHECKOUT_URL;
  if (customUrl) return customUrl;

  // URLs oficiales según especificación API v2 Ualá Bis
  const baseUrl = env === 'stage' ? 'https://checkout.stage.developers.ar.ua.la' : 'https://checkout.developers.ar.ua.la';
  const path = import.meta.env.VITE_UALA_CHECKOUT_PATH || '/v2/api/checkout';
  return `${baseUrl}${path}`;
}

function getUalaCredentials() {
  const env = getUalaEnvironment();
  const clientId = (env === 'stage' ? (import.meta.env.VITE_UALA_CLIENT_ID_STAGE || import.meta.env.VITE_UALA_CLIENT_ID) : import.meta.env.VITE_UALA_CLIENT_ID)?.trim();
  const clientSecret = (env === 'stage' ? (import.meta.env.VITE_UALA_CLIENT_SECRET_STAGE || import.meta.env.VITE_UALA_CLIENT_SECRET) : import.meta.env.VITE_UALA_CLIENT_SECRET)?.trim();
  const username = (env === 'stage' ? (import.meta.env.VITE_UALA_USERNAME_STAGE || import.meta.env.VITE_UALA_USERNAME) : import.meta.env.VITE_UALA_USERNAME)?.trim();
  return { clientId, clientSecret, username, env };
}

function assertUalaConfig(creds: { clientId?: string; clientSecret?: string; username?: string; env: string }): void {
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error(
      `Faltan credenciales de Ualá Bis para el entorno ${creds.env.toUpperCase()} (VITE_UALA_CLIENT_ID / VITE_UALA_CLIENT_SECRET o su versión _STAGE en .env).`
    );
  }
  if (!creds.username) {
    throw new Error(
      `Falta el usuario de Ualá Bis para el entorno ${creds.env.toUpperCase()} (VITE_UALA_USERNAME en .env).`
    );
  }
}

export async function getUalaAccessToken(): Promise<string> {
  const creds = getUalaCredentials();
  assertUalaConfig(creds);
  const authUrl = getAuthUrl();

  // Enviamos tanto las claves de v1 (user_name, client_secret_id) como las de v2 (username, client_secret)
  // ya que Ualá Bis difiere en sus nombres de parámetros entre entornos Stage (v1) y Producción (v2).
  const payload = {
    user_name: creds.username,
    username: creds.username,
    client_id: creds.clientId,
    client_secret_id: creds.clientSecret,
    client_secret: creds.clientSecret,
    grant_type: 'client_credentials',
  };

  let response;
  try {
    response = await axios.post(authUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  } catch (err: any) {
    if (err.response?.data) {
      console.error('Detalle del error de Ualá al obtener token:', JSON.stringify(err.response.data, null, 2));
    }
    if (err.response?.status === 401 && creds.env === 'stage') {
      throw new Error(
        'Error 401 (Unauthorized) en Stage: Las credenciales de Producción no son válidas en Sandbox/Stage. Configuralas en tu archivo .env usando VITE_UALA_CLIENT_ID_STAGE, VITE_UALA_CLIENT_SECRET_STAGE y VITE_UALA_USERNAME_STAGE.'
      );
    }
    throw err;
  }

  const token = response.data?.access_token;
  if (!token) {
    throw new Error('Ualá no devolvió un token de acceso válido.');
  }
  return token;
}

export async function createUalaPayment(
  order: Record<string, unknown>,
  successUrl: string,
  failUrl: string
): Promise<{ paymentId: string; paymentUrl: string }> {
  const env = getUalaEnvironment();
  const endpointUrl = 'https://us-central1-el-ropero-8989a.cloudfunctions.net/createUalaCheckout';

  console.log(`[Ualá Bis] Solicitando cobro seguro al backend en entorno: ${env.toUpperCase()}`);

  let safeSuccessUrl = successUrl;
  let safeFailUrl = failUrl;
  if (safeSuccessUrl.includes('localhost') || safeSuccessUrl.includes('127.0.0.1')) {
    safeSuccessUrl = safeSuccessUrl.replace(/http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, 'https://elropero.ar');
    safeFailUrl = safeFailUrl.replace(/http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, 'https://elropero.ar');
  }

  try {
    const resp = await axios.post(endpointUrl, {
      order,
      successUrl: safeSuccessUrl,
      failUrl: safeFailUrl,
      env
    });

    const paymentId = resp.data?.paymentId;
    const paymentUrl = resp.data?.paymentUrl;

    if (!paymentId || !paymentUrl) {
      throw new Error('El backend no devolvió el enlace de pago.');
    }

    return { paymentId: String(paymentId), paymentUrl: String(paymentUrl) };
  } catch (err: any) {
    if (err.response?.data?.error) {
      throw new Error(err.response.data.error);
    }
    throw err;
  }
}

/**
 * Función de prueba para validar la conexión con la Cloud Function de Ualá Bis
 * en el entorno seleccionado (Stage o Producción).
 */
export async function testUalaConnection(envOverride?: UalaEnvironment): Promise<{
  success: boolean;
  environment: UalaEnvironment;
  token?: string;
  paymentUrl?: string;
  error?: string;
}> {
  if (envOverride) {
    setUalaEnvironment(envOverride);
  }
  const env = getUalaEnvironment();
  try {
    // Generar un cobro de prueba por el mínimo ($25 ARS) directamente mediante la Cloud Function
    const dummyOrder = {
      id: `test_${Date.now()}`,
      total: 25.00,
      customerEmail: 'test-environment@el-ropero.com',
      customerNombre: 'TEST UALA BIS VALIDADOR',
      customerTelefono: '1100000000',
    };
    const payment = await createUalaPayment(
      dummyOrder,
      'https://elropero.ar/?test=ok',
      'https://elropero.ar/?test=fail'
    );
    
    return {
      success: true,
      environment: env,
      token: 'Servidor Seguro OK',
      paymentUrl: payment.paymentUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      environment: env,
      error: err?.message || 'Error desconocido al conectar con Ualá Bis vía Cloud Function',
    };
  }
}
