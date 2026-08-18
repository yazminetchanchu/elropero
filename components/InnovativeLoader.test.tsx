import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import InnovativeLoader from './InnovativeLoader';

describe('InnovativeLoader Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderiza con el nombre del local por defecto y estado de carga', () => {
    render(<InnovativeLoader />);
    
    // Verificamos que el contenedor de progreso está presente
    expect(screen.getByText(/cargando|completado/i)).toBeInTheDocument();
  });

  it('muestra el nombre personalizado del local y el mensaje complementario', () => {
    render(<InnovativeLoader storeName="ROPERO TEST" message="Cargando catálogo exclusivo..." />);
    
    expect(screen.getByText('Cargando catálogo exclusivo...')).toBeInTheDocument();
  });

  it('ejecuta onComplete cuando isDataLoaded es true', () => {
    const handleComplete = vi.fn();
    render(<InnovativeLoader isDataLoaded={true} onComplete={handleComplete} />);
    
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(handleComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });

  it('avanza la barra de progreso automáticamente y llama onComplete al llegar a 100%', () => {
    const handleComplete = vi.fn();
    render(<InnovativeLoader onComplete={handleComplete} />);

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(handleComplete).toHaveBeenCalled();
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });
});
