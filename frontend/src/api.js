const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8082';

async function req(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

/** Health */
export const health = () => req('/health');

/** Auth */
export const login = (email, password) =>
  req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const register = (name, email, password) =>
  req('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });

/** Products CRUD (adjust paths to your backend if needed) */
export const listProducts   = () => req('/products');
export const getProduct     = (id) => req(`/products/${id}`);
export const createProduct  = (data) => req('/products', { method: 'POST', body: JSON.stringify(data) });
export const updateProduct  = (id, data) => req(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProduct  = (id) => req(`/products/${id}`, { method: 'DELETE' });

export { API_BASE };
