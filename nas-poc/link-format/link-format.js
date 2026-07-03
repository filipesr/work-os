// Link-format helper (spike) — mirrors lib/locale-storage.ts (detect -> override -> default,
// persisted in localStorage under a "workos:*" key). Seed for the production lib/nas/link-format.ts.
//
// Windows opens SMB shares via UNC backslash paths (\\NAS\Share\dir); macOS/Linux via smb:// URLs.
// Browsers can't navigate to either for security, so the real affordance is "copy path" — and the
// string must be in the format that matches the user's OS. We detect the default from the OS but let
// the user override it (exactly like the theme/locale toggles), then derive the link from that.
//
// Written as browser-native ESM (no build step) so nas-poc/link-format/test.html can import it as-is.

/** @typedef {"unc" | "smb"} LinkFormat */

const LINK_FORMAT_STORAGE_KEY = "workos:link-format";

/** @returns {LinkFormat | null} */
export function getStoredLinkFormat() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LINK_FORMAT_STORAGE_KEY);
    return stored === "unc" || stored === "smb" ? stored : null;
  } catch (error) {
    console.error("Failed to get stored link format:", error);
    return null;
  }
}

/** @param {LinkFormat} format */
export function setStoredLinkFormat(format) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LINK_FORMAT_STORAGE_KEY, format);
  } catch (error) {
    console.error("Failed to set stored link format:", error);
  }
}

/**
 * Detect the OS default. Prefers the modern userAgentData (Chromium); falls back to the legacy
 * navigator.platform (Safari/Firefox), then the UA string.
 * @returns {LinkFormat}
 */
export function detectLinkFormat() {
  if (typeof navigator === "undefined") return "smb";
  const platform =
    (navigator.userAgentData && navigator.userAgentData.platform) ||
    navigator.platform ||
    navigator.userAgent ||
    "";
  return /win/i.test(platform) ? "unc" : "smb";
}

/**
 * The format to use: stored preference first, else OS detection, else smb.
 * @returns {LinkFormat}
 */
export function getPreferredLinkFormat() {
  return getStoredLinkFormat() ?? detectLinkFormat();
}

/**
 * Build the local SMB link for a folder or file.
 * @param {{ host: string, share: string, relPath: string, format?: LinkFormat }} opts
 *   relPath is the agent's forward-slash relative path (e.g. "Cliente/Campanhas/.../file.mov").
 * @returns {string}
 */
export function buildLocalLink({ host, share, relPath, format = getPreferredLinkFormat() }) {
  const clean = relPath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (format === "unc") {
    const back = clean.replace(/\//g, "\\");
    return `\\\\${host}\\${share}\\${back}`;
  }
  return `smb://${host}/${share}/${clean}`;
}

/** Folder link (dirname of the file) — the "Abrir pasta no NAS" affordance. */
export function buildFolderLink({ host, share, relPath, format = getPreferredLinkFormat() }) {
  const dir = relPath.replace(/^\/+/, "").replace(/\/[^/]*$/, "");
  return buildLocalLink({ host, share, relPath: dir, format });
}

export { LINK_FORMAT_STORAGE_KEY };
