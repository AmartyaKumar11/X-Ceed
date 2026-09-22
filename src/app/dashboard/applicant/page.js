'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Briefcase, 
  FileText, 
  User, 
  Star, 
  Bell, 
  CheckCircle,
  Loader2,
  Edit,
  TrendingUp,
  Target
} from 'lucide-react';
import JobCountBadge from '@/components/JobCountBadge';
import { clientAuth } from '@/lib/auth';
import ProfileSettingsDialog from '@/components/ProfileSettingsDialog';
import NewsPanel from '@/components/NewsPanel';
import { useToast } from '@/components/ui/use-toast';
import WebJobsComponent from '@/components/WebJobsComponent';
import ApplicationContributionCalendar from '@/components/ApplicationContributionCalendar';

export default function ApplicantDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();  const [savedJobsCount, setSavedJobsCount] = useState(0);
  const [loadingSavedJobs, setLoadingSavedJobs] = useState(true);
  const [applications, setApplications] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [completionAnimation, setCompletionAnimation] = useState('');
  const [lastCompletionPercentage, setLastCompletionPercentage] = useState(0);  useEffect(() => {
    fetchSavedJobsCount();
    fetchProfileData();
    fetchRecentApplications();
  }, []);

  const fetchProfileData = async () => {
    try {
      if (!clientAuth.isAuthenticated()) {
        setLoadingProfile(false);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch('/api/applicant/profile', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setProfileData(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching profile data:', error);
    } finally {
      setLoadingProfile(false);
    }
  };
  const fetchSavedJobsCount = async () => {
    try {
      if (!clientAuth.isAuthenticated()) {
        setLoadingSavedJobs(false);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch('/api/saved-jobs/count', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSavedJobsCount(data.count);
        }
      }
    } catch (error) {
      console.error('Error fetching saved jobs count:', error);    } finally {
      setLoadingSavedJobs(false);
    }
  };
  const fetchRecentApplications = async () => {
    try {
      console.log('🔍 Fetching all applications for activity chart...');
      const token = localStorage.getItem('token');
      console.log('🔍 Token exists:', !!token);
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Add auth header if token exists
      if (token && clientAuth.isAuthenticated()) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('🔍 Auth header added');
      }

      // Fetch ALL applications (no limit)
      const response = await fetch('/api/applications', {
        method: 'GET',
        headers: headers
      });

      console.log('🔍 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Response data:', data);
        
        if (data.success) {
          console.log('🔍 Applications found:', data.applications?.length || 0);
          setApplications(data.applications || []);
        } else {
          console.error('🔍 API returned success: false');
        }
      } else {
        console.error('Failed to fetch applications:', response.status);
      }
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoadingApplications(false);
    }
  };

  const calculateProfileCompletion = () => {
    if (!profileData) return { percentage: 0, completed: [], pending: [] };

    // Only include fields that were part of the original registration process
    const fields = [
      { 
        key: 'personal', 
        label: 'Personal Information', 
        check: () => profileData.firstName && profileData.lastName && profileData.email 
      },
      { 
        key: 'education', 
        label: 'Education', 
        check: () => Array.isArray(profileData.education) && profileData.education.length > 0 && 
                    profileData.education.some(edu => edu?.institution && edu?.degree)
      },
      { 
        key: 'contact', 
        label: 'Contact Information', 
        check: () => profileData.phone && (profileData.city || profileData.address)
      },
      { 
        key: 'experience', 
        label: 'Work Experience',
        check: () => Array.isArray(profileData.workExperience) && profileData.workExperience.length > 0 && 
                    profileData.workExperience.some(exp => exp?.company && exp?.position)
      }
    ];

    const completed = fields.filter(field => field.check());
    const pending = fields.filter(field => !field.check());
    const percentage = Math.round((completed.length / fields.length) * 100);

    return { percentage, completed, pending };  };

  const profileCompletion = calculateProfileCompletion();

  const handleProfileDialogClose = async () => {
    setProfileDialogOpen(false);
    const oldPercentage = profileCompletion.percentage;
    
    // Refresh profile data after dialog closes and wait for it to complete
    await fetchProfileData();
    
    // Show animation if profile was completed - with a small delay to ensure state update
    setTimeout(() => {
      const newCompletion = calculateProfileCompletion();
      console.log('🔍 Profile completion check after dialog close:', {
        oldPercentage,
        newPercentage: newCompletion.percentage,
        profileData: {
          hasEducation: profileData?.education?.length > 0,
          hasExperience: profileData?.workExperience?.length > 0,
          hasPersonal: !!(profileData?.firstName && profileData?.lastName && profileData?.email),
          hasContact: !!(profileData?.phone && (profileData?.city || profileData?.address))
        }
      });
      
      if (newCompletion.percentage === 100 && oldPercentage < 100) {
        setCompletionAnimation('animate-pulse');
        setTimeout(() => setCompletionAnimation(''), 2000);
        
        // Show toast notification
        toast({
          title: "Profile Complete! 🎉",
          description: "Your profile is now 100% complete. You're ready to apply for jobs and get noticed by recruiters!",
          variant: "success",
        });      }
    }, 500); // Reduced timeout to be more responsive
  };

  // Real-time profile completion check (called when sections are saved)
  const handleProfileUpdate = async () => {
    console.log('🔔 Profile update notification received');
    const oldPercentage = profileCompletion.percentage;
    
    // Refresh profile data and check completion
    await fetchProfileData();
    
    // Check completion status after a brief delay to ensure state updates
    setTimeout(() => {
      const newCompletion = calculateProfileCompletion();
      console.log('🔍 Real-time profile completion check:', {
        oldPercentage,
        newPercentage: newCompletion.percentage,
        wasComplete: oldPercentage === 100,
        isComplete: newCompletion.percentage === 100
      });
      
      if (newCompletion.percentage === 100 && oldPercentage < 100) {
        setCompletionAnimation('animate-pulse');
        setTimeout(() => setCompletionAnimation(''), 2000);
        
        // Show toast notification
        toast({
          title: "Profile Complete! 🎉",
          description: "Your profile is now 100% complete. You're ready to apply for jobs and get noticed by recruiters!",
          variant: "success",
        });
        
        console.log('🎉 Profile completion toast triggered!');
      }
    }, 500);
  };

  const handleSavedJobsClick = () => {
    router.push('/dashboard/applicant/saved-jobs');
  };

  // Don't render profile completion card if 100% complete
  const shouldShowProfileCompletion = profileCompletion.percentage < 100;  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Two Column Layout: News Panel (left), Main Content (right) */}
        <div className="flex flex-col lg:flex-row gap-6 h-screen">
          {/* Left Sidebar - News Panel */}
          <div className="lg:w-80 lg:flex-shrink-0 h-64 lg:h-full">
            <div className="card h-full">
              <NewsPanel />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="space-y-6 p-6">
            {/* --- Contribution Chart --- */}
            <div className="mb-8">
              <div className="card p-6 flex flex-col items-start justify-center h-[220px] w-full min-w-0 chart-parent-container">
                <div className="w-full min-w-0 flex flex-col h-full contribution-calendar">
                  <ApplicationContributionCalendar applications={applications} minCellSize={14} maxCellSize={20} weeks={52} />
                </div>
              </div>
            </div>
            {/* Recent Applications - Full Width */}
            <div className="card p-6 overflow-hidden">
              <h3 className="text-lg font-semibold mb-4 flex items-center text-foreground">
                <FileText className="h-5 w-5 mr-2 text-muted-foreground" />
                Recent Applications
              </h3>
                {loadingApplications ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Loading applications...</span>
                </div>              ) : applications.length > 0 ? (
                <div className="space-y-4 overflow-visible">
                  {console.log('🔍 Rendering applications:', applications.length)}
                  {applications.map((application) => (
                    <div 
                      key={application._id} 
                      className="p-4 border border-border rounded-lg hover:bg-accent/20 cursor-pointer transition-all duration-200 bg-card" 
                      onClick={() => {
                        // Navigate to application details or job details
                        if (application.jobId) {
                          router.push(`/dashboard/applicant/jobs/${application.jobId}`);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground mb-1">{application.jobTitle}</h4>
                          <p className="text-sm text-muted-foreground mb-2">{application.company}</p>
                          {application.location && (
                            <p className="text-xs text-muted-foreground/70 mb-2">{application.location}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                            <span>Applied {application.appliedDateRelative}</span>
                            {application.appliedDateFormatted && (
                              <span>• {application.appliedDateFormatted}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${application.statusStyling}`}>
                            {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                          </span>
                          {application.jobType && (
                            <span className="text-xs text-muted-foreground/60 bg-muted/50 px-2 py-1 rounded">
                              {application.jobType}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* View All Applications Link */}
                  <div className="pt-4 border-t border-border">
                    <button 
                      onClick={() => router.push('/dashboard/applicant/applications')}
                      className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                    >
                      View all applications
                      <TrendingUp className="h-4 w-4" />
                    </button>
                  </div>
                </div>              ) : (
                <div className="text-center py-8">
                  {console.log('🔍 No applications to display, applications.length:', applications.length)}
                  <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                  <h4 className="font-medium text-foreground mb-2">No Applications Yet</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start applying to jobs to see your applications here
                  </p>
                  <button 
                    onClick={() => router.push('/dashboard/applicant/jobs')}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Browse Jobs
                  </button>
                </div>
              )}
            </div>

            {/* Profile Completion - Only show if not 100% complete */}
            {shouldShowProfileCompletion && (
              <div 
                className={`card p-6 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer ${completionAnimation}`}
                  onClick={() => setProfileDialogOpen(true)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center text-foreground">
                      <User className="h-5 w-5 mr-2 text-muted-foreground" />
                      Profile Completion
                    </h3>
                    <div className="flex items-center space-x-2">
                      <Target className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-primary">{profileCompletion.percentage}%</span>
                    </div>
                  </div>

                  {/* Dynamic Progress Bar */}
                  <div className="mb-4 bg-muted rounded-full h-3 relative overflow-hidden">
                    <div 
                      className="bg-foreground h-3 rounded-full transition-all duration-700 ease-out relative"
                      style={{ width: `${profileCompletion.percentage}%` }}
                    >
                      {profileCompletion.percentage > 0 && (
                        <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></div>
                      )}
                    </div>
                  </div>

                  {loadingProfile ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                      <span className="text-sm text-muted-foreground">Loading profile...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        Complete your profile to get better job matches
                      </p>
                      
                      <div className="space-y-3">
                        {/* Completed Fields */}
                        {profileCompletion.completed.map((field, index) => (
                          <div key={field.key} className="flex items-center animate-fade-in">
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                            <span className="text-sm text-foreground">{field.label}</span>
                          </div>
                        ))}
                        
                        {/* Pending Fields */}
                        {profileCompletion.pending.slice(0, 3).map((field, index) => (
                          <div key={field.key} className="flex items-center opacity-60">
                            <Bell className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
                            <span className="text-sm text-muted-foreground">Add {field.label.toLowerCase()}</span>
                          </div>
                        ))}
                        
                        {profileCompletion.pending.length > 3 && (
                          <div className="flex items-center opacity-60">
                            <TrendingUp className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
                            <span className="text-sm text-muted-foreground">
                              +{profileCompletion.pending.length - 3} more sections
                            </span>
                          </div>
                        )}
                      </div>                      <div className="mt-4 pt-3 border-t border-border">
                        <div className="flex items-center justify-between">                          <span className="text-xs text-muted-foreground">Click to continue</span>
                          <Edit className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}            </div>
          </div>
        </div>
      </div>

      {/* Profile Settings Dialog */}
      <ProfileSettingsDialog 
        isOpen={profileDialogOpen}
        onClose={handleProfileDialogClose}
        onProfileUpdate={handleProfileUpdate}
        userRole="applicant"
      />
    </>
  );
}
