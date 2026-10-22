# Performance

Avoid premature optimization, but prevent obvious scalability problems:

- N+1 ORM queries
- unbounded lists/audit results
- synchronous heavy media processing
- serving large videos through the application when object/CDN delivery is appropriate
- oversized 3D assets
- unnecessary continuous Three.js render loops
- loading all analytics events into a browser

Use `select_related`/`prefetch_related` intentionally. Measure before adding caches.
