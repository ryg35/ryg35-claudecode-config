-- 列の追加・削除・改名と、後付けの外部キー
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY,
  code text NOT NULL
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_id uuid;
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);
ALTER TABLE public.orders DROP COLUMN memo;
ALTER TABLE public.users RENAME COLUMN email TO login_email;
ALTER TABLE public.users ADD COLUMN nickname text, ADD COLUMN age integer;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX orders_user_idx ON public.orders (user_id);
