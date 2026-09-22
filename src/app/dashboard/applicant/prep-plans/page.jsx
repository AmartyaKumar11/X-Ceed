'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  GraduationCap,
  Clock,
  Building,
  MapPin,
  DollarSign,
  Calendar,
  Play,
  Trash2,
  MoreVertical,
  CheckCircle,
  Target,
  Briefcase,
  FileText,
  Loader2,
  Plus,
  AlertCircle,
  BookOpen,
  Brain,
  TrendingUp,
  CheckSquare,
  ArrowRight,
  Star,
  Users,
  Lightbulb
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShiningText } from "@/components/ui/shining-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function PrepPlansPage() {
  const router = useRouter();
  const [prepPlans, setPrepPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState(null);
  const [generatingPlan, setGeneratingPlan] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [viewDetailedPlan, setViewDetailedPlan] = useState(false);

  useEffect(() => {
    fetchPrepPlans();
  }, []);

  const fetchPrepPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/prep-plans', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setPrepPlans(result.data || []);
      } else {
        console.error('Failed to fetch prep plans');
      }
    } catch (error) {
      console.error('Error fetching prep plans:', error);
    } finally {
      setLoading(false);
    }
  };
  const deletePrepPlan = async (planId) => {
    try {
      setDeletingPlan(planId);
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/prep-plans?id=${planId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setPrepPlans(prev => prev.filter(plan => plan._id !== planId));
      } else {
        console.error('Failed to delete prep plan');
      }
    } catch (error) {
      console.error('Error deleting prep plan:', error);
    } finally {
      setDeletingPlan(null);
      setDeleteDialogOpen(false);
      setPlanToDelete(null);
    }
  };

  const handleDeleteClick = (plan) => {
    setPlanToDelete(plan);
    setDeleteDialogOpen(true);
  };

  const openPrepPlan = (plan) => {
    const jobData = {
      _id: plan.jobId,
      title: plan.jobTitle,
      companyName: plan.companyName,
      description: plan.jobDescription,
      requirements: plan.requirements,
      location: plan.location,
      salaryRange: plan.salaryRange,
      jobType: plan.jobType,
      ...(plan.jobDetails || {})
    };

    const jobParam = encodeURIComponent(JSON.stringify(jobData));
    router.push(`/dashboard/applicant/prep-plan?job=${jobParam}`);
  };
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800';
      case 'in-progress': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
      case 'active': return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getProgressColor = (progress) => {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 50) return 'bg-blue-500';
    if (progress >= 25) return 'bg-yellow-500';
    return 'bg-gray-300';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const generateDetailedPlan = async (prepPlanId, forceRegenerate = false) => {
    try {
      setGeneratingPlan(prepPlanId);
      
      const response = await fetch('/api/prep-plans/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ 
          prepPlanId,
          forceRegenerate 
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Success result:', result);
        
        // Show appropriate success message based on whether it was cached
        if (result.data?.cached) {
          alert('✅ Study plan loaded from cache (no tokens used)!');
        } else {
          alert('✅ New detailed study plan generated successfully!');
        }
        
        // Refresh the prep plans to show the generated plan
        await fetchPrepPlans();
      } else {
        const error = await response.json();
        console.error('❌ API Error Response:', error);
        console.error('Response status:', response.status);
        console.error('Response statusText:', response.statusText);
        alert(`❌ Failed to generate study plan: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Network/Parse Error:', error);
      console.error('Error details:', error.message);
      alert(`❌ Error generating study plan: ${error.message}`);
    } finally {
      setGeneratingPlan(null);
    }
  };

  const viewDetailedStudyPlan = async (prepPlan) => {
    try {
      // If the plan doesn't have a detailed plan yet, fetch the latest data
      if (!prepPlan.detailedPlan) {
        const response = await fetch(`/api/prep-plans/${prepPlan._id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          setSelectedPlan(result.data);
        } else {
          setSelectedPlan(prepPlan);
        }
      } else {
        setSelectedPlan(prepPlan);
      }
      
      setViewDetailedPlan(true);
    } catch (error) {
      console.error('Error fetching detailed plan:', error);
      setSelectedPlan(prepPlan);
      setViewDetailedPlan(true);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Loading your prep plans...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded-lg">
                <GraduationCap className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              My Prep Plans
            </h1>
            <p className="text-muted-foreground mt-2">
              Track your learning progress for different job opportunities
            </p>
          </div>
            <Button 
            onClick={() => router.push('/dashboard/applicant/jobs')}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Plan
          </Button>
        </div>
      </div>

      {/* Prep Plans Grid */}
      {prepPlans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prepPlans.map((plan) => (
            <Card key={plan._id} className="group hover:shadow-lg transition-all duration-200 border-0 shadow-sm bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                      {plan.jobTitle}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Building className="h-4 w-4" />
                      {plan.companyName}
                    </CardDescription>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openPrepPlan(plan)}>
                        <Play className="h-4 w-4 mr-2" />
                        Continue Learning
                      </DropdownMenuItem>                      <DropdownMenuItem onClick={() => handleDeleteClick(plan)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Plan
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="pt-0 space-y-4">
                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{plan.progress || 0}%</span>
                  </div>
                  <Progress 
                    value={plan.progress || 0} 
                    className="h-2"
                  />
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={getStatusColor(plan.status)}
                    >
                      {plan.status === 'active' ? 'Ready to Start' :
                       plan.status === 'in-progress' ? 'In Progress' :
                       plan.status === 'completed' ? 'Completed' : 
                       plan.status}
                    </Badge>
                    
                    {plan.detailedPlan && (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        AI Plan Ready
                      </Badge>
                    )}
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Created {formatDate(plan.createdAt)}
                  </div>
                </div>

                {/* Job Details */}
                <div className="space-y-2 text-sm text-muted-foreground">
                  {plan.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">{plan.location}</span>
                    </div>
                  )}
                  
                  {plan.salaryRange && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      <span>{plan.salaryRange}</span>
                    </div>
                  )}
                  
                  {plan.jobType && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      <span className="capitalize">{plan.jobType.replace('-', ' ')}</span>
                    </div>
                  )}
                </div>                {/* AI Study Plan Status */}
                {/* Action Buttons */}
                <div className="space-y-2">
                  {plan.detailedPlan ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={() => viewDetailedStudyPlan(plan)}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          <BookOpen className="h-3 w-3 mr-1" />
                          View Study Plan
                        </Button>
                        <Button 
                          onClick={() => openPrepPlan(plan)}
                          size="sm"
                          className="text-xs"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Continue Learning
                        </Button>
                      </div>
                      {/* Regenerate option */}
                      <Button 
                        onClick={() => {
                          if (confirm('This will use AI tokens to create a new study plan. Continue?')) {
                            generateDetailedPlan(plan._id, true);
                          }
                        }}
                        disabled={generatingPlan === plan._id}
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground hover:text-foreground"
                      >
                        {generatingPlan === plan._id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <Brain className="h-3 w-3 mr-1" />
                            Regenerate Plan
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      onClick={() => generateDetailedPlan(plan._id)}
                      disabled={generatingPlan === plan._id}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                      size="sm"
                    >
                      {generatingPlan === plan._id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating AI Study Plan...
                        </>
                      ) : (
                        <>
                          <Brain className="h-4 w-4 mr-2" />
                          Generate AI Study Plan
                        </>
                      )}
                    </Button>
                  )}
                  {generatingPlan === plan._id && (
                    <div className="mt-2 text-center">
                      <ShiningText text="AI is building your study plan..." className="text-xs" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Empty State
        <div className="text-center py-16">
          <div className="mx-auto w-24 h-24 bg-purple-50 dark:bg-purple-950 rounded-full flex items-center justify-center mb-6">
            <GraduationCap className="h-12 w-12 text-purple-600 dark:text-purple-400" />
          </div>
          
          <h3 className="text-xl font-semibold mb-2">No Prep Plans Yet</h3>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Create your first prep plan by analyzing a job and clicking "Create Learning Plan" 
            in the AI Career Assistant, or browse jobs to get started.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">            <Button 
              onClick={() => router.push('/dashboard/applicant/jobs')}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Browse Jobs
            </Button>
              <Button 
              variant="outline"
              onClick={() => router.push('/dashboard/applicant/resume-match')}
              className="border-border hover:bg-accent hover:text-accent-foreground"
            >
              <Target className="h-4 w-4 mr-2" />
              Analyze Resume
            </Button>
          </div>        </div>
      )}
      
      {/* Detailed Study Plan Modal */}
      {viewDetailedPlan && selectedPlan && (
        <Dialog open={viewDetailedPlan} onOpenChange={setViewDetailedPlan}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                AI Study Plan - {selectedPlan.jobTitle}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {selectedPlan.detailedPlan ? (
                <>
                  {/* Gap Analysis */}
                  {selectedPlan.detailedPlan.gapAnalysis && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Target className="h-5 w-5 text-blue-600" />
                          Skills Gap Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedPlan.detailedPlan.gapAnalysis.missingSkills?.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-red-600 mb-2">Missing Skills</h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedPlan.detailedPlan.gapAnalysis.missingSkills.map((skill, index) => (
                                <Badge key={index} variant="destructive">{skill}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedPlan.detailedPlan.gapAnalysis.skillsToAdvance?.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-orange-600 mb-2">Skills to Advance</h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedPlan.detailedPlan.gapAnalysis.skillsToAdvance.map((skill, index) => (
                                <Badge key={index} variant="secondary">{skill}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedPlan.detailedPlan.gapAnalysis.criticalLearningPath && (
                          <div>
                            <h4 className="font-semibold text-green-600 mb-2">Learning Path</h4>
                            <p className="text-sm text-muted-foreground">
                              {selectedPlan.detailedPlan.gapAnalysis.criticalLearningPath}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Personalized Topics */}
                  {selectedPlan.detailedPlan.personalizedTopics?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-purple-600" />
                          Personalized Study Topics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {selectedPlan.detailedPlan.personalizedTopics.map((topic, index) => (
                            <div key={index} className="border rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-lg">{topic.topicName}</h4>
                                <Badge variant="outline">{topic.studyHours}</Badge>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="font-medium text-blue-600">Why needed:</span>
                                  <p className="text-muted-foreground mt-1">{topic.whyNeeded}</p>
                                </div>
                                
                                <div>
                                  <span className="font-medium text-green-600">Progress:</span>
                                  <p className="text-muted-foreground mt-1">
                                    {topic.currentLevel} → {topic.targetLevel}
                                  </p>
                                </div>
                              </div>
                              
                              {topic.specificProjects?.length > 0 && (
                                <div className="mt-3">
                                  <span className="font-medium text-purple-600">Projects:</span>
                                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
                                    {topic.specificProjects.map((project, i) => (
                                      <li key={i}>{project}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Weekly Progression */}
                  {selectedPlan.detailedPlan.weeklyProgression && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-green-600" />
                          Weekly Study Plan ({selectedPlan.duration} weeks)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(selectedPlan.detailedPlan.weeklyProgression).map(([week, plan]) => (
                            <div key={week} className="border rounded-lg p-4">
                              <h4 className="font-semibold text-lg capitalize">{week.replace(/([A-Z])/g, ' $1').trim()}</h4>
                              <div className="mt-2">
                                <span className="font-medium text-blue-600">Focus:</span>
                                <p className="text-muted-foreground">{plan.focus}</p>
                              </div>
                              
                              {plan.topics?.length > 0 && (
                                <div className="mt-2">
                                  <span className="font-medium text-purple-600">Topics:</span>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {plan.topics.map((topic, i) => (
                                      <Badge key={i} variant="outline">{topic}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {plan.rationale && (
                                <div className="mt-2">
                                  <span className="font-medium text-green-600">Rationale:</span>
                                  <p className="text-sm text-muted-foreground">{plan.rationale}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Resources */}
                  {selectedPlan.detailedPlan.candidateSpecificResources && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="h-5 w-5 text-orange-600" />
                          Personalized Resources
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {selectedPlan.detailedPlan.candidateSpecificResources.basedOnBackground && (
                          <div>
                            <span className="font-medium text-blue-600">Based on your background:</span>
                            <p className="text-muted-foreground">
                              {selectedPlan.detailedPlan.candidateSpecificResources.basedOnBackground}
                            </p>
                          </div>
                        )}
                        
                        {selectedPlan.detailedPlan.candidateSpecificResources.learningPath && (
                          <div>
                            <span className="font-medium text-green-600">Learning path:</span>
                            <p className="text-muted-foreground">
                              {selectedPlan.detailedPlan.candidateSpecificResources.learningPath}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No detailed study plan available</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Prep Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the prep plan for "{planToDelete?.jobTitle}" at {planToDelete?.companyName}? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deletingPlan === planToDelete?._id}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => deletePrepPlan(planToDelete?._id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deletingPlan === planToDelete?._id}
            >
              {deletingPlan === planToDelete?._id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
