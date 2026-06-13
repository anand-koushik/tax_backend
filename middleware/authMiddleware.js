import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  // Get token from header
  const authHeader = req.header('Authorization');
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  // Token format: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token format is invalid, must be Bearer <token>' });
  }

  const token = parts[1];

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'indian_tax_planner_pro_jwt_secret_998811';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach decoded user info to request object
    req.user = decoded; // Should contain { id, email }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};
