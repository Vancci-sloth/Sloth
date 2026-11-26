const ejemplos: Record<string, [titulo: string, descripcion: string, ejemplo: string]> = {
  "1": ["Ajustar al lienzo","Encaja la imagen completa dentro del área visible.","Vuelve a la vista completa después de revisar un detalle."],
  "2": ["200%","Amplía la vista sin cambiar el archivo ni la posición de las marcas.","Acércate para revisar el contorno de la casa."],
  "3": ["300%","Amplía la vista sin cambiar el archivo ni la posición de las marcas.","Acércate para revisar el contorno de la casa."],
  "editar": ["Cambiar zona","Rodea la parte que quieres editar y describe únicamente el cambio.","Vuelve azul la casa marcada."],
  "quitar": ["Quitar objeto","Rodea el objeto para que la IA lo retire y reconstruya el fondo.","Quita la casa del paisaje."],
  "conservar": ["Conservar zona","Marca lo que debe mantenerse mientras editas el resto de la imagen.","Cambia el paisaje a un atardecer y conserva la casa."],
  "limpiar": ["Limpiar todas las marcas","Borra las selecciones del lienzo. La imagen y tu descripción se conservan.","Quita las marcas antes de seleccionar otra zona."],
  "luz": ["Mejorar iluminación","Recupera detalle en sombras y equilibra la exposición.","Aclara un paisaje que salió demasiado oscuro."],
  "color": ["Corregir color","Ajusta el balance de blancos para recuperar colores naturales.","Corrige un paisaje con dominante amarilla."],
  "detalle": ["Recuperar detalle","Mejora la definición de bordes y texturas.","Haz más nítidas las siluetas de las montañas."],
  "restaurar": ["Restaurar fotografía","Reduce manchas y arañazos en una foto deteriorada.","Limpia una fotografía antigua del campo."],
  "colorizar": ["Colorizar foto antigua","Añade color a una imagen en blanco y negro.","Devuelve el color al cielo y a las montañas."],
  "retrato": ["Retocar retrato","Suaviza brillos e imperfecciones temporales conservando los rasgos.","Reduce el brillo de la frente sin alterar la expresión."],
  "reflejos": ["Reducir reflejos","Reduce el brillo superpuesto para recuperar lo que queda detrás.","Reduce el reflejo de una ventana en el paisaje."],
  "perspectiva": ["Corregir perspectiva","Endereza líneas inclinadas y corrige la caída de las verticales.","Endereza una foto tomada con la cámara inclinada."],
  "fondo": ["Reemplazar fondo","Cambia el entorno y conserva al sujeto o elemento principal.","Cambia las montañas por un cielo de atardecer."],
  "estilo": ["Cambiar estilo visual","Da otra apariencia a la escena conservando su composición.","Convierte el paisaje en una ilustración de tonos pastel."],
  "objeto": ["Añadir un elemento","Añade un elemento en la zona marcada o en el lugar que indiques.","Agrega rayos y truenos en el cielo."],
  "reemplazar": ["Reemplazar un elemento","Cambia un objeto por otro respetando el entorno.","Sustituye la casa por un árbol."],
  "profundidad": ["Desenfocar fondo","Suaviza el fondo y conserva el motivo principal nítido.","Desenfoca las montañas y deja la casa enfocada."],
  "reencuadre": ["Reencuadrar imagen","Acerca o desplaza el motivo dentro de la proporción actual.","Dale más protagonismo a la casa."],
  "producto": ["Foto de producto","Presenta un producto con luz suave, fondo limpio y sombra de contacto.","Convierte la foto de un frasco en una imagen de catálogo."],
  "recorte": ["Quitar fondo · PNG","Separa el sujeto del fondo y crea una imagen con transparencia.","Recorta un frasco para usarlo en otra composición."],
  "mover": ["Desplazar con arrastre","Mueve la vista ampliada arrastrando el lienzo. Los píxeles quedan intactos.","Desplázate hacia la derecha para revisar un borde."],
  "1.25": ["125%","Amplía la vista sin cambiar el archivo ni la posición de las marcas.","Acércate para revisar el contorno de la casa."],
  "1.5": ["150%","Amplía la vista sin cambiar el archivo ni la posición de las marcas.","Acércate para revisar el contorno de la casa."],
}

export function nombreDeEjemplo(id: string) {
  return Object.hasOwn(ejemplos, id) ? ejemplos[id][0] : undefined
}

function EscenaEjemplo({ id, despues }: { id: string; despues: boolean }) {
  const retrato = id === 'retrato'
  const frasco = id === 'producto' || id === 'recorte'
  const zoom = Number(id)
  const escala = Number.isFinite(zoom) ? despues ? zoom : zoom === 1 ? 2 : 1 : undefined
  return <div className="ejemplo-edicion-escena" data-ejemplo={id} data-despues={despues || undefined} aria-hidden="true">
    <div className="ejemplo-edicion-encuadre" style={escala ? { transform: 'scale(' + escala + ')' } : undefined}>
      <div className="ejemplo-edicion-fondo">
        {!retrato && !frasco && <>
          <i className="ejemplo-edicion-sol" />
          <i className="ejemplo-edicion-montanas" />
        </>}
      </div>
      {!retrato && !frasco && <i className="ejemplo-edicion-casa" />}
      {retrato && <i className="ejemplo-edicion-retrato" />}
      {frasco && <i className="ejemplo-edicion-frasco" />}
      {id === 'reemplazar' && despues && <i className="ejemplo-edicion-arbol" />}
      <i className="ejemplo-edicion-efecto" />
      {['editar', 'quitar', 'conservar', 'limpiar', 'objeto'].includes(id) && !despues && <i className="ejemplo-edicion-zona" />}
    </div>
  </div>
}

export function EjemploEdicionImagen({ id }: { id: string }) {
  const ejemplo = ejemplos[id]
  if (!ejemplo) return null
  const [titulo, descripcion, frase] = ejemplo

  return <div className="ejemplo-edicion">
    <strong className="ejemplo-edicion-titulo">{titulo}</strong>
    <p>{descripcion}</p>
    <div className="ejemplo-edicion-doble" aria-label="Ilustración de antes y después">
      <figure><EscenaEjemplo id={id} despues={false} /><figcaption>Antes</figcaption></figure>
      <figure><EscenaEjemplo id={id} despues /><figcaption>Después</figcaption></figure>
    </div>
    <p className="ejemplo-edicion-frase"><strong>Ejemplo de uso</strong><span>{frase}</span></p>
  </div>
}
