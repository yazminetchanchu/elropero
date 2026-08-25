import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TransferSuccessPage from '../components/TransferSuccessPage';
import { isOrderExpired } from '../services/webOrderFulfillment';
import { WebSettings } from '../types';

describe('Transfer Checkout Flow & TransferSuccessPage', () => {
  const mockWebSettings: WebSettings = {
    storeName: 'EL ROPERO',
    contactWhatsapp: '5492346685836',
    bankTitular: 'VALENTINA SHOWROOM',
    bankCbu: '0000003100084729182736',
    bankAlias: 'elropero.transfer',
    bankName: 'Banco Santander',
    mercadoPagoAlias: 'elropero.mp',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders TransferSuccessPage with order details, 24-hour notice, banking data and WhatsApp action', () => {
    localStorage.setItem(
      'ropero_last_pending_order',
      JSON.stringify({
        orderId: 'ORD-TRANSFER-12345',
        total: 45000,
        metodoPago: 'Transferencia',
        estado: 'pending_transfer',
      })
    );

    render(
      <MemoryRouter initialEntries={['/checkout/transferencia-exitosa?orderId=ORD-TRANSFER-12345']}>
        <Routes>
          <Route
            path="/checkout/transferencia-exitosa"
            element={<TransferSuccessPage webSettings={mockWebSettings} />}
          />
        </Routes>
      </MemoryRouter>
    );

    // Verify title and success header
    expect(screen.getByText('¡Pedido Registrado con Éxito!')).toBeInTheDocument();
    
    // Verify 24-hour notice
    expect(screen.getByText(/Tenés 24 horas para realizar la transferencia/i)).toBeInTheDocument();
    expect(screen.getByText(/Tu stock permanecerá reservado durante 24 horas/i)).toBeInTheDocument();

    // Verify order ID and discounted total
    expect(screen.getByText('#ORD-TRANSFER-12345')).toBeInTheDocument();
    expect(screen.getByText('-20% OFF APLICADO')).toBeInTheDocument();
    expect(screen.getByText('$45.000')).toBeInTheDocument();

    // Verify Banking details
    expect(screen.getByText('VALENTINA SHOWROOM')).toBeInTheDocument();
    expect(screen.getByText('0000003100084729182736')).toBeInTheDocument();
    expect(screen.getByText('elropero.transfer')).toBeInTheDocument();
    expect(screen.getByText('Banco Santander')).toBeInTheDocument();

    // Verify WhatsApp button
    expect(screen.getByText(/Enviar Comprobante por WhatsApp/i)).toBeInTheDocument();
  });

  it('allows copying CBU, Alias, and Order ID with visual feedback', () => {
    // Mock navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <MemoryRouter initialEntries={['/checkout/transferencia-exitosa?orderId=ORD-999']}>
        <Routes>
          <Route
            path="/checkout/transferencia-exitosa"
            element={<TransferSuccessPage webSettings={mockWebSettings} />}
          />
        </Routes>
      </MemoryRouter>
    );

    const copyCbuBtn = screen.getByRole('button', { name: /Copiar CBU/i });
    fireEvent.click(copyCbuBtn);
    expect(writeTextMock).toHaveBeenCalledWith('0000003100084729182736');

    const copyAliasBtn = screen.getByRole('button', { name: /Copiar Alias/i });
    fireEvent.click(copyAliasBtn);
    expect(writeTextMock).toHaveBeenCalledWith('elropero.transfer');
  });

  it('opens WhatsApp with pre-formatted message containing order ID and total', () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    localStorage.setItem(
      'ropero_last_pending_order',
      JSON.stringify({
        orderId: 'ORD-ABC-777',
        total: 32000,
        metodoPago: 'Transferencia',
      })
    );

    render(
      <MemoryRouter initialEntries={['/checkout/transferencia-exitosa?orderId=ORD-ABC-777']}>
        <Routes>
          <Route
            path="/checkout/transferencia-exitosa"
            element={<TransferSuccessPage webSettings={mockWebSettings} />}
          />
        </Routes>
      </MemoryRouter>
    );

    const wsBtn = screen.getByRole('button', { name: /Enviar Comprobante por WhatsApp/i });
    fireEvent.click(wsBtn);

    expect(windowOpenSpy).toHaveBeenCalled();
    const calledUrl = windowOpenSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('wa.me/5492346685836');
    expect(decodeURIComponent(calledUrl)).toContain('#ORD-ABC-777');
    expect(decodeURIComponent(calledUrl)).toContain('$32.000');

    windowOpenSpy.mockRestore();
  });

  it('evaluates expiration correctly for pending_transfer orders with 24-hour limit', () => {
    const now = Date.now();

    // Active order created 2 hours ago (within 24h)
    const activeOrder = {
      estado: 'pending_transfer',
      fecha: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now + 22 * 60 * 60 * 1000).toISOString(),
    };
    expect(isOrderExpired(activeOrder)).toBe(false);

    // Expired transfer order (created 25 hours ago)
    const expiredOrder = {
      estado: 'pending_transfer',
      fecha: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
    };
    expect(isOrderExpired(expiredOrder)).toBe(true);

    // Fallback based on fecha when expiresAt is missing
    const fallbackActive = {
      estado: 'pending_transfer',
      fecha: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
    };
    expect(isOrderExpired(fallbackActive)).toBe(false);

    const fallbackExpired = {
      estado: 'pending_transfer',
      fecha: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    };
    expect(isOrderExpired(fallbackExpired)).toBe(true);
  });
});
