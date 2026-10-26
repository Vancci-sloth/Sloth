# Historias de Reddit

Historias reales de gente a la que algo del nicho del canal (`nicho` en la marca) le salió muy mal por un error
(perdió dinero, tiempo o algo que no vuelve), sacadas de Reddit y contadas con nuestras palabras. Es el género «una
historia» de [`GUION.md`](../GUION.md).

## El tema, si no te dieron uno

- **Primero el banco:** `banco.py ver reddit` (ver "Series" en el SKILL). Si una sirve, tómala y salta a leerla.
- **Dónde:** cinco o seis subreddits del nicho (crypto: r/CryptoCurrency, r/Bitcoin, r/ethereum, r/solana,
  r/ledgerwallet; finanzas: r/personalfinance, r/povertyfinance; tecnología: r/techsupport, r/sysadmin; cocina:
  r/Cooking, r/KitchenConfidential).
- **Cómo buscar** (no busques otra forma): con el navegador del agente, abre `https://www.reddit.com/` y corre esto con
  `browser_evaluate`, con los subs y las palabras del nicho (en inglés, como lo contaría quien lo vivió). Pide el buscador de cada sub y devuelve votos/comentarios, sub, enlace
  y título, de más a menos votado. WebSearch no da hilos de Reddit; `search.json` y old.reddit piden sesión; arctic-shift
  se cae por tiempo; el buscador sin sub devuelve lo más votado de todo Reddit, sin relación.

  ```js
  async () => {
    const subs = ["CryptoCurrency", "Bitcoin", "ethereum", "solana", "CryptoMarkets", "ledgerwallet"];
    const qs = ["lost my seed phrase", "sent to wrong network", "wallet drained", "liquidated"];
    const out = [];
    for (const s of subs) for (const q of qs) {
      const h = await (await fetch(`/r/${s}/search/?q=${encodeURIComponent(q)}&type=posts&sort=top&t=all&restrict_sr=1`)).text();
      new DOMParser().parseFromString(h, "text/html").querySelectorAll('[data-testid="search-post-unit"]').forEach(u => {
        const a = u.querySelector('a[href*="/comments/"]');
        const n = [...u.querySelectorAll("faceplate-number")].map(x => x.getAttribute("number"));
        out.push([+n[0], n.join("/"), s, a?.getAttribute("href"), (a?.getAttribute("aria-label") || a?.textContent || "").trim()]);
      });
    }
    return [...new Map(out.map(p => [p[3], p])).values()].sort((a, b) => b[0] - a[0]).map(p => p.slice(1).join(" | ")).join("\n");
  }
  ```

  **Para leer los hilos, todos a la vez** con `browser_run_code_unsafe` (cada uno en su pestaña; con `fetch` no viene
  el post): devuelve de cada uno el título, votos, comentarios, fecha, el texto con sus EDIT y los 8 comentarios de
  primer nivel con sus votos. Reddit lo enseña traducido al español; el título original está en el enlace. En
  nuevo-7 se leyeron uno por uno: 28 llamadas y 2.5 min.

  ```js
  async (page) => {
    const posts = ["/r/CryptoCurrency/comments/ql3fs7/", "/r/Bitcoin/comments/1vclm91/"];
    const leer = async (url) => {
      const p = await page.context().newPage();
      try {
        await p.goto("https://www.reddit.com" + url, { waitUntil: "domcontentloaded" });
        await p.waitForSelector("shreddit-post", { timeout: 20000 });
        await p.mouse.wheel(0, 3000);
        await p.waitForSelector('shreddit-comment[depth="0"]', { timeout: 10000 }).catch(() => {});
        return await p.evaluate(() => {
          const s = document.querySelector("shreddit-post");
          const coms = [...document.querySelectorAll('shreddit-comment[depth="0"]')].slice(0, 8)
            .map((c) => `  ${c.getAttribute("score")} | ${(c.querySelector('[slot="comment"]')?.innerText || "").replace(/\s+/g, " ").slice(0, 300)}`);
          return [`== ${location.pathname}`,
            `${s.getAttribute("post-title")} | ${s.getAttribute("score")} votos | ${s.getAttribute("comment-count")} comentarios | ${s.getAttribute("created-timestamp")}`,
            (document.querySelector('[slot="text-body"]')?.innerText || "").slice(0, 4000), "Comentarios:", ...coms].join("\n");
        });
      } catch (e) { return `== ${url}: ${e.message}`; } finally { await p.close(); }
    };
    return (await Promise.all(posts.map(leer))).join("\n\n");
  }
  ```
- **Cuál:** la que tenga más votos y comentarios y, sobre todo, **un momento** en que todo se tuerce (la hora, los
  segundos, el clic). Mejor si el autor publicó algo que se pueda comprobar (en crypto, una dirección o una transacción en
  el explorador de bloques; en otro nicho, una noticia, un documento, una foto): compruébalo y di que lo comprobaste. Si no se puede comprobar nada, dilo en `fuentes/investigacion.md` y cuéntala como «lo que
  publicó».
- **Que no se repita:** ni un tema ya hecho, ni el mismo error que alguno de los dos últimos de esta serie
  (`huellas.py buscar --serie`).
- Las que leíste y no usaste, al banco (`banco.py guardar reddit`). Al darle el guion al usuario, dile por qué
  elegiste esa historia y dale otras dos, por si prefiere.

## Qué tiene que pasar

- El gancho es el título del post, citado: «"Perdí mil doscientos dólares en cien segundos." Eso publicó un usuario de
  Reddit.» **Nunca en primera persona como si le hubiera pasado al usuario**: es la historia de otro.
- Quién era y qué quería, el descuido, el momento en que todo se tuerce, qué hizo después y cómo acabó. Lo técnico
  (qué es una seed phrase, una red equivocada) va dentro de la historia, en una frase, cuando hace falta.
- Lo que dijeron los comentarios más votados, y el EDIT del autor si lo hay: es el giro final.
- En la imagen, el post rehecho (el sub, la hora, los votos) con **el usuario tapado o cambiado**; los comentarios,
  igual (`Post` y `Comentario` de la plantilla). Dónde sale el post (una pantalla del lugar, un celular, impreso) es
  de cada video. El texto del post, contado con nuestras palabras, no copiado entero.
- Termina en lo que habría evitado el error, en una frase y sin sermón.

## Temas para empezar

Ejemplos de crypto; en otro nicho, busca los suyos con la misma idea (un descuido y el momento en que todo se tuerce):

1. El disco duro en la basura: el británico que tiró una laptop con miles de BTC y lleva años pidiendo excavar el
   relleno sanitario.
2. Dos intentos para salvar una fortuna: el programador al que le quedan pocos intentos de contraseña para abrir una USB
   con miles de BTC.
3. Compré en el pico, vendí en el piso: el pánico de 2021–2022.
4. Mandé mis USDT por la red equivocada y desaparecieron.
5. Guardé mi seed phrase en una foto del celular y me vaciaron la wallet.
6. «Reclama tu airdrop gratis»: conecté mi wallet y se llevaron todo.
7. Apalancamiento 100x: liquidado en menos de cinco minutos.
8. Le di acceso remoto a «soporte técnico» por WhatsApp.
9. Compré la memecoin que recomendó un influencer y se fue a cero en un día.
10. Murió sin decirle a nadie dónde guardaba sus llaves: la familia no pudo recuperar nada.

Los dos primeros salieron en noticias, no en Reddit: valen igual, con sus fuentes.
