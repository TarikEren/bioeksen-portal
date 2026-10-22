/**
 * Ports for the servers that a test starts, and for the services that a test
 * makes unreachable.
 */
import net from "node:net";

/** A TCP port on 127.0.0.1 that was free when the call returned. */
export async function freePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("The operating system gave no TCP port."));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * A TCP port on 127.0.0.1 where nothing listens: a dependency at this port
 * does not answer. The port was free when the call returned.
 */
export async function closedPort(): Promise<number> {
  return await freePort();
}

/** Resolves when a TCP connection to the port succeeds, without an HTTP request. */
export async function waitForPort(
  port: number,
  options: { readonly timeoutMs: number; readonly isAlive: () => boolean },
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    if (!options.isAlive()) {
      throw new Error(`The process stopped before port ${String(port)} accepted a connection.`);
    }
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (open) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Port ${String(port)} did not accept a connection within ${String(options.timeoutMs)} ms.`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}
