// Proxy hacia el backend del portal.
//
// Existe por dos razones, y ninguna es de estilo:
//
//   1. Contenido mixto. Vercel sirve por HTTPS y el backend responde por HTTP.
//      Si el navegador llamara directo al backend, el navegador bloquearia la
//      peticion. Aqui la llamada la hace el servidor, no el navegador, asi que
//      el navegador solo ve HTTPS contra su propio origen.
//
//   2. La direccion del backend no debe quedar en el repositorio, que es
//      publico. Vive en la variable de entorno API_BASE del hosting.
//
// En desarrollo cae a localhost:7002, que es donde escucha el backend en IIS.
export default defineEventHandler(async (event) => {
    const base = (process.env.API_BASE || 'http://localhost:7002').replace(/\/+$/, '');

    // `event.path` llega como "/api/auth/login?x=1"; se reenvia tal cual,
    // conservando la query.
    const destino = `${base}${event.path}`;

    return proxyRequest(event, destino, {
        // El backend espera el JWT en `Authorization` sin prefijo "Bearer" y la
        // empresa en `X-Company`. `proxyRequest` reenvia los headers de entrada,
        // pero `host` debe quitarse: si se propaga, el backend lo recibe con el
        // dominio de Vercel y algunos middlewares lo rechazan.
        headers: { host: undefined }
    });
});
