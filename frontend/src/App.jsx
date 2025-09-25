import React, { useEffect, useState } from "react";
import { API_BASE, health, listProducts } from "./api";

export default function App() {
  const [status, setStatus] = useState("checking...");
  const [products, setProducts] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const h = await health();
        setStatus(JSON.stringify(h));
      } catch (e) {
        setStatus(`health failed: ${e.message}`);
      }
      try {
        const p = await listProducts();
        setProducts(Array.isArray(p) ? p : []);
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, lineHeight: 1.4 }}>
      <h1 style={{ margin: 0 }}>Ecommerce Web</h1>
      <div style={{ color: "#555" }}>API base: {API_BASE}</div>

      <h2>Health</h2>
      <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 8 }}>{status}</pre>

      <h2>Products</h2>
      {err && <div style={{ color: "crimson" }}>Load error: {err}</div>}
      {!err && products.length === 0 && <div>No products (yet)</div>}
      <ul>
        {products.map((p) => (
          <li key={p._id || p.id || p.name}>{p.name || p.title || "(unnamed)"}{p.price ? ` - $${p.price}` : ""}</li>
        ))}
      </ul>
    </div>
  );
}
