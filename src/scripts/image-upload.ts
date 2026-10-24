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

function problemFor(form: HTMLFormElement, file: File): string | null {
  const problem = checkOriginal(file);
  if (problem === 'type')
    return form.dataset.msgType ?? 'Use a JPEG, PNG or WebP photo.';
  if (problem === 'empty')
    return form.dataset.msgEmpty ?? 'That file is empty.';
  if (problem === 'size')
    return `${form.dataset.msgSize ?? 'That photo is too large. Maximum:'} ${MAX_ORIGINAL_BYTES / 1024 / 1024} MB`;
  return null;
}

/** Cleans one photo in the browser and uploads it; resolves with the page the server redirected to (it carries the result message). */
async function sendOne(
  form: HTMLFormElement,
  file: File,
  preview?: HTMLElement | null,
): Promise<string> {
  const bitmap = await decode(file);
  if (preview) {
    // A canvas, not an <img>: the page's CSP only allows images from our own origin, so blob: and data: previews would be blocked.
    const thumb = document.createElement('canvas');
    thumb.width = 120;
    thumb.height = 120;
    const side = Math.min(bitmap.width, bitmap.height);
    thumb
      .getContext('2d')
      ?.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        120,
        120,
      );
    preview.appendChild(thumb);
  }
  const plan = planVariants(bitmap.width, bitmap.height);
  const body = new FormData();
  for (const name of ['csrf', 'alt_text', 'caption'] as const)
    body.set(
      name,
      (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '',
    );
  // The tailor portal asks the tailor to confirm the photo may be shown; a ticked box is sent, an unticked one is simply absent.
  const confirm = form.elements.namedItem('confirm');
  if (confirm instanceof HTMLInputElement && confirm.checked)
    body.set('confirm', 'yes');
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
  return response.url;
}

async function handle(form: HTMLFormElement, event: SubmitEvent) {
  event.preventDefault();
  const input = form.querySelector<HTMLInputElement>('input[type="file"]');
  const files = [...(input?.files ?? [])];
  if (files.length === 0)
    return show(form, form.dataset.msgChoose ?? 'Choose a photo.');
  const wrong = files.map((f) => problemFor(form, f)).find((m) => m);
  if (wrong) return show(form, wrong);

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  const previews = form.querySelector<HTMLElement>('[data-previews]');
  const room = Number(form.dataset.room ?? files.length);
  const todo = files.slice(0, Math.max(room, 1));
  let last = '';
  try {
    for (const [index, file] of todo.entries()) {
      show(
        form,
        todo.length > 1
          ? `${form.dataset.msgWorking ?? 'Preparing the photo…'} (${index + 1}/${todo.length})`
          : (form.dataset.msgWorking ?? 'Preparing the photo…'),
      );
      last = await sendOne(form, file, previews);
      previews?.lastElementChild?.classList.add('is-done');
      // stop at the first photo the server refused, and show why
      if (new URL(last).searchParams.get('msg') !== 'uploaded') break;
    }
    window.location.assign(last); // the page the server redirected to, with its message
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

// The tailor portal's "add photos" tile: choosing or dropping files sends them at once, once the tailor has ticked that the photos are theirs to show.
for (const form of document.querySelectorAll<HTMLFormElement>(
  'form[data-auto-upload]',
)) {
  const input = form.querySelector<HTMLInputElement>('input[type="file"]');
  form
    .querySelector<HTMLButtonElement>('[data-upload-button]')
    ?.setAttribute('hidden', '');
  const start = () => {
    if (!input?.files?.length) return;
    const confirm = form.elements.namedItem('confirm');
    if (confirm instanceof HTMLInputElement && !confirm.checked) {
      input.value = '';
      show(form, form.dataset.msgTick ?? 'Tick the box first.');
      confirm.focus();
      return;
    }
    form.requestSubmit();
  };
  input?.addEventListener('change', start);
  const drop = form.querySelector<HTMLElement>('[data-drop]');
  drop?.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('is-over');
  });
  for (const name of ['dragleave', 'dragend'])
    drop?.addEventListener(name, () => drop.classList.remove('is-over'));
  drop?.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-over');
    if (input && event.dataTransfer?.files.length) {
      input.files = event.dataTransfer.files;
      start();
    }
  });
}
