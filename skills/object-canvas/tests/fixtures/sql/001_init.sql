-- 最初のスキーマ。users / orders / scratch を作る
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TYPE public.order_status AS ENUM ('draft', 'paid', 'shipped');

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.order_status NOT NULL DEFAULT 'draft',
  total numeric(10, 2) /* 税込 */ NOT NULL,
  memo text
);

CREATE TABLE public.scratch (
  id uuid PRIMARY KEY,
  note text
);
