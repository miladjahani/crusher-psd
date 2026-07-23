// VLESS protocol handler for Cloudflare Workers.
// Written from scratch, fully readable — no obfuscation, no hidden calls.
//
// How VLESS-over-WebSocket works, in short:
// 1. The client (e.g. v2rayNG) opens a WebSocket (wrapped in TLS) to this Worker.
// 2. The first WS message contains a VLESS header: version, client UUID,
//    a command byte (TCP/UDP), and the real destination address+port.
// 3. We verify the UUID against our allow-list, then open a *real* TCP
//    connection to that destination using Cloudflare's `cloudflare:sockets`
//    API, and from then on just relay bytes in both directions.
//
// This file only handles TCP (the common case: HTTPS, etc.). UDP (mostly
// used for DNS-over-VLESS) is intentionally left out of this first version.

import { connect } from "cloudflare:sockets";

const VLESS_VERSION = new Uint8Array([0]);

/** Turn a WebSocket into an async ReadableStream of Uint8Array chunks. */
function makeReadableWebSocketStream(webSocket, earlyDataHeader) {
  let cancelled = false;
  return new ReadableStream({
    start(controller) {
      webSocket.addEventListener("message", (event) => {
        if (cancelled) return;
        controller.enqueue(new Uint8Array(event.data));
      });
      webSocket.addEventListener("close", () => {
        if (!cancelled) controller.close();
      });
      webSocket.addEventListener("error", (err) => {
        controller.error(err);
      });

      // Some clients send "0-RTT" early data base64-encoded in a header.
      if (earlyDataHeader) {
        try {
          const decoded = base64UrlToUint8Array(earlyDataHeader);
          if (decoded) controller.enqueue(decoded);
        } catch {
          /* ignore malformed early data */
        }
      }
    },
    cancel() {
      cancelled = true;
      try {
        webSocket.close();
      } catch {
        /* already closed */
      }
    },
  });
}

function base64UrlToUint8Array(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uuidBytesToString(bytes, offset) {
  const hex = [...bytes.slice(offset, offset + 16)].map((b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

/**
 * Parses a VLESS request header.
 * Returns { uuid, addressRemote, portRemote, rawDataIndex, isUDP } or throws.
 * Reference: the VLESS spec (open protocol, publicly documented).
 */
function parseVlessHeader(buffer, allowedUUIDs) {
  if (buffer.byteLength < 24) throw new Error("VLESS header too short");
  const view = new Uint8Array(buffer);

  const version = view[0];
  const uuid = uuidBytesToString(view, 1);
  if (!allowedUUIDs.has(uuid)) throw new Error("Unauthorized UUID");

  let offset = 17;
  const addonsLen = view[offset];
  offset += 1 + addonsLen; // skip protocol addons, unused here

  const command = view[offset]; // 1 = TCP, 2 = UDP
  offset += 1;
  if (command !== 1 && command !== 2) throw new Error("Unsupported command");

  const portRemote = (view[offset] << 8) | view[offset + 1];
  offset += 2;

  const addressType = view[offset];
  offset += 1;

  let addressRemote = "";
  if (addressType === 1) {
    // IPv4
    addressRemote = view.slice(offset, offset + 4).join(".");
    offset += 4;
  } else if (addressType === 2) {
    // Domain name
    const len = view[offset];
    offset += 1;
    addressRemote = new TextDecoder().decode(view.slice(offset, offset + len));
    offset += len;
  } else if (addressType === 3) {
    // IPv6
    const parts = [];
    for (let i = 0; i < 8; i++) {
      parts.push(((view[offset + i * 2] << 8) | view[offset + i * 2 + 1]).toString(16));
    }
    addressRemote = parts.join(":");
    offset += 16;
  } else {
    throw new Error("Unsupported address type");
  }

  return {
    version,
    uuid,
    isUDP: command === 2,
    addressRemote,
    portRemote,
    rawDataIndex: offset,
  };
}

/**
 * Main entry point: given an incoming Request that wants to upgrade to a
 * WebSocket, do the VLESS handshake and bridge to the real destination.
 */
export async function handleVlessWebSocket(request, allowedUUIDs) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
  const readable = makeReadableWebSocketStream(server, earlyDataHeader);
  const reader = readable.getReader();

  let remoteSocket = null;
  let vlessResponseSent = false;

  (async () => {
    try {
      // First chunk should contain the full VLESS header.
      const { value: firstChunk, done } = await reader.read();
      if (done || !firstChunk) throw new Error("Empty stream");

      const parsed = parseVlessHeader(firstChunk.buffer, allowedUUIDs);
      if (parsed.isUDP) {
        // UDP relaying (mainly used for DNS) is not implemented in this MVP.
        server.close(1000, "UDP not supported yet");
        return;
      }

      remoteSocket = connect({ hostname: parsed.addressRemote, port: parsed.portRemote });
      const writer = remoteSocket.writable.getWriter();

      // Send any payload bytes that came after the header in the first chunk.
      const payload = firstChunk.slice(parsed.rawDataIndex);
      if (payload.byteLength > 0) await writer.write(payload);
      writer.releaseLock();

      // From here on: client -> remote
      const pipeClientToRemote = (async () => {
        const w = remoteSocket.writable.getWriter();
        try {
          while (true) {
            const { value, done: rDone } = await reader.read();
            if (rDone) break;
            await w.write(value);
          }
        } catch {
          /* connection closed */
        } finally {
          try {
            w.releaseLock();
          } catch {
            /* noop */
          }
        }
      })();

      // remote -> client, prefixed once with the 2-byte VLESS response header
      const pipeRemoteToClient = (async () => {
        const remoteReader = remoteSocket.readable.getReader();
        try {
          while (true) {
            const { value, done: rDone } = await remoteReader.read();
            if (rDone) break;
            if (!vlessResponseSent) {
              const header = new Uint8Array([VLESS_VERSION[0], 0]);
              const combined = new Uint8Array(header.byteLength + value.byteLength);
              combined.set(header, 0);
              combined.set(value, header.byteLength);
              server.send(combined);
              vlessResponseSent = true;
            } else {
              server.send(value);
            }
          }
        } catch {
          /* connection closed */
        } finally {
          try {
            server.close(1000, "done");
          } catch {
            /* already closed */
          }
        }
      })();

      await Promise.all([pipeClientToRemote, pipeRemoteToClient]);
    } catch (err) {
      try {
        server.close(1011, String(err.message || err).slice(0, 120));
      } catch {
        /* noop */
      }
    }
  })();

  return new Response(null, { status: 101, webSocket: client });
}

/** Builds a shareable vless:// link for a given UUID + this Worker's own domain. */
export function buildVlessLink({ uuid, host, port = 443, path = "/vless", remark = "Personal-VLESS" }) {
  const params = new URLSearchParams({
    encryption: "none",
    security: "tls",
    sni: host,
    type: "ws",
    host,
    path,
  });
  return `vless://${uuid}@${host}:${port}?${params.toString()}#${encodeURIComponent(remark)}`;
}
