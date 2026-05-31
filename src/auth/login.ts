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
    // Try to get user info from the page data
    const userData = await page.evaluate(() => {
      const el = document.querySelector("script[data-name='currentUser']");
      if (el) {
        try { return JSON.parse(el.textContent || "{}"); } catch {}
      }
      const allScripts = document.querySelectorAll("script");
      for (const s of allScripts) {
        const t = s.textContent || "";
        if (t.includes("currentUser") || t.includes('"login"')) {
          try {
            const m = t.match(/currentUser\s*[:=]\s*({[^;]+})/);
            if (m) return JSON.parse(m[1]);
          } catch {}
        }
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
      const urlInfo = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/settings/profile"]');
        if (links.length > 0) return null;
        return window.location.hostname;
      });
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
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
  });

  try {
    const page = await browser.newPage();

    console.log("浏览器已打开，请在页面中完成登录（手机号+验证码/扫码均可）...");
    console.log("登录成功后本工具会自动捕获会话信息。");

    await page.goto("https://www.yuque.com/login", { waitUntil: "networkidle2" });

    const start = Date.now();
    while (Date.now() - start < MAX_WAIT) {
      const cookies = await page.cookies();
      const hasSession = cookies.some(
        (c) => c.name === "_yuque_session" && c.domain.includes("yuque.com") && c.value
      );
      if (hasSession) {
        // Give the page a moment to load user data
        await new Promise((r) => setTimeout(r, 2000));
        const sessionData = await getLoginFromPage(page);
        saveSession(sessionData);

        if (sessionData.user) {
          console.log(
            `登录成功！用户: ${sessionData.user.name} (@${sessionData.user.login})`
          );
        } else {
          console.log("登录成功！");
        }
        console.log("会话已保存，有效期约 14 天。");
        return sessionData;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error("登录超时或未检测到登录态，请重试。");
  } finally {
    await browser.close();
  }
}
