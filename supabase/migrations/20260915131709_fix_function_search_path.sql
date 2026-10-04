-- Fix mutable search_path on the updated_at trigger function
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
