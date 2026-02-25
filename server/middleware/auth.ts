import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';

export interface AuthenticatedRequest extends Request {
  authUser?: {
    id: string;
    email?: string;
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization') || req.header('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: missing Bearer token',
      code: 'AUTH_REQUIRED',
    });
  }

  const token = bearerMatch[1].trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: empty Bearer token',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: invalid or expired token',
        code: 'AUTH_INVALID',
      });
    }

    const authReq = req as AuthenticatedRequest;
    authReq.authUser = {
      id: data.user.id,
      email: data.user.email || undefined,
    };

    if (req.body && typeof req.body === 'object') {
      (req.body as Record<string, unknown>).userId = data.user.id;
    }

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: token verification failed',
      code: 'AUTH_INVALID',
    });
  }
}
