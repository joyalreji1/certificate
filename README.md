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