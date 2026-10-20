/** Anything with a fetch-style entry point; a Hono app qualifies. */
export interface FetchHandler {
  fetch(request: Request, env?: unknown): Response | Promise<Response>
}

/** `ctx.webuiServer`: where a plugin serves the HTTP API its WebUI module calls. */
export interface WebUIServer {
  /**
   * Serves requests under `prefix` with `handler` until the plugin is disposed or the returned function
   * runs. The handler sees the full URL: give a Hono app `basePath(prefix)` or `route(prefix, ...)`.
   *
   * Routes live under `/api/` behind the WebUI login, and `ctx.api()` of the plugin's WebUI module calls
   * them with it. `public` routes live outside `/api/` without the login, e.g. for webhooks from other
   * services; such a handler has to check access itself.
   */
  route(prefix: string, handler: FetchHandler, options?: { public?: boolean }): () => void
}

declare module 'cordis' {
  interface Context {
    webuiServer: WebUIServer
  }
}
