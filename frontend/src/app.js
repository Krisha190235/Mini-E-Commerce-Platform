const API = import.meta.env.VITE_API_URL || 'http://localhost:8082';

export function getToken() { return localStorage.getItem('token'); }
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function register(payload) {
  const r = await fetch(`${API}/api/users/register`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(await r.text()); return r.json();
}

export async function login(payload) {
  const r = await fetch(`${API}/api/users/login`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
  if(!r.ok) throw new Error(await r.text()); return r.json();
}

export async function me() {
  const r = await fetch(`${API}/api/users/profile`, { headers: authHeaders() });
  if(!r.ok) throw new Error(await r.text()); return r.json();
}

// Products CRUD
export async function listProducts() {
  const r = await fetch(`${API}/api/products`, { headers: authHeaders() });
  if(!r.ok) throw new Error(await r.text()); return r.json();
}
export async function createProduct(p) {
  const r = await fetch(`${API}/api/products`, {
    method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body:JSON.stringify(p)
  });
  if(!r.ok) throw new Error(await r.text()); return r.json();
}
export async function updateProduct(id, p) {
  const r = await fetch(`${API}/api/products/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json', ...authHeaders()}, body:JSON.stringify(p)
  });
  if(!r.ok) throw new Error(await r.text()); return r.json();
}
export async function deleteProduct(id) {
  const r = await fetch(`${API}/api/products/${id}`, { method:'DELETE', headers: authHeaders() });
  if(!r.ok) throw new Error(await r.text()); return r.json();
}