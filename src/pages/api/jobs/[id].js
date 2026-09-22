import clientPromise, { getDatabase } from '../../../lib/mongodb';
import { authMiddleware } from '../../../lib/middleware';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  try {
    // Get the job ID from the URL parameter
    const { id } = req.query;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    
    // Connect to the database
    const db = await getDatabase();
    
    // Handle different request methods
    switch (req.method) {
      case 'GET':
        // Anyone can view a single job, no auth required
        try {
          const now = new Date();
          let job = await db.collection('jobs').findOne({ 
            _id: new ObjectId(id),
            status: 'active',
            $or: [
              { applicationEnd: { $gte: now } },
              { applicationEnd: { $exists: false } },
              { applicationEnd: null }
            ]
          });

          if (job) {
            await db.collection('jobs').updateOne(
              { _id: job._id },
              { $inc: { viewsCount: 1 } }
            );
            return res.status(200).json({ job: { ...job, source: 'recruiter' } });
          }

          // Aggregated Remotive / Jobicy jobs
          const agg = await db.collection('aggregated_jobs').findOne({
            _id: new ObjectId(id),
            active: true,
          });
          if (!agg) {
            return res.status(404).json({ message: 'Job not found or no longer available' });
          }

          return res.status(200).json({
            job: {
              ...agg,
              companyName: agg.company,
              workMode: 'Remote',
              jobType: agg.job_type,
              salaryMin: agg.salary_range?.min ?? null,
              salaryMax: agg.salary_range?.max ?? null,
              currency: agg.salary_range?.currency || 'USD',
              createdAt: agg.published_at || agg.fetched_at,
            },
          });
        } catch (error) {
          console.error('Error fetching job:', error);
          return res.status(500).json({ message: 'Internal server error' });
        }
        
      case 'PUT':
        // Check authentication for updating jobs
        const auth = await authMiddleware(req);
        if (!auth.isAuthenticated) {
          return res.status(auth.status).json({ message: auth.error });
        }
        
        // Only recruiters can update jobs
        if (auth.user.userType !== 'recruiter') {
          return res.status(403).json({ message: 'Only recruiters can update jobs' });
        }
        
        try {
          // Get the current job
          const job = await db.collection('jobs').findOne({ _id: new ObjectId(id) });
          
          if (!job) {
            return res.status(404).json({ message: 'Job not found' });
          }
          
          // Verify that the recruiter owns this job
          if (job.recruiterId !== auth.user.userId) {
            return res.status(403).json({ message: 'You can only update your own jobs' });
          }
          
          // Extract update data from request body
          const {
            title,
            company,
            location,
            description,
            requirements,
            responsibilities,
            salary,
            salaryType,
            jobType,
            category,
            benefits,
            applicationDeadline,
            contactEmail,
            contactPhone,
            status
          } = req.body;
          
          // Build update object with only provided fields
          const updateData = {};
          
          if (title !== undefined) updateData.title = title;
          if (company !== undefined) updateData.company = company;
          if (location !== undefined) updateData.location = location;
          if (description !== undefined) updateData.description = description;
          if (requirements !== undefined) updateData.requirements = requirements;
          if (responsibilities !== undefined) updateData.responsibilities = responsibilities;
          if (salary !== undefined) updateData.salary = salary;
          if (salaryType !== undefined) updateData.salaryType = salaryType;
          if (jobType !== undefined) updateData.jobType = jobType;
          if (category !== undefined) updateData.category = category;
          if (benefits !== undefined) updateData.benefits = benefits;
          if (applicationDeadline !== undefined) {
            updateData.applicationDeadline = new Date(applicationDeadline);
          }
          if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
          if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
          if (status !== undefined) updateData.status = status;
          
          // Always update the updatedAt timestamp
          updateData.updatedAt = new Date();
          
          // Update the job
          const result = await db.collection('jobs').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
          );
          
          if (result.modifiedCount === 0) {
            return res.status(400).json({ message: 'Job not updated' });
          }
          
          // Get the updated job
          const updatedJob = await db.collection('jobs').findOne({ _id: new ObjectId(id) });
          
          return res.status(200).json({ 
            message: 'Job updated successfully',
            job: updatedJob 
          });
        } catch (error) {
          console.error('Error updating job:', error);
          return res.status(500).json({ message: 'Internal server error' });
        }
        
      case 'DELETE':
        // Check authentication for deleting jobs
        const delAuth = await authMiddleware(req);
        if (!delAuth.isAuthenticated) {
          return res.status(delAuth.status).json({ message: delAuth.error });
        }
        
        // Only recruiters can delete jobs
        if (delAuth.user.userType !== 'recruiter') {
          return res.status(403).json({ message: 'Only recruiters can delete jobs' });
        }
        
        try {
          // Get the current job
          const job = await db.collection('jobs').findOne({ _id: new ObjectId(id) });
          
          if (!job) {
            return res.status(404).json({ message: 'Job not found' });
          }
          
          // Verify that the recruiter owns this job
          if (job.recruiterId !== delAuth.user.userId) {
            return res.status(403).json({ message: 'You can only delete your own jobs' });
          }
          
          // Soft delete by setting status to 'deleted'
          const result = await db.collection('jobs').updateOne(
            { _id: new ObjectId(id) },
            { 
              $set: { 
                status: 'deleted',
                updatedAt: new Date()
              } 
            }
          );
          
          if (result.modifiedCount === 0) {
            return res.status(400).json({ message: 'Job not deleted' });
          }
          
          return res.status(200).json({ message: 'Job deleted successfully' });
        } catch (error) {
          console.error('Error deleting job:', error);
          return res.status(500).json({ message: 'Internal server error' });
        }
        
      default:
        return res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Jobs API error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}