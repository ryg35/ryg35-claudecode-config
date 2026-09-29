-- 関数本体と DO ブロックの中の DDL は読まない
CREATE OR REPLACE FUNCTION public.reset_demo() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  CREATE TABLE public.should_not_exist (id uuid PRIMARY KEY);
  DROP TABLE public.orders;
END;
$$;

DO $do$
BEGIN
  RAISE NOTICE 'orders; CREATE TABLE public.also_not_exist (id uuid)';
END
$do$;

ALTER TABLE public.scratch RENAME TO notes;
DROP TABLE IF EXISTS public.coupons CASCADE;
