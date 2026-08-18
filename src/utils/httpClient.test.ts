import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, httpGet, httpPost, HttpError } from './httpClient';

describe('httpClient Utility', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('makes a successful GET request returning JSON data', async () => {
    const mockResponse = { success: true, data: 'test' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const data = await httpGet('https://api.example.com/data');
    expect(data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('makes a successful POST request with body and custom headers', async () => {
    const mockResponse = { id: 123 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const payload = { name: 'Item' };
    const customHeaders = { Authorization: 'Bearer token123' };

    const data = await httpPost('https://api.example.com/create', payload, customHeaders);

    expect(data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        }),
        body: JSON.stringify(payload),
      })
    );
  });

  it('handles non-JSON responses gracefully (text response)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'Plain text response',
    });

    const data = await request({ url: 'https://api.example.com/text' });
    expect(data).toBe('Plain text response');
  });

  it('throws HttpError when response is not ok (JSON error message)', async () => {
    const errorBody = { message: 'Invalid credentials' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => errorBody,
    });

    await expect(httpGet('https://api.example.com/protected')).rejects.toThrow(HttpError);

    try {
      await httpGet('https://api.example.com/protected');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(401);
      expect(err.message).toBe('Invalid credentials');
      expect(err.data).toEqual(errorBody);
    }
  });

  it('throws HttpError with statusText when error response has no JSON message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'Server crashed',
    });

    try {
      await httpGet('https://api.example.com/error');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(500);
      expect(err.message).toBe('Internal Server Error');
      expect(err.data).toBe('Server crashed');
    }
  });

  it('handles request timeout via AbortController', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';

    global.fetch = vi.fn().mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(abortError), 10);
    }));

    try {
      await request({ url: 'https://api.example.com/timeout', timeoutMs: 5 });
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(408);
      expect(err.message).toBe('Request timed out');
    }
  });
});
