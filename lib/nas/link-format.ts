// Local SMB link builder — production port of nas-poc/link-format/link-format.js, typed.
// Mirrors lib/locale-storage.ts (detect -> override -> default, persisted under a "workos:*" key).
//
// Windows opens SMB shares via UNC backslash paths (\\NAS\Share\dir); macOS/Linux via smb:// URLs.
// Browsers can't navigate to either (security), so the real affordance is "copy path" / "open
// folder" — and the string must match the user's OS. We detect the default from the OS but let the
// user override it (like the theme/locale toggles), then derive the link from that.

export type LinkFormat = "unc" | "smb";

export const LINK_FORMAT_STORAGE_KEY = "workos:link-format";

// navigator.userAgentData is Chromium-only and not yet in lib.dom types.
interface NavigatorUAData {
  platform?: string;
}

export function getStoredLinkFormat(): LinkFormat | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LINK_FORMAT_STORAGE_KEY);
    return stored === "unc" || stored === "smb" ? stored : null;
  } catch (error) {
    console.error("Failed to get stored link format:", error);
    return null;
  }
}

export function setStoredLinkFormat(format: LinkFormat): void {
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
 */
export function detectLinkFormat(): LinkFormat {
  if (typeof navigator === "undefined") return "smb";
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const platform = uaData?.platform || navigator.platform || navigator.userAgent || "";
  return /win/i.test(platform) ? "unc" : "smb";
}

/** The format to use: stored preference first, else OS detection, else smb. */
export function getPreferredLinkFormat(): LinkFormat {
  return getStoredLinkFormat() ?? detectLinkFormat();
}

export interface LocalLinkOpts {
  host: string;
  share: string;
  /** Agent's forward-slash relative path (e.g. "Cliente/Campanhas/.../file.mov"). */
  relPath: string;
  format?: LinkFormat;
}

/** Build the local SMB link for a folder or file. */
export function buildLocalLink({
  host,
  share,
  relPath,
  format = getPreferredLinkFormat(),
}: LocalLinkOpts): string {
  const clean = relPath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (format === "unc") {
    const back = clean.replace(/\//g, "\\");
    return `\\\\${host}\\${share}\\${back}`;
  }
  return `smb://${host}/${share}/${clean}`;
}

/** Folder link (dirname of the file) — the "Abrir pasta no NAS" affordance. */
export function buildFolderLink({
  host,
  share,
  relPath,
  format = getPreferredLinkFormat(),
}: LocalLinkOpts): string {
  const dir = relPath.replace(/^\/+/, "").replace(/\/[^/]*$/, "");
  return buildLocalLink({ host, share, relPath: dir, format });
}
