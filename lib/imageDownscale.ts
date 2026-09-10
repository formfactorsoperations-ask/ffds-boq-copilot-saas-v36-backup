/*
  Keeping an uploaded floor plan small enough to survive being saved.

  The plan is stored as base64 inside the project document, and the whole
  document is compressed and written to Firestore as a single record. A photo
  of a drawing taken on a phone is 3-5 MB; base64 inflates that by a third and
  already-compressed JPEG data does not shrink again, so the record goes over
  the 1 MB limit. At that point the save path's emergency fallback strips
  images and writes the project **without the plan** — and it does so quietly:
  the studio sees a successful save and discovers the plan missing later.

  Downscaling on the way in means that fallback never has to fire. 1600px on
  the long edge is more resolution than the plan analysis uses and keeps a
  typical drawing comfortably inside the budget.
*/

export const MAX_PLAN_EDGE = 1600;
export const PLAN_JPEG_QUALITY = 0.85;

/** Strip the `data:<mime>;base64,` prefix — the app stores the payload alone. */
export const stripDataUrlPrefix = (dataUrl: string): string =>
  dataUrl.replace('data:', '').replace(/^.+,/, '');

/**
 * Read a file and, when it is a raster image larger than `MAX_PLAN_EDGE`,
 * return a downscaled JPEG. Anything else — a PDF, an image already small
 * enough, or a file the browser will not decode — comes back untouched, since
 * a plan that fails to convert is better stored as-is than lost.
 */
export const downscalePlanToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      if (!dataUrl) { reject(new Error('Empty file')); return; }

      if (!file.type.startsWith('image/')) {
        resolve(stripDataUrlPrefix(dataUrl));
        return;
      }

      const img = new Image();
      // A decode failure must not lose the upload.
      img.onerror = () => resolve(stripDataUrlPrefix(dataUrl));
      img.onload = () => {
        const longest = Math.max(img.width, img.height);
        if (!longest || longest <= MAX_PLAN_EDGE) {
          resolve(stripDataUrlPrefix(dataUrl));
          return;
        }
        const scale = MAX_PLAN_EDGE / longest;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(stripDataUrlPrefix(dataUrl)); return; }
        // Flatten onto white: a transparent PNG would otherwise go black once
        // it is re-encoded as JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(stripDataUrlPrefix(canvas.toDataURL('image/jpeg', PLAN_JPEG_QUALITY)));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
