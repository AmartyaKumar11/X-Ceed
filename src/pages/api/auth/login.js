import clientPromise from '../../../lib/mongodb';
import bcrypt from 'bcryptjs';
import { createToken, setAuthCookie } from '../../../lib/auth';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Connect to the database
    const client = await clientPromise;    
    // Extract database name from URI or use default
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/x-ceed-db';
    const dbName = uri.split('/')[3]?.split('?')[0] || 'x-ceed-db';
    
    const db = client.db(dbName);
    
    // Extract data from request body
    const { email, password } = req.body;
    
    // Debug logging
    console.log("🔍 Login attempt:");
    console.log("  Email:", email);
    console.log("  Password length:", password ? password.length : 'undefined');
    console.log("  Request body:", JSON.stringify(req.body, null, 2));
    
    // Validate required fields
    if (!email || !password) {
      console.log("❌ Missing email or password");
      return res.status(400).json({ message: 'Missing email or password' });
    }

    // Normalize email: trim and lowercase
    const normalizedEmail = email.trim().toLowerCase();
    console.log("🔍 Searching for user with normalized email:", normalizedEmail);
    // Always use case-insensitive search
    let user = await db.collection('users').findOne({
      email: { $regex: new RegExp('^' + normalizedEmail.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '$', 'i') }
    });
    if (!user) {
      console.log("❌ No user found with normalized/case-insensitive search");
      return res.status(401).json({ message: 'Invalid email or password' });
    } else {
      console.log("✅ User found:", user.email);
    }
    
    // Verify password
    console.log("🔑 Verifying password...");
    console.log("  Stored hash:", user.password ? user.password.substring(0, 20) + "..." : "No password");
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log("  Password valid:", isPasswordValid);
    
    if (!isPasswordValid) {
      console.log("❌ Password verification failed");
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    console.log("✅ Login successful for user:", user.email);
    
    // Generate JWT token with user information
    const resolvedType = user.userType || user.role || 'applicant';
    const token = await createToken({ 
      userId: user._id.toString(),
      email: user.email,
      userType: resolvedType,
      name: resolvedType === 'applicant' ? user.personal?.name : user.recruiter?.name
    });
    
    // Set the token in the cookies
    setAuthCookie({ req, res, token });
    
    // Log the login attempt
    await db.collection('users').updateOne(
      { _id: user._id },
      { 
        $set: { lastLogin: new Date() },
        $push: { 
          loginHistory: {
            timestamp: new Date(),
            userAgent: req.headers['user-agent'] || 'Unknown',
            ip: req.headers['x-forwarded-for'] || 
                req.socket.remoteAddress || 
                'Unknown'
          } 
        }
      }
    );
    
    // Return success response with token and user info (excluding password and sensitive fields)
    const { 
      password: _, 
      resetPasswordToken: __, 
      resetPasswordExpiry: ___, 
      loginHistory: ____, 
      ...userWithoutSensitiveInfo 
    } = user;
    
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        ...userWithoutSensitiveInfo,
        userType: resolvedType,
        role: resolvedType,
      }
    });
    
  } catch (error) {
    console.error('❌ Login error details:');
    console.error('  Error message:', error.message);
    console.error('  Error stack:', error.stack);
    console.error('  Error name:', error.name);
    console.error('  Full error:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
}