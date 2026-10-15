# Google Cloud OAuth 2.0 & Google Drive Setup Guide

This guide provides instructions for configuring Google Cloud to enable genuine Google Drive uploads for the **Bulk Certificate Generator**.

---

## 1. Overview & Scope Principles

Bulk Certificate Generator operates **Download-First**. All certificate generation, previewing, and ZIP/combined-PDF packaging functions operate with 100% independence from Google services.

When the user chooses to connect Google Drive, the application uses **real OAuth 2.0 with PKCE and server-side authorization code exchange**. We intentionally request only the narrowest possible scope:
- `https://www.googleapis.com/auth/drive.file` — View and manage Google Drive files and folders that you have opened or created with this app.
- `openid email` (optional) — Displays the connected Google account email in the app's settings.

**Why `drive.file`?**
This scope does not grant broad access to existing private user files in Google Drive. It is restricted exclusively to files and folders created by this application.

---

## 2. Step-by-Step Google Cloud Project Configuration

### Step 1: Create a Google Cloud Project
1. Log in to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown in the top navigation bar and select **New Project**.
3. Set the Project Name: `Bulk Certificate Generator` (or your organization's name).
4. Click **Create** and ensure the new project is selected.

### Step 2: Enable the Required APIs
1. Navigate to **APIs & Services > Library**.
2. Search for **Google Drive API** and click **Enable**.
3. (Optional) Search for **Google Picker API** and click **Enable** if you intend to enable the Google Drive folder selector picker modal.

### Step 3: Configure the OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**.
2. Select **User Type**:
   - Choose **External** (unless your organization uses Google Workspace and you only want internal members to access it).
   - Click **Create**.
3. **App Information**:
   - **App name**: `Bulk Certificate Generator`
   - **User support email**: Your admin contact email (e.g. `joyalregi8@gmail.com`)
   - **Developer contact information**: Your developer email address
4. **Scopes**:
   - Click **Add or Remove Scopes**.
   - Filter and select:
     - `https://www.googleapis.com/auth/drive.file`
     - `.../auth/userinfo.email`
     - `openid`
   - Click **Update**.
5. **Test Users (Crucial for Testing Mode)**:
   - While your Publishing Status is **Testing**, Google restricts OAuth access to explicit test accounts.
   - Click **Add Users** and add your Google account (e.g. `joyalregi8@gmail.com`).
   - You can add up to 100 test user emails.
   - Click **Save and Continue**.

### Step 4: Create OAuth 2.0 Credentials
1. Navigate to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Select **Application type**: **Web application**.
4. Set **Name**: `Bulk Certificate Generator Web Client`.
5. **Authorized JavaScript origins**:
   - Development: `http://localhost:5173`
   - Production: `https://your-domain.com`
6. **Authorized redirect URIs** (Must match exact character-for-character):
   - Development: `http://localhost:4000/api/auth/google/callback`
   - Production: `https://api.your-domain.com/api/auth/google/callback` (or your reverse-proxy callback URL)
7. Click **Create**.
8. A modal will display your **Client ID** and **Client Secret**.

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env` in the repository root. **Never commit `.env` to Git.**

```bash
# Google Cloud OAuth 2.0
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback

# Security & Secrets
SESSION_SECRET=a_random_32_character_string_for_session_encryption
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

> [!CAUTION]
> The `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and `TOKEN_ENCRYPTION_KEY` must **never** be exposed in the frontend code, browser bundles, network requests, or repository commits. The server decrypts and handles all token operations server-side.

---

## 4. Production Release & Verification

1. **Testing vs. Production Publishing Status**:
   - In **Testing** mode, refresh tokens expire after 7 days, and only listed test accounts can authorize.
   - In **In production** mode, any Google account can log in.
2. **Verification Requirements**:
   - Because `drive.file` is classified as a sensitive scope (not restricted), Google requires domain verification, a publicly accessible Privacy Policy URL (`/docs/PRIVACY.md`), and a demonstration video explaining why the scope is needed.
   - You do **not** need a costly third-party security assessment (CASA) for `drive.file`, unlike broad drive scopes.

---

## 5. Troubleshooting Common OAuth Issues

| Error Code / Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| `redirect_uri_mismatch` | The callback URL registered in Google Cloud Console does not match `GOOGLE_REDIRECT_URI` exactly. | Ensure trailing slashes, protocol (`http` vs `https`), and ports (`4000`) match character-for-character in both Google Console and `.env`. |
| `access_denied` / Error 403 | App is in "Testing" mode and the user is not listed under Test Users. | Add the user's email under **OAuth consent screen > Test users** in Google Cloud Console. |
| `invalid_grant` | The authorization code expired, was already used, or the refresh token was revoked by the user. | Click "Reconnect Google Drive" to start a fresh authorization code exchange. |
| "Google hasn't verified this app" | The app is in Testing mode or pending verification. | Click **Advanced > Go to Bulk Certificate Generator (unsafe)** during testing/development. |
| `insufficient_scope` | The user granted identity scopes but unchecked the Drive permission box. | Prompt the user to reconnect and consent to the Drive file creation permission. |
