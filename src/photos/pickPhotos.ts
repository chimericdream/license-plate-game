/**
 * Opens the system photo picker (or the camera) and resolves with the chosen
 * files, or an empty list if the user backs out. Must be called straight from
 * a tap, or the browser will ignore it.
 */
export function pickPhotos(options: { camera: boolean; multiple?: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = options.multiple ?? !options.camera;
    if (options.camera) input.setAttribute('capture', 'environment');
    input.hidden = true;

    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    document.body.append(input);
    input.click();
  });
}
