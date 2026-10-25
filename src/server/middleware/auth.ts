import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';

export const JWT_SECRET = process.env.JWT_SECRET || 'rec_bijnor_campus_care_jwt_secret_2026_xyz';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'staff' | 'admin';
  department?: string;
  enrollmentNumber?: string;
  hostel?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    // Check if user still exists and is active
    const user = await db.users.findById(decoded.id);
    if (!user) {
      res.status(401).json({ error: 'User account no longer exists.' });
      return;
    }
    if (user.isActive === false) {
      res.status(403).json({ error: 'Your account has been deactivated. Please contact REC Bijnor Administration.' });
      return;
    }

    req.user = {
      id: user.id || (user as any)._id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      enrollmentNumber: user.enrollmentNumber,
      hostel: user.hostel,
    };
    next();
  } catch (err: any) {
    res.status(403).json({ error: 'Invalid or expired session token.' });
  }
};

export const requireRoles = (roles: Array<'student' | 'faculty' | 'staff' | 'admin'>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Access denied. Requires one of: ${roles.join(', ')}` });
      return;
    }
    next();
  };
};
