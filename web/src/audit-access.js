export function canReadAudit(role) {
  return ["Owner", "Admin", "Auditor"].includes(role);
}

export async function loadAuditForRole(role, fetchAudit) {
  if (!canReadAudit(role)) return { events: [] };
  return fetchAudit();
}
