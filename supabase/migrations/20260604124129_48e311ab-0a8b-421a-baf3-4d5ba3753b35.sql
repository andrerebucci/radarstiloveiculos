
CREATE OR REPLACE FUNCTION public.join_organization_by_code(_code text)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org public.organizations;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _org FROM public.organizations WHERE code = upper(trim(_code));
  IF _org.id IS NULL THEN
    RAISE EXCEPTION 'Código não encontrado';
  END IF;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_org.id, _uid, 'member')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN _org;
END;
$$;
