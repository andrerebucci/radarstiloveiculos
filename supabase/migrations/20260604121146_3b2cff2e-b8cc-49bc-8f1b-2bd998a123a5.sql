CREATE OR REPLACE FUNCTION public.create_organization(_name text, _code text)
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

  INSERT INTO public.organizations (code, name, owner_user_id)
  VALUES (_code, _name, _uid)
  RETURNING * INTO _org;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_org.id, _uid, 'owner');

  RETURN _org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;