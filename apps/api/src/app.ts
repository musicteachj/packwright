import cors from 'cors'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { createLabelRouter } from './labels/routes'

export interface AppOptions {
  /** Suppresses request logging under test, where it is only noise. */
  enableLogging?: boolean
}

/**
 * Builds the Express application without starting a listener.
 *
 * Split from `server.ts` on purpose: Supertest can exercise the app directly,
 * so route tests need neither a port nor a running process.
 */
export function createApp(options: AppOptions = {}): Express {
  const { enableLogging = true } = options
  const app = express()

  app.use(helmet())
  app.use(cors())
  // Generous, because a label audit posts a photograph.
  app.use(express.json({ limit: '10mb' }))
  if (enableLogging) app.use(morgan('combined'))

  /**
   * Liveness probe. The ALB target group polls this, so its shape is load
   * bearing — a 200 here is what keeps the ECS task in service.
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    })
  })

  app.use('/api/labels', createLabelRouter())

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Never leak an internal message to the client; the detail goes to the logs,
    // which in production means CloudWatch.
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
