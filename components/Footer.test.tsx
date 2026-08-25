import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import Footer from './Footer';

describe('Footer Component (Minimalist & Compact)', () => {
  const mockSettings = {
    storeName: 'EL ROPERO',
    contactWhatsapp: '5492346685836',
    instagramHandle: 'elropero.ar'
  };

  it('renderiza la marca EL ROPERO y enlaces a WhatsApp e Instagram sin descripcion', () => {
    render(<Footer webSettings={mockSettings as any} />);

    // Marca
    expect(screen.getByText('EL ROPERO')).toBeInTheDocument();

    // Enlaces directos
    const whatsappLink = screen.getByRole('link', { name: /WhatsApp/i });
    expect(whatsappLink).toHaveAttribute('href', expect.stringContaining('5492346685836'));

    const instagramLink = screen.getByRole('link', { name: /Instagram/i });
    expect(instagramLink).toHaveAttribute('href', 'https://instagram.com/elropero.ar');
  });

  it('muestra la sección Tienda con Guía de Compra, Ubicación y Cambios y Devoluciones', () => {
    render(<Footer webSettings={mockSettings as any} />);

    expect(screen.getByText('Tienda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guía de Compra/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ubicación/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cambios y Devoluciones/i })).toBeInTheDocument();
  });

  it('muestra la sección Ayuda & Legal con Botón de Arrepentimiento y Defensa al Consumidor', () => {
    render(<Footer webSettings={mockSettings as any} />);

    expect(screen.getByText('Ayuda & Legal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Botón de Arrepentimiento/i })).toBeInTheDocument();

    const defensaLink = screen.getByRole('link', { name: /Defensa al Consumidor/i });
    expect(defensaLink).toHaveAttribute(
      'href',
      'https://www.argentina.gob.ar/produccion/defensadelconsumidor'
    );
  });

  it('muestra Medios de Pago y Envíos', () => {
    render(<Footer webSettings={mockSettings as any} />);

    expect(screen.getByText('Medios de Pago')).toBeInTheDocument();
    expect(screen.getByText(/Ualá Bis • Tarjetas/i)).toBeInTheDocument();

    expect(screen.getByText('Envíos')).toBeInTheDocument();
    expect(screen.getByText(/Correo Argentino a todo el país/i)).toBeInTheDocument();
  });

  it('abre y permite interactuar con la Guía de Compra y Botón de Arrepentimiento', () => {
    render(<Footer webSettings={mockSettings as any} />);

    // Guía de Compra
    fireEvent.click(screen.getByRole('button', { name: /Guía de Compra/i }));
    expect(screen.getAllByText(/Guía de Compra/i).length).toBeGreaterThan(0);

    // Botón de Arrepentimiento
    fireEvent.click(screen.getByRole('button', { name: /Botón de Arrepentimiento/i }));
    expect(screen.getAllByText(/Botón de Arrepentimiento/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ley 24.240/i)).toBeInTheDocument();
  });

  it('conecta callbacks de ubicación y términos', () => {
    const onShowLocation = vi.fn();
    const onShowTerms = vi.fn();

    render(
      <Footer
        webSettings={mockSettings as any}
        onShowLocation={onShowLocation}
        onShowTerms={onShowTerms}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Ubicación/i }));
    expect(onShowLocation).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Cambios y Devoluciones/i }));
    expect(onShowTerms).toHaveBeenCalled();
  });
});
