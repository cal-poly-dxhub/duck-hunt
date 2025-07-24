export const validateUUID = (s: string | null | undefined): boolean => {
  if (!s) return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[10-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(s);
};
