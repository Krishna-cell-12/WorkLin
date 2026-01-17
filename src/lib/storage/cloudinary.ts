/**
 * Cloudinary Storage Implementation
 * Free tier: 25 GB storage, 25 GB bandwidth/month
 * No credit card required!
 *
 * Sign up: https://cloudinary.com/users/register/free
 */

interface UploadResult {
  url: string | null;
  error: string | null;
}

/**
 * Upload file to Cloudinary
 * @param file - File to upload
 * @param folder - Folder path (e.g., 'workspaces/workspaceId/images')
 * @param options - Additional Cloudinary options
 */
export const uploadFile = async (
  file: File,
  folder: string = 'uploads',
  options?: {
    transformation?: string;
    publicId?: string;
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
  }
): Promise<UploadResult> => {
  try {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

    if (!cloudName) {
      throw new Error('Cloudinary cloud name not configured. Add VITE_CLOUDINARY_CLOUD_NAME to .env');
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', folder);

    if (options?.publicId) {
      formData.append('public_id', options.publicId);
    }

    // Defensive: ensure we do NOT send a 'transformation' parameter in the form data.
    // Cloudinary will return 400 for unsigned uploads if 'transformation' is present.
    if (formData.has('transformation')) {
      formData.delete('transformation');
    }
    // Some callers or bundlers might append resource_type; ensure it's set only by us if needed.
    if (formData.has('resource_type')) {
      formData.delete('resource_type');
    }
    if (options?.transformation) {
      // Don't send transformation with unsigned presets — apply it via URL after upload.
      // eslint-disable-next-line no-console
      console.warn(
        'Cloudinary: not sending transformation in upload request for unsigned preset; transformation will be applied to returned URL.'
      );
    }

    // Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${
        options?.resourceType === 'video' ? 'video' : 'image'
      }/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      let errorMessage = 'Upload failed';
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.error?.message || error.message || JSON.stringify(error) || 'Upload failed';
        } else {
          const text = await response.text();
          errorMessage = text || `Upload failed with status ${response.status}`;
        }

        if (errorMessage.includes('Invalid upload preset')) {
          errorMessage = 'Invalid upload preset. Please check VITE_CLOUDINARY_UPLOAD_PRESET in .env';
        } else if (errorMessage.includes('Unauthorized')) {
          errorMessage = 'Unauthorized. Please check your Cloudinary credentials.';
        } else if (errorMessage.includes('Transformation parameter is not allowed')) {
          errorMessage =
            'Cloudinary rejected a transformation parameter on an unsigned upload. Remove transformation from upload or use signed uploads.';
        }
      } catch (parseError) {
        errorMessage = `Upload failed with status ${response.status}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    let url = data.secure_url;

    // Apply transformation via URL if provided (since we can't use transformation param with unsigned uploads)
    if (options?.transformation && url) {
      url = url.replace('/upload/', `/upload/${options.transformation}/`);
    }

    return { url, error: null };
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    let errorMessage = error.message || 'Upload failed';

    if (errorMessage.includes('Cloudinary cloud name not configured')) {
      errorMessage = 'Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME to .env file. See QUICK_STORAGE_SETUP.md for setup instructions.';
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      errorMessage = 'Network error. Please check your internet connection and try again.';
    }

    return { url: null, error: errorMessage };
  }
};
