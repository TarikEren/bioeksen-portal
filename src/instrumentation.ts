/**
 * The start hook of Next.js (FND-03).
 *
 * `register` runs once when the server starts and must complete before the
 * server takes a request. It checks the configuration and writes a `FATAL`
 * record with `CFG-5000` or `CFG-5001` for each setting that is unusable
 * (`sds-config`, **When it is validated**). The server code loads only in the
 * Node.js runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportStartup } = await import("@/lib/startup");
    reportStartup();
  }
}
