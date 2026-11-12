# Hotel La Fontana real en `maqueta.html`

Rama `hotel-real`. El estado anterior está en la etiqueta `respaldo-antes-hotel-real`.

## Qué cambió

| Archivo | Cambio |
|---|---|
| `maqueta.html` | Agrega tres cosas: el hotel GLB georreferenciado, el recorte de la fotogrametría de Google dentro de su huella y el recorrido cinematográfico de 7 escenas con vistas fijas. La interfaz, los colores, los marcadores y el giro manual no cambiaron. |
| `modelos/hotel_la_fontana.glb` | Hotel exportado (11,5 MB, unos 690 mil triángulos y texturas a 1024 px). |
| `modelos/hotel_geo.json` | Origen del GLB, ajuste medido contra Google y polígono de recorte. |
| `herramientas/*` | Pipeline reproducible para exportar, georreferenciar, alinear y capturar. |
| `index.html`, `giro/`, `giro_corredor/`, `config.js`, `geo.json` | **Sin cambios**. |

## Fuente de la geometría

Ver el inventario completo en `LaFontana360/05_web/ref/INVENTARIO_ARCHIVOS.md`. Es local y no se publica porque contiene rutas privadas.

- Las fachadas y las cubiertas del edificio completo **solo existen** en `Hotel_la_fontana_contexto.rvt`. Hay dos copias, del 20 y del 31 de octubre, y ninguna estaba abierta. Los planos DWG 210-HLF son solo interiores de los pisos 2 a 6. El modelo de 3ds Max es solo del piso 2.
- Se usó la geometría que la web `hotel_la_fontana` ya derivó de esas fuentes, sin reinventarla:
  - Ala principal: losa de Revit del piso 2 (`p2-architecture.json`).
  - 16 volúmenes del catastro del lote 008401019001, con alturas y pisos.
  - Ventanas de la familia de Revit `HLF-VENTANA FACHADA BARANDAL`.
  - Cubiertas a cuatro aguas calculadas por esqueleto recto, con pendiente de 30° y alero de 0,75 m (`hotel-roofs.json`).
- **Limitación:** las pendientes de 30° y los aleros de 0,75 m son los de esa derivación, no una medición directa del RVT. Para cubiertas 100 % Revit hay que exportar el RVT de contexto a FBX o glTF (ver "Actualizar desde Revit").

## Pipeline

```
node herramientas/servidor_exportar.mjs   # Chrome sin ventana arma el hotel con los módulos de ref/hotel_la_fontana → salida/hotel_bruto.glb
cp herramientas/salida/hotel_bruto.glb modelos/hotel_la_fontana.glb
node herramientas/geo_hotel.mjs           # origen, ajuste y polígono de recorte → modelos/hotel_geo.json
GPU=1 node herramientas/captura.mjs out.png "maqueta.html?vista=cubiertas" 50   # captura + errores JS
node herramientas/alinear.mjs google.png modelo.png 0.1632                        # mide desplazamiento y giro contra Google
```

- **Georreferencia.** El marco local de la referencia se define como `x = (lon+74.043696)·110945 − 13.47` y `z = −(lat−4.704585)·110574 + 7.15`. El origen del GLB queda en lon −74.04357459, lat 4.70464966. La cota es la altura de la malla de Google en el borde de la huella (cuantil 25 %), unos 2576,5 m elipsoidales.
- **Ajuste medido.** Se comparó la máscara de tejados en capturas cenitales a 0,163 m/px. Con el catastro quedaba corrido; la corrección es un giro de 1,25° antihorario y una traslación de 4,9 m al oeste y 7,5 m al sur. La coincidencia de tejados pasó de 63 % a 78 %, con residuo 0 después de aplicarla.
- **Recorte de Google.** Todas las huellas más un margen de 1,5 m se unen en un solo contorno de 138 vértices. Un patio interior se conserva con un ojal de 5 cm. El anillo de margen se rellena con un piso plano.
- **Rendimiento.** Cesium recalcula el rectángulo de cada polígono de recorte por tesela y por cuadro. Con 18 polígonos la ciudad no terminaba de cargar en una GPU Intel UHD. Se cachea ese rectángulo y ahora carga igual que sin recorte (9 fps headless, 2143 teselas en 45 s).

## Recorrido y vistas

- **Botones:** Recorrido (reproducir/pausar/continuar), Reiniciar, Contexto urbano, Vista aérea, Cubiertas, Axonometría, Exterior y Vista inicial.
- **Escenas:**
  1. Contexto
  2. Aproximación
  3. Órbita de 300°
  4. Cubiertas (−64°)
  5. Axonometría (35,3°, campo de 22° y casi sin perspectiva)
  6. Fachadas
  7. Regreso al giro original
- **Cómo se mueve:** la trayectoria es Catmull-Rom con velocidad continua, arranque y frenado de 3 s, y distancia interpolada en escala logarítmica. La inclinación queda limitada a −4° o menos y la distancia a 60 m o más, para que la cámara no baje del terreno.
- **Control manual:** arrastrar, la rueda, las flechas o los botones de giro interrumpen el recorrido. El giro manual sigue desde la vista que se ve, sin salto. La barra espaciadora reproduce o pausa.
- **Enlaces directos:** `?vista=cubiertas` y `?tour=SEG`.
- **Diagnóstico:** `?sinrecorte`, `?transp`, `?solomodelo`, `?sinmodelo` y `?cam=rumbo,inclinación,distancia,fov`.

## Pruebas realizadas (Chrome 2026, GPU Intel UHD y SwiftShader)

Capturas en `LaFontana360/04_pruebas/hotel_real/`.

- Sin errores de JavaScript en consola.
- La ciudad termina de cargar con el recorte.
- Antes y después desde la misma cámara: `00_original.png` contra `02_sinrecorte.png` y `15_*.png`.
- Planta: `04_cenital_transp.png` y `14/15_cubiertas.png`.
- Recorrido: `16_tour_*.png`.
- Celular de 390×844: `17_movil.png`.
- **No probado:** un celular físico y Safari/iOS.

## Pendiente

- **Giro 360° (`index.html`).** Las 72 imágenes son renders de Unreal con el hotel provisional `Edificios2_Hotel`. **No se regeneraron.** Para hacerlo:
  1. Importar `modelos/hotel_la_fontana.glb` en el proyecto UE 5.8 `MyProject3`, con el mismo origen y ajuste de `hotel_geo.json`.
  2. Ocultar el actor provisional.
  3. Correr `LaFontana360/01_config/render_giro.py todas` y `publicar_tlf.sh`.
- **Actualizar desde Revit.** Exportar `Hotel_la_fontana_contexto.rvt` a FBX o glTF desde una vista 3D filtrada al hotel. Luego pasarlo por 3ds Max con los materiales en capas separadas, para reemplazar geometría sin perder los materiales. Por último, sustituir `modelos/hotel_la_fontana.glb` y volver a correr `alinear.mjs`.
- **Compresión.** Draco y WebP con `@gltf-transform/cli` bajarían el GLB a unos 3–4 MB. No se pudo instalar en esta sesión.
