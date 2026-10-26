/**
 * Genera la narración del episodio con una voz de Google AI Studio («Generate speech»), en la cuenta de Google del
 * usuario, como la genera él a mano: sin llave de API, con la cuota gratis de la página (la API gratis da 10 pedidos al
 * día y por eso se quitó). Se corre en la raíz del proyecto del episodio:
 *
 *     node <skill>/scripts/voz_studio.mjs [--voz Fola]      deja fuentes/voz/studio.wav
 *     node <skill>/scripts/voz_studio.mjs --entrar          abre la ventana para iniciar sesión en Google (una vez)
 *
 * Lee lo que se narra de guion.md (desde el primer `##`, sin títulos, como «Copiar» de Sloth) y lo pide entero en un solo
 * pedido: el guion de 6 minutos de des-to (1166 palabras) tardó unos 100 s y salió en un WAV de 6:37, 24 kHz mono. La
 * voz es `voz_studio` de la marca o `--voz`, con su nombre de AI Studio; el estilo, vacío. Si el texto no cambió desde
 * el último WAV, no pide nada.
 *
 * Usa un Edge propio, con su perfil en %LOCALAPPDATA%/video-el-diff/aistudio, sin sonido y sin ventana, manejado por CDP
 * (Google no deja iniciar sesión en un navegador que abre Playwright). Cada corrida usa su pestaña: los episodios de un
 * lote pueden pedir a la vez.
 *
 * Sale con 3 si falta la sesión (correr --entrar y que el usuario entre), con 4 si AI Studio no generó (la cuota del día,
 * un error suyo) y con 2 si la página cambió y no encuentra algo. En cualquiera de esos casos, se le pide la voz al
 * usuario como siempre.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(AQUI, "..", "..", "..", "package.json"))("playwright-core");
const URL_VOZ = "https://aistudio.google.com/generate-speech";
const PUERTO = 9336;
const PERFIL = join(process.env.LOCALAPPDATA ?? join(homedir(), ".cache"), "video-el-diff", "aistudio");
const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/opt/microsoft/msedge/msedge"].find((e) => existsSync(e));

const salir = (codigo, mensaje) => {
  console.error(mensaje);
  process.exit(codigo);
};
/** Lo que sale con su código (ver arriba), después de cerrar la pestaña. */
class Falla extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}
const responde = () => fetch(`http://127.0.0.1:${PUERTO}/json/version`).then((r) => r.ok, () => false);

/** El Edge de AI Studio: el que ya está abierto o uno nuevo. `ventana` para iniciar sesión; si no, sin ventana ni sonido. */
async function edge(ventana) {
  if (await responde()) {
    if (!ventana) return chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`);
    // Para iniciar sesión hace falta la ventana: se cierra el de sin ventana (la sesión vive en el perfil).
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`);
    await (await b.newBrowserCDPSession()).send("Browser.close").catch(() => {});
    for (let i = 0; i < 20 && (await responde()); i++) await new Promise((r) => setTimeout(r, 250));
  }
  if (!EDGE) salir(2, "No encontré Microsoft Edge.");
  mkdirSync(PERFIL, { recursive: true });
  const extra = ventana ? [URL_VOZ] : ["--headless=new", "--mute-audio", "about:blank"];
  spawn(EDGE, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`, "--no-first-run", "--no-default-browser-check", ...extra],
    { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40 && !(await responde()); i++) await new Promise((r) => setTimeout(r, 500));
  return chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`);
}

const args = process.argv.slice(2);
if (args.includes("--entrar")) {
  await (await edge(true)).close(); // solo suelta la conexión: la ventana queda abierta
  console.log("Abrí AI Studio en Edge: que el usuario inicie sesión con su cuenta de Google ahí y deje la página abierta.");
  process.exit(0);
}

// Lo que se narra y la voz.
const raiz = resolve(".");
const guion = join(raiz, "guion.md");
if (!existsSync(guion)) salir(2, "Córrelo en la raíz del episodio, con guion.md ya entregado.");
const md = readFileSync(guion, "utf8");
const inicio = md.search(/^## /m);
const texto = md.slice(Math.max(0, inicio)).replace(/^#+ .*$/gm, "").split(/\n\s*\n/).map((p) => p.split(/\s+/).join(" ").trim())
  .filter(Boolean).join("\n\n");
const marca = [join(raiz, "..", "marca.json"), join(raiz, "src", "marca.json")].filter(existsSync).map((f) => JSON.parse(readFileSync(f, "utf8")))[0] ?? {};
const voz = args.includes("--voz") ? args[args.indexOf("--voz") + 1] : marca.voz_studio;
if (!voz) salir(2, "Falta la voz: `voz_studio` en marca.json (su nombre en AI Studio, p. ej. Fola) o --voz.");
const dv = join(raiz, "fuentes", "voz");
mkdirSync(dv, { recursive: true });
const wav = join(dv, "studio.wav");
const huella = createHash("sha1").update(`${voz}\n${texto}`).digest("hex");
if (existsSync(wav) && existsSync(`${wav}.huella`) && readFileSync(`${wav}.huella`, "utf8") === huella) {
  console.log(`${wav} ya estaba al día (mismo texto y voz).`);
  process.exit(0);
}

const b = await edge(false);
const page = await b.contexts()[0].newPage();
const t0 = Date.now();
let falla = null;
try {
  await page.goto(URL_VOZ, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  if (page.url().includes("accounts.google.com"))
    throw new Falla(3, "AI Studio no tiene la sesión iniciada: corre `node <skill>/scripts/voz_studio.mjs --entrar`, pide al usuario que " +
      "entre con su cuenta de Google en la ventana que se abre y vuelve a correrlo. Mientras, pide la voz como siempre.");
  const caja = page.locator('textarea[aria-label="Speech block text"]').first();
  if (!(await caja.isVisible().catch(() => false)))
    await page.getByRole("button", { name: "Create new dialog" }).first().click({ timeout: 30000 });
  await caja.waitFor({ timeout: 20000 });
  await caja.fill(texto);
  const boton = page.locator('button:has-text("Speaker 1")').first();
  const delHablante = async () => (await boton.innerText()).replace(/\s+/g, " ");
  if (!(await delHablante()).includes(voz)) {
    // Se elige en el panel de voces: por su nombre, que es lo primero del botón de cada una.
    await boton.click();
    const panel = page.locator(".cdk-overlay-pane").last();
    await panel.locator("input").first().fill(voz).catch(() => {});
    await page.waitForTimeout(800);
    await panel.locator("button").filter({ hasText: new RegExp(`^\\s*${voz}\\b`) }).first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
  }
  const hablante = await delHablante();
  if (!hablante.includes(voz))
    throw new Falla(2, `AI Studio tiene la voz «${hablante}» y la marca pide «${voz}». Que el usuario la cambie una vez en AI Studio, o usa --voz.`);

  // El WAV se baja con el botón Download de la página, a una carpeta propia.
  const descargas = join(tmpdir(), "voz-studio-descargas");
  mkdirSync(descargas, { recursive: true });
  const cdp = await b.newBrowserCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: descargas, eventsEnabled: true });
  // El WAV lo baja un marco de otro proceso (blob:null), que no sale en el árbol de la pestaña: se toma la primera
  // descarga que empieza tras el clic, y el clic va con candado para que dos episodios no bajen a la vez.
  let guid = null;
  let esperando = false;
  const bajada = new Promise((ok, mal) => {
    cdp.on("Browser.downloadWillBegin", (e) => {
      if (esperando && !guid) guid = e.guid;
    });
    cdp.on("Browser.downloadProgress", (e) => {
      if (e.guid !== guid) return;
      if (e.state === "completed") ok(join(descargas, e.guid));
      if (e.state === "canceled") mal(new Error("Edge canceló la descarga del WAV"));
    });
  });

  const respuesta = page.waitForResponse((r) => r.url().includes("MakerSuiteService/GenerateContent"), { timeout: 15 * 60_000 });
  await page.locator('button:has-text("Run")').last().click();
  const r = await respuesta;
  if (r.status() !== 200) {
    await page.waitForTimeout(1500);
    const aviso = await page.evaluate(() => [...document.querySelectorAll("mat-snack-bar-container, [role=alert], .error, .error-message")]
      .map((d) => d.innerText.trim()).filter(Boolean).join(" · "));
    throw new Falla(4, `AI Studio no generó la voz (${r.status()}${aviso ? `: ${aviso}` : ""}). Si es la cuota del día, pide la voz al usuario.`);
  }
  // La respuesta llega por partes (la página ya reproduce el principio): Download baja algo hasta que termina.
  const corte = await r.finished();
  if (corte) throw new Falla(4, `AI Studio cortó la voz a medias (${corte}). Vuelve a correrlo una vez; si se repite, pide la voz al usuario.`);
  const bajar = page.getByRole("button", { name: "Download" }).first();
  await bajar.waitFor({ timeout: 120_000 });
  const candado = join(descargas, "candado");
  for (let i = 0; ; i++) {
    try {
      mkdirSync(candado);
      break;
    } catch {
      // Otro episodio está bajando el suyo (unos 5 s); uno de más de 3 minutos quedó de una corrida cortada.
      if (Date.now() - statSync(candado, { throwIfNoEntry: false })?.mtimeMs > 180_000) rmSync(candado, { recursive: true, force: true });
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  try {
    esperando = true;
    // El botón sale antes de que el audio esté listo, y ese primer clic no baja nada: se repite hasta que empiece.
    for (let i = 0; i < 10 && !guid; i++) {
      await page.waitForTimeout(1500);
      await page.mouse.move(5, 5); // el tooltip de Run tapa el botón
      await bajar.click({ force: true });
      for (let k = 0; k < 10 && !guid; k++) await page.waitForTimeout(300);
    }
    const archivo = await Promise.race([bajada, new Promise((_, mal) => setTimeout(() => mal(new Error("el WAV no bajó en 2 minutos")), 120_000).unref())]);
    copyFileSync(archivo, wav);
    rmSync(archivo, { force: true });
  } finally {
    rmSync(candado, { recursive: true, force: true });
  }
  writeFileSync(`${wav}.huella`, huella);
  const segundos = (statSync(wav).size - 44) / 48000; // 24 kHz, 16 bits, mono
  console.log(`${wav}: ${Math.floor(segundos / 60)}:${String(Math.round(segundos % 60)).padStart(2, "0")} de voz (${voz}), ` +
    `${texto.split(/\s+/).length} palabras, en ${Math.round((Date.now() - t0) / 1000)} s`);
} catch (e) {
  falla = e instanceof Falla ? e : new Falla(2, `AI Studio cambió o no respondió: ${String(e.message).split("\n")[0]}. ` +
    "Captura en fuentes/voz/studio-error.png.");
  if (!(e instanceof Falla)) await page.screenshot({ path: join(dv, "studio-error.png") }).catch(() => {});
} finally {
  await page.close().catch(() => {});
  await b.close().catch(() => {});
}
if (falla) salir(falla.codigo, falla.message);
