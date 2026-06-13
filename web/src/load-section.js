// Resilience primitive for the post-login workspace loader.
//
// The workspace fetches ~100 independent datasets after login. Before this,
// a single failing fetch rejected the whole `load()` and blanked the entire
// workspace. `loadOr` localizes failure: a non-401 error degrades that one
// panel to a fallback value (and is surfaced via console.warn for diagnosis),
// while a 401 is rethrown so the top-level handler can log the user out.
//
// @template T
// @param {T} fallback   - value to return if the fetch fails for a non-auth reason
// @param {() => Promise<T>} fetcher - the data fetch to attempt
// @returns {Promise<T>}
export async function loadOr(fallback, fetcher) {
  try {
    return await fetcher();
  } catch (error) {
    // A 401 means the session is invalid — let the top-level loader handle
    // logout/redirect rather than silently swallowing it into a fallback.
    if (error && error.status === 401) {
      throw error;
    }
    console.warn("loadOr: section failed to load, using fallback", error);
    return fallback;
  }
}
