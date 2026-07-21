# Media rights

Every package media file requires one active record under `content/media-rights/`. The record binds the article, exact `media/...` path, SHA-256 digest, approved raster MIME type, creator, source, rights basis, permission details, attribution, alt text, restrictions, and status.

Ingest rejects symlinks, files over 10 MiB, packages over 25 MiB, unapproved extensions, and extension/signature mismatches. SVG and executable formats are not accepted by this package lane. Missing rights, missing alt text, duplicate rights paths, hash mismatch, or unregistered files fail closed.

Rights records are evidence, not a substitute for retaining the underlying license or permission artifact in the appropriate private business system.
