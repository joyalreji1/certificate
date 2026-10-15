# Bulk Certificate Generator

A production-quality web application to create large batches of personalized PDF certificates with exact vector template fidelity, automated validation, honest status reporting, and genuine Google Drive integration.

---

## Key Features

- **Exact Template Fidelity**: The uploaded PDF artwork is preserved unaltered with `pdf-lib` + `@pdf-lib/fontkit`. Text is overlaid in PDF point space without rasterization or redrawing.
- **Robust Spreadsheet Parsing**: Supports both Excel (`.xlsx`, `.xls`) and CSV with delimiter auto-detection, multi-sheet selection, formula injection sanitation, and whitespace normalization.
- **Strict Validation Engine**: Audits 100% of rows for missing required fields, whitespace-only entries, duplicates (exact and name+program), and overlong strings.
- **Enterprise Security**:
  - httpOnly, Secure, SameSite session cookies with idle (30 min) and absolute timeouts.
  - Rate-limited login (5 failures per 15 min triggers temporary lockout).
  - Bcrypt password hashing (cost factor ≥ 12). Plaintext passwords never stored or logged.
  - Constant-time verification and uniform response timing.
  - CSRF protection across state-changing endpoints.
  - Ephemeral 24-hour file retention with immediate user deletion support.
- **Download-First & Drive Ready**: Operates completely offline without Google Drive; optionally connects to Google Drive via real OAuth 2.0 (`drive.file` scope).

---

## Tech Stack & Architecture

- **Monorepo**:
  - `packages/shared`: Shared TypeScript types, data models, and schemas.
  - `apps/server`: Node.js, Express, `node:sqlite` (native SQLite in Node 24), `pdf-lib`, `xlsx`, `papaparse`, `bcryptjs`.
  - `apps/web`: React 18, Vite, TypeScript, Zustand, `pdfjs-dist`, `lucide-react`.
  - `tests/fixtures`: Deterministic test fixtures (sample PDF, 220-row spreadsheet with seeded edge cases).

---

## Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default seed admin credentials:
- **Login Name**: `joyalregi8@gmail.com`
- **Password**: `Admin@123`

### 3. Build Packages
```bash
npm run build
```

### 4. Run Test Suites
```bash
npm run test --workspace=apps/server
```

### 5. Launch Development Servers
```bash
# Terminal 1: Backend API (port 4000)
npm run dev --workspace=apps/server

# Terminal 2: Frontend Web App (port 5173)
npm run dev --workspace=apps/web
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Documentation Links

- [Google Cloud OAuth Setup Guide](docs/GOOGLE_CLOUD_SETUP.md)
- [Privacy & Data Retention Specification](docs/PRIVACY.md)
- [Staged Implementation Plan](C:/Users/IRFAN/.gemini/antigravity-ide/brain/340852f3-6bb4-4dbb-b154-e3824c4945a4/implementation_plan.md)
