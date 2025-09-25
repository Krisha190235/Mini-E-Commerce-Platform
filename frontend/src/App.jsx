import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { login, register, me, listProducts, createProduct, updateProduct, deleteProduct, getToken } from './api'

function Nav() {
  const nav = useNavigate()
  const out = () => { localStorage.removeItem('token'); nav('/login'); }
  return (
    <nav style={{ display: 'flex', gap: 12, margin: '12px 0' }}>
      <Link to="/">Home</Link>
      <Link to="/products">Products</Link>
      {getToken() ? <button onClick={out}>Logout</button> : <Link to="/login">Login</Link>}
    </nav>
  )
}

function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('pass123')
  const [mode, setMode] = useState('login')
  const submit = async e => {
    e.preventDefault()
    const api = mode === 'login' ? login : register
    const res = await api({ email, password, name: 'Test User' })
    if (res.token) { localStorage.setItem('token', res.token) }
    nav('/products')
  }
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 300 }}>
      <h3>{mode === 'login' ? 'Login' : 'Register'}</h3>
      <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Submit</button>
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        Switch to {mode === 'login' ? 'Register' : 'Login'}
      </button>
    </form>
  )
}

function Home() {
  const [user, setUser] = useState(null)
  useEffect(() => { if (getToken()) me().then(setUser).catch(() => { }) }, [])
  return <div>
    <h2>E-commerce API running</h2>
    {user ? <p>Welcome, {user.name || user.email}</p> : <p><em>Login to manage products.</em></p>}
  </div>
}

function Products() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ name: '', price: 0, description: '' })
  const reload = () => listProducts().then(setItems)
  useEffect(() => { reload() }, [])
  const save = async () => { await createProduct(form); setForm({ name: '', price: 0, description: '' }); reload() }
  const patch = async (id) => { const price = prompt('New price?'); if (price) { await updateProduct(id, { price: Number(price) }); reload() } }
  const del = async (id) => { if (confirm('Delete?')) { await deleteProduct(id); reload() } }

  return <div style={{ display: 'grid', gap: 12 }}>
    <h3>Products</h3>
    <div style={{ display: 'grid', gap: 6, maxWidth: 360 }}>
      <input placeholder="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <input placeholder="price" type="number" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
      <input placeholder="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
      <button onClick={save}>Create</button>
    </div>

    <ul>
      {items.map(p => (
        <li key={p._id || p.id} style={{ margin: '6px 0' }}>
          <strong>{p.name}</strong> — ${p.price} &nbsp;
          <button onClick={() => patch(p._id || p.id)}>Edit</button>
          <button onClick={() => del(p._id || p.id)}>Delete</button>
        </li>
      ))}
    </ul>
  </div>
}

export default function App() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, Arial' }}>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/products" element={<Products />} />
      </Routes>
    </div>
  )
}