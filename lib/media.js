import { v2 as cloudinary } from 'cloudinary';

// The Cloudinary SDK reads CLOUDINARY_URL from the environment automatically.
export const mediaEnabled = () => Boolean(process.env.CLOUDINARY_URL);

export function uploadBuffer(buffer, mimetype) {
  const resource_type = mimetype.startsWith('video/') ? 'video' : 'image';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: process.env.CLOUDINARY_FOLDER || 'sic-growth', resource_type },
      (err, result) => (err ? reject(err) : resolve({ url: result.secure_url, public_id: result.public_id, resource_type }))
    );
    stream.end(buffer);
  });
}

export async function destroy(public_id, resource_type) {
  if (!public_id || !mediaEnabled()) return;
  try {
    await cloudinary.uploader.destroy(public_id, { resource_type });
  } catch (err) {
    console.error('[media] delete failed:', err.message);
  }
}
