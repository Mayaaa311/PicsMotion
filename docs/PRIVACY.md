# Privacy & Data Retention

(Design targets for Milestone 7; enforced as the pipeline is implemented — spec §17.19.)

- **Immutable original.** The uploaded photo is never overwritten. A normalized
  display copy, cryptographic hash, EXIF orientation, dimensions and MIME type
  are stored alongside it.
- **Signed, expiring URLs** for private source images.
- **Controlled storage.** Provider outputs are copied into project-controlled
  storage; temporary provider-facing assets are deleted after the retention period.
- **User deletion.** Users can delete their project and all generated assets.
- **Disclosure & consent.** The set of external providers that receive image
  content is documented and shown to the user. Private images are **not** sent to
  fallback providers without explicit, user-visible consent.
- **Minimize exposure.** Images are sent to no more providers than necessary.
- **Provenance.** Every layer records whether its visible pixels are `original`,
  `generated`, or `mixed`, plus the providers and request ids involved, so
  generated regions are always identifiable.
