# Programa del bucle

<!-- Tres partes. "Objetivo" y "Reglas fijas" las escribe el humano. "Cómo trabajar" y "Hábitos aprendidos" las
reescribe el bucle de fuera después de cada fase. Nadie toca los checks. -->

## Objetivo

<!-- Qué se quiere conseguir, en una o dos frases. Y la lista de fases (funcionalidades) en orden. -->

## Reglas fijas

- Solo cambias el código del proyecto. Nunca `.autoloop/checks/`, `.autoloop/config.json` ni este archivo.
- Un cambio por ronda: una idea, pequeña y que se pueda medir. Si no sabes si mejora, pruébalo; para eso está el bucle.
- No instales dependencias nuevas sin que el objetivo lo diga.
- Más simple gana: a igual puntuación, el cambio que borra código es mejor que el que lo añade.

## Cómo trabajar

1. Lee las últimas filas de `.autoloop/results.tsv` y, si la última ronda falló, el final de su log. No repitas una
   idea que ya se descartó.
2. Conecta lo que construyes con la app en la misma ronda: una función que pasa sus checks pero que nada usa no está
   hecha.
3. Antes de añadir una forma nueva de hacer algo, busca todos los sitios donde la app ya lo hace y haz que sigan la
   misma regla.
4. Corre los checks tú mismo antes de terminar, para no gastar una ronda en un error tonto.

## Hábitos aprendidos

<!-- El bucle de fuera apunta aquí cada hábito con las rondas que lo prueban. Ejemplo:
- Guardar en la base de datos en la misma ronda que se crea la tabla (rondas 3 y 7: checks verdes, nada guardado). -->
