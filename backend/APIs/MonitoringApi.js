import express from 'express'
import { authMiddleware } from '../Middlewares/authMiddleware.js'
import { adminMiddleware } from '../Middlewares/adminMiddleware.js'
import { getRateLimitMonitoringSnapshot } from '../services/rateLimitMonitoring.js'
import { getServerHealthSnapshot } from '../services/serverHealth.js'

export const monitoringRoute = express.Router()

monitoringRoute.get('/rate-limits', authMiddleware, adminMiddleware, (req, res) => {
  res.status(200).json(getRateLimitMonitoringSnapshot())
})

monitoringRoute.get('/server-health', authMiddleware, adminMiddleware, (req, res) => {
  res.status(200).json(getServerHealthSnapshot())
})
