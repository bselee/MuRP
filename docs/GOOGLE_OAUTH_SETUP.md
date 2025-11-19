# Google OAuth Setup for MuRP

## Overview

This enables Google integration for:
- ✅ **Sign in with Google** - Users can log in using their Google account
- ✅ **Google Calendar** - Sync production builds, pull creator schedules
- ✅ **Google Drive** - Store/access documents, artwork, PDFs
- ✅ **Google Sheets** - Import/export inventory, vendor data, BOMs

## 1. Create Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Click "Select a project" → "NEW PROJECT"
3. Name it "MuRP" and click "CREATE"

## 2. Enable Required Google APIs

1. In your project, go to "APIs & Services" → "Library"
2. Search for and enable these APIs:
   - **Google Calendar API** - For production scheduling
   - **Google Drive API** - For document storage
   - **Google Sheets API** - For data import/export
   - **Google Docs API** - For document templates
3. Click "ENABLE" for each one

### 3. Enable Calendar Scope

In the Supabase Google provider settings, add these scopes (space-separated):
```
https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets
```

That's it! No need to add anything to `.env.local` for Supabase Auth.

## What Users Can Do

Once configured, any user can:

1. **Sign in with Google** - Use Google account to log into MuRP
2. **Connect Google Services** - In Settings, click "Connect Google Account"
3. **Access Features**:
   - 📅 **Calendar** - Sync production builds with Google Calendar
   - 📊 **Sheets** - Import/export inventory data to Google Sheets
   - 📁 **Drive** - Store product documentation, artwork, compliance docs
   - 📄 **Docs** - Generate product data sheets, compliance reports

Each user's data is private - they only access their own Google account data.

## 4. Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "+ CREATE CREDENTIALS" → "OAuth client ID"
3. Select "Web application"
4. Name it: `MuRP Production`
5. Under "Authorized redirect URIs", add:
   ```
   https://mpuevsmtoyvexhsqugkm.supabase.co/auth/v1/callback
   ```
6. Click "CREATE"
7. **COPY the Client ID and Client Secret** - you'll need these for Supabase

## 5. Configure Supabase

1. Go to your Supabase project: https://supabase.com/dashboard/project/wndtcnlwfqbvoprnuzdo/auth/providers
2. Enable "Google" provider
3. Paste:
   - **Client ID** from step 4
   - **Client Secret** from step 4
4. Click "Save"

## 6. Test the Integration

1. Go to https://murp.app
2. Navigate to Settings → Google Calendar Settings
3. Click "Connect Google Account"
4. You should see Google OAuth login
5. Grant calendar permissions
6. You'll be redirected back to MuRP

## Callback URL

The correct callback URL for your Supabase project is:
```
https://mpuevsmtoyvexhsqugkm.supabase.co/auth/v1/callback
```

This is automatically provided by Supabase and should be added to Google Cloud Console as shown in step 4.5 above.
