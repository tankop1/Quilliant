// Cloudinary configuration
// Get these values from your Cloudinary Dashboard: https://cloudinary.com/console
// 
// To set up:
// 1. Sign up at https://cloudinary.com (free tier available)
// 2. Go to Dashboard
// 3. Copy your Cloud Name, API Key, and API Secret
// 4. Create an unsigned upload preset:
//    - Go to Settings > Upload
//    - Scroll to "Upload presets"
//    - Click "Add upload preset"
//    - Name it (e.g., "quilliant_unsigned")
//    - Set "Signing mode" to "Unsigned"
//    - Set folder to "quilliant" (optional)
//    - Save
// 5. Replace the values below

export const cloudinaryConfig = {
  cloudName: "dxqpoivvx",
  uploadPreset: "quilliant_unsigned",
  apiKey: "224342467865383", // Optional: only needed for signed uploads or admin operations
  // Note: API Secret should NEVER be in frontend code - only use on backend
};

// Cloudinary upload URL
export const cloudinaryUploadUrl = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/upload`;

