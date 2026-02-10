import { defineConfig, loadEnv, type PluginOption } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import extractHandler from './api/extract'

const devApiExtractPlugin = (): PluginOption => ({
  name: 'dev-api-extract',
  configureServer(server) {
    server.middlewares.use(
      '/api/extract',
      async (
        req: IncomingMessage,
        res: ServerResponse,
      ) => {
        const method = req.method ?? 'GET'
        const headers = new Headers()
        for (const [key, value] of Object.entries(req.headers)) {
          if (value === undefined) continue
          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(key, item)
            }
          } else {
            headers.set(key, String(value))
          }
        }

        const chunks: Uint8Array[] = []
        for await (const chunk of req) {
          if (typeof chunk === 'string') {
            chunks.push(Buffer.from(chunk))
          } else {
            chunks.push(chunk)
          }
        }
        const bodyBuffer = Buffer.concat(chunks)
        const requestUrl = `http://${req.headers.host ?? 'localhost:5173'}${
          req.url ?? '/api/extract'
        }`

        try {
          const response = await extractHandler(
            new Request(requestUrl, {
              method,
              headers,
              body:
                method === 'GET' ||
                method === 'HEAD' ||
                bodyBuffer.length === 0
                  ? undefined
                  : bodyBuffer,
            }),
          )

          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })
          const responseBuffer = Buffer.from(await response.arrayBuffer())
          res.end(responseBuffer)
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          const message =
            error instanceof Error
              ? error.message
              : 'Onbekende fout in /api/extract middleware'
          res.end(JSON.stringify({ error: message }))
        }
      },
    )
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [react(), devApiExtractPlugin()],
  }
})
