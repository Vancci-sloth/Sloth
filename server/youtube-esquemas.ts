/** Contratos de salida para que los proveedores devuelvan JSON válido, incluso con prompts y análisis largos. */
const texto = { type: 'string' }
const lista = { type: 'array', items: texto }
const objeto = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
export const PLAN_YOUTUBE = objeto({ tema: texto, consultas: { ...lista, minItems: 1, maxItems: 2 }, hechos: lista })
export const DESCRIPCION_YOUTUBE = objeto({ texto, razon: texto })
export const RECOMENDACION_YOUTUBE = objeto({
  titulo: objeto({ principal: texto, alternativas: { ...lista, maxItems: 3 }, razon: texto }),
  miniatura: objeto({ concepto: texto, texto, composicion: texto, prompt: texto, razon: texto }),
  analisis: texto, limites: lista,
  referencias: { type: 'array', minItems: 1, items: objeto({ id: texto, observacion: texto }) }
})
