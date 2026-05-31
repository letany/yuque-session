import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SessionData } from "../types.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "yuque-session");
const COOKIE_FILE = path.join(CONFIG_DIR, "cookies.json");

function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getSession(): SessionData | null {
  try {
    if (!fs.existsSync(COOKIE_FILE)) return null;
    const raw = fs.readFileSync(COOKIE_FILE, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function saveSession(data: SessionData): void {
  ensureDir();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function clearSession(): void {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      fs.unlinkSync(COOKIE_FILE);
    }
  } catch {
    // ignore
  }
}

export function isExpired(data: SessionData): boolean {
  if (!data.expiresAt) return true;
  return Date.now() > data.expiresAt;
}

export function sessionPath(): string {
  return COOKIE_FILE;
}
