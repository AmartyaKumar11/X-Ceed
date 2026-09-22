// filepath: c:\Users\AMARTYA KUMAR\Desktop\x-ceed\src\pages\api\jobs\index.js
import clientPromise, { getDatabase } from '../../../lib/mongodb';
import { authMiddleware } from '../../../lib/middleware';
import { ObjectId } from 'mongodb';
import { jwtVerify } from 'jose';

// Helper function for token verification
const verifyToken = async (token) => {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-for-jwt-tokens');
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
};

export default async function handler(req, res) {  try {
    // Connect to the database
    const db = await getDatabase();
    
    if (req.method === 'POST') {
      // Verify authentication
      const auth = await authMiddleware(req);
      if (!auth.isAuthenticated) {
        return res.status(auth.status).json({ success: false, message: auth.error });
      }
      
      // Verify user is a recruiter
      if (auth.user.userType !== 'recruiter') {
        return res.status(403).json({ success: false, message: 'Only recruiters can create jobs' });
      }      const {
        title,
        department,
        level,
        description,
        jobDescriptionType,
        jobDescriptionText,
        jobDescriptionFile,
        workMode,
        location,
        jobType,
        duration,
        salaryMin,
        salaryMax,
        currency,
        benefits,
        numberOfOpenings,
        applicationStart,
        applicationEnd,
        priority,
        status = 'active',
        evaluationWeights,
      } = req.body;

      // Validate required fields
      if (!title || !department || !level || !workMode || !jobType || !duration || 
          !salaryMin || !salaryMax || !numberOfOpenings || !applicationStart || !applicationEnd) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields' 
        });
      }

      // Validate salary range
      if (parseInt(salaryMin) >= parseInt(salaryMax)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Maximum salary must be greater than minimum salary' 
        });
      }

      // Validate dates
      const startDate = new Date(applicationStart);
      const endDate = new Date(applicationEnd);
      if (startDate >= endDate) {
        return res.status(400).json({ 
          success: false, 
          message: 'Application end date must be after start date' 
        });
      }
        const job = {
        recruiterId: auth.user.userId,
        title,
        department,
        level,
        description: description || '',
        jobDescriptionType: jobDescriptionType || 'text',
        jobDescriptionText: jobDescriptionText || '',
        jobDescriptionFile: jobDescriptionFile || null,
        workMode,
        location: location || '',
        jobType,
        duration,
        salaryMin: parseInt(salaryMin),
        salaryMax: parseInt(salaryMax),
        currency: currency || 'USD',
        benefits: benefits || '',
        numberOfOpenings: parseInt(numberOfOpenings),
        applicationStart: startDate,
        applicationEnd: endDate,
        priority: priority || 'medium',
        status,
        evaluationWeights: evaluationWeights || {
          skills: 0.35,
          experience: 0.25,
          education: 0.15,
          projects: 0.15,
          communication: 0.1,
        },
        applicationsCount: 0,
        viewsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('jobs').insertOne(job);

      return res.status(201).json({
        success: true,
        data: { ...job, _id: result.insertedId },
        message: 'Job created successfully'
      });
    } else if (req.method === 'GET') {
      // Handle public job listings vs. recruiter-specific job listings
      const isPublic = req.query.public === 'true';      if (!isPublic) {
        // If not public, verify authentication for recruiter-specific listings
        const auth = await authMiddleware(req);
        if (!auth.isAuthenticated) {
          return res.status(auth.status).json({ success: false, message: auth.error });
        }
        
        // Use auth.user.userId instead of decoded.userId
        const jobs = await db.collection('jobs')
          .find({ 
            recruiterId: auth.user.userId,
            status: { $ne: 'deleted' }
          })
          .sort({ createdAt: -1 })
          .toArray();
          
        // Get application statistics for each job
        const jobsWithStats = await Promise.all(jobs.map(async (job) => {
          try {
            // Get total applications count for this job
            job.applicationsCount = await db.collection('applications')
              .countDocuments({ jobId: job._id.toString() });
              
            // Get counts by status
            const statusStats = await db.collection('applications')
              .aggregate([
                { $match: { jobId: job._id.toString() } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
              ])
              .toArray();
              
            // Convert to object for easier access
            const applicationStats = {
              pending: 0,
              reviewing: 0,
              interview: 0,
              accepted: 0,
              rejected: 0
            };
            
            statusStats.forEach(stat => {
              if (stat._id && applicationStats.hasOwnProperty(stat._id)) {
                applicationStats[stat._id] = stat.count;
              }
            });
            
            job.applicationStats = applicationStats;
            
            return job;
          } catch (error) {
            console.error(`Error getting stats for job ${job._id}:`, error);
            return job;
          }
        }));

        return res.status(200).json({
          success: true,
          data: jobsWithStats
        });      } else {
        // Public jobs listing - show only active jobs that haven't expired
        const now = new Date();
        const jobs = await db.collection('jobs')
          .find({ 
            status: 'active',
            // Only show jobs that are still accepting applications
            $or: [
              { applicationEnd: { $gte: now } }, // Application deadline hasn't passed
              { applicationEnd: { $exists: false } }, // No deadline set
              { applicationEnd: null } // Explicit null deadline
            ]
          })
          .sort({ createdAt: -1 })
          .toArray();

        console.log(`📊 Public jobs query: Found ${jobs.length} active, non-expired jobs`);

        return res.status(200).json({
          success: true,
          data: jobs
        });
      }
    } else if (req.method === 'PUT') {
      // Update job - use authMiddleware instead of manual token verification
      const auth = await authMiddleware(req);
      if (!auth.isAuthenticated) {
        return res.status(auth.status).json({ success: false, message: auth.error });
      }
      
      // Verify user is a recruiter
      if (auth.user.userType !== 'recruiter') {
        return res.status(403).json({ success: false, message: 'Only recruiters can update jobs' });
      }

      const { jobId, ...updateData } = req.body;

      if (!jobId) {
        return res.status(400).json({ success: false, message: 'Job ID is required' });
      }

      // Use the existing db connection instead of connectToDatabase
      const result = await db.collection('jobs').updateOne(
        { 
          _id: new ObjectId(jobId), 
          recruiterId: auth.user.userId 
        },
        { 
          $set: { 
            ...updateData, 
            updatedAt: new Date() 
          } 
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: 'Job not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Job updated successfully'
      });
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Jobs API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
}
