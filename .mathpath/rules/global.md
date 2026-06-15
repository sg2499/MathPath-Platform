# MathPath Global AI Rules

## 1. UI Aesthetics and Constraints
* **Gamified Animations**: We elevate the page feel with gamified interactive animations built *on top* of standard layouts (e.g., hover glows, staggered entrance cascading, scale interactions, shimmer effects).
* **Teacher Login Specifics**: Text like student names in teacher modules MUST use explicit black styling (e.g., `!text-slate-950 dark:!text-white`) instead of inheriting generic role colors.
* **Hero Blocks**: Must strictly adhere to the global MathPath platform design system (`math-hero`, `math-student-metric-card`). Do not use ad-hoc Tailwind for core structural hero elements if a system component exists.

## 2. Backend & Data Logic
* **Deletion Cascade**: When deleting rows (e.g., from Admin dashboard), it MUST trigger a logical cascade that removes or hides records from all corresponding Teacher and Student dashboards. Use `is_active = False` where soft-deletes are the standard.

*(More rules will be added as architectural decisions are made.)*
