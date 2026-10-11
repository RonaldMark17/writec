-- Apply after registration_approval.sql. No table/column changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_review_pending(user_ids TEXT[], new_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_id TEXT; target public."userTable"%ROWTYPE;
  succeeded JSONB := '[]'; failed JSONB := '[]';
BEGIN
  IF NOT public.writecheck_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF new_status IS NULL OR new_status NOT IN ('active','rejected')
    OR COALESCE(cardinality(user_ids),0) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Select 1 to 25 pending accounts and approve or reject them.' USING ERRCODE = '22023';
  END IF;
  FOR target_id IN SELECT DISTINCT unnest(user_ids) ORDER BY 1 LOOP
    BEGIN
      SELECT * INTO target FROM public."userTable" WHERE id::text = target_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.'; END IF;
      IF target.role NOT IN ('student','teacher') OR target.account_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Account is no longer an eligible pending registration.';
      END IF;
      -- Reuse authorization, transition rules and audit logging while holding the lock.
      PERFORM public.admin_set_account_status(target_id, new_status);
      succeeded := succeeded || jsonb_build_array(target_id);
    EXCEPTION WHEN OTHERS THEN
      failed := failed || jsonb_build_array(jsonb_build_object('id',target_id,'error',SQLERRM));
    END;
  END LOOP;
  RETURN jsonb_build_object('succeeded',succeeded,'failed',failed);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_pending(TEXT[],TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_pending(TEXT[],TEXT) TO authenticated;
COMMIT;
