export function getSourceLink(source) {
  const rawUrl = String(source?.sourceUrl || "").trim();
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return {
      href: parsed.href,
      host: parsed.host.replace(/^www\./, "")
    };
  } catch {
    return null;
  }
}

export function formatSourceDate(source) {
  const reviewedAt = source?.latestReview?.reviewedAt || source?.latestReview?.createdAt;
  if (reviewedAt) return String(reviewedAt).slice(0, 10);
  return source?.effectiveDate || "առանց ամսաթվի";
}
