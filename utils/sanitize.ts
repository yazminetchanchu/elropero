export function sanitizeInput(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj } as any;
  for (const key in result) {
    if (typeof result[key] === 'string') {
      result[key] = sanitizeInput(result[key]);
    } else if (result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
       // Optional: recursive for nested objects if needed, but for simple forms shallow is usually enough or we handle specific fields
       result[key] = sanitizeObject(result[key]);
    }
  }
  return result;
}
