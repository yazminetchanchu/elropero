import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import NetworkStatus from './NetworkStatus';

describe('NetworkStatus Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('no muestra nada inicialmente si el navegador está online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { container } = render(<NetworkStatus />);

    expect(container.firstChild).toBeNull();
  });

  it('muestra banner offline si el navegador inicia offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<NetworkStatus />);

    expect(screen.getByText('Modo Offline')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión. Los datos se guardan localmente.')).toBeInTheDocument();
  });

  it('muestra banner offline cuando se dispara el evento offline de window', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<NetworkStatus />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText('Modo Offline')).toBeInTheDocument();
  });

  it('muestra notificación de conexión restaurada al volver online y se oculta tras 3 segundos', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { container } = render(<NetworkStatus />);

    expect(screen.getByText('Modo Offline')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByText('Conexión Restaurada')).toBeInTheDocument();
    expect(screen.getByText('Sincronizando catálogo...')).toBeInTheDocument();

    // Avanzamos 3 segundos
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(container.firstChild).toBeNull();
  });
});
