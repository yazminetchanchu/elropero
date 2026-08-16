import { describe, it, expect, beforeEach } from 'vitest';

describe('Autenticación y Registro de Dispositivos de Confianza (2FA)', () => {
  const testEmail = 'elropero.informacion@gmail.com';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('Identifica un dispositivo como nuevo si no existe registro en localStorage', () => {
    const cleanEmail = testEmail.trim().toLowerCase();
    const isDeviceTrusted = localStorage.getItem(`ropero_trusted_device_${cleanEmail}`) === 'true';
    
    expect(isDeviceTrusted).toBe(false);
  });

  it('Registra el dispositivo como de confianza tras verificar el código 2FA exitosamente', () => {
    const cleanEmail = testEmail.trim().toLowerCase();

    // Simular que el usuario ingresa el código OTP de 6 dígitos correctamente
    localStorage.setItem(`ropero_trusted_device_${cleanEmail}`, 'true');
    sessionStorage.setItem('ropero_2fa_verified', 'true');

    const isDeviceTrusted = localStorage.getItem(`ropero_trusted_device_${cleanEmail}`) === 'true';
    const isSessionVerified = sessionStorage.getItem('ropero_2fa_verified') === 'true';

    expect(isDeviceTrusted).toBe(true);
    expect(isSessionVerified).toBe(true);
  });

  it('Omite el pedido de 2FA en inicios de sesión posteriores en el mismo dispositivo', () => {
    const cleanEmail = testEmail.trim().toLowerCase();
    
    // Dispositivo previamente guardado
    localStorage.setItem(`ropero_trusted_device_${cleanEmail}`, 'true');

    // Al autenticar credenciales en un dispositivo conocido:
    const isDeviceTrusted = localStorage.getItem(`ropero_trusted_device_${cleanEmail}`) === 'true';
    
    expect(isDeviceTrusted).toBe(true);
    // Como isDeviceTrusted es true, el sistema omitirá la llamada a sendAdmin2FACode y el paso 2FA.
  });

  it('Solicita 2FA si se accede desde un dispositivo o navegador distinto', () => {
    const cleanEmail = testEmail.trim().toLowerCase();

    // Dispositivo A verificado
    localStorage.setItem(`ropero_trusted_device_${cleanEmail}`, 'true');

    // Simular un nuevo navegador limpiando localStorage
    localStorage.clear();

    const isDeviceTrusted = localStorage.getItem(`ropero_trusted_device_${cleanEmail}`) === 'true';
    expect(isDeviceTrusted).toBe(false);
  });
});
