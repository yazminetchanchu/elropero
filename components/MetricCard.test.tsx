import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import MetricCard from './MetricCard';

describe('MetricCard Component', () => {
  it('renderiza la etiqueta y el valor principal correctamente', () => {
    render(<MetricCard label="Ventas Totales" value="$125.000" />);

    expect(screen.getByText('Ventas Totales')).toBeInTheDocument();
    expect(screen.getByText('$125.000')).toBeInTheDocument();
  });

  it('renderiza subValue cuando se proporciona', () => {
    render(<MetricCard label="Ticket Promedio" value="$15.000" subValue="Últimos 30 días" />);

    expect(screen.getByText('Últimos 30 días')).toBeInTheDocument();
  });

  it('renderiza tendencia positiva con signo + y formato de porcentaje', () => {
    render(
      <MetricCard
        label="Ganancia"
        value="$50.000"
        trend={{ value: 12.5, label: 'vs mes anterior', isPositive: true }}
      />
    );

    expect(screen.getByText('+12.5%')).toBeInTheDocument();
  });

  it('renderiza tendencia negativa sin prefijo +', () => {
    render(
      <MetricCard
        label="Gastos"
        value="$20.000"
        trend={{ value: -5.3, label: 'vs mes anterior', isPositive: false }}
      />
    );

    expect(screen.getByText('-5.3%')).toBeInTheDocument();
  });

  it('soporta interacción de click cuando clickable=true y muestra texto "Ver detalles"', () => {
    const handleClick = vi.fn();
    render(
      <MetricCard
        label="Pedidos Web"
        value={18}
        clickable={true}
        onClick={handleClick}
        dataTestId="metric-card-orders"
      />
    );

    expect(screen.getByText('Ver detalles')).toBeInTheDocument();
    const card = screen.getByTestId('metric-card-orders');
    fireEvent.click(card);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('no ejecuta onClick si clickable es false', () => {
    const handleClick = vi.fn();
    render(
      <MetricCard
        label="Productos"
        value={45}
        clickable={false}
        onClick={handleClick}
        dataTestId="metric-card-stock"
      />
    );

    expect(screen.queryByText('Ver detalles')).not.toBeInTheDocument();
    const card = screen.getByTestId('metric-card-stock');
    fireEvent.click(card);

    expect(handleClick).not.toHaveBeenCalled();
  });
});
