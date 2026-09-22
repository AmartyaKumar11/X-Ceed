'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Briefcase, 
  FileCheck, 
  PieChart,
  LineChart,
  CheckCheck,
  Edit,
  MapPin,
  DollarSign,
  Calendar,
  Eye,  Plus
} from 'lucide-react';
import { clientAuth } from '@/lib/auth';
import CreateJobDialog from '@/components/CreateJobDialog';
import ApplicationStatusCards from '@/components/ApplicationStatusCards';
import { AnalyticsProvider } from '@/contexts/AnalyticsContext';
import { gql, RECRUITER_DASHBOARD_QUERY } from '@/lib/graphqlClient';

export default function RecruiterDashboardPage() {
  const router = useRouter();  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [isCreateJobDialogOpen, setIsCreateJobDialogOpen] = useState(false);
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);

  const [stats, setStats] = useState({
    activeJobs: 0,
    totalApplications: 0,
    interviews: 0
  });useEffect(() => {
    checkAuthAndFetchData();
    
    // Force cache clear for job data on initial load
    if (typeof window !== 'undefined') {
      // Clear any potential cached API responses
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            if (name.includes('api') || name.includes('jobs')) {
              caches.delete(name);
            }
          });
        });
      }
    }  }, []);
    // Update stats when interviews are loaded
  useEffect(() => {
    if (jobs.length > 0) {
      calculateStats(jobs);
    }
  }, [upcomingInterviews, jobs]);
  
  // Check URL hash for #create-job
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleHashChange = () => {
        if (window.location.hash === '#create-job') {
          setIsCreateJobDialogOpen(true);
        }
      };
      
      // Check hash on initial load
      handleHashChange();
      
      // Listen for hash changes
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }
  }, []);
  const checkAuthAndFetchData = async () => {
    try {      // Check if user is authenticated
      if (!clientAuth.isAuthenticated()) {
        router.push('/auth');
        return;
      }

      // Check if user is a recruiter
      const userRole = clientAuth.getUserRole();
      if (userRole !== 'recruiter') {
        if (userRole === 'applicant') {
          router.push('/dashboard/applicant');
        } else {
          router.push('/auth');
        }
        return;
      }      setAuthLoading(false);
      await fetchJobs();
      await fetchUpcomingInterviews();} catch (error) {
      router.push('/auth');
    }
  };
  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setJobs([]);
        calculateStats([]);
        return;
      }

      // Prefer single GraphQL round-trip; fall back to REST
      try {
        const data = await gql(RECRUITER_DASHBOARD_QUERY);
        const dash = data?.recruiterDashboard;
        if (dash) {
          const mapped = (dash.jobs || []).map((j) => ({
            ...j,
            _id: j.id,
            applicationsCount: j.applicationCount ?? 0,
          }));
          setJobs(mapped);
          setStats({
            activeJobs: dash.stats?.activeJobs ?? mapped.filter((j) => j.status === 'active').length,
            totalApplications: dash.stats?.totalApplications ?? 0,
            interviews: dash.stats?.shortlistedCount ?? 0,
          });
          return;
        }
      } catch (gqlErr) {
        console.warn('GraphQL dashboard fallback to REST:', gqlErr.message);
      }

      const response = await fetch('/api/jobs', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.success) {
          setJobs(data.data || []);
          calculateStats(data.data || []);
        } else {
          setJobs([]);
          calculateStats([]);
        }
      } else if (response.status === 401) {
        localStorage.removeItem('token');
        clientAuth.logout();
        router.push('/auth');
        return;
      } else {
        setJobs([]);
        calculateStats([]);
      }
    } catch (error) {
      setJobs([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUpcomingInterviews = async () => {
    try {
      setInterviewsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setUpcomingInterviews([]);
        return;
      }      const userData = clientAuth.getUser();
      console.log('🔍 User data:', userData);
      
      if (!userData?._id) {
        console.error('❌ No user ID found');
        setUpcomingInterviews([]);
        return;
      }

      const apiUrl = `/api/interviews/upcoming?recruiterId=${userData._id}`;
      console.log('🌐 Calling API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📡 API Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 API Response data:', data);
        
        if (data && data.success) {
          console.log('✅ Setting interviews:', data.interviews);
          setUpcomingInterviews(data.interviews || []);
        } else {
          console.error('❌ API returned no success');
          setUpcomingInterviews([]);
        }
      } else {
        const errorText = await response.text();
        console.error('❌ API Error:', response.status, errorText);
        setUpcomingInterviews([]);
      }
    } catch (error) {
      console.error('Error fetching upcoming interviews:', error);
      setUpcomingInterviews([]);
    } finally {
      setInterviewsLoading(false);
    }
  };
  const calculateStats = (jobsData) => {
    const activeJobs = jobsData.filter(job => job.status === 'active').length;
    const totalApplications = jobsData.reduce((sum, job) => sum + (job.applicationsCount || 0), 0);
      setStats({
      activeJobs,
      totalApplications,
      interviews: upcomingInterviews.length // Use actual interview count
    });
  };
  const handleJobCreated = (newJob) => {
    setJobs(prevJobs => [newJob, ...prevJobs]);
    calculateStats([newJob, ...jobs]);
    setIsCreateJobDialogOpen(false);
  };

  const formatSalary = (min, max, currency = 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  const getWorkModeIcon = (mode) => {
    switch (mode) {
      case 'remote':
        return 'Remote';
      case 'onsite':
        return 'On-site';
      case 'hybrid':
        return 'Hybrid';
      default:
        return 'Location';
    }
  };  return (
    <AnalyticsProvider>
      <div className="space-y-6 max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold mb-6 text-foreground">Recruitment Overview</h2>
        
        {/* Application Status Analytics */}
        <ApplicationStatusCards />
        
        {/* Basic Stats Cards */}      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div 
          className="bg-card text-card-foreground p-4 rounded-lg border shadow-md hover:shadow-lg transition-shadow cursor-pointer flex items-start" 
          onClick={() => router.push('/dashboard/recruiter/jobs')}
        >
          <div className="p-2 rounded-full bg-primary/10 mr-3">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Active Jobs</p>
            <h3 className="text-xl font-bold text-card-foreground">{stats.activeJobs}</h3>
          </div>
        </div>
        
        <div className="bg-card text-card-foreground p-4 rounded-lg border shadow-md hover:shadow-lg transition-shadow flex items-start">
          <div className="p-2 rounded-full bg-purple-500/10 mr-3">
            <FileCheck className="h-5 w-5 text-purple-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Applications</p>
            <h3 className="text-xl font-bold text-card-foreground">{stats.totalApplications}</h3>
          </div>        </div>
        
        <div className="bg-card text-card-foreground p-4 rounded-lg border shadow-md hover:shadow-lg transition-shadow flex items-start">
          <div className="p-2 rounded-full bg-rose-500/10 mr-3">
            <PieChart className="h-5 w-5 text-rose-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Interviews</p>
            <h3 className="text-xl font-bold text-card-foreground">{stats.interviews}</h3>
          </div>
        </div>
      </div>{/* Main Content Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Active Job Postings */}
        <div className="xl:col-span-3 bg-card text-card-foreground p-4 rounded-lg border shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center text-card-foreground">
              <Briefcase className="h-5 w-5 mr-2 text-muted-foreground" />
              Active Job Postings
            </h3>
            <div className="flex items-center gap-2">
              {jobs.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {jobs.filter(job => job.status === 'active').length} active
                </span>
              )}
            </div>
          </div>
          
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">No jobs posted yet</p>
              <p className="text-sm text-muted-foreground mb-4">Create your first job posting to get started</p>
              <button
                onClick={() => setIsCreateJobDialogOpen(true)}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Create Your First Job
              </button>
            </div>
          ) : (            <div className="space-y-4 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-muted/20">
              {jobs.filter(job => job.status === 'active').map((job) => (
                <div 
                  key={job._id} 
                  className="p-4 border border-border/50 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-card-foreground">{job.title}</h4>
                    <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded-full">
                      Active
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {getWorkModeIcon(job.workMode)}
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
                    </span>
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.location}
                      </span>
                    )}
                  </div>                  
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Posted {formatDate(job.createdAt)}</span>
                      <span className="flex items-center gap-1">
                        <FileCheck className="h-3 w-3" />
                        {job.applicationsCount || 0} applicants
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {job.viewsCount || 0} views
                      </span>
                    </div>
                    <button className="text-xs text-primary flex items-center hover:text-primary/80">
                      <Edit className="h-3 w-3 mr-1" /> 
                      Edit
                    </button>
                  </div>
                  
                  {job.applicationEnd && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Applications close on {formatDate(job.applicationEnd)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>        {/* Upcoming Interviews */}
        <div className="bg-card text-card-foreground p-4 rounded-lg border shadow-md">
          <h3 className="text-lg font-semibold mb-4 flex items-center text-card-foreground">
            <LineChart className="h-5 w-5 mr-2 text-muted-foreground" />
            Upcoming Interviews
          </h3>
            {interviewsLoading ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Loading interviews...</div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3 border border-border/50 rounded-md animate-pulse">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-gray-300 rounded-full mr-2"></div>
                    <div className="h-4 bg-gray-300 rounded w-24"></div>
                  </div>
                  <div className="h-3 bg-gray-300 rounded w-40 mt-1"></div>
                </div>
              ))}
            </div>          ) : (
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                Debug: Found {upcomingInterviews.length} interviews
              </div>
              {upcomingInterviews.length > 0 ? (
                <div className="space-y-3">
                  {upcomingInterviews.map((interview) => (
                    <div 
                      key={interview.id} 
                      className="p-3 border border-border/50 rounded-md hover:bg-muted/50 cursor-pointer transition-colors" 
                      onClick={() => router.push(`/dashboard/recruiter/jobs/${interview.jobId}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-2 ${
                            interview.isToday ? 'bg-red-500' : 
                            interview.isTomorrow ? 'bg-orange-500' : 
                            'bg-green-500'
                          }`}></div>
                          <h4 className="font-medium text-sm text-card-foreground">{interview.applicantName}</h4>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          interview.isToday ? 'bg-red-100 text-red-800' :
                          interview.isTomorrow ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {interview.timeFromNow}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {interview.jobTitle} • {interview.timeFromNow}, {interview.interviewTime}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {interview.interviewType}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No upcoming interviews scheduled</p>
                  <p className="text-xs mt-1">Applications with 'Interview' status will appear here</p>
                </div>              )}
            </div>
          )}
        </div>
      </div>
      
      <CreateJobDialog
        isOpen={isCreateJobDialogOpen}
        onClose={() => setIsCreateJobDialogOpen(false)}
        onJobCreated={handleJobCreated}
      />
    </div>
    </AnalyticsProvider>
  );
}
