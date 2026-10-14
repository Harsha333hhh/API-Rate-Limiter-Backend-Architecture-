export function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret || jwtSecret === 'dev_secret') {
    return res.status(503).json({ message: 'Admin monitoring is not configured securely' })
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator access required' })
  }

  next()
}
