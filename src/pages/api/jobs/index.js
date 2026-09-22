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
        // Public jobs listing — recruiter-posted + aggregated (Remotive/Jobicy)
        const now = new Date();
        const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 200);
        const searchQuery = (req.query.q || req.query.search || '').trim();
        const sourceFilter = (req.query.source || '').trim().toLowerCase();

        const recruiterQuery = {
          status: 'active',
          $or: [
            { applicationEnd: { $gte: now } },
            { applicationEnd: { $exists: false } },
            { applicationEnd: null },
          ],
        };
        if (searchQuery) {
          recruiterQuery.$and = [
            {
              $or: [
                { title: { $regex: searchQuery, $options: 'i' } },
                { description: { $regex: searchQuery, $options: 'i' } },
                { companyName: { $regex: searchQuery, $options: 'i' } },
                { location: { $regex: searchQuery, $options: 'i' } },
              ],
            },
          ];
        }

        let recruiterJobs = [];
        if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'recruiter' || sourceFilter === 'direct') {
          recruiterJobs = await db
            .collection('jobs')
            .find(recruiterQuery)
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();
        }

        let aggregatedJobs = [];
        if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'remotive' || sourceFilter === 'jobicy') {
          const aggQuery = { active: true };
          if (sourceFilter === 'remotive' || sourceFilter === 'jobicy') {
            aggQuery.source = sourceFilter;
          }
          try {
            if (searchQuery) {
              aggregatedJobs = await db
                .collection('aggregated_jobs')
                .find({ ...aggQuery, $text: { $search: searchQuery } })
                .sort({ published_at: -1 })
                .limit(limit)
                .toArray();
            } else {
              aggregatedJobs = await db
                .collection('aggregated_jobs')
                .find(aggQuery)
                .sort({ published_at: -1 })
                .limit(limit)
                .toArray();
            }
          } catch (e) {
            // text index may not exist yet — fall back to regex
            if (searchQuery) {
              aggregatedJobs = await db
                .collection('aggregated_jobs')
                .find({
                  ...aggQuery,
                  $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { company: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } },
                  ],
                })
                .sort({ published_at: -1 })
                .limit(limit)
                .toArray();
            } else {
              throw e;
            }
          }
        }

        const normalizedRecruiter = recruiterJobs.map((j) => ({
          ...j,
          source: 'recruiter',
          companyName: j.companyName || j.company || '',
          published_at: j.createdAt,
        }));

        const normalizedAggregated = aggregatedJobs.map((j) => ({
          ...j,
          companyName: j.company || '',
          company: j.company || '',
          workMode: 'Remote',
          jobType: j.job_type || 'full_time',
          salaryMin: j.salary_range?.min ?? null,
          salaryMax: j.salary_range?.max ?? null,
          currency: j.salary_range?.currency || 'USD',
          createdAt: j.published_at || j.fetched_at,
          department: (j.tags && j.tags[0]) || 'Tech',
          level: '',
          description: j.description || '',
        }));

        const allJobs = [...normalizedRecruiter, ...normalizedAggregated]
          .sort(
            (a, b) =>
              new Date(b.published_at || b.createdAt || 0) -
              new Date(a.published_at || a.createdAt || 0)
          )
          .slice(0, limit);

        console.log(
          `📊 Public jobs: ${normalizedRecruiter.length} recruiter + ${normalizedAggregated.length} aggregated → ${allJobs.length}`
        );

        return res.status(200).json({
          success: true,
          data: allJobs,
          jobs: allJobs,
          total: allJobs.length,
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
