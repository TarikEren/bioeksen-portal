# Object Storage

S3-compatible object storage holds e-IFU document files, course media and 3D
assets. Storage layout is a traceability concern, not an implementation detail.

## Buckets

| Bucket | Contents | Access |
|---|---|---|
| `bioeksen-documents` | e-IFU controlled files | Private. Never public-read. Served only through short-lived signed URLs. |
| `bioeksen-course-media` | Course images, video, 3D models | Private. Signed URLs for authenticated learners. |
| `bioeksen-uploads-tmp` | In-flight uploads pending validation | Private. Lifecycle rule deletes objects after 24 hours. |

No bucket has public-read ACLs, and no bucket policy grants anonymous access.
The e-IFU flow is unauthenticated at the application layer, not at the storage layer.

## Key naming

Keys are derived from database identifiers and a content hash. **Never** from a
user-supplied filename.

```
documents/{document_id}/{version_id}/{language_code}/{sha256}.pdf
course-media/{sha256[0:2]}/{sha256}.{ext}
models/{model_slug}/{version}/{sha256}.glb
```

Course media carries **no course, version or block segment**, and that is a
change from what this file said before the media library was built. The reason
is what the library is: an author uploads an image once and picks it from a list
afterwards. The same photograph appears in several blocks and in every later
version of the course. A key scoped to a block would store one copy per use, and
would dangle the moment the block was rewritten in the next version — inside
content that has already been published. The two-character prefix only keeps the
bucket listing from becoming one flat namespace.

Rules:

- The `sha256` segment makes keys content-addressed: identical bytes never
  duplicate, and a replaced file cannot collide with the file it replaced.
- Keys are immutable. A correction writes a **new** key; it never overwrites an
  existing one. This is what makes `DocumentFileReplacement` meaningful — see
  `state-machines.md`.
- `original_filename` is retained in the database for traceability and used only
  as the `Content-Disposition` filename on download, after sanitisation.

## Upload validation

Before an object is accepted into a non-temporary bucket:

1. Enforce a size limit per content type.
2. Detect the content type from the bytes (magic number), not from the
   `Content-Type` header or the file extension.
3. Reject anything outside the allow-list for that bucket. Documents: `application/pdf`
   only. Media: a fixed image/video allow-list. Models: `model/gltf-binary`.
4. Compute SHA-256 and compare with the client-declared hash when one was
   supplied (`EIFU_FILE_HASH_MISMATCH`).
5. Never trust, echo or store the raw filename as a path component.

### How a document upload actually runs

**Through the application, not presigned direct-to-storage.** A presigned PUT
never lets the server see the bytes, so the digest, the size and the content
type would all be whatever the client declared — and the whole of the list above
is about not believing a client. `bioeksen-uploads-tmp` is therefore unused by
the document path: validation happens before anything is written anywhere,
which is what the tmp bucket existed to approximate.

The cost is that the bytes pass through the process, which is why
`MAX_DOCUMENT_BYTES` is 20 MB. An IFU is a few pages; the limit is what makes
holding one in memory to hash it safe.

The write uses `IfNoneMatch: '*'`, so it fails rather than overwrites. Keys are
content-addressed and a collision means identical bytes, but a silent overwrite
is how a retained file would be destroyed by the correction meant to preserve
it — not something to leave to the key derivation being right.

### How a course image upload runs

The same shape and the same refusal to believe a client: through the
application, magic number before anything else, digest computed here. Three
things differ, each for a stated reason.

`MAX_IMAGE_BYTES` is 8 MB rather than 20. SVG is refused — it is an image
everywhere except in the way that counts, being a document that can carry
script, and course media is served `inline`.

The write is `putIfAbsent` rather than `put`: a collision on a media key means
two authors uploaded the same diagram, which is ordinary and must succeed both
times. On the document path a collision is a retained controlled file being
written over, which is why that path fails instead. The `CourseAsset` row is
written with an upsert on the key for the same reason.

An orphaned media object is not cleaned up, unlike a document object. It is
bytes that the next upload of the same image adopts, rather than an
unreferenced controlled file.

3D models are larger still and are not built yet. When they are, the tmp-bucket
flow may be the right shape for them; it is not for documents and was not needed
for images.

## Signed URLs

| Content | TTL | Notes |
|---|---|---|
| e-IFU document download | 5 minutes | Single-use in effect; the short TTL is the control. |
| Course media | 30 minutes | Long enough for a lesson without becoming a shareable link. |
| Video / 3D assets | 60 minutes | Larger assets, longer sessions. |

Rules:

- A signed URL is generated **only after** authorization has been checked for
  that specific object. Generating one is itself a privileged operation.
- **The client is never handed a storage key without a URL beside it.** Block
  configuration holds keys; the read paths (`ContentController.tree`,
  `LearningController.blocks`) return an `asset_urls` map alongside. The key
  stays in the configuration deliberately — an author saves back what they were
  given, and substituting a URL into `asset` would store a URL, which is the one
  thing that field exists to prevent.
- Course media is signed `inline` where documents are signed `attachment`. Three
  things upstream make that safe: the type came from a magic number, SVG is not
  in the allow-list, and `ResponseContentType` pins what the store announces.
  The object store is also a different origin from the application.
- Signed URLs are never logged, never placed in a redirect that gets recorded in
  access logs with query strings, and never emailed.
- `DOWNLOAD` and `VIEW` actions are recorded in `EIFUAccessRecord` at URL
  generation time, since the fetch itself bypasses the application.

## Deletion

Objects backing a `DocumentFile`, `DocumentFileReplacement` or issued
`Certificate` are **never** deleted, including when the file is replaced. Bucket
lifecycle expiry rules must not be configured on `bioeksen-documents`.

Only `bioeksen-uploads-tmp` has a deletion lifecycle.

## Data residency

The storage endpoint must be hosted in Turkey. Do not configure cross-region
replication to a region outside Turkey. See `privacy-data-residency.md` and ADR-0006.

## Credentials

Storage credentials are read from the environment and never appear in the React
bundle. The frontend never talks to object storage with credentials — it only
follows signed URLs the backend issues.
