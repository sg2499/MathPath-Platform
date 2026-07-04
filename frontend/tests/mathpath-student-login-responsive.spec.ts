import { expect, test, type Browser, type Page } from "@playwright/test";

type ViewportCase = {
  name: string;
  width: number;
  height: number;
};

const Viewports: ViewportCase[] = [
  { name: "compact-phone", width: 320, height: 568 },
  { name: "small-phone", width: 360, height: 800 },
  { name: "modern-phone", width: 390, height: 844 },
  { name: "large-phone", width: 430, height: 932 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "short-laptop", width: 1280, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "full-hd", width: 1920, height: 1080 },
];

const Themes = ["light", "dark"] as const;
const BaseUrl = process.env.MATHPATH_BASE_URL || "http://127.0.0.1:3000";

async function OpenStudentLogin(
  BrowserInstance: Browser,
  Viewport: ViewportCase,
  Theme: typeof Themes[number],
  PageErrors: string[],
) {
  const Context = await BrowserInstance.newContext({
    viewport: { width: Viewport.width, height: Viewport.height },
    colorScheme: Theme,
    reducedMotion: "reduce",
  });

  await Context.addInitScript((RequestedTheme) => {
    window.localStorage.setItem("mathpath_theme", RequestedTheme);
    window.localStorage.setItem("mathpath_theme_user_set", "true");
  }, Theme);

  const PageInstance = await Context.newPage();
  PageInstance.on("pageerror", (Error) => PageErrors.push(Error.message));
  await PageInstance.goto(`${BaseUrl}/login?role=student`, { waitUntil: "domcontentloaded" });
  await expect(PageInstance.getByRole("heading", { name: "Student Login" })).toBeVisible();
  return { Context, PageInstance };
}

async function ReadLayout(PageInstance: Page) {
  return PageInstance.evaluate(() => {
    const Rect = (Selector: string) => {
      const Element = document.querySelector<HTMLElement>(Selector);
      if (!Element) return null;
      const Box = Element.getBoundingClientRect();
      if (Box.width === 0 || Box.height === 0) return null;
      return { left: Box.left, right: Box.right, top: Box.top, bottom: Box.bottom, width: Box.width, height: Box.height };
    };

    const OverlapArea = (First: ReturnType<typeof Rect>, Second: ReturnType<typeof Rect>) => {
      if (!First || !Second) return 0;
      return Math.max(0, Math.min(First.right, Second.right) - Math.max(First.left, Second.left))
        * Math.max(0, Math.min(First.bottom, Second.bottom) - Math.max(First.top, Second.top));
    };

    const Tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
    const Identifier = document.querySelector<HTMLElement>("#mathpath-login-identifier");

    const Brand = Rect(".math-login-mobile-brand");
    const ThemeToggle = Rect(".math-login-theme-toggle");

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      shell: Rect('[data-testid="login-shell"]'),
      frame: Rect('[data-testid="login-frame"]'),
      form: Rect('[data-testid="student-login-form"]'),
      submit: Rect('[data-testid="student-login-form"] button[type="submit"]'),
      mobileHeaderOverlap: OverlapArea(Brand, ThemeToggle),
      tabLabels: Tabs.map((Tab) => (Tab.textContent || "").trim()),
      clippedTabs: Tabs.filter((Tab) => Tab.scrollWidth > Tab.clientWidth + 1).length,
      identifierFontSize: Identifier ? Number.parseFloat(window.getComputedStyle(Identifier).fontSize) : 0,
      darkMode: document.documentElement.classList.contains("dark"),
    };
  });
}

for (const Theme of Themes) {
  for (const Viewport of Viewports) {
    test(`student login remains usable on ${Viewport.name} in ${Theme} mode`, async ({ browser }) => {
      const PageErrors: string[] = [];
      const { Context, PageInstance } = await OpenStudentLogin(browser, Viewport, Theme, PageErrors);

      try {
        const Layout = await ReadLayout(PageInstance);

        expect(Layout.documentWidth, "The login page must not create horizontal document overflow").toBeLessThanOrEqual(Layout.viewportWidth + 1);
        expect(Layout.frame, "The login frame must render").not.toBeNull();
        expect(Layout.form, "The login form must render").not.toBeNull();
        expect(Layout.submit, "The submit button must render").not.toBeNull();
        expect(Layout.frame!.left).toBeGreaterThanOrEqual(-1);
        expect(Layout.frame!.right).toBeLessThanOrEqual(Layout.viewportWidth + 1);
        expect(Layout.form!.left).toBeGreaterThanOrEqual(-1);
        expect(Layout.form!.right).toBeLessThanOrEqual(Layout.viewportWidth + 1);
        expect(Layout.submit!.left).toBeGreaterThanOrEqual(-1);
        expect(Layout.submit!.right).toBeLessThanOrEqual(Layout.viewportWidth + 1);
        expect(Layout.submit!.height, "The login action must remain touch friendly").toBeGreaterThanOrEqual(44);
        expect(Layout.mobileHeaderOverlap, "The mobile brand and theme toggle must not overlap").toBe(0);
        expect(Layout.tabLabels).toEqual(["Admin", "Teacher", "Student"]);
        expect(Layout.clippedTabs, "Role labels must remain readable").toBe(0);
        expect(Layout.darkMode).toBe(Theme === "dark");
        if (Viewport.width <= 639) {
          expect(Layout.identifierFontSize, "Mobile inputs must avoid forced iOS focus zoom").toBeGreaterThanOrEqual(16);
        }
        expect(PageErrors).toEqual([]);
      } finally {
        await Context.close();
      }
    });
  }
}
