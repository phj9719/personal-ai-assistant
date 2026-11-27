export function isSameOrigin(origin:string|null, configured:string|undefined) {
  if (!configured || !origin) return false;
  try { return origin===new URL(configured).origin; }
  catch { return false; }
}
