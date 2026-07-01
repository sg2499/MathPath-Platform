# MathPath Project External Assets

The master external assets for MathPath (including the 150 DPS sheet images across 30 lessons and the 3 master Excel sheets) are permanently stored on the local filesystem at the following absolute path:

`C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM\Level - 9`

**CRITICAL INSTRUCTION FOR ALL AGENTS:**
Do not ask the user to upload these sheets or images. Whenever you need to read or parse the master excel sheets or reference the DPS sheet images, ALWAYS access them directly from the absolute path above.

# EdTech Platform Robustness Guidelines
1. **Data Normalization**: Backend must act as the single source of truth. Metrics like standardized scores and time utililization must be computed precisely once in the backend, avoiding frontend logic fragmentation.
2. **Testing**: Enforce automated testing (Jest, Playwright) and block PRs on failure.
3. **Type Safety**: Strictly validate schemas (Zod/Pydantic) to enforce API contracts.
4. **CI/CD**: Require preview environments for review before merging to production.
