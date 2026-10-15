# Privacy Policy & Data Retention Specification

**Bulk Certificate Generator** is designed with privacy-first principles. We recognize that student rosters, participant lists, and certification credentials contain personal student data that must be safeguarded with strict ephemeral storage policies.

---

## 1. Core Privacy Commitments

1. **Zero Selling or Data Sharing**: Student records, participant names, and certificate files are never shared with third parties, advertisers, or external partners.
2. **Zero Model Training**: Student lists, template artwork, and generated documents are never used for AI model training or machine learning analytics.
3. **No Hidden Tracking**: The application contains no third-party tracking scripts, advertising SDKs, or session replay telemetry.
4. **Download-First Architecture**: Connecting third-party cloud storage (such as Google Drive) is completely optional. You can generate and download all files locally.

---

## 2. What Data is Collected & Stored

| Data Category | Purpose | Storage Location | Retention Duration |
| :--- | :--- | :--- | :--- |
| **User Account Credentials** | Admin authentication and session control. | SQLite `users` table (`storage/db/app.sqlite`). | Persistent until admin deletion. Password is stored solely as a one-way `bcrypt` hash (cost factor 12). |
| **Uploaded PDF Templates** | Used as the background artwork for overlaying text. | Per-batch isolated directory (`storage/temp/uploads/`). | 24 hours maximum, or immediately upon clicking "Delete this batch now". |
| **Participant Spreadsheets (CSV/XLSX)** | Parsed to obtain names, programs, and mapping fields. | Per-batch isolated directory (`storage/temp/uploads/`). | 24 hours maximum, or immediately upon clicking "Delete this batch now". |
| **Generated Certificates (PDF/ZIP)** | Downloadable individual PDFs, combined PDF, and ZIP archive. | Per-job isolated directory (`storage/temp/jobs/`). | 24 hours maximum, or immediately upon clicking "Delete this batch now". |
| **Google Drive OAuth Tokens (Optional)** | Enables resumable upload to user's chosen Drive folder if connected. | Encrypted at rest in database using AES-256-GCM. | Revoked with Google and wiped from server immediately when the user clicks "Disconnect Google Drive". |

---

## 3. Ephemeral Retention & Automated Cleanup

- **24-Hour Default Expiry**: Every batch created in the system is assigned a 24-hour expiration timestamp (`expires_at`).
- **Immediate User Deletion**: Users can delete any batch on demand from the Dashboard or Results screen. Deletion recursively purges the original template, spreadsheet, generated PDFs, and job logs from disk and drops the database records.
- **Server-Side Isolation**: Files are stored in user-isolated directories using randomized UUID filenames (`crypto.randomUUID()`) to prevent path traversal or unintended access.

---

## 4. Google Drive OAuth Scopes

When you connect Google Drive, Bulk Certificate Generator requests access only to:
- `https://www.googleapis.com/auth/drive.file`

This scope restricts application access exclusively to files and folders that Bulk Certificate Generator itself creates or opens with user permission. It **cannot** view, read, or modify other documents in your Google Drive.
