import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth, ADMIN_EMAILS } from '../contexts/AuthContext';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';

vi.mock('../services/firebase', () => ({
  auth: {},
  db: {},
  googleProvider: {}
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() }
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  setDoc: vi.fn().mockResolvedValue({}),
  updateDoc: vi.fn().mockResolvedValue({}),
  collection: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn()
}));

vi.mock('../services/emailService', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(true)
}));

vi.mock('../services/webOrderFulfillment', () => ({
  releaseExpiredReservations: vi.fn().mockResolvedValue(true),
  isOrderExpired: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/storage', () => ({
  getShowroomID: () => 'test_showroom'
}));

const TestComponent = () => {
  const { user, customerProfile, isLoading, isAdminLoggedIn } = useAuth();
  if (isLoading) return <div data-testid="loading">Cargando...</div>;
  return (
    <div>
      <div data-testid="user-status">{user ? user.email : 'INVITADO'}</div>
      <div data-testid="profile-status">{customerProfile ? customerProfile.email : 'SIN_PERFIL'}</div>
      <div data-testid="admin-status">{isAdminLoggedIn ? 'ADMIN_LOGGED_IN' : 'NOT_ADMIN'}</div>
    </div>
  );
};

describe('AuthContext - Prevención de Auto-Login de Admin en Tienda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mantiene la tienda en modo INVITADO cuando el usuario en Firebase es un email de administración', async () => {
    let authCallback: any;
    (onAuthStateChanged as any).mockImplementation((authObj: any, callback: any) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Simular que Firebase Auth tiene al usuario admin logueado
    await act(async () => {
      authCallback({
        uid: 'admin_123',
        email: 'elropero.informacion@gmail.com',
        displayName: 'El Ropero Admin'
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-status').textContent).toBe('INVITADO');
      expect(screen.getByTestId('profile-status').textContent).toBe('SIN_PERFIL');
      expect(screen.getByTestId('admin-status').textContent).toBe('ADMIN_LOGGED_IN');
    });
  });

  it('permite el inicio de sesión para clientes con emails normales', async () => {
    let authCallback: any;
    (onAuthStateChanged as any).mockImplementation((authObj: any, callback: any) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await act(async () => {
      authCallback({
        uid: 'customer_999',
        email: 'cliente.nuevo@gmail.com',
        displayName: 'Cliente Ejemplo'
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-status').textContent).toBe('cliente.nuevo@gmail.com');
      expect(screen.getByTestId('admin-status').textContent).toBe('NOT_ADMIN');
    });
  });

  it('bloquea la autenticación como cliente si se intenta usar un correo de admin en loginWithEmail', async () => {
    (onAuthStateChanged as any).mockImplementation((authObj: any, callback: any) => {
      callback(null);
      return () => {};
    });

    let authContextRef: any;
    const Grabber = () => {
      authContextRef = useAuth();
      return null;
    };

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>
    );

    await expect(authContextRef.loginWithEmail('elropero.informacion@gmail.com', 'password123')).rejects.toThrow(
      'Este correo pertenece a la administración de la tienda'
    );
  });
});
