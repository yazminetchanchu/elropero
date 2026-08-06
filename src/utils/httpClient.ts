// src/utils/httpClient.ts

/**
 * Simple HTTP client wrapper around native fetch (Node 18+).
 * Provides a generic request method with configurable timeout and unified error handling.
 */

export interface HttpRequestOptions<T = any> {
  /** Full URL (including base) */
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Optional headers object */
  headers?: Record<string, string>;
  /** Optional JSON payload for POST/PUT/PATCH */
  body?: any;
  /** Timeout in milliseconds. If omitted, defaults to 5000ms. */
  timeoutMs?: number;
}

export class HttpError extends Error {
  /** HTTP status code */
  readonly status: number;
  /** Parsed response body (if any) */
  readonly data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Performs a fetch request with abort timeout and uniform error handling.
 */
export async function request<T = any>(options: HttpRequestOptions<T>): Promise<T> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 5000,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    signal: controller.signal,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeout);
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message = isJson && data?.message ? data.message : response.statusText;
      throw new HttpError(message, response.status, data);
    }
    return data as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new HttpError('Request timed out', 408);
    }
    throw err;
  }
}

/** Convenience helpers */
export const httpGet = <T = any>(url: string, headers?: Record<string, string>, timeoutMs?: number) =>
  request<T>({ url, method: 'GET', headers, timeoutMs });

export const httpPost = <T = any>(url: string, body: any, headers?: Record<string, string>, timeoutMs?: number) =>
  request<T>({ url, method: 'POST', headers, body, timeoutMs });
