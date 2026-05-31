export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication is required.' })
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: `${role} permission is required.` })
    }

    return next()
  }
}

export const requireAdmin = requireRole('admin')
