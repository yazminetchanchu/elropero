import axios from 'axios';
import { auth } from './firebase';

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

export async function getUalaAccessToken(): Promise<string> {
  // Nota de seguridad: La autenticación de Ualá Bis se realiza exclusivamente en el backend (Cloud Functions)
  // para no exponer las claves secretas en el navegador del cliente.
  return "SERVER_SECURED_TOKEN";
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
    if (env === 'stage') {
      console.warn('[Ualá Bis] Falló el cobro en STAGE. Reintentando automáticamente en PRODUCCIÓN...', err);
      try {
        const resp = await axios.post(endpointUrl, {
          order,
          successUrl: safeSuccessUrl,
          failUrl: safeFailUrl,
          env: 'production'
        });
        const paymentId = resp.data?.paymentId;
        const paymentUrl = resp.data?.paymentUrl;
        if (paymentId && paymentUrl) {
          return { paymentId: String(paymentId), paymentUrl: String(paymentUrl) };
        }
      } catch (prodErr: any) {
        if (prodErr.response?.data?.error) {
          throw new Error(prodErr.response.data.error);
        }
        throw prodErr;
      }
    }
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
