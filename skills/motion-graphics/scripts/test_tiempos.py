import unittest
from tiempos import validar


class TiemposTest(unittest.TestCase):
    def test_musica_sin_palabras_ni_voz(self):
        datos = dict(sonido='musica', duracion=8, audio='fuentes/audio/mezcla.wav',
                     momentos=[dict(segundo=0, detalle='Portadas en profundidad'),
                               dict(segundo=2.4, detalle='Portada ocupa el encuadre')])
        self.assertEqual(validar(datos, '# Guion visual'), [])
        datos.pop('audio')
        self.assertTrue(validar(datos, ''))

    def test_narracion_conserva_anclas(self):
        datos = dict(duracion=8, momentos=[dict(segundo=0, palabra='Tu música')])
        self.assertEqual(validar(datos, 'Tu música cambia contigo'), [])
        self.assertTrue(validar(datos, 'Otro guion'))

    def test_tiempos_invalidos(self):
        for tiempo in (float('nan'), float('inf'), -1, 8, True):
            with self.subTest(tiempo=tiempo):
                self.assertTrue(validar(dict(sonido='musica', audio='a.wav', duracion=8,
                    momentos=[dict(segundo=tiempo, detalle='Plano')]), ''))
        self.assertTrue(validar(dict(duracion=8, momentos=[None]), ''))
        self.assertTrue(validar(dict(sonido='musica', audio='a.wav', duracion=8,
            momentos=[dict(segundo=2, detalle='A'), dict(segundo=1, detalle='B')]), ''))


if __name__ == '__main__':
    unittest.main()
