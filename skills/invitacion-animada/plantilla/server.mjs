// Taller de invitaciones: cada carpeta con index.html se abre en http://localhost:<puerto>/<carpeta>/
// También escucha en la red local, para probarla en un teléfono conectado al mismo wifi.
// Correrlo dos veces no hace daño: si este taller ya tiene servidor, solo dice dónde está.
import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".woff2": "font/woff2",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
};

async function portada() {
  const items = [];
  for (const d of await readdir(root, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".") || d.name === "herramientas" || d.name === "node_modules") continue;
    if (await stat(join(root, d.name, "index.html")).catch(() => null)) items.push(d.name);
  }
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invitaciones</title>
<style>body{margin:0;min-height:100vh;display:grid;place-content:center;gap:14px;background:#0b0b0d;font:16px system-ui;color:#eee}
a{display:block;padding:14px 22px;border:1px solid #333;border-radius:10px;color:#eee;text-decoration:none}a:hover{background:#1a1a1f}</style>
${items.map((n) => `<a href="/${n}/">${n}</a>`).join("\n") || "<p>Aún no hay invitaciones.</p>"}</html>`;
}

const server = createServer(async (req, res) => {
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
  try {
    const url = new URL(req.url, "http://x"), path = decodeURIComponent(url.pathname);
    if (path === "/") return send(200, TYPES[".html"], await portada());
    if (path === "/__taller") return send(200, TYPES[".json"], JSON.stringify({ raiz: root }));
    if (path === "/favicon.ico") return send(204, "image/x-icon", "");
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) return send(403, "text/plain; charset=utf-8", "Fuera del taller");
    let st = await stat(file).catch(() => null);
    if (st?.isDirectory()) {
      if (!path.endsWith("/")) { res.writeHead(301, { location: url.pathname + "/" + url.search }); return res.end(); }
      file = join(file, "index.html");
      st = await stat(file).catch(() => null);
    }
    if (!st?.isFile()) return send(404, "text/plain; charset=utf-8", `No existe: ${path}`);
    send(200, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", await readFile(file));
  } catch (err) {
    send(500, "text/plain; charset=utf-8", String(err));
  }
});

// Si ya hay un servidor de este mismo taller, no se abre otro.
const previo = await readFile(join(root, ".puerto"), "utf8").catch(() => "");
if (previo) {
  const info = await fetch(`http://localhost:${previo.trim()}/__taller`).then((r) => r.json()).catch(() => null);
  if (info?.raiz?.toLowerCase() === root.toLowerCase()) {
    console.log(`Ya está corriendo: http://localhost:${previo.trim()}/`);
    process.exit(0);
  }
}

// Si el puerto está ocupado (otro taller u otra app), prueba el siguiente; las herramientas leen .puerto.
const primero = Number(process.env.PORT ?? 5199);
let port = primero;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && !process.env.PORT && port < primero + 20) server.listen(++port);
  else throw err;
});
server.on("listening", async () => {
  await writeFile(join(root, ".puerto"), String(port));
  console.log(`Taller: http://localhost:${port}/`);
  const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  for (const ip of lan.sort((a, b) => b.startsWith("192.168.") - a.startsWith("192.168."))) console.log(`En el teléfono (mismo wifi): http://${ip}:${port}/`);
});
server.listen(port);
