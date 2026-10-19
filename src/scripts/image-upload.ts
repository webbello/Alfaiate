// Runs in the admin's browser (SPEC-phase-3 assumption 6): turns one chosen photo into three small JPEGs by redrawing it on
// a canvas, which drops EXIF, GPS and every other hidden detail, then uploads those. The server re-validates all of it.
import {
  MAX_ORIGINAL_BYTES,
  VARIANT_WIDTHS,
  checkOriginal,
  planVariants,
  type VariantName,
} from './resize-plan';

const QUALITY = 0.82;

function show(form: HTMLFormElement, text: string) {
  const status = form.querySelector<HTMLElement>('[data-upload-status]');
  if (status) status.textContent = text; // textContent only: never HTML
}

async function decode(file: File): Promise<ImageBitmap> {
  // from-image applies the photo's rotation before the metadata is thrown away
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function toJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('canvas'));
  context.fillStyle = '#ffffff'; // PNG/WebP transparency becomes white instead of black
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode'))),
      'image/jpeg',
      QUALITY,
    ),
  );
}

async function handle(form: HTMLFormElement, event: SubmitEvent) {
  event.preventDefault();
  const input = form.querySelector<HTMLInputElement>('input[type="file"]');
  const file = input?.files?.[0];
  if (!file) return show(form, form.dataset.msgChoose ?? 'Choose a photo.');
  const problem = checkOriginal(file);
  if (problem === 'type')
    return show(form, form.dataset.msgType ?? 'Use a JPEG, PNG or WebP photo.');
  if (problem === 'empty')
    return show(form, form.dataset.msgEmpty ?? 'That file is empty.');
  if (problem === 'size')
    return show(
      form,
      `${form.dataset.msgSize ?? 'That photo is too large. Maximum:'} ${MAX_ORIGINAL_BYTES / 1024 / 1024} MB`,
    );

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  show(form, form.dataset.msgWorking ?? 'Preparing the photo…');
  try {
    const bitmap = await decode(file);
    const plan = planVariants(bitmap.width, bitmap.height);
    const body = new FormData();
    for (const name of ['csrf', 'alt_text', 'caption'] as const)
      body.set(
        name,
        (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '',
      );
    for (const name of Object.keys(VARIANT_WIDTHS) as VariantName[]) {
      body.set(
        name,
        new File(
          [await toJpeg(bitmap, plan[name].width, plan[name].height)],
          `${name}.jpg`,
          { type: 'image/jpeg' },
        ),
      );
    }
    bitmap.close();
    const response = await fetch(form.action, {
      method: 'POST',
      body,
      credentials: 'same-origin',
    });
    window.location.assign(response.url); // the page the server redirected to, with its message
  } catch {
    show(
      form,
      form.dataset.msgFailed ??
        'The photo could not be prepared. Try a different photo.',
    );
    if (button) button.disabled = false;
  }
}

for (const form of document.querySelectorAll<HTMLFormElement>(
  'form[data-photo-upload]',
)) {
  form.addEventListener('submit', (event) => void handle(form, event));
}
