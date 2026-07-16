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

const RoleHeadings: Record<string, string> = {
  admin: "Admin Login",
  teacher: "Teacher Login",
  student: "Student Login",
};

async function OpenLogin(
  BrowserInstance: Browser,
  Viewport: ViewportCase,
  Theme: typeof Themes[number],
  PageErrors: string[],
  Role: keyof typeof RoleHeadings = "student",
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
  await PageInstance.goto(`${BaseUrl}/login?role=${Role}`, { waitUntil: "domcontentloaded" });
  await expect(PageInstance.getByRole("heading", { name: RoleHeadings[Role] })).toBeVisible();
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

    const FormZone = document.querySelector<HTMLElement>('[data-testid="login-form-zone"]');
    const Shell = document.querySelector<HTMLElement>('[data-testid="login-shell"]');
    const StoryPanel = document.querySelector<HTMLElement>('[data-testid="login-story-panel"]');
    const StoryPanelVisible = !!StoryPanel && StoryPanel.getBoundingClientRect().width > 0;

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      shell: Rect('[data-testid="login-shell"]'),
      frame: Rect('[data-testid="login-frame"]'),
      form: Rect('[data-testid="student-login-form"]'),
      submit: Rect('[data-testid="student-login-form"] button[type="submit"]'),
      mobileHeaderOverlap: OverlapArea(Brand, ThemeToggle),
      tabLabels: Tabs.map((Tab) => (Tab.textContent || "").trim()),
      clippedTabs: Tabs.filter((Tab) => Tab.scrollWidth > Tab.clientWidth + 1).length,
      identifierFontSize: Identifier ? Number.parseFloat(window.getComputedStyle(Identifier).fontSize) : 0,
      darkMode: document.documentElement.classList.contains("dark"),
      // "Visible in one go" means: (a) the page itself never grows taller than the
      // viewport, and (b) the form column never needs its own internal scrollbar either.
      // Both are checked below instead of assumed.
      formZoneScrollOverflow: FormZone ? FormZone.scrollHeight - FormZone.clientHeight : 0,
      shellScrollOverflow: Shell ? Shell.scrollHeight - Shell.clientHeight : 0,
      // The desktop "story" (brand/copy/feature) panel has its own fixed height to fit
      // within, separate from the form column - only visible at wide-enough viewports.
      // Checked the same way as the form column so a future content change can't silently
      // clip the bottom feature-card row again without a real test catching it.
      storyPanelVisible: StoryPanelVisible,
      storyPanelScrollOverflow: StoryPanel ? StoryPanel.scrollHeight - StoryPanel.clientHeight : 0,
    };
  });
}

// Diagnostic-only: measures each sub-section of the desktop story panel so a CI failure
// tells us WHICH element is oversized instead of just the total overflow amount. Not part
// of the layout contract itself - purely so the next failed run's log is self-explanatory.
async function ReadStoryPanelBreakdown(PageInstance: Page) {
  return PageInstance.evaluate(() => {
    const HeightOf = (Selector: string) => {
      const Element = document.querySelector<HTMLElement>(Selector);
      return Element ? Math.round(Element.getBoundingClientRect().height) : null;
    };
    const Feature = document.querySelectorAll<HTMLElement>(".math-login-feature");
    return {
      storyPanel: HeightOf('[data-testid="login-story-panel"]'),
      storyContent: HeightOf(".math-login-story-content"),
      logoCard: HeightOf(".math-login-logo-card"),
      logoMark: HeightOf(".math-login-logo-mark"),
      storyCopy: HeightOf(".math-login-story-copy"),
      eyebrow: HeightOf(".math-login-eyebrow"),
      headline: HeightOf(".math-login-story-headline"),
      description: HeightOf(".math-login-story-description"),
      featureGrid: HeightOf(".math-login-feature-grid"),
      featureCards: Array.from(Feature).map((El) => Math.round(El.getBoundingClientRect().height)),
    };
  });
}

for (const Theme of Themes) {
  for (const Viewport of Viewports) {
    test(`student login remains usable on ${Viewport.name} in ${Theme} mode`, async ({ browser }) => {
      const PageErrors: string[] = [];
      const { Context, PageInstance } = await OpenLogin(browser, Viewport, Theme, PageErrors, "student");

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
        expect(
          Layout.documentHeight,
          "The login page must be visible in one go, with no page-level scroll"
        ).toBeLessThanOrEqual(Layout.viewportHeight + 1);
        expect(
          Layout.formZoneScrollOverflow,
          "The form column must not need its own internal scrollbar either"
        ).toBeLessThanOrEqual(1);
        if (Layout.storyPanelVisible) {
          if (Layout.storyPanelScrollOverflow > 1) {
            const Breakdown = await ReadStoryPanelBreakdown(PageInstance);
            console.log(
              `[story-panel-breakdown] ${Viewport.name}/${Theme}/student overflow=${Layout.storyPanelScrollOverflow} `
              + JSON.stringify(Breakdown)
            );
          }
          expect(
            Layout.storyPanelScrollOverflow,
            "The desktop story panel must not clip its bottom feature-card row"
          ).toBeLessThanOrEqual(1);
        }
        expect(PageErrors).toEqual([]);
      } finally {
        await Context.close();
      }
    });
  }
}

// The desktop "story" panel's content length depends on which role is active - Admin's
// copy in particular ran noticeably longer than Teacher/Student's, so a fix verified only
// against the Student role (the only one the suite above ever loads) could still leave
// Admin and/or Teacher clipped. Covers just the viewport widths where the story panel is
// actually visible (>=1180px), not the full matrix, to keep this addition proportionate.
const DesktopViewports = Viewports.filter((V) => V.width >= 1280);
const OtherRoles = ["admin", "teacher"] as const;

for (const Theme of Themes) {
  for (const Viewport of DesktopViewports) {
    for (const Role of OtherRoles) {
      test(`${Role} login story panel is not clipped on ${Viewport.name} in ${Theme} mode`, async ({ browser }) => {
        const PageErrors: string[] = [];
        const { Context, PageInstance } = await OpenLogin(browser, Viewport, Theme, PageErrors, Role);

        try {
          const Layout = await ReadLayout(PageInstance);
          expect(Layout.storyPanelVisible, "The story panel should be visible at this width").toBe(true);
          if (Layout.storyPanelScrollOverflow > 1) {
            const Breakdown = await ReadStoryPanelBreakdown(PageInstance);
            console.log(
              `[story-panel-breakdown] ${Viewport.name}/${Theme}/${Role} overflow=${Layout.storyPanelScrollOverflow} `
              + JSON.stringify(Breakdown)
            );
          }
          expect(
            Layout.storyPanelScrollOverflow,
            `The ${Role} story panel must not clip its bottom feature-card row`
          ).toBeLessThanOrEqual(1);
          expect(
            Layout.documentHeight,
            "The login page must be visible in one go, with no page-level scroll"
          ).toBeLessThanOrEqual(Layout.viewportHeight + 1);
          expect(PageErrors).toEqual([]);
        } finally {
          await Context.close();
        }
      });
    }
  }
}
