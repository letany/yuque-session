import puppeteer from "puppeteer";
import type { SessionData } from "../types.js";
import { saveSession } from "./session.js";

const YUQUE_LOGIN_URL = "https://www.yuque.com/login";
const COOKIE_DOMAIN = ".yuque.com";

const POLL_INTERVAL = 1000;
const MAX_WAIT = 10 * 60 * 1000;

export async function login(): Promise<SessionData> {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
  });

  try {
    const page = await browser.newPage();
    await page.goto(YUQUE_LOGIN_URL, { waitUntil: "networkidle2" });

    console.log("浏览器已打开，请在页面中完成登录（手机号+验证码/扫码均可）...");
    console.log("登录成功后本工具会自动捕获会话信息。");

    const start = Date.now();
    let sessionValue = "";
    let ctokenValue = "";

    while (Date.now() - start < MAX_WAIT) {
      const cookies = await page.cookies();
      const sessionCookie = cookies.find(
        (c) => c.name === "_yuque_session" && c.domain.includes("yuque.com")
      );
      const ctokenCookie = cookies.find(
        (c) => c.name === "yuque_ctoken" && c.domain.includes("yuque.com")
      );

      if (sessionCookie?.value) {
        sessionValue = sessionCookie.value;
        ctokenValue = ctokenCookie?.value ?? "";
        break;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    if (!sessionValue) {
      throw new Error("登录超时或未检测到登录态，请重试。");
    }

    let user = null;
    try {
      const userResp = await page.evaluate(async () => {
        const res = await fetch("/api/users/me", {
          credentials: "include",
        });
        if (!res.ok) return null;
        return await res.json();
      });
      if (userResp?.data) {
        user = {
          id: userResp.data.id,
          name: userResp.data.name,
          login: userResp.data.login,
          avatar_url: userResp.data.avatar_url,
        };
      }
    } catch {
      // user info is optional
    }

    const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;

    const sessionData: SessionData = {
      session: sessionValue,
      ctoken: ctokenValue,
      user,
      expiresAt,
      createdAt: Date.now(),
    };

    saveSession(sessionData);

    if (user) {
      console.log(`登录成功！用户: ${user.name} (@${user.login})`);
    } else {
      console.log("登录成功！");
    }
    console.log(`会话已保存，有效期约 14 天。`);

    return sessionData;
  } finally {
    await browser.close();
  }
}
