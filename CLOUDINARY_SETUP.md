# Cloudinary Setup Guide

## Step 1: Create a Cloudinary Account

1. Go to [https://cloudinary.com](https://cloudinary.com)
2. Click "Sign Up" (free tier available)
3. Complete the registration

## Step 2: Get Your Cloudinary Credentials

1. After logging in, you'll see your **Dashboard**
2. Note your **Cloud Name** (shown at the top of the dashboard)
3. Note your **API Key** (shown in the dashboard)
4. Your **API Secret** is also shown (keep this private!)

## Step 3: Create an Unsigned Upload Preset

1. In your Cloudinary Dashboard, go to **Settings** (gear icon)
2. Click on **Upload** in the left sidebar
3. Scroll down to **Upload presets** section
4. Click **Add upload preset**
5. Configure the preset:
   - **Preset name**: `quilliant_unsigned` (or any name you prefer)
   - **Signing mode**: Select **Unsigned**
   - **Folder**: `quilliant` (optional, helps organize files)
   - **Access mode**: **Public** (so files can be accessed via URL)
6. Click **Save**

## Step 4: Update the Configuration File

1. Open `src/config/cloudinary.js`
2. Replace the placeholder values:
   - `YOUR_CLOUD_NAME` → Your Cloud Name from Step 2
   - `YOUR_UPLOAD_PRESET` → The preset name you created (e.g., `quilliant_unsigned`)
   - `YOUR_API_KEY` → Your API Key (optional, only if you switch to signed uploads later)

## Step 5: Test the Setup

1. Start your development server: `npm run dev`
2. Go to the Personalize page
3. Try uploading a file
4. Check your Cloudinary Media Library to verify the file was uploaded

## Security Notes

- **Never commit your API Secret to version control**
- The unsigned upload preset is safe to use in frontend code
- Files are organized by user ID in the folder structure: `quilliant/{userId}/`
- All uploaded files are publicly accessible via their URLs

## Troubleshooting

- **Upload fails**: Check that your upload preset name matches exactly
- **Files not appearing**: Verify the upload preset is set to "Unsigned" mode
- **CORS errors**: Cloudinary should handle CORS automatically, but check your browser console

