import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Serves /api/insight during `npm run dev`, so the AI feature works without
 *  installing the Vercel CLI. In production that path is handled by the real
 *  edge function (api/insight.ts); both call the same generateInsight core.
 *  `env` comes from loadEnv with an empty prefix, i.e. the unprefixed secrets
 *  in .env that deliberately never reach the client bundle. */
function insightDevApi(env: Record<string, string>): Plugin {
  return {
    name: 'pocer-insight-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/insight', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        res.setHeader('Content-Type', 'application/json')
        try {
          // Mirrors the cap in api/insight.ts. No rate limit here: dev only
          // ever serves localhost, and the throttle exists for the public URL.
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            size += (chunk as Buffer).length
            if (size > 64 * 1024) {
              res.statusCode = 413
              res.end(JSON.stringify({ error: 'Payload quá lớn' }))
              return
            }
            chunks.push(chunk as Buffer)
          }
          const core = await server.ssrLoadModule('/api/_insight-core.ts')
          const result = await core.generateInsight(
            JSON.parse(Buffer.concat(chunks).toString('utf8')),
            env
          )
          res.end(JSON.stringify(result))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Lỗi không xác định'
          const badRequest = error instanceof Error && error.name === 'BadRequestError'
          if (!badRequest) server.config.logger.error(`[insight] ${message}`)
          res.statusCode = badRequest ? 400 : 502
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), insightDevApi(loadEnv(mode, process.cwd(), ''))],
}))
