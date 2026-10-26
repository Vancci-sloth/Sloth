// El 3D se dibuja con la tarjeta de video (ANGLE). Sin esto, Chrome sin ventana lo hace por software: 3.5 veces más
// lento y se ve igual (medido con 60 cuadros: 38 s contra 11 s).
import { Config } from "@remotion/cli/config";

Config.setChromiumOpenGlRenderer("angle");
