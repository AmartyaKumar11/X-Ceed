'use client';

import { useState } from 'react';
import { 
  Filter, 
  Search,
  Globe,
  Briefcase
} from 'lucide-react';
import RealJobsComponent from '@/components/RealJobsComponent';
import JobicyJobsComponent from '@/components/JobicyJobsComponent';
import JobApplicationDialog from '@/components/JobApplicationDialog';
import AggregatedJobDetailDialog from '@/components/AggregatedJobDetailDialog';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ApplicantJobsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [aggDetailOpen, setAggDetailOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [filters] = useState({
    jobType: [],
    workMode: [],
    department: [],
    level: [],
    location: '',
    salaryRange: [0, 200000],
    postedWithin: '',
  });
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  const handleJobClick = (job) => {
    setSelectedJob(job);
    if (job?.source === 'remotive' || job?.source === 'jobicy') {
      setAggDetailOpen(true);
      setIsDialogOpen(false);
    } else {
      setIsDialogOpen(true);
      setAggDetailOpen(false);
    }
  };

  const handleApplicationSubmitted = (_applicationData, recommendedJob) => {
    setIsDialogOpen(false);
    setSelectedJob(null);
    
    if (recommendedJob) {
      setSelectedJob(recommendedJob);
      if (recommendedJob?.source === 'remotive' || recommendedJob?.source === 'jobicy') {
        setAggDetailOpen(true);
      } else {
        setIsDialogOpen(true);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="space-y-2 mb-6">
          <h1 className="text-3xl font-bold text-foreground">Job Opportunities</h1>
          <p className="text-muted-foreground">
            Explore job opportunities from multiple sources and find your perfect match
          </p>
        </div>

        <Tabs defaultValue="local" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              All Jobs
            </TabsTrigger>
            <TabsTrigger value="remote" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Live Remote Feed
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="local" className="mt-6">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search jobs..."
                    className="pl-9 w-full sm:w-64"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  aria-label="Filter by source"
                >
                  <option value="all">All Sources</option>
                  <option value="recruiter">Direct</option>
                  <option value="remotive">Remotive</option>
                  <option value="jobicy">Jobicy</option>
                </select>

                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>

                <Button 
                  variant={showSavedOnly ? "default" : "outline"}
                  onClick={() => setShowSavedOnly(!showSavedOnly)}
                >
                  {showSavedOnly ? 'All Jobs' : 'Saved Jobs'}
                </Button>
              </div>

              <RealJobsComponent 
                onJobClick={handleJobClick} 
                searchQuery={searchQuery}
                filters={filters}
                showSavedOnly={showSavedOnly}
                sourceFilter={sourceFilter}
              />
            </div>
          </TabsContent>

          <TabsContent value="remote" className="mt-6">
            <JobicyJobsComponent />
          </TabsContent>
        </Tabs>
      </div>

      <JobApplicationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        job={selectedJob}
        onApplicationSubmitted={handleApplicationSubmitted}
      />

      <AggregatedJobDetailDialog
        isOpen={aggDetailOpen}
        onClose={() => setAggDetailOpen(false)}
        job={selectedJob}
      />
    </div>
  );
}
