import { describe, it, expect } from 'vitest';
import { sanitizeInput, sanitizeObject } from './sanitize';

describe('sanitize Utility', () => {
  describe('sanitizeInput', () => {
    it('returns empty string for null, undefined, or empty input', () => {
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
      expect(sanitizeInput('')).toBe('');
    });

    it('escapes special HTML characters properly', () => {
      expect(sanitizeInput('<h1>Hello & Welcome</h1>')).toBe('&lt;h1&gt;Hello &amp; Welcome&lt;/h1&gt;');
      expect(sanitizeInput(`alert("XSS")`)).toBe('alert(&quot;XSS&quot;)');
      expect(sanitizeInput(`it's cool`)).toBe('it&#x27;s cool');
    });

    it('leaves clean string untouched', () => {
      const clean = 'Remera de Algodon Talle M';
      expect(sanitizeInput(clean)).toBe(clean);
    });
  });

  describe('sanitizeObject', () => {
    it('sanitizes all string fields in a flat object', () => {
      const input = {
        name: '<b>John</b>',
        age: 30,
        email: 'john@example.com',
      };
      const sanitized = sanitizeObject(input);
      expect(sanitized).toEqual({
        name: '&lt;b&gt;John&lt;/b&gt;',
        age: 30,
        email: 'john@example.com',
      });
    });

    it('recursively sanitizes nested objects', () => {
      const input = {
        user: {
          bio: '<img src=x onerror=alert(1)>',
          details: {
            city: 'Buenos Aires & CABA',
          },
        },
        tags: ['test'], // array should be untouched
      };
      const sanitized = sanitizeObject(input);
      expect(sanitized.user.bio).toBe('&lt;img src=x onerror=alert(1)&gt;');
      expect(sanitized.user.details.city).toBe('Buenos Aires &amp; CABA');
    });
  });
});
