'use client';

import { useState, useEffect, Suspense} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  BookOpen, 
  Clock, 
  CheckCircle, 
  Target, 
  GraduationCap,
  Loader2,
  FileText,
  Code,
  Brain,
  Zap,
  Building,
  Calendar,
  Settings,
  Check,
  X,
  Play,
  Youtube,
  Search,
  Filter,
  SortAsc,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import LearningPathPreview from "@/components/learning-path/LearningPathPreview";
import PayoutCalculator from "@/components/gamification/PayoutCalculator";
import { skillFilter } from "@/lib/skillFilter";

function PrepPlanPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [jobData, setJobData] = useState(null);
  const [prepPlan, setPrepPlan] = useState(null);
  const [detailedPlan, setDetailedPlan] = useState(null);
  const [prepPlanId, setPrepPlanId] = useState(null);
  const [parsedSkills, setParsedSkills] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parsingJD, setParsingJD] = useState(false);
  const [error, setError] = useState(null);  const [learningDuration, setLearningDuration] = useState('12'); // weeks
  const [completedTopics, setCompletedTopics] = useState(new Set());  const [selectedSkill, setSelectedSkill] = useState(null);
  const [skillVideos, setSkillVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  
  // Video search and filter states
  const [videoSearchTerm, setVideoSearchTerm] = useState('');
  const [videoDurationFilter, setVideoDurationFilter] = useState('any');
  const [videoUploadFilter, setVideoUploadFilter] = useState('any');
  const [videoSortBy, setVideoSortBy] = useState('relevance');
  const [originalSkillVideos, setOriginalSkillVideos] = useState([]);

  // Learning path customization states
  const [showCustomizationView, setShowCustomizationView] = useState(false);
  const [pathCustomizations, setPathCustomizations] = useState({});

  // Gamification states
  const [showPayoutCalculator, setShowPayoutCalculator] = useState(false);
  const [currentPayout, setCurrentPayout] = useState(null);

  // Video selection states
  const [selectedVideosForPlan, setSelectedVideosForPlan] = useState([]);
  const [totalVideoPlanDuration, setTotalVideoPlanDuration] = useState(0);

  // Helper function to generate consistent jobId
  const getJobId = (jobData) => {
    return jobData?.id || `${jobData?.title || 'unknown'}-${jobData?.companyName || 'company'}`.replace(/\s+/g, '-').toLowerCase();
  };

  // Load existing video plan on component mount
  useEffect(() => {
    const loadExistingVideoPlan = async () => {
      try {
        const userId = localStorage.getItem('userId') || 'temp-user-id';
        const jobId = getJobId(jobData);
        
        // Try to load from backend first
        const response = await fetch(`/api/video-plans/custom?userId=${userId}&jobId=${jobId}`);
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.videoPlan) {
            setSelectedVideosForPlan(result.videoPlan.videos || []);
            setTotalVideoPlanDuration(result.videoPlan.totalDuration || 0);
            console.log('✅ Loaded existing video plan from backend');
            return;
          }
        }
      } catch (error) {
        console.log('⚠️ Backend not available, checking localStorage');
      }
      
      // Fallback to localStorage
      const savedPlan = localStorage.getItem('selectedVideoPlan');
      if (savedPlan) {
        try {
          const plan = JSON.parse(savedPlan);
          if (plan.videos && Array.isArray(plan.videos)) {
            setSelectedVideosForPlan(plan.videos);
            setTotalVideoPlanDuration(plan.totalDuration || 0);
            console.log('✅ Loaded existing video plan from localStorage');
          }
        } catch (error) {
          console.error('❌ Error parsing localStorage video plan:', error);
        }
      }
    };

    if (jobData) {
      loadExistingVideoPlan();
    }
  }, [jobData]);

  useEffect(() => {
    const initializePage = async () => {
      // Get job data from URL params
      const jobParam = searchParams.get('job');
      if (jobParam) {
        try {
          const decodedJob = JSON.parse(decodeURIComponent(jobParam));
          setJobData(decodedJob);
          
          // Check if we have cached parsed skills for this job
          const jobId = getJobId(decodedJob);
          const cachedSkills = getCachedParsedSkills(jobId);
          
          if (cachedSkills) {
            console.log('🔄 Using cached parsed skills');
            setParsedSkills(cachedSkills);
            setParsingJD(false);
          } else {
            console.log('🆕 Parsing job description for the first time');
            await parseJobDescription(decodedJob);
          }
        } catch (error) {
          console.error('Error parsing job data:', error);
          setError('Invalid job data');
          setLoading(false);
        }
      } else {
        console.log('🔄 No job data provided, redirecting to saved jobs');
        router.push('/dashboard/applicant/saved-jobs');
        return;
      }
    };

    initializePage();  }, [searchParams]);

  // Fetch detailed plan from database
  const fetchDetailedPlan = async (jobTitle, companyName) => {
    try {
      console.log('🔍 Searching for detailed plan:', { jobTitle, companyName });
      
      const response = await fetch('/api/prep-plans', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        const plans = result.data || [];
        
        // Find matching prep plan
        const matchingPlan = plans.find(plan => 
          plan.jobTitle?.toLowerCase() === jobTitle?.toLowerCase() && 
          plan.companyName?.toLowerCase() === companyName?.toLowerCase()
        );
        
        if (matchingPlan && matchingPlan.detailedPlan) {
          console.log('✅ Found detailed AI plan:', matchingPlan);
          setDetailedPlan(matchingPlan.detailedPlan);
          setPrepPlanId(matchingPlan._id);
          return matchingPlan.detailedPlan;
        } else {
          console.log('❌ No detailed plan found for this job');
        }
      }
    } catch (error) {
      console.error('Error fetching detailed plan:', error);
    }
    return null;
  };

  // Generate prep plan when skills are parsed or duration changes
  useEffect(() => {
    if (jobData && !parsingJD) {
      console.log('Triggering prep plan generation with:', { 
        parsedSkills: !!parsedSkills, 
        jobData: !!jobData,
        parsingCompleted: !parsingJD
      });
      generatePrepPlan(jobData, parseInt(learningDuration));
    }
  }, [parsedSkills, learningDuration, jobData, parsingJD]);

  const getCachedParsedSkills = (jobId) => {
    try {
      const cached = localStorage.getItem(`parsedSkills_${jobId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error loading cached skills:', error);
      return null;
    }
  };

  const cacheParsedSkills = (jobId, skills) => {
    try {
      localStorage.setItem(`parsedSkills_${jobId}`, JSON.stringify(skills));
    } catch (error) {
      console.error('Error caching skills:', error);
    }
  };

  const parseJobDescription = async (job) => {
    try {
      setParsingJD(true);
      console.log('Parsing job description...');
      
      const response = await fetch('/api/parse-job-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },        body: JSON.stringify({
          jobDescription: job.description || '',
          jobTitle: job.title || '',
          companyName: job.companyName || '',
          jobId: job.id || null,
          jobDescriptionFile: job.jobDescriptionFile || null
        })
      });      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setParsedSkills(result.data);
          console.log('Parsed skills:', result.data);
          
          // Cache the parsed skills
          const jobId = job.id || `${job.title}-${job.companyName}`.replace(/\s+/g, '-').toLowerCase();
          cacheParsedSkills(jobId, result.data);
        } else {
          console.error('Failed to parse JD:', result.error);
        }
      }
    } catch (error) {
      console.error('Error parsing job description:', error);
    } finally {
      setParsingJD(false);
    }
  };  const generatePrepPlan = async (job, durationInWeeks = learningDuration) => {
    try {
      console.log('🔄 generatePrepPlan called with:', { 
        jobTitle: job?.title, 
        companyName: job?.companyName,
        durationInWeeks, 
        hasParsedSkills: !!parsedSkills,
        parsedSkillsKeys: parsedSkills ? Object.keys(parsedSkills) : 'none'
      });
      
      setLoading(true);

      // First, try to fetch detailed AI plan from database
      const aiDetailedPlan = await fetchDetailedPlan(job.title, job.companyName);
      
      if (aiDetailedPlan) {
        console.log('✅ Using AI-generated detailed plan');
        const convertedPlan = convertDetailedPlanToStudyStructure(job, aiDetailedPlan, durationInWeeks);
        setPrepPlan(convertedPlan);
        setLoading(false);
        return;
      }

      console.log('🔄 No detailed AI plan found, generating skill-based plan');
      
      // Wait for skills to be parsed if not already done
      if (!parsedSkills) {
        console.log('⏳ Waiting for skills to be parsed...');
        // Give some time for parsing to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Generate prep plan based on parsed skills
      console.log('🎯 Generating dynamic prep plan...');
      const dynamicPrepPlan = generateDynamicPrepPlan(job, parsedSkills, durationInWeeks);
      console.log('📚 Generated prep plan with phases:', dynamicPrepPlan.phases?.length || 0);
      
      setTimeout(() => {
        setPrepPlan(dynamicPrepPlan);
        setLoading(false);
        console.log('✅ Prep plan set successfully');
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error generating prep plan:', error);
      setError('Failed to generate prep plan');
      setLoading(false);
    }
  };

  // Convert AI detailed plan to study structure for UI
  const convertDetailedPlanToStudyStructure = (job, detailedPlan, durationInWeeks) => {
    console.log('🔄 Converting AI detailed plan to study structure');
    
    // Filter skills to remove non-learnable items
    const rawMissingSkills = detailedPlan.gapAnalysis?.missingSkills || [];
    const rawSkillsToAdvance = detailedPlan.gapAnalysis?.skillsToAdvance || [];
    
    console.log('🔍 Filtering skills before creating study structure...');
    const filteredMissing = skillFilter.filterAndNormalizeSkills(rawMissingSkills);
    const filteredAdvance = skillFilter.filterAndNormalizeSkills(rawSkillsToAdvance);
    
    // Log what was filtered out
    if (filteredMissing.filtered.length > 0) {
      console.log('❌ Filtered out non-learnable missing skills:', filteredMissing.filtered.map(f => f.original));
    }
    if (filteredAdvance.filtered.length > 0) {
      console.log('❌ Filtered out non-learnable skills to advance:', filteredAdvance.filtered.map(f => f.original));
    }
    
    const phases = [];
    let topicId = 1;
    
    // Phase 1: Gap Analysis & Critical Skills
    if (filteredMissing.learnable.length > 0 || filteredAdvance.learnable.length > 0) {
      const gapTopics = [];
      
      // Missing skills topics (using filtered skills)
      filteredMissing.learnable.forEach((skill) => {
        const relatedTopic = detailedPlan.personalizedTopics?.find(topic => 
          topic.topicName?.toLowerCase().includes(skill.toLowerCase())
        );
        
        gapTopics.push({
          id: topicId++,
          title: `Master ${skill}`,
          description: relatedTopic?.whyNeeded || `Learn ${skill} as it's missing from your profile but required for this role`,
          estimatedHours: parseInt(relatedTopic?.studyHours) || Math.ceil(durationInWeeks * 4),
          resources: [
            { type: 'course', title: `${skill} Complete Course`, url: '#' },
            { type: 'practice', title: `${skill} Hands-on Practice`, url: '#' },
            { type: 'project', title: relatedTopic?.specificProjects?.[0] || `Build ${skill} Project`, url: '#' },
            { type: 'documentation', title: `${skill} Documentation`, url: '#' }
          ],
          completed: false,
          skillType: 'missing',
          currentLevel: relatedTopic?.currentLevel || 'Beginner',
          targetLevel: relatedTopic?.targetLevel || 'Intermediate'
        });
      });
      
      // Skills to advance topics (using filtered skills)
      filteredAdvance.learnable.forEach((skill) => {
        const relatedTopic = detailedPlan.personalizedTopics?.find(topic => 
          topic.topicName?.toLowerCase().includes(skill.toLowerCase())
        );
        
        gapTopics.push({
          id: topicId++,
          title: `Advanced ${skill}`,
          description: relatedTopic?.whyNeeded || `Advance your ${skill} skills to meet job requirements`,
          estimatedHours: parseInt(relatedTopic?.studyHours) || Math.ceil(durationInWeeks * 3),
          resources: [
            { type: 'course', title: `Advanced ${skill} Course`, url: '#' },
            { type: 'practice', title: `${skill} Advanced Practice`, url: '#' },
            { type: 'project', title: relatedTopic?.specificProjects?.[0] || `Advanced ${skill} Project`, url: '#' }
          ],
          completed: false,
          skillType: 'advance',
          currentLevel: relatedTopic?.currentLevel || 'Basic',
          targetLevel: relatedTopic?.targetLevel || 'Advanced'
        });
      });
      
      if (gapTopics.length > 0) {
        phases.push({
          id: 1,
          title: '🎯 Critical Skills Gap',
          duration: `${Math.ceil(durationInWeeks * 0.4)} weeks`,
          topics: gapTopics,
          description: detailedPlan.gapAnalysis.criticalLearningPath
        });
      }
    }
    
    // Phase 2: Weekly Progression Topics
    if (detailedPlan.weeklyProgression) {
      const progressionTopics = [];
      
      Object.entries(detailedPlan.weeklyProgression).forEach(([week, weekPlan]) => {
        weekPlan.topics?.forEach((topic) => {
          progressionTopics.push({
            id: topicId++,
            title: topic,
            description: `${weekPlan.focus} - ${weekPlan.rationale}`,
            estimatedHours: Math.ceil(durationInWeeks * 2),
            resources: [
              { type: 'course', title: `${topic} Training`, url: '#' },
              { type: 'practice', title: `${topic} Practice`, url: '#' },
              { type: 'project', title: `${topic} Project`, url: '#' }
            ],
            completed: false,
            week: week
          });
        });
      });
      
      if (progressionTopics.length > 0) {
        phases.push({
          id: 2,
          title: '📚 Structured Learning Path',
          duration: `${Math.ceil(durationInWeeks * 0.4)} weeks`,
          topics: progressionTopics
        });
      }
    }
    
    // Phase 3: Domain Knowledge & Specialization
    if (detailedPlan.gapAnalysis?.newDomainKnowledge?.length > 0) {
      const domainTopics = detailedPlan.gapAnalysis.newDomainKnowledge.map((knowledge) => ({
        id: topicId++,
        title: knowledge,
        description: `Specialized knowledge for ${job.title} role`,
        estimatedHours: Math.ceil(durationInWeeks * 2),
        resources: [
          { type: 'course', title: `${knowledge} Course`, url: '#' },
          { type: 'research', title: `${knowledge} Research`, url: '#' },
          { type: 'practice', title: `${knowledge} Application`, url: '#' }
        ],
        completed: false,
        skillType: 'domain'
      }));
      
      phases.push({
        id: 3,
        title: '🚀 Domain Expertise',
        duration: `${Math.ceil(durationInWeeks * 0.2)} weeks`,
        topics: domainTopics
      });
    }
    
    // Calculate totals
    const totalTopics = phases.reduce((total, phase) => total + phase.topics.length, 0);
    
    return {
      overview: {
        estimatedTimeWeeks: durationInWeeks,
        difficultyLevel: 'Personalized',
        totalTopics: totalTopics,
        completedTopics: 0,
        aiGenerated: true,
        gapAnalysis: {
          ...detailedPlan.gapAnalysis,
          missingSkills: filteredMissing.learnable,
          skillsToAdvance: filteredAdvance.learnable,
          filteredOut: {
            missing: filteredMissing.filtered,
            advance: filteredAdvance.filtered,
            mapped: [...filteredMissing.mapped, ...filteredAdvance.mapped]
          }
        },
        learningPath: detailedPlan.candidateSpecificResources?.learningPath
      },
      phases: phases,
      metadata: {
        source: 'ai-detailed-plan',
        generatedAt: new Date().toISOString(),
        basedOnGapAnalysis: true
      }
    };
  };

  const generateDynamicPrepPlan = (job, skills, durationInWeeks) => {
    console.log('🔍 generateDynamicPrepPlan called with:', {
      jobTitle: job?.title,
      hasSkills: !!skills,
      skillsKeys: skills ? Object.keys(skills) : 'none',
      durationInWeeks,
      requiredSkillsExists: !!(skills?.requiredSkills),
      criticalSkills: skills?.requiredSkills?.critical || [],
      mustLearnSkills: skills?.learningPath?.mustLearn || []
    });

    // Default fallback if no skills are parsed
    if (!skills || !skills.requiredSkills) {
      console.log('⚠️ No skills found, using fallback prep plan');
      return generateFallbackPrepPlan(job, durationInWeeks);
    }

    console.log('✅ Using dynamic prep plan based on parsed skills');
    const phases = [];
    let topicId = 1;
    
    // Phase 1: Foundation & Critical Skills
    const criticalSkills = skills.requiredSkills.critical || [];
    const mustLearnSkills = skills.learningPath?.mustLearn || [];
    const combinedCritical = [...new Set([...criticalSkills, ...mustLearnSkills])];
    
    if (combinedCritical.length > 0) {
      const foundationTopics = combinedCritical.map(skill => ({
        id: topicId++,
        title: `${skill} Fundamentals`,
        description: `Master the core concepts and fundamentals of ${skill}`,
        estimatedHours: 12,
        resources: generateResourcesForSkill(skill, 'foundation'),
        completed: false
      }));

      phases.push({
        id: 1,
        title: 'Foundation & Critical Skills',
        duration: `${Math.ceil(durationInWeeks * 0.3)} weeks`,
        topics: foundationTopics
      });
    }

    // Phase 2: Technical Skills Development
    const technicalSkills = skills.requiredSkills.technical || [];
    const languages = skills.requiredSkills.languages || [];
    const frameworks = skills.requiredSkills.frameworks || [];
    const databases = skills.requiredSkills.databases || [];
    
    const techTopics = [];
    
    languages.forEach(lang => {
      techTopics.push({
        id: topicId++,
        title: `${lang} Advanced Concepts`,
        description: `Deep dive into ${lang} - advanced features, best practices, and optimization`,
        estimatedHours: 15,
        resources: generateResourcesForSkill(lang, 'advanced'),
        completed: false
      });
    });

    frameworks.forEach(framework => {
      techTopics.push({
        id: topicId++,
        title: `${framework} Development`,
        description: `Build production-ready applications using ${framework}`,
        estimatedHours: 18,
        resources: generateResourcesForSkill(framework, 'framework'),
        completed: false
      });
    });

    databases.forEach(db => {
      techTopics.push({
        id: topicId++,
        title: `${db} Database Management`,
        description: `Design, optimize, and manage ${db} databases`,
        estimatedHours: 12,
        resources: generateResourcesForSkill(db, 'database'),
        completed: false
      });
    });

    if (techTopics.length > 0) {
      phases.push({
        id: 2,
        title: 'Technical Skills Development',
        duration: `${Math.ceil(durationInWeeks * 0.4)} weeks`,
        topics: techTopics
      });
    }

    // Phase 3: Tools & DevOps
    const tools = skills.requiredSkills.tools || [];
    const cloudTech = skills.requiredSkills.cloud || [];
    
    const toolTopics = [];
    
    tools.forEach(tool => {
      toolTopics.push({
        id: topicId++,
        title: `${tool} Proficiency`,
        description: `Master ${tool} for development workflow and productivity`,
        estimatedHours: 8,
        resources: generateResourcesForSkill(tool, 'tool'),
        completed: false
      });
    });

    cloudTech.forEach(cloud => {
      toolTopics.push({
        id: topicId++,
        title: `${cloud} Cloud Services`,
        description: `Deploy and manage applications using ${cloud}`,
        estimatedHours: 15,
        resources: generateResourcesForSkill(cloud, 'cloud'),
        completed: false
      });
    });

    if (toolTopics.length > 0) {
      phases.push({
        id: 3,
        title: 'Tools & DevOps',
        duration: `${Math.ceil(durationInWeeks * 0.2)} weeks`,
        topics: toolTopics
      });
    }

    // Phase 4: Interview Preparation
    const interviewTopics = skills.interviewPrep?.technicalTopics || [];
    const systemDesignTopics = skills.interviewPrep?.systemDesign || [];
    
    const prepTopics = [
      {
        id: topicId++,
        title: 'Technical Interview Practice',
        description: `Focus on: ${interviewTopics.join(', ')}`,
        estimatedHours: 10,
        resources: [
          { type: 'practice', title: 'LeetCode Problems', url: 'https://leetcode.com' },
          { type: 'practice', title: 'HackerRank Challenges', url: 'https://hackerrank.com' },
          { type: 'course', title: 'Cracking the Coding Interview', url: '#' }
        ],
        completed: false
      }
    ];

    if (systemDesignTopics.length > 0) {
      prepTopics.push({
        id: topicId++,
        title: 'System Design Preparation',
        description: `Study: ${systemDesignTopics.join(', ')}`,
        estimatedHours: 12,
        resources: [
          { type: 'course', title: 'System Design Interview Course', url: '#' },
          { type: 'book', title: 'Designing Data-Intensive Applications', url: '#' },
          { type: 'practice', title: 'Design Popular Systems', url: '#' }
        ],
        completed: false
      });
    }

    prepTopics.push({
      id: topicId++,
      title: 'Company-Specific Preparation',
      description: `Research ${job.companyName} culture, recent projects, and interview process`,
      estimatedHours: 6,
      resources: [
        { type: 'research', title: `${job.companyName} Engineering Blog`, url: '#' },
        { type: 'networking', title: 'Connect with current employees', url: '#' },
        { type: 'research', title: 'Glassdoor Interview Experiences', url: '#' }
      ],
      completed: false
    });

    phases.push({
      id: 4,
      title: 'Interview Preparation',
      duration: `${Math.ceil(durationInWeeks * 0.1)} weeks`,
      topics: prepTopics
    });

    const totalTopics = phases.reduce((sum, phase) => sum + phase.topics.length, 0);

    return {
      overview: {
        estimatedTimeWeeks: durationInWeeks,
        difficultyLevel: skills.learningPath?.difficultyLevel || job.level || 'Intermediate',
        totalTopics,
        completedTopics: 0
      },
      phases
    };
  };

  const generateResourcesForSkill = (skill, type) => {
    const skillLower = skill.toLowerCase();
    const resources = [];

    // Default resources based on skill type
    switch (type) {
      case 'foundation':
        resources.push(
          { type: 'course', title: `${skill} Complete Guide`, url: '#' },
          { type: 'documentation', title: `Official ${skill} Documentation`, url: '#' },
          { type: 'practice', title: `${skill} Practice Problems`, url: '#' }
        );
        break;
      
      case 'advanced':
        resources.push(
          { type: 'course', title: `Advanced ${skill} Concepts`, url: '#' },
          { type: 'book', title: `${skill} Best Practices`, url: '#' },
          { type: 'project', title: `Build Advanced ${skill} Project`, url: '#' }
        );
        break;
      
      case 'framework':
        resources.push(
          { type: 'course', title: `${skill} Complete Course`, url: '#' },
          { type: 'project', title: `Build App with ${skill}`, url: '#' },
          { type: 'documentation', title: `${skill} Official Docs`, url: '#' }
        );
        break;
      
      case 'database':
        resources.push(
          { type: 'course', title: `${skill} Database Course`, url: '#' },
          { type: 'practice', title: `${skill} Query Practice`, url: '#' },
          { type: 'project', title: `Design Schema with ${skill}`, url: '#' }
        );
        break;
      
      case 'tool':
        resources.push(
          { type: 'course', title: `${skill} Tutorial`, url: '#' },
          { type: 'documentation', title: `${skill} User Guide`, url: '#' },
          { type: 'hands-on', title: `${skill} Hands-on Practice`, url: '#' }
        );
        break;
      
      case 'cloud':
        resources.push(
          { type: 'course', title: `${skill} Certification Course`, url: '#' },
          { type: 'hands-on', title: `${skill} Hands-on Labs`, url: '#' },
          { type: 'documentation', title: `${skill} Service Documentation`, url: '#' }
        );
        break;
    }

    return resources;
  };

  const generateFallbackPrepPlan = (job, durationInWeeks) => {
    // Fallback plan when skills parsing fails
    return {
      overview: {
        estimatedTimeWeeks: durationInWeeks,
        difficultyLevel: job.level || 'Intermediate',
        totalTopics: 8,
        completedTopics: 0
      },
      phases: [
        {
          id: 1,
          title: 'Foundation Skills',
          duration: '3 weeks',
          topics: [
            {
              id: 1,
              title: 'Core Programming Concepts',
              description: 'Strengthen fundamental programming skills',
              estimatedHours: 15,
              resources: [
                { type: 'course', title: 'Programming Fundamentals', url: '#' },
                { type: 'practice', title: 'Coding Challenges', url: '#' }
              ],
              completed: false
            },
            {
              id: 2,
              title: 'Data Structures & Algorithms',
              description: 'Master essential DSA concepts',
              estimatedHours: 20,
              resources: [
                { type: 'course', title: 'DSA Complete Course', url: '#' },
                { type: 'practice', title: 'Algorithm Practice', url: '#' }
              ],
              completed: false
            }
          ]
        },
        {
          id: 2,
          title: 'Job-Specific Skills',
          duration: '4 weeks',
          topics: [
            {
              id: 3,
              title: `${job.title} Role Preparation`,
              description: `Prepare for ${job.title} position requirements`,
              estimatedHours: 25,
              resources: [
                { type: 'research', title: 'Role Requirements Research', url: '#' },
                { type: 'project', title: 'Relevant Project Building', url: '#' }
              ],
              completed: false
            }
          ]
        },
        {
          id: 3,
          title: 'Interview Preparation',
          duration: '1 week',
          topics: [
            {
              id: 4,
              title: 'Technical Interview Prep',
              description: 'Prepare for technical interviews',
              estimatedHours: 10,
              resources: [
                { type: 'practice', title: 'Mock Interviews', url: '#' },
                { type: 'course', title: 'Interview Techniques', url: '#' }
              ],
              completed: false
            }
          ]
        }
      ]
    };
  };

  const getResourceIcon = (type) => {
    switch (type) {
      case 'course': return <BookOpen className="h-4 w-4" />;
      case 'book': return <FileText className="h-4 w-4" />;
      case 'practice': return <Code className="h-4 w-4" />;
      case 'project': return <Target className="h-4 w-4" />;
      case 'documentation': return <FileText className="h-4 w-4" />;
      case 'mock': return <Brain className="h-4 w-4" />;
      case 'research': return <Brain className="h-4 w-4" />;
      case 'networking': return <Brain className="h-4 w-4" />;
      case 'hands-on': return <Zap className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  };

  // Completion tracking functions
  const toggleTopicCompletion = (topicId) => {
    setCompletedTopics(prev => {
      const newCompleted = new Set(prev);
      if (newCompleted.has(topicId)) {
        newCompleted.delete(topicId);
      } else {
        newCompleted.add(topicId);
      }
      return newCompleted;
    });
  };
  const handleDurationChange = (newDuration) => {
    setLearningDuration(newDuration);
    // The useEffect will automatically regenerate the plan when duration changes
  };

  const handlePathUpdate = (customizations) => {
    setPathCustomizations(customizations);
  };

  const handlePayoutCalculated = (payoutData) => {
    setCurrentPayout(payoutData);
  };
  const calculateProgress = () => {
    if (!prepPlan) return 0;
    const totalTopics = prepPlan.phases.reduce((total, phase) => total + phase.topics.length, 0);
    return totalTopics > 0 ? (completedTopics.size / totalTopics) * 100 : 0;
  };  const fetchSkillVideos = async (skillTitle, customSearchTerm = '') => {
    setVideosLoading(true);
    console.log('🎥 Fetching videos for skill:', skillTitle);
    
    try {
      // Use custom search term if provided, otherwise use skill title + current search term
      const baseQuery = customSearchTerm || `${skillTitle} ${videoSearchTerm}`.trim();
      const searchQuery = encodeURIComponent(baseQuery + ' tutorial programming');
      
      // Build API URL with filters
      let apiUrl = `/api/youtube/videos?search=${searchQuery}&limit=12`;
      
      // Add duration filter
      if (videoDurationFilter !== 'any') {
        apiUrl += `&duration=${videoDurationFilter}`;
      }
      
      // Add upload date filter
      if (videoUploadFilter !== 'any') {
        apiUrl += `&publishedAfter=${getPublishedAfterDate(videoUploadFilter)}`;
      }
      
      // Add sort order
      apiUrl += `&order=${videoSortBy}`;
      
      console.log('🔗 API URL:', apiUrl);
      
      // Make the fetch request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('📊 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Videos fetched successfully:', data.videos?.length || 0, 'videos');
        console.log('📋 First video data:', data.videos?.[0]);
        const videos = data.videos || [];
        setSkillVideos(videos);
        setOriginalSkillVideos(videos); // Store original for local filtering
      } else {
        console.error('❌ Failed to fetch videos - Response not OK:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        
        // Set empty array but don't show error to user - they'll see "No videos found"
        setSkillVideos([]);
        setOriginalSkillVideos([]);
      }
    } catch (error) {
      console.error('❌ Error fetching skill videos:', error);
      
      if (error.name === 'AbortError') {
        console.error('Request timed out after 10 seconds');
      } else if (error.message === 'Failed to fetch') {
        console.error('Network error - server may be down or URL is incorrect');
        console.error('Make sure the development server is running on the correct port');
      }
      
      // Set empty array - user will see "No videos found" message
      setSkillVideos([]);
      setOriginalSkillVideos([]);
    } finally {
      setVideosLoading(false);
    }
  };
  const handleViewRelatedVideos = (skillTitle) => {
    console.log('🎬 Opening video dialog for skill:', skillTitle);
    
    if (!skillTitle) {
      console.error('❌ No skill title provided');
      return;
    }
    
    setSelectedSkill(skillTitle);
    setSelectedVideo(null); // Reset any selected video
    setSkillVideos([]); // Clear previous videos
    
    // Fetch videos for the selected skill
    fetchSkillVideos(skillTitle);
  };
  const getYouTubeVideoId = (url) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  const getPublishedAfterDate = (filter) => {
    const now = new Date();
    switch (filter) {
      case 'hour':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      case 'year':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return null;
    }
  };
  const handleVideoSearch = () => {
    if (selectedSkill) {
      fetchSkillVideos(selectedSkill);
    }
  };

  const handleFilterChange = (filterType, value) => {
    switch (filterType) {
      case 'duration':
        setVideoDurationFilter(value);
        break;
      case 'upload':
        setVideoUploadFilter(value);
        break;
      case 'sort':
        setVideoSortBy(value);
        break;
    }
    
    // Automatically re-search when filters change
    setTimeout(() => {
      if (selectedSkill) {
        fetchSkillVideos(selectedSkill);
      }
    }, 100);
  };

  // Video selection functions
  const addVideoToPlan = (video) => {
    const isAlreadySelected = selectedVideosForPlan.some(v => v.url === video.url);
    
    if (!isAlreadySelected) {
      const updatedVideos = [...selectedVideosForPlan, video];
      setSelectedVideosForPlan(updatedVideos);
      
      // Calculate total duration
      const totalDuration = calculateTotalDuration(updatedVideos);
      setTotalVideoPlanDuration(totalDuration);
      
      console.log('✅ Video added to plan:', video.title);
      console.log('📊 Total videos in plan:', updatedVideos.length);
      console.log('⏱️ Total duration:', totalDuration, 'minutes');
    } else {
      console.log('⚠️ Video already in plan:', video.title);
    }
  };

  const removeVideoFromPlan = (videoUrl) => {
    const updatedVideos = selectedVideosForPlan.filter(v => v.url !== videoUrl);
    setSelectedVideosForPlan(updatedVideos);
    
    const totalDuration = calculateTotalDuration(updatedVideos);
    setTotalVideoPlanDuration(totalDuration);
    
    console.log('❌ Video removed from plan');
    console.log('📊 Total videos in plan:', updatedVideos.length);
  };

  const calculateTotalDuration = (videos) => {
    return videos.reduce((total, video) => {
      const duration = parseDuration(video.duration);
      return total + duration;
    }, 0);
  };

  const parseDuration = (durationStr) => {
    if (!durationStr) return 0;
    
    // Handle format like "10:30" or "1:30:45"
    const parts = durationStr.split(':').map(p => parseInt(p) || 0);
    
    if (parts.length === 3) {
      // Hours:Minutes:Seconds
      return parts[0] * 60 + parts[1] + parts[2] / 60;
    } else if (parts.length === 2) {
      // Minutes:Seconds
      return parts[0] + parts[1] / 60;
    } else {
      // Just minutes
      return parts[0] || 0;
    }
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  };

  const goToVideoPlan = async () => {
    try {
      // Get user ID (you'll need to implement getUserId based on your auth system)
      const userId = localStorage.getItem('userId') || 'temp-user-id'; // Replace with actual user ID
      
      const jobId = getJobId(jobData);
      
      console.log('🚀 Saving video plan to backend...', {
        userId,
        jobId,
        videosCount: selectedVideosForPlan.length,
        totalDuration: totalVideoPlanDuration
      });
      
      // Save to backend
      const response = await fetch('/api/video-plans/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          jobId,
          videos: selectedVideosForPlan,
          totalDuration: totalVideoPlanDuration,
          jobTitle: jobData?.title,
          companyName: jobData?.companyName,
          jobData: jobData // Include complete job data for navigation back
        })
      });

      console.log('📡 API Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ API Error Response:', errorData);
        throw new Error(`API responded with status ${response.status}: ${errorData}`);
      }

      const result = await response.json();
      console.log('✅ Video plan saved to backend:', result);
      
      // Also store in localStorage as backup
      localStorage.setItem('selectedVideoPlan', JSON.stringify({
        videos: selectedVideosForPlan,
        totalDuration: totalVideoPlanDuration,
        jobTitle: jobData?.title,
        companyName: jobData?.companyName,
        jobId: jobId, // Include jobId for proper isolation
        planId: result.planId,
        createdAt: new Date().toISOString()
      }));
      
      // Navigate to video plan page
      router.push('/dashboard/applicant/video-plan');
    } catch (error) {
      console.error('❌ Error saving video plan:', error);
      
      // Fallback to localStorage only
      console.log('⚠️ Falling back to localStorage only');
      localStorage.setItem('selectedVideoPlan', JSON.stringify({
        videos: selectedVideosForPlan,
        totalDuration: totalVideoPlanDuration,
        jobTitle: jobData?.title,
        companyName: jobData?.companyName,
        jobId: jobId, // Include jobId for proper isolation
        createdAt: new Date().toISOString()
      }));
      
      router.push('/dashboard/applicant/video-plan');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 top-16 overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {parsingJD ? 'Parsing Job Description with AI...' : 'Generating Your Prep Plan'}
              </h3>
              <p className="text-muted-foreground text-center">
                {parsingJD 
                  ? 'AI is analyzing job requirements and extracting required skills...'
                  : 'AI is analyzing the job requirements and creating a personalized study plan for you...'
                }
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 top-16 overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="text-destructive mb-4">⚠️</div>
              <h3 className="text-lg font-medium mb-2">Error</h3>
              <p className="text-muted-foreground text-center">{error}</p>
              <Button 
                onClick={() => router.push('/dashboard/applicant/saved-jobs')}
                className="mt-4"
              >
                Go Back to Saved Jobs
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );  }
  return (
    <div className="fixed inset-0 top-16 overflow-y-auto bg-background" style={{scrollBehavior: 'smooth'}}>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Prep Plan</h1>
            <p className="text-muted-foreground">
              {jobData?.title} at {jobData?.companyName}
            </p>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-4">
            {/* View Toggles */}
            <div className="flex items-center gap-2">
              <Button
                variant={showCustomizationView ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowCustomizationView(!showCustomizationView);
                  setShowPayoutCalculator(false);
                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                {showCustomizationView ? "Standard View" : "Customize Path"}
              </Button>
              
              <Button
                variant={showPayoutCalculator ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowPayoutCalculator(!showPayoutCalculator);
                  setShowCustomizationView(false);
                }}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                {showPayoutCalculator ? "Hide Calculator" : "Demo Betting"}
              </Button>
              
              {/* Video Plan Button */}
              {selectedVideosForPlan.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={goToVideoPlan}
                  className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Complete & Go to Video Plan ({selectedVideosForPlan.length} videos - {formatDuration(totalVideoPlanDuration)})
                </Button>
              )}
            </div>
            
            {/* Duration Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">Duration:</span>
            </div>
            <Select value={learningDuration} onValueChange={handleDurationChange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 weeks</SelectItem>
                <SelectItem value="8">8 weeks</SelectItem>
                <SelectItem value="12">12 weeks</SelectItem>
                <SelectItem value="16">16 weeks</SelectItem>
                <SelectItem value="20">20 weeks</SelectItem>
                <SelectItem value="24">24 weeks</SelectItem>
                <SelectItem value="36">36 weeks</SelectItem>
                <SelectItem value="52">1 year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overview Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Study Plan Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{prepPlan?.overview.estimatedTimeWeeks}</div>
                <div className="text-sm text-muted-foreground">Weeks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{prepPlan?.overview.totalTopics}</div>
                <div className="text-sm text-muted-foreground">Topics</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{completedTopics.size}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <Badge variant="outline" className="text-sm">
                  {prepPlan?.overview.difficultyLevel}
                </Badge>
                <div className="text-sm text-muted-foreground mt-1">Difficulty</div>
              </div>
              <div className="text-center">
                <Progress value={calculateProgress()} className="w-full" />
                <div className="text-sm text-muted-foreground mt-1">{Math.round(calculateProgress())}% Progress</div>
              </div>
              {currentPayout && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{currentPayout.finalMultiplier}x</div>
                  <div className="text-sm text-muted-foreground">Demo Payout</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Parsed Skills Section */}
        {parsedSkills && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI-Powered Job Analysis
                {parsingJD && <Loader2 className="h-4 w-4 animate-spin" />}
                {parsedSkills.source === 'gemini-ai' && (
                  <Badge variant="default" className="ml-2">
                    Gemini AI
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Critical Skills - Most Important */}
              {parsedSkills.requiredSkills?.critical && parsedSkills.requiredSkills.critical.length > 0 && (
                <div className="mb-6 p-4 border-2 border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
                  <h4 className="font-bold mb-3 flex items-center gap-2 text-red-700 dark:text-red-400">
                    <Target className="h-5 w-5" />
                    🚨 CRITICAL SKILLS - Must Learn First
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedSkills.requiredSkills.critical.map((skill, index) => (
                      <Badge key={index} variant="destructive" className="text-sm font-medium">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">
                    These skills are absolutely mandatory for this role. Focus on these first!
                  </p>
                </div>
              )}

              {/* Learning Path Priority */}
              {parsedSkills.learningPath && (
                <div className="mb-6">
                  <h4 className="font-medium mb-4 flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Prioritized Learning Path
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Must Learn */}
                    {parsedSkills.learningPath.mustLearn && (
                      <div className="p-3 border border-red-300 rounded-lg bg-red-50 dark:bg-red-950/10">
                        <h5 className="font-medium text-red-700 dark:text-red-400 mb-2">Must Learn (Priority 1)</h5>
                        <div className="space-y-1">
                          {parsedSkills.learningPath.mustLearn.slice(0, 5).map((skill, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              <span>{skill}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* High Priority */}
                    {parsedSkills.learningPath.highPriority && (
                      <div className="p-3 border border-orange-300 rounded-lg bg-orange-50 dark:bg-orange-950/10">
                        <h5 className="font-medium text-orange-700 dark:text-orange-400 mb-2">High Priority (Priority 2)</h5>
                        <div className="space-y-1">
                          {parsedSkills.learningPath.highPriority.slice(0, 5).map((skill, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                              <span>{skill}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Medium Priority */}
                    {parsedSkills.learningPath.mediumPriority && (
                      <div className="p-3 border border-blue-300 rounded-lg bg-blue-50 dark:bg-blue-950/10">
                        <h5 className="font-medium text-blue-700 dark:text-blue-400 mb-2">Medium Priority (Priority 3)</h5>
                        <div className="space-y-1">
                          {parsedSkills.learningPath.mediumPriority.slice(0, 4).map((skill, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span>{skill}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Nice to Have */}
                    {parsedSkills.learningPath.niceToHave && (
                      <div className="p-3 border border-green-300 rounded-lg bg-green-50 dark:bg-green-950/10">
                        <h5 className="font-medium text-green-700 dark:text-green-400 mb-2">Nice to Have (Bonus)</h5>
                        <div className="space-y-1">
                          {parsedSkills.learningPath.niceToHave.slice(0, 4).map((skill, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span>{skill}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Learning Timeline */}
                  {(parsedSkills.learningPath.estimatedTimeWeeks || parsedSkills.learningPath.difficultyLevel) && (
                    <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium text-purple-700 dark:text-purple-400">Learning Timeline</h5>
                          <p className="text-sm text-purple-600 dark:text-purple-300">
                            Estimated: {parsedSkills.learningPath.estimatedTimeWeeks || 8} weeks
                          </p>
                        </div>
                        <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                          {parsedSkills.learningPath.difficultyLevel || 'Intermediate'} Level
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Technical Skills */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Technical Skills
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedSkills.requiredSkills?.technical?.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Programming Languages */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Programming Languages
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedSkills.requiredSkills?.languages?.map((language, index) => (
                      <Badge key={index} variant="default" className="text-xs">
                        {language}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Frameworks & Tools */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Frameworks & Tools
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedSkills.requiredSkills?.frameworks?.map((framework, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {framework}
                      </Badge>
                    ))}
                    {parsedSkills.requiredSkills?.tools?.map((tool, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Cloud & Databases */}
                {(parsedSkills.requiredSkills?.cloud || parsedSkills.requiredSkills?.databases) && (
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Cloud & Databases
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {parsedSkills.requiredSkills?.cloud?.map((cloud, index) => (
                        <Badge key={index} variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                          {cloud}
                        </Badge>
                      ))}
                      {parsedSkills.requiredSkills?.databases?.map((db, index) => (
                        <Badge key={index} variant="secondary" className="text-xs bg-green-100 text-green-800">
                          {db}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Experience Level */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Experience Required
                  </h4>
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-xs">
                      {parsedSkills.experience?.level || 'Not specified'}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {parsedSkills.experience?.minYears || 0} - {parsedSkills.experience?.maxYears || 0} years
                    </p>
                  </div>
                </div>

                {/* Job Insights */}
                {parsedSkills.jobInsights && (
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Job Insights
                    </h4>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {parsedSkills.jobInsights.workType || 'Not specified'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {parsedSkills.jobInsights.companyType || 'Unknown'}
                        </Badge>
                      </div>
                      {parsedSkills.jobInsights.teamSize && (
                        <p className="text-sm text-muted-foreground">
                          Team: {parsedSkills.jobInsights.teamSize}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Responsibilities */}
              {parsedSkills.responsibilities && parsedSkills.responsibilities.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Key Responsibilities
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {parsedSkills.responsibilities.slice(0, 6).map((responsibility, index) => (
                      <div key={index} className="flex items-start gap-2 text-sm">
                        <div className="w-1 h-1 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-muted-foreground">{responsibility}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Interview Prep Insights */}
              {parsedSkills.interviewPrep && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Interview Preparation Insights
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parsedSkills.interviewPrep.technicalTopics && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Technical Topics</h5>
                        <div className="flex flex-wrap gap-1">
                          {parsedSkills.interviewPrep.technicalTopics.slice(0, 4).map((topic, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {parsedSkills.interviewPrep.codingChallenges && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Coding Challenges</h5>
                        <div className="flex flex-wrap gap-1">
                          {parsedSkills.interviewPrep.codingChallenges.slice(0, 4).map((challenge, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {challenge}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI Analysis Footer */}
              <div className="mt-6 pt-4 border-t bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 p-3 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <span className="text-blue-700 dark:text-blue-400 font-medium">
                      AI-Powered Analysis Complete
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Confidence: {Math.round((parsedSkills.confidence || 0.75) * 100)}%</span>
                    {parsedSkills.source === 'gemini-ai' && (
                      <Badge variant="outline" className="text-xs">Powered by Gemini</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Learning Path Customization View */}
        {showCustomizationView && prepPlan && (
          <div className="mb-6">
            <LearningPathPreview
              prepPlan={prepPlan}
              prepPlanId={prepPlanId}
              onPathUpdate={handlePathUpdate}
              isCustomizable={true}
            />
          </div>
        )}

        {/* Payout Calculator View */}
        {showPayoutCalculator && prepPlan && (
          <div className="mb-6">
            <PayoutCalculator
              prepPlan={prepPlan}
              prepPlanId={prepPlanId}
              onPayoutCalculated={handlePayoutCalculated}
            />
          </div>
        )}

        {/* Study Phases - Standard View */}
        {!showCustomizationView && (
          <div className="space-y-6">
            {prepPlan?.phases.map((phase) => (
            <Card key={phase.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {phase.id}
                    </div>
                    {phase.title}
                  </CardTitle>
                  <Badge variant="secondary">{phase.duration}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {phase.topics.map((topic) => (
                    <div key={topic.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{topic.title}</h4>
                          <p className="text-sm text-muted-foreground">{topic.description}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {topic.estimatedHours}h
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium">Resources:</h5>
                        {topic.resources.map((resource, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            {getResourceIcon(resource.type)}
                            <span className="text-muted-foreground capitalize">{resource.type}:</span>
                            <a href={resource.url} className="text-primary hover:underline">
                              {resource.title}
                            </a>
                          </div>
                        ))}
                      </div>                        <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={completedTopics.has(topic.id) ? "default" : "outline"}
                            className={`flex items-center gap-2 ${
                              completedTopics.has(topic.id) 
                                ? 'bg-green-600 hover:bg-green-700 text-white' 
                                : 'hover:bg-primary hover:text-primary-foreground'
                            }`}
                            onClick={() => toggleTopicCompletion(topic.id)}
                          >
                            {completedTopics.has(topic.id) ? (
                              <>
                                <Check className="h-4 w-4" />
                                Completed
                              </>
                            ) : (
                              <>
                                <Target className="h-4 w-4" />
                                Mark Complete
                              </>
                            )}
                          </Button>
                          
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleViewRelatedVideos(topic.title)}
                          >
                            <Youtube className="h-4 w-4" />
                            View Related Videos
                          </Button>
                        </div>
                        
                        {completedTopics.has(topic.id) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => toggleTopicCompletion(topic.id)}
                          >
                            <X className="h-4 w-4" />
                            Undo
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        )}

        {/* AI Enhancement Notice */}
        <Card className="mt-6 border-dashed">
          <CardContent className="text-center py-6">
            <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <h3 className="font-medium mb-2">AI-Powered Personalization</h3>
            <p className="text-sm text-muted-foreground">
              This prep plan is powered by Gemini AI analysis of the job description. 
              Track your progress by marking topics as complete!
            </p>
          </CardContent>
        </Card>        {/* Video Dialog */}
        <Dialog open={!!selectedSkill} onOpenChange={() => {
          setSelectedSkill(null);
          setSelectedVideo(null);
          setVideoSearchTerm('');
          setVideoDurationFilter('any');
          setVideoUploadFilter('any');
          setVideoSortBy('relevance');
        }}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Youtube className="h-5 w-5 text-red-600" />
                Related Videos: {selectedSkill}
              </DialogTitle>
            </DialogHeader>
            
            {/* Search and Filter Controls */}
            {!selectedVideo && (
              <div className="space-y-4 border-b pb-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for specific videos..."
                    value={videoSearchTerm}
                    onChange={(e) => setVideoSearchTerm(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleVideoSearch();
                      }
                    }}
                    className="pl-10 pr-4"
                  />
                  <Button
                    size="sm"
                    onClick={handleVideoSearch}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2"
                    disabled={videosLoading}
                  >
                    {videosLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Filter Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Duration Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Duration
                    </label>
                    <Select
                      value={videoDurationFilter}
                      onValueChange={(value) => handleFilterChange('duration', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Duration</SelectItem>
                        <SelectItem value="short">Under 4 minutes</SelectItem>
                        <SelectItem value="medium">4-20 minutes</SelectItem>
                        <SelectItem value="long">Over 20 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Upload Date Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Upload Time
                    </label>
                    <Select
                      value={videoUploadFilter}
                      onValueChange={(value) => handleFilterChange('upload', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Time</SelectItem>
                        <SelectItem value="hour">Last Hour</SelectItem>
                        <SelectItem value="day">Last Day</SelectItem>
                        <SelectItem value="week">Last Week</SelectItem>
                        <SelectItem value="month">Last Month</SelectItem>
                        <SelectItem value="year">Last Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort Order */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <SortAsc className="h-4 w-4" />
                      Sort By
                    </label>
                    <Select
                      value={videoSortBy}
                      onValueChange={(value) => handleFilterChange('sort', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="date">Upload Date</SelectItem>
                        <SelectItem value="viewCount">View Count</SelectItem>
                        <SelectItem value="rating">Rating</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            
            {videosLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading videos...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedVideo ? (
                  // Video Player View
                  <div className="space-y-4">                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">{selectedVideo.title}</h3>
                      <div className="flex gap-2">                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => {
                            const aiAssistantUrl = `/video-ai-assistant?videoId=${getYouTubeVideoId(selectedVideo.url)}&title=${encodeURIComponent(selectedVideo.title)}&channel=${encodeURIComponent(selectedVideo.channel)}`;
                            window.open(aiAssistantUrl, '_blank');
                          }}
                        >
                          🤖 Open with AI Assistant
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedVideo(null)}
                        >
                          ← Back to Videos
                        </Button>
                      </div>
                    </div>
                    
                    <div className="aspect-video w-full">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${getYouTubeVideoId(selectedVideo.url)}?autoplay=1`}
                        title={selectedVideo.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="rounded-lg"
                      ></iframe>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>👀 {selectedVideo.views} views</span>
                        <span>•</span>
                        <span>⏱️ {selectedVideo.duration}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedVideo.description}</p>
                    </div>
                  </div>
                ) : (
                  // Video Grid View
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {skillVideos.map((video, index) => (                      <div 
                        key={index} 
                        className="border rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                        onClick={() => setSelectedVideo(video)}
                      >                        <div className="relative w-full h-48 bg-gray-100 overflow-hidden">
                          <img 
                            src={video.thumbnail || video.thumbnailFallback || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgwIiBoZWlnaHQ9IjM2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDgwIiBoZWlnaHQ9IjM2MCIgZmlsbD0iIzAwNjZjYyIvPgogIDxjaXJjbGUgY3g9IjI0MCIgY3k9IjE4MCIgcj0iMzAiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz4KICA8cG9seWdvbiBwb2ludHM9IjIzMCwxNjUgMjUwLDE4MCAyMzAsMTk1IiBmaWxsPSIjMDA2NmNjIi8+CiAgPHRleHQgeD0iMjQwIiB5PSIyNTAiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4KICAgIPCfk7ogVmlkZW8KICA8L3RleHQ+Cjwvc3ZnPgo='} 
                            alt={video.title}
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{ display: 'block', zIndex: 1 }}
                            onError={(e) => {
                              console.log('Thumbnail failed for:', video.title, 'URL:', e.target.src);
                              
                              // First attempt failed, try alternatives
                              if (video.thumbnailAlternatives && video.thumbnailAlternatives.length > 0) {
                                const currentSrc = e.target.src;
                                const currentIndex = video.thumbnailAlternatives.findIndex(alt => alt === currentSrc);
                                const nextIndex = currentIndex + 1;
                                
                                if (nextIndex < video.thumbnailAlternatives.length) {
                                  console.log('Trying alternative:', video.thumbnailAlternatives[nextIndex]);
                                  e.target.src = video.thumbnailAlternatives[nextIndex];
                                  return;
                                }
                              }
                              
                              // Try the thumbnailFallback if available and not already tried
                              if (video.thumbnailFallback && e.target.src !== video.thumbnailFallback) {
                                console.log('Trying thumbnailFallback:', video.thumbnailFallback);
                                e.target.src = video.thumbnailFallback;
                                return;
                              }
                              
                              // Final fallback: Create a custom SVG with video info
                              const finalFallback = `data:image/svg+xml;base64,${btoa(`
                                <svg width="480" height="360" xmlns="http://www.w3.org/2000/svg">
                                  <rect width="480" height="360" fill="#374151"/>
                                  <rect x="40" y="40" width="400" height="280" fill="#4B5563" rx="8"/>
                                  <circle cx="240" cy="160" r="40" fill="#6B7280"/>
                                  <polygon points="220,140 260,160 220,180" fill="#F3F4F6"/>
                                  <text x="240" y="220" font-size="16" fill="#F3F4F6" text-anchor="middle" font-family="Arial, sans-serif">
                                    ${video.title.substring(0, 30)}${video.title.length > 30 ? '...' : ''}
                                  </text>
                                  <text x="240" y="245" font-size="12" fill="#D1D5DB" text-anchor="middle" font-family="Arial, sans-serif">
                                    ${video.channel}
                                  </text>
                                </svg>
                              `)}`;
                              
                              if (e.target.src !== finalFallback) {
                                console.log('Using final custom SVG fallback');
                                e.target.src = finalFallback;
                              }
                            }}
                            onLoad={(e) => {
                              console.log('Thumbnail loaded successfully:', video.title);
                              e.target.style.opacity = '1';
                            }}
                            onLoadStart={(e) => {
                              e.target.style.opacity = '0.5';
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-30 transition-all pointer-events-none hover:pointer-events-auto" style={{ zIndex: 2 }}>
                            <Play className="h-8 w-8 text-white opacity-0 hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-1 rounded" style={{ zIndex: 3 }}>
                            {video.duration}
                          </div>
                        </div>
                        
                        <div className="p-3">
                          <h4 className="font-medium text-sm line-clamp-2 mb-1 text-gray-900 dark:text-gray-100">{video.title}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{video.description}</p>
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                            <span>{video.channel}</span>
                            <span>{video.views} views</span>
                          </div>
                          
                          {/* Add to Video Plan Button */}
                          <Button
                            size="sm"
                            variant={selectedVideosForPlan.some(v => v.url === video.url) ? "default" : "outline"}
                            className={`w-full text-xs ${
                              selectedVideosForPlan.some(v => v.url === video.url) 
                                ? "bg-green-600 hover:bg-green-700 text-white dark:bg-green-600 dark:hover:bg-green-700" 
                                : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card click
                              const isSelected = selectedVideosForPlan.some(v => v.url === video.url);
                              if (isSelected) {
                                removeVideoFromPlan(video.url);
                              } else {
                                addVideoToPlan(video);
                              }
                            }}
                          >
                            {selectedVideosForPlan.some(v => v.url === video.url) ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Added to Plan
                              </>
                            ) : (
                              <>
                                <Target className="h-3 w-3 mr-1" />
                                Add to Video Plan
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {!videosLoading && skillVideos.length === 0 && (
                  <div className="text-center py-8">
                    <Youtube className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No videos found for this skill</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function PrepPlanPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <PrepPlanPageInner />
    </Suspense>
  );
}

