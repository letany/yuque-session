import puppeteer from "puppeteer";
import type { SessionData, YuqueUser } from "../types.js";
import { saveSession } from "./session.js";

const POLL_INTERVAL = 1000;
const MAX_WAIT = 10 * 60 * 1000;

async function getLoginFromPage(page: import("puppeteer").Page): Promise<SessionData> {
  const cookies = await page.cookies();
  const sessionCookie = cookies.find(
    (c) => c.name === "_yuque_session" && c.domain.includes("yuque.com")
  );
  const ctokenCookie = cookies.find(
    (c) => c.name === "yuque_ctoken" && c.domain.includes("yuque.com")
  );

  if (!sessionCookie?.value) throw new Error("登录失败");

  let user: YuqueUser | null = null;
  try {
    const userData = await page.evaluate(() => {
      // Method 1: React/Next.js __NEXT_DATA__
      const nextData = document.getElementById("__NEXT_DATA__");
      if (nextData) {
        try {
          const parsed = JSON.parse(nextData.textContent || "{}");
          const cu = parsed?.props?.pageProps?.currentUser || parsed?.props?.currentUser;
          if (cu?.id) return cu;
        } catch {}
      }
      // Method 2: Look for window.__INITIAL_STATE__ or similar
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        const t = s.textContent || "";
        if (!t.includes("currentUser") && !t.includes('"login"')) continue;
        try {
          const m = t.match(/currentUser\s*[=:]\s*({.+?})\s*[;,\n]/);
          if (m) {
            const parsed = JSON.parse(m[1]);
            if (parsed?.id) return parsed;
          }
        } catch {}
      }
      // Method 3: check for data-current-user attribute
      const body = document.body;
      const attr = body.getAttribute("data-current-user") || body.getAttribute("data-user");
      if (attr) {
        try { return JSON.parse(attr); } catch {}
      }
      return null;
    });

    if (userData?.id) {
      user = {
        id: userData.id,
        name: userData.name || "",
        login: userData.login || "",
        avatar_url: userData.avatar_url || "",
      };
    }
  } catch {}

  if (!user) {
    try {
      const urlLogin = await page.evaluate(() => {
        const m = window.location.pathname.match(/^\/([^/]+)/);
        return m ? m[1] : null;
      });
      if (urlLogin) {
        user = { id: 0, name: urlLogin, login: urlLogin, avatar_url: "" };
      }
    } catch {}
  }

  const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;

  return {
    session: sessionCookie.value,
    ctoken: ctokenCookie?.value ?? "",
    user,
    expiresAt,
    createdAt: Date.now(),
  };
}

export async function login(): Promise<SessionData> {
  const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const hasChrome = await import("node:fs").then((fs) => fs.existsSync(systemChrome)).catch(() => false);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    ...(hasChrome ? {
      executablePath: systemChrome,
      args: ["--disable-blink-features=AutomationControlled"],
    } : {}),
  });

  try {
    const [page] = await browser.pages();

    // Hide automation detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // Clear any guest cookies that Yuque login page sets automatically
    await page.deleteCookie();

    console.log("\n浏览器已打开，请在页面中完成登录（手机号+验证码/扫码均可）...");
    console.log("登录成功后页面会自动跳转，本工具将捕获会话信息。\n");

    await page.goto("https://www.yuque.com/login", { waitUntil: "networkidle2" });

    const start = Date.now();
    while (Date.now() - start < MAX_WAIT) {
      try {
        const currentUrl = page.url();
        const pathname = new URL(currentUrl).pathname;

        // Login page itself sets guest cookies.
        // We detect real login by URL change: after login, Yuque redirects to /dashboard or /.
        if (!pathname.includes("/login")) {
          await new Promise((r) => setTimeout(r, 2000));
          const sessionData = await getLoginFromPage(page);
          saveSession(sessionData);

          if (sessionData.user) {
            console.log(
              `\n登录成功！用户: ${sessionData.user.name} (@${sessionData.user.login})`
            );
          } else {
            console.log("\n登录成功！");
          }
          console.log("会话已保存，有效期约 14 天。");
          return sessionData;
        }
      } catch {
        // Page might have been closed/navigated
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error("登录超时或未检测到登录态，请重试。");
  } finally {
    try { await browser.close(); } catch {}
  }
}
