import { verifyToken, getAuthCookie } from './auth.js';
import { connectToDatabase } from './mongodb.js';
import { ObjectId } from 'mongodb';

/**
 * Authentication middleware for API routes
 * @param {Object} req - The request object
 * @returns {Promise<Object>} - Authentication result object
 */
export async function authMiddleware(req) {
  try {
    // Get token from cookie or Authorization header
    let token = getAuthCookie({ req });
    
    if (!token) {
      // Try Authorization header as fallback
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      return {
        isAuthenticated: false,
        status: 401,
        error: 'No authentication token provided'
      };
    }
    
    // Verify the token
    let payload;
    try {
      payload = await verifyToken(token);
    } catch (error) {
      return {
        isAuthenticated: false,
        status: 401,
        error: 'Invalid or expired token'
      };
    }
    
    // Get user from database to ensure they still exist
    const { db } = await connectToDatabase();
    const user = await db.collection('users').findOne({ 
      _id: new ObjectId(payload.userId) 
    });
    
    if (!user) {
      return {
        isAuthenticated: false,
        status: 401,
        error: 'User not found'
      };
    }
    
    return {
      isAuthenticated: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        userType: user.userType,
        personal: user.personal,
        professional: user.professional
      },
      status: 200
    };
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    return {
      isAuthenticated: false,
      status: 500,
      error: 'Authentication service error'
    };
  }
}

/**
 * Higher-order function to create protected API routes
 * @param {Function} handler - The API route handler
 * @param {Object} options - Options for authentication
 * @param {string[]} options.allowedRoles - Array of allowed user roles
 * @returns {Function} - The protected handler
 */
export function withAuth(handler, options = {}) {
  return async function protectedHandler(req, res) {
    const auth = await authMiddleware(req);
    
    if (!auth.isAuthenticated) {
      return res.status(auth.status).json({ message: auth.error });
    }
    
    // Check role-based access if specified
    if (options.allowedRoles && !options.allowedRoles.includes(auth.user.userType)) {
      return res.status(403).json({ 
        message: `Access denied. Required roles: ${options.allowedRoles.join(', ')}` 
      });
    }
    
    // Add user to request object
    req.user = auth.user;
    
    // Call the original handler
    return handler(req, res);
  };
}

/**
 * Middleware specifically for recruiter-only routes
 */
export const requireRecruiter = (handler) => withAuth(handler, { allowedRoles: ['recruiter'] });

/**
 * Middleware specifically for applicant-only routes
 */
export const requireApplicant = (handler) => withAuth(handler, { allowedRoles: ['applicant'] });
