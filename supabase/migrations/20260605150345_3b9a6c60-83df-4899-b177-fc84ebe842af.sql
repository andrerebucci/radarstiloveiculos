CREATE OR REPLACE FUNCTION public.join_organization_by_code(_code text)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org public.organizations;
  _normalized_input text := regexp_replace(upper(coalesce(_code, '')), '[^A-Z0-9]', '', 'g');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _normalized_input = '' THEN
    RAISE EXCEPTION 'Informe o código da organização';
  END IF;

  SELECT * INTO _org
  FROM public.organizations
  WHERE regexp_replace(upper(code), '[^A-Z0-9]', '', 'g') = _normalized_input
     OR regexp_replace(regexp_replace(upper(code), '[^A-Z0-9]', '', 'g'), '^ORG', '') = regexp_replace(_normalized_input, '^ORG', '')
  LIMIT 1;

  IF _org.id IS NULL THEN
    RAISE EXCEPTION 'Código não encontrado';
  END IF;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_org.id, _uid, 'member')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN _org;
END;
$$;