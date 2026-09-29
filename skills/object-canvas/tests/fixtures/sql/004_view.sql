-- ビューと、解釈しない CREATE TABLE AS
CREATE VIEW public.order_summary WITH (security_invoker = true) AS
  SELECT o.id, u.login_email
  FROM public.orders o
  JOIN public.users u ON u.id = o.user_id;

CREATE TABLE public.orders_backup_20260101 AS SELECT * FROM public.orders;

DROP TABLE IF EXISTS public.never_existed;
