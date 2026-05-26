// AUTH MIDDLEWARE - Protects routes by verifying the JWT token
// Reads the token from the cookie (or Authorization header), verifies it,
// and attaches the decoded payload to req.user so handlers can use req.user.userId.
import jwt from 'jsonwebtoken'

export function authMiddleware(req, res, next) {
  try {
    // get token from cookie first, then fall back to Authorization header
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated, no token' })
    }

    // verify the token and attach the payload to req.user
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret')
    req.user = decoded // contains { userId, role }
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
