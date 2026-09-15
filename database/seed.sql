-- Fictional demo data. Re-running the seed never overwrites business changes.
INSERT INTO customers (id, name, email) VALUES
  ('customer-demo', 'Camille Martin', 'camille@example.test'),
  ('customer-other', 'Alex Bernard', 'alex@example.test') ON CONFLICT DO NOTHING;
INSERT INTO products (id, name, description, price_cents, stock, image_url) VALUES
  ('PRD-001', 'Casque Studio', 'Casque audio sans fil, autonomie 30 heures.', 8900, 12,
   'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300&auto=format&fit=crop'),
  ('PRD-002', 'Clavier Compact', 'Clavier mecanique compact, connexion USB-C.', 6900, 0,
   'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&auto=format&fit=crop')
  ON CONFLICT DO NOTHING;
INSERT INTO orders (id, customer_id, status, total_cents, tracking_number) VALUES
  ('ORD-1001', 'customer-demo', 'shipped', 8900, 'DEMO-TRACK-1001'),
  ('ORD-1002', 'customer-demo', 'processing', 6900, NULL),
  ('ORD-2001', 'customer-other', 'delivered', 8900, 'DEMO-TRACK-2001') ON CONFLICT DO NOTHING;
INSERT INTO order_items (order_id, product_id, quantity) VALUES
  ('ORD-1001', 'PRD-001', 1), ('ORD-1002', 'PRD-002', 1), ('ORD-2001', 'PRD-001', 1)
  ON CONFLICT DO NOTHING;
