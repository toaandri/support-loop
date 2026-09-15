CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  stock integer NOT NULL CHECK (stock >= 0),
  image_url text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id),
  status text NOT NULL CHECK (status IN ('processing', 'shipped', 'delivered', 'cancelled')),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  tracking_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
  order_id text NOT NULL REFERENCES orders(id),
  product_id text NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE IF NOT EXISTS support_conversations (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id),
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY,
  conversation_id text NOT NULL UNIQUE REFERENCES support_conversations(id),
  customer_id text NOT NULL REFERENCES customers(id),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  confidence_threshold double precision NOT NULL CHECK (confidence_threshold BETWEEN 0 AND 1)
);
INSERT INTO support_settings (id, confidence_threshold) VALUES (1, 0.85) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS support_conversations_customer_idx ON support_conversations(customer_id);
