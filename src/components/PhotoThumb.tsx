import type { Photo } from '../domain/types';
import { usePhotoUrl } from '../state/photoHooks';
import classes from './Photos.module.css';

/** A square, cropped preview of a photo. Fills whatever box it is placed in. */
export function PhotoThumb({ photo, alt }: { photo: Photo; alt: string }) {
  const url = usePhotoUrl(photo.id, 'thumb');
  return url ? (
    <img className={classes.thumb} src={url} alt={alt} loading="lazy" />
  ) : (
    <div className={classes.thumb} aria-hidden />
  );
}
