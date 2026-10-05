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
  // Both logos are part of the layout contract below, so give the images a moment to arrive
  // rather than racing them. If one genuinely fails to load, the branding assertions catch it.
  await PageInstance.waitForFunction(
    () =>
      Array.from(
        document.querySelectorAll<HTMLImageElement>('[data-testid="login-mathpath-logo"] img, [data-testid="login-zetta-link"] img')
      ).every((Picture) => Picture.complete && Picture.naturalWidth > 0),
    undefined,
    { timeout: 15_000 }
  ).catch(() => undefined);
  // Measure the settled page: the display font swaps in after first paint.
  await PageInstance.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => undefined);
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

    const Brand = Rect('[data-testid="login-mathpath-logo"]');
    const ThemeToggle = Rect('[data-testid="login-theme-toggle"]');

    // How many lines a block of text occupies, from its own computed line height.
    const LineCount = (Selector: string) => {
      const Element = document.querySelector<HTMLElement>(Selector);
      if (!Element) return 0;
      const Box = Element.getBoundingClientRect();
      const LineHeight = Number.parseFloat(window.getComputedStyle(Element).lineHeight);
      if (!Box.height || !LineHeight) return 0;
      return Math.round(Box.height / LineHeight);
    };

    const ZettaLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="zetta-metrics.com"]')).map((Link) => {
      const Box = Link.getBoundingClientRect();
      return { href: Link.href, target: Link.target, rel: Link.rel, left: Box.left, right: Box.right, width: Box.width, height: Box.height };
    });
    const LogoLoaded = (Selector: string) => {
      const Picture = document.querySelector<HTMLImageElement>(Selector);
      if (!Picture) return false;
      const Box = Picture.getBoundingClientRect();
      return Picture.complete && Picture.naturalWidth > 0 && Box.width > 0 && Box.height > 0;
    };

    const FormZone = document.querySelector<HTMLElement>('[data-testid="login-form-zone"]');
    const Shell = document.querySelector<HTMLElement>('[data-testid="login-shell"]');
    const StoryPanel = document.querySelector<HTMLElement>('[data-testid="login-story-panel"]');
    const StoryPanelVisible = !!StoryPanel && StoryPanel.getBoundingClientRect().width > 0;
    // The stage (StoryPanel) holds a full-bleed decorative scene behind its content, so
    // measuring scrollHeight on the panel itself would count decoration as if it were real
    // overflowing content. The headline / description / live readout live in the title
    // card (login-story-content) - measuring overflow there reflects only the real content.
    const StoryContent = document.querySelector<HTMLElement>('[data-testid="login-story-content"]');

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
      brand: Brand,
      themeToggle: ThemeToggle,
      zettaLinks: ZettaLinks,
      mathPathLogoLoaded: LogoLoaded('[data-testid="login-mathpath-logo"] img'),
      zettaLogoLoaded: LogoLoaded('[data-testid="login-zetta-link"] img'),
      headlineLines: LineCount('[data-testid="login-story-headline"]'),
      descriptionLines: LineCount('[data-testid="login-story-description"]'),
      tabsTop: Rect('[data-testid="login-role-tabs"]')?.top ?? null,
      headingTop: Rect("#mathpath-login-heading")?.top ?? null,
      tabLabels: Tabs.map((Tab) => (Tab.textContent || "").trim()),
      clippedTabs: Tabs.filter((Tab) => Tab.scrollWidth > Tab.clientWidth + 1).length,
      identifierFontSize: Identifier ? Number.parseFloat(window.getComputedStyle(Identifier).fontSize) : 0,
      darkMode: document.documentElement.classList.contains("dark"),
      // "Visible in one go" means: (a) the page itself never grows taller than the
      // viewport, and (b) the form column never needs its own internal scrollbar either.
      // Both are checked below instead of assumed.
      formZoneScrollOverflow: FormZone ? FormZone.scrollHeight - FormZone.clientHeight : 0,
      shellScrollOverflow: Shell ? Shell.scrollHeight - Shell.clientHeight : 0,
      // The stage's title card (headline / description / live readout) has its own space
      // to fit within, separate from the form column. Checked the same way as the form
      // column so a future content change can't silently clip it without a real test
      // catching it.
      storyPanelVisible: StoryPanelVisible,
      storyPanelScrollOverflow: StoryContent ? StoryContent.scrollHeight - StoryContent.clientHeight : 0,
    };
  });
}

// Diagnostic-only: measures each part of the stage so a CI failure tells us WHICH element is
// oversized instead of just the total overflow amount. Not part of the layout contract itself -
// purely so the next failed run's log is self-explanatory.
async function ReadStoryPanelBreakdown(PageInstance: Page) {
  return PageInstance.evaluate(() => {
    const HeightOf = (Selector: string) => {
      const Element = document.querySelector<HTMLElement>(Selector);
      return Element ? Math.round(Element.getBoundingClientRect().height) : null;
    };
    return {
      storyPanel: HeightOf('[data-testid="login-story-panel"]'),
      storyContent: HeightOf('[data-testid="login-story-content"]'),
      stageSlot: HeightOf(".mp-si-slot"),
      headline: HeightOf('[data-testid="login-story-headline"]'),
      description: HeightOf('[data-testid="login-story-description"]'),
      readout: HeightOf(".mp-si-readout"),
      topBar: HeightOf(".mp-si-top"),
      bottomBar: HeightOf(".mp-si-foot"),
    };
  });
}

// Shared by every case below: both logos are really on screen, and the Zetta Metrics credit
// goes to the official site in a new tab.
function ExpectBrandingContract(Layout: Awaited<ReturnType<typeof ReadLayout>>) {
  expect(Layout.brand, "The MathPath logo must render").not.toBeNull();
  expect(Layout.themeToggle, "The theme toggle must render").not.toBeNull();
  expect(Layout.mathPathLogoLoaded, "The MathPath logo image must load and be visible").toBe(true);
  expect(Layout.zettaLogoLoaded, "The Zetta Metrics logo image must load and be visible").toBe(true);
  expect(Layout.zettaLinks.length, "The Zetta Metrics credit must be present").toBeGreaterThanOrEqual(1);
  for (const Link of Layout.zettaLinks) {
    expect(Link.href).toBe("https://www.zetta-metrics.com/");
    expect(Link.target, "The Zetta Metrics link must open in a new tab").toBe("_blank");
    expect(Link.rel).toContain("noopener");
    expect(Link.width, "The Zetta Metrics link must be visible").toBeGreaterThan(0);
    expect(Link.left).toBeGreaterThanOrEqual(-1);
    expect(Link.right).toBeLessThanOrEqual(Layout.viewportWidth + 1);
  }
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
        expect(Layout.mobileHeaderOverlap, "The MathPath logo and theme toggle must not overlap").toBe(0);
        ExpectBrandingContract(Layout);
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
            "The stage must not clip its title card"
          ).toBeLessThanOrEqual(1);
        }
        if (Viewport.width >= 1280) {
          expect(Layout.headlineLines, "The headline must stay on one line when there is room").toBe(1);
          expect(Layout.descriptionLines, "The description must stay on one line when there is room").toBe(1);
        }
        expect(PageErrors).toEqual([]);
      } finally {
        await Context.close();
      }
    });
  }
}

// The stage's copy length depends on which role is active - Admin's and Teacher's run
// noticeably longer than Student's, so a fix verified only against the Student role (the
// only one the suite above ever loads) could still leave them clipped or wrapped. Covers
// the desktop widths, not the full matrix, to keep this addition proportionate.
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
            `The ${Role} stage must not clip its title card`
          ).toBeLessThanOrEqual(1);
          expect(Layout.headlineLines, `The ${Role} headline must stay on one line`).toBe(1);
          expect(Layout.descriptionLines, `The ${Role} description must stay on one line`).toBe(1);
          expect(
            Layout.formZoneScrollOverflow,
            "The form column must not need its own internal scrollbar"
          ).toBeLessThanOrEqual(1);
          ExpectBrandingContract(Layout);
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

// Switching role must never move the form: the tabs, the heading and the sign-in button
// stay exactly where they are, whatever the role's copy length.
for (const Theme of Themes) {
  test(`role switch keeps the form in place in ${Theme} mode`, async ({ browser }) => {
    const PageErrors: string[] = [];
    const Viewport = { name: "desktop", width: 1440, height: 900 };
    const { Context, PageInstance } = await OpenLogin(browser, Viewport, Theme, PageErrors, "student");

    try {
      const Positions: Array<{ tabsTop: number | null; headingTop: number | null; submitTop: number | null }> = [];
      for (const Role of ["student", "teacher", "admin", "student"] as const) {
        // A click that lands before the page has hydrated is dropped, so retry until the role takes.
        await expect(async () => {
          await PageInstance.locator(`#mathpath-login-tab-${Role}`).click();
          await expect(PageInstance.getByRole("heading", { name: RoleHeadings[Role] })).toBeVisible({ timeout: 1_500 });
        }).toPass({ timeout: 20_000 });
        const Layout = await ReadLayout(PageInstance);
        Positions.push({
          tabsTop: Layout.tabsTop === null ? null : Math.round(Layout.tabsTop),
          headingTop: Layout.headingTop === null ? null : Math.round(Layout.headingTop),
          submitTop: Layout.submit ? Math.round(Layout.submit.top) : null,
        });
      }
      for (const Position of Positions) {
        expect(Position.tabsTop, "The role tabs must render").not.toBeNull();
        expect(Position, "The form must not move when the role changes").toEqual(Positions[0]);
      }
      expect(PageErrors).toEqual([]);
    } finally {
      await Context.close();
    }
  });
}
