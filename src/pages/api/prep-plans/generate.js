import { authMiddleware } from '../../../lib/middleware';
import { getDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';
import { youtubeContentCurator } from '../../../lib/youtubeContentCurator';
import { skillFilter } from '../../../lib/skillFilter';

// Generate a detailed AI-powered prep plan using OpenRouter with dynamic duration adaptation
async function generateDetailedPrepPlan(jobData, userProfile, duration = 3, resumeAnalysis = null) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_PREP_PLAN_API_KEY;

  console.log('🔑 OpenRouter API Key check:', OPENROUTER_API_KEY ? `Available (${OPENROUTER_API_KEY.substring(0, 15)}...)` : 'Missing');
  console.log('📊 Generation parameters:', {
    jobTitle: jobData.jobTitle,
    duration,
    hasProfile: !!userProfile,
    hasResumeAnalysis: !!resumeAnalysis,
    resumeAnalysisSource: resumeAnalysis ? 'Resume-JD Match Analysis' : 'User Profile Only'
  });

  // Debug user profile data for personalization
  console.log('👤 USER PROFILE DEBUG:', {
    skillsCount: Array.isArray(userProfile.skills) ? userProfile.skills.length : 0,
    skills: Array.isArray(userProfile.skills) ? userProfile.skills.slice(0, 3) : 'No skills',
    hasExperience: !!userProfile.workExperience,
    experienceCount: Array.isArray(userProfile.workExperience) ? userProfile.workExperience.length : 0,
    hasEducation: !!userProfile.education,
    educationCount: Array.isArray(userProfile.education) ? userProfile.education.length : 0
  });

  // Debug resume analysis data if available
  if (resumeAnalysis) {
    console.log('📄 RESUME ANALYSIS DEBUG:', {
      hasStructuredAnalysis: !!resumeAnalysis.structuredAnalysis,
      hasGapAnalysis: !!(resumeAnalysis.gapAnalysis || resumeAnalysis.structuredAnalysis?.gap_analysis),
      hasMissingSkills: !!(resumeAnalysis.missingSkills || resumeAnalysis.structuredAnalysis?.missing_skills),
      hasMatchingSkills: !!(resumeAnalysis.matchingSkills || resumeAnalysis.structuredAnalysis?.matching_skills),
      hasSkillsToImprove: !!(resumeAnalysis.skillsToImprove || resumeAnalysis.structuredAnalysis?.skills_to_improve)
    });
  }

  if (!OPENROUTER_API_KEY) {
    console.error('❌ OpenRouter API Key not configured');
    throw new Error('OpenRouter API Key not configured');
  }

  // Dynamic duration adaptation logic
  const durationWeeks = duration;
  const isIntensive = durationWeeks <= 4; // 1 month or less = intensive approach
  const isComprehensive = durationWeeks >= 12; // 3+ months = comprehensive approach
  const isModerate = !isIntensive && !isComprehensive; // 1-3 months = moderate approach

  console.log('⏱️ Duration Analysis:', {
    weeks: durationWeeks,
    approach: isIntensive ? 'Intensive' : isComprehensive ? 'Comprehensive' : 'Moderate',
    hoursPerWeek: isIntensive ? '15-20' : isComprehensive ? '8-12' : '10-15'
  });

  // Helper function to generate weekly structure template
  function generateWeeklyStructure(weeks, intensive, comprehensive) {
    const structure = {};
    for (let i = 1; i <= Math.min(weeks, 12); i++) { // Limit to 12 weeks in JSON for brevity
      if (intensive) {
        structure[`week${i}`] = {
          "focus": i <= 2 ? "Critical skills crash course" : i <= 4 ? "Essential practice and application" : "Job readiness and interview prep",
          "topics": ["High-priority skills for immediate impact"],
          "rationale": "Fast-track approach focusing on job-critical skills only"
        };
      } else if (comprehensive) {
        structure[`week${i}`] = {
          "focus": i <= 3 ? "Foundation building" : i <= 8 ? "Skill development and practice" : "Advanced topics and portfolio",
          "topics": ["Progressive skill building with depth"],
          "rationale": "Comprehensive approach building strong foundation and advanced expertise"
        };
      } else {
        structure[`week${i}`] = {
          "focus": i <= 2 ? "Core skills foundation" : i <= 6 ? "Practical application" : "Advanced skills and projects",
          "topics": ["Balanced skill development"],
          "rationale": "Moderate approach balancing speed and depth"
        };
      }
    }
    return JSON.stringify(structure);
  }

  // Helper function to generate skill-specific milestones
  function generateSkillMilestones(skill, weeks, intensive) {
    if (intensive && weeks <= 4) {
      return [`Week 1: ${skill} basics`, `Week 2: ${skill} practical application`, `Week 3-4: ${skill} job-ready proficiency`];
    } else if (weeks >= 12) {
      return [`Week 1-2: ${skill} fundamentals`, `Week 3-6: ${skill} intermediate concepts`, `Week 7-10: ${skill} advanced topics`, `Week 11-12: ${skill} mastery projects`];
    } else {
      return [`Week 1: ${skill} introduction`, `Week 2-4: ${skill} core concepts`, `Week 5-6: ${skill} practical projects`];
    }
  }

  // Helper function to generate overall plan milestones
  function generatePlanMilestones(weeks, intensive, comprehensive, missingSkills) {
    const milestones = [];
    const milestoneInterval = intensive ? 1 : comprehensive ? 3 : 2;

    for (let i = 1; i <= weeks; i += milestoneInterval) {
      const weekEnd = Math.min(i + milestoneInterval - 1, weeks);
      const weekRange = i === weekEnd ? `Week ${i}` : `Week ${i}-${weekEnd}`;

      if (intensive) {
        milestones.push({
          week: i,
          title: i === 1 ? "Foundation Setup" : i <= 2 ? "Core Skills Sprint" : i <= 4 ? "Application & Practice" : "Job Readiness",
          description: i === 1 ? "Environment setup and first skill introduction" :
            i <= 2 ? "Intensive learning of critical skills" :
              i <= 4 ? "Hands-on practice and project work" : "Interview prep and portfolio completion",
          deliverables: i === 1 ? ["Development environment", "First skill basics"] :
            i <= 2 ? ["Core skill competency", "Basic project"] :
              i <= 4 ? ["Working project", "Skill demonstration"] : ["Portfolio ready", "Interview prepared"],
          successCriteria: i === 1 ? "Can set up development environment and demonstrate basic understanding" :
            i <= 2 ? "Can build simple applications using core skills" :
              i <= 4 ? "Can create functional projects demonstrating job-relevant skills" : "Ready for technical interviews"
        });
      } else if (comprehensive) {
        milestones.push({
          week: i,
          title: i <= 3 ? "Foundation Building" : i <= 9 ? "Skill Development" : "Mastery & Portfolio",
          description: i <= 3 ? "Solid foundation in core concepts" :
            i <= 9 ? "Progressive skill building with practice" : "Advanced topics and portfolio development",
          deliverables: i <= 3 ? ["Strong fundamentals", "Basic projects"] :
            i <= 9 ? ["Intermediate projects", "Skill progression"] : ["Advanced portfolio", "Industry-ready skills"],
          successCriteria: i <= 3 ? "Solid understanding of fundamentals with basic project completion" :
            i <= 9 ? "Can build intermediate-level applications with good practices" : "Portfolio demonstrates professional-level competency"
        });
      } else {
        milestones.push({
          week: i,
          title: i <= 2 ? "Foundation Setup" : i <= 6 ? "Core Development" : "Advanced Application",
          description: i <= 2 ? "Learning environment and basic skills" :
            i <= 6 ? "Core skill development with projects" : "Advanced skills and portfolio work",
          deliverables: i <= 2 ? ["Environment setup", "Basic competency"] :
            i <= 6 ? ["Working projects", "Core skills mastery"] : ["Advanced projects", "Job-ready portfolio"],
          successCriteria: i <= 2 ? "Can demonstrate basic understanding and complete simple tasks" :
            i <= 6 ? "Can build functional applications using core skills" : "Ready for job applications with strong portfolio"
        });
      }
    }

    return milestones;
  }

  // Build the AI prompt with dynamic duration adaptation
  let prompt = `You are an AI career advisor specializing in adaptive learning plans. Create a ${isIntensive ? 'INTENSIVE' : isComprehensive ? 'COMPREHENSIVE' : 'MODERATE'} study plan based on the timeline and skill gaps.

==== TIMELINE REQUIREMENTS ====
Duration: ${durationWeeks} weeks (${Math.round(durationWeeks / 4.33)} months)
Approach: ${isIntensive ? 'INTENSIVE - Fast-track learning with focused, high-impact content' :
      isComprehensive ? 'COMPREHENSIVE - Deep learning with extensive practice and projects' :
        'MODERATE - Balanced learning with steady progression'}
Study Hours per Week: ${isIntensive ? '15-20 hours' : isComprehensive ? '8-12 hours' : '10-15 hours'}
Content Type Focus: ${isIntensive ? 'Crash courses, bootcamp-style tutorials, essential skills only' :
      isComprehensive ? 'Full courses, multiple projects, advanced topics, industry best practices' :
        'Structured courses with practical exercises and key projects'}

==== JOB REQUIREMENTS ====
Position: ${jobData.jobTitle} at ${jobData.companyName}
Requirements: ${Array.isArray(jobData.requirements) ? jobData.requirements.join(', ') : 'Not specified'}
Job Description: ${(jobData.jobDescriptionText || jobData.description || '').substring(0, 600)}

==== CANDIDATE CURRENT SKILLS ====
Existing Skills: ${Array.isArray(userProfile.skills) ? userProfile.skills.join(', ') : 'No skills listed'}
Experience: ${userProfile.workExperience ? JSON.stringify(userProfile.workExperience).substring(0, 300) : 'No experience data'}
Education: ${userProfile.education ? JSON.stringify(userProfile.education).substring(0, 200) : 'No education data'}`;

  // Add resume analysis data if available for more precise gap analysis
  if (resumeAnalysis) {
    const gapAnalysis = resumeAnalysis.gapAnalysis || resumeAnalysis.structuredAnalysis?.gap_analysis;
    const missingSkills = resumeAnalysis.missingSkills || resumeAnalysis.structuredAnalysis?.missing_skills || [];
    const matchingSkills = resumeAnalysis.matchingSkills || resumeAnalysis.structuredAnalysis?.matching_skills || [];
    const skillsToImprove = resumeAnalysis.skillsToImprove || resumeAnalysis.structuredAnalysis?.skills_to_improve || [];

    prompt += `

==== DETAILED RESUME-JD ANALYSIS ====
Resume Analysis Results: This candidate's resume was analyzed against this specific job posting.
Missing Skills (Critical): ${Array.isArray(missingSkills) ? missingSkills.join(', ') : 'None identified'}
Matching Skills (Strengths): ${Array.isArray(matchingSkills) ? matchingSkills.join(', ') : 'None identified'}
Skills to Improve: ${Array.isArray(skillsToImprove) ? skillsToImprove.join(', ') : 'None identified'}
Gap Analysis: ${gapAnalysis || 'No detailed gap analysis available'}

PRIORITY: Use this resume-specific analysis to create a highly targeted prep plan that addresses the exact gaps between this candidate's resume and this specific job posting.`;
  }

  prompt += `

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation text, no code blocks. Just raw JSON.

Return this exact JSON structure with ${durationWeeks}-week timeline adaptation:
{
  "planMetadata": {
    "duration": ${durationWeeks},
    "approach": "${isIntensive ? 'intensive' : isComprehensive ? 'comprehensive' : 'moderate'}",
    "totalEstimatedHours": ${Math.ceil(durationWeeks * (isIntensive ? 17.5 : isComprehensive ? 10 : 12.5))},
    "weeklyHours": ${isIntensive ? 17.5 : isComprehensive ? 10 : 12.5},
    "difficultyLevel": "${isIntensive ? 'high' : isComprehensive ? 'progressive' : 'moderate'}"
  },
  "gapAnalysis": {
    "missingSkills": ["List skills mentioned in job but completely absent from candidate"],
    "skillsToAdvance": ["List skills candidate has but need improvement for this role"],
    "newDomainKnowledge": ["Domain-specific knowledge needed for this role"],
    "criticalLearningPath": "What this candidate specifically needs to learn for this role",
    "priorityLevel": "${isIntensive ? 'Focus only on critical skills for immediate job readiness' :
      isComprehensive ? 'Cover all skills thoroughly with advanced topics' :
        'Balance essential skills with some advanced topics'}"
  },
  "personalizedTopics": [
    {
      "topicName": "Specific skill from gap analysis",
      "whyNeeded": "Explain why this candidate specifically needs this",
      "currentLevel": "Candidate's estimated current level",
      "targetLevel": "Level needed for the job",
      "studyHours": ${Math.ceil((durationWeeks * (isIntensive ? 17.5 : isComprehensive ? 10 : 12.5)) / 6)},
      "contentType": "${isIntensive ? 'crash-course' : isComprehensive ? 'comprehensive-course' : 'structured-course'}",
      "specificProjects": ["Projects that demonstrate mastery of this gap"],
      "milestones": ["Weekly checkpoints for this topic"]
    }
  ],
  "weeklyProgression": ${generateWeeklyStructure(durationWeeks, isIntensive, isComprehensive)},
  "contentRecommendations": {
    "videoTypes": "${isIntensive ? 'Short tutorials, crash courses, bootcamp content' :
      isComprehensive ? 'Full course series, detailed tutorials, advanced workshops' :
        'Structured tutorials with practical exercises'}",
    "projectComplexity": "${isIntensive ? 'Quick wins, essential demos' :
      isComprehensive ? 'Complex projects, portfolio pieces' :
        'Moderate projects with real-world application'}",
    "learningPath": "Progression from current state to job requirements optimized for ${durationWeeks} weeks"
  },
  "milestones": [
    {
      "week": 1,
      "title": "Foundation Setup",
      "description": "Establish learning environment and begin critical skills",
      "deliverables": ["Environment setup", "First skill milestone"],
      "successCriteria": "Can demonstrate basic understanding of priority skill"
    }
  ]
}`;

  console.log('📝 Prompt length:', prompt.length);

  // Retry logic with exponential backoff
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      retryCount++;
      console.log(`🔄 Attempt ${retryCount}/${maxRetries}`);

      if (retryCount > 1) {
        // Exponential backoff: wait 2^(retryCount-1) seconds
        const waitTime = Math.pow(2, retryCount - 1) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      // Try multiple free models with fallback - optimized order for prep plan generation
      const freeModels = [
        'microsoft/phi-3-mini-128k-instruct:free',  // Best for educational content and long context
        'google/gemma-2-9b-it:free',                // Most powerful for complex reasoning
        'liquidai/lfm2.5-1.2b-thinking:free'    // Fast and reliable fallback
      ];

      let response = null;
      let lastError = null;

      for (const model of freeModels) {
        try {
          console.log(`🤖 Trying OpenRouter model: ${model}`);

          response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002',
              'X-Title': 'X-CEED Prep Plan Generator'
            },
            body: JSON.stringify({
              model: model,
              messages: [
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.7,
              max_tokens: 4000,
            }),
          });

          console.log(`🌐 ${model} API Response status:`, response.status);

          if (response.ok) {
            console.log(`✅ Successfully using model: ${model}`);
            break;
          } else {
            const errorText = await response.text();
            console.warn(`⚠️ ${model} failed with status ${response.status}:`, errorText);
            if (response.status === 401) {
              console.error('🚨 AUTHENTICATION ERROR: OpenRouter API key is invalid or user not found');
              console.error('💡 Please check your OPENROUTER_PREP_PLAN_API_KEY in .env.local');
            }
            lastError = `${model}: ${response.status} - ${errorText}`;
            response = null;
          }
        } catch (modelError) {
          console.warn(`⚠️ ${model} error:`, modelError.message);
          lastError = `${model}: ${modelError.message}`;
          response = null;
        }
      }

      if (!response || !response.ok) {
        throw new Error(`All OpenRouter models failed. Last error: ${lastError}`);
      }

      const data = await response.json();
      console.log('✅ API Response received, content length:', data.choices?.[0]?.message?.content?.length || 0);

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content in API response');
      }

      // Try to parse JSON from the response - try multiple extraction methods
      let prepPlan = null;

      // Method 1: Try direct JSON parse (for clean responses)
      try {
        prepPlan = JSON.parse(content.trim());
      } catch (e) {
        console.log('❌ Direct parse failed:', e.message);
      }

      // Method 2: Try to find JSON block with proper structure
      if (!prepPlan) {
        const jsonMatch = content.match(/\{[\s\S]*"gapAnalysis"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            prepPlan = JSON.parse(jsonMatch[0]);
          } catch (e) {
            console.log('❌ Method 2 failed:', e.message);
          }
        }
      }

      // Method 3: Try to find any JSON structure
      if (!prepPlan) {
        const anyJsonMatch = content.match(/\{[\s\S]*\}/);
        if (anyJsonMatch) {
          try {
            prepPlan = JSON.parse(anyJsonMatch[0]);
          } catch (e) {
            console.log('❌ Method 3 failed:', e.message);
          }
        }
      }

      // Method 4: Try to extract from code blocks
      if (!prepPlan) {
        const codeBlockMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          try {
            prepPlan = JSON.parse(codeBlockMatch[1]);
          } catch (e) {
            console.log('❌ Method 4 failed:', e.message);
          }
        }
      }

      if (!prepPlan) {
        console.log('🔍 Raw AI Response (first 1000 chars):', content.substring(0, 1000));
        throw new Error('No valid JSON found in response');
      }
      console.log('✅ Plan parsed successfully');

      return prepPlan;

    } catch (error) {
      console.error(`❌ Attempt ${retryCount} failed:`, error.message);

      if (retryCount >= maxRetries) {
        console.error('❌ All retry attempts failed, using fallback plan');
        break;
      }
    }
  }

  // If we reach here, all retries failed - use fallback plan
  console.log('🔄 All OpenRouter attempts failed, generating fallback plan');

  // Return a gap-focused fallback plan using resume analysis if available
  const jobRequirements = Array.isArray(jobData.requirements) ? jobData.requirements : [];
  const candidateSkills = Array.isArray(userProfile.skills) ? userProfile.skills : [];
  const jobDescription = (jobData.jobDescriptionText || jobData.description || '').toLowerCase();

  // Use resume analysis data if available, otherwise do simple gap analysis
  let missingSkills = [];
  let skillsToAdvance = [];

  if (resumeAnalysis) {
    // Use resume-specific gap analysis (more accurate)
    console.log('📄 Using resume analysis for fallback plan');
    const rawMissingSkills = resumeAnalysis.missingSkills || resumeAnalysis.structuredAnalysis?.missing_skills || [];
    const rawSkillsToAdvance = resumeAnalysis.skillsToImprove || resumeAnalysis.structuredAnalysis?.skills_to_improve || [];

    // Filter and normalize skills using the skill filter
    console.log('🔍 Filtering non-learnable skills...');
    const filteredMissing = skillFilter.filterAndNormalizeSkills(rawMissingSkills);
    const filteredAdvance = skillFilter.filterAndNormalizeSkills(rawSkillsToAdvance);

    missingSkills = filteredMissing.learnable;
    skillsToAdvance = filteredAdvance.learnable;

    // Log what was filtered out for debugging
    if (filteredMissing.filtered.length > 0) {
      console.log('❌ Filtered out non-learnable missing skills:', filteredMissing.filtered.map(f => f.original));
    }
    if (filteredAdvance.filtered.length > 0) {
      console.log('❌ Filtered out non-learnable skills to advance:', filteredAdvance.filtered.map(f => f.original));
    }
    if (filteredMissing.mapped.length > 0) {
      console.log('🔄 Mapped vague skills to specific ones:', filteredMissing.mapped);
    }
  } else {
    // Fallback to keyword-based analysis
    console.log('🔍 Using keyword-based gap analysis for fallback');

    // Extract skills mentioned in job description - comprehensive list
    const jobSkillKeywords = [
      // Frontend Technologies
      'react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'sass', 'scss',
      'bootstrap', 'tailwind', 'jquery', 'webpack', 'vite', 'next.js', 'nuxt.js',
      
      // Backend Technologies  
      'node.js', 'node', 'express', 'python', 'django', 'flask', 'java', 'spring',
      'php', 'laravel', 'ruby', 'rails', 'c#', '.net', 'go', 'rust',
      
      // Databases
      'mongodb', 'mysql', 'postgresql', 'sql', 'redis', 'elasticsearch', 'sqlite',
      'oracle', 'cassandra', 'dynamodb', 'firebase',
      
      // Cloud & DevOps
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'ci/cd', 'terraform',
      'ansible', 'nginx', 'apache', 'linux', 'ubuntu',
      
      // APIs & Architecture
      'rest', 'restful', 'api', 'graphql', 'microservices', 'websockets', 'grpc',
      
      // Data & AI
      'machine learning', 'data science', 'tensorflow', 'pytorch', 'pandas', 'numpy',
      'scikit-learn', 'jupyter', 'r', 'matlab', 'spark', 'hadoop',
      
      // Mobile
      'react native', 'flutter', 'ios', 'android', 'swift', 'kotlin',
      
      // Tools & Others
      'git', 'github', 'gitlab', 'jira', 'agile', 'scrum', 'testing', 'jest', 'cypress'
    ];

    const candidateSkillsLower = candidateSkills.map(skill => skill.toLowerCase());

    jobSkillKeywords.forEach(skill => {
      if (jobDescription.includes(skill)) {
        if (!candidateSkillsLower.some(candidateSkill => candidateSkill.includes(skill))) {
          missingSkills.push(skill);
        } else {
          skillsToAdvance.push(skill);
        }
      }
    });

    // Add explicit job requirements
    jobRequirements.forEach(req => {
      const reqLower = req.toLowerCase();
      if (!candidateSkillsLower.some(skill => skill.toLowerCase().includes(reqLower))) {
        missingSkills.push(req);
      }
    });

    // Also extract skills from job title and description using more advanced parsing
    const jobText = `${jobData.jobTitle} ${jobData.jobDescriptionText || ''}`.toLowerCase();
    
    // Look for common skill patterns in job descriptions
    const skillPatterns = [
      /experience with ([a-zA-Z\.\s]+)/gi,
      /knowledge of ([a-zA-Z\.\s]+)/gi,
      /proficient in ([a-zA-Z\.\s]+)/gi,
      /familiar with ([a-zA-Z\.\s]+)/gi,
      /using ([a-zA-Z\.\s]+)/gi,
      /working with ([a-zA-Z\.\s]+)/gi
    ];

    skillPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(jobText)) !== null) {
        const extractedSkills = match[1].split(/[,&and]+/).map(s => s.trim());
        extractedSkills.forEach(skill => {
          if (skill.length > 2 && skill.length < 30) { // Reasonable skill name length
            const skillLower = skill.toLowerCase();
            if (!candidateSkillsLower.some(candidateSkill => candidateSkill.includes(skillLower))) {
              if (!missingSkills.some(ms => ms.toLowerCase() === skillLower)) {
                missingSkills.push(skill);
              }
            }
          }
        });
      }
    });
  }

  // Enhanced fallback plan with dynamic duration adaptation
  const totalEstimatedHours = Math.ceil(durationWeeks * (isIntensive ? 17.5 : isComprehensive ? 10 : 12.5));
  const weeklyHours = isIntensive ? 17.5 : isComprehensive ? 10 : 12.5;

  return {
    planMetadata: {
      duration: durationWeeks,
      approach: isIntensive ? 'intensive' : isComprehensive ? 'comprehensive' : 'moderate',
      totalEstimatedHours: totalEstimatedHours,
      weeklyHours: weeklyHours,
      difficultyLevel: isIntensive ? 'high' : isComprehensive ? 'progressive' : 'moderate'
    },
    gapAnalysis: {
      missingSkills: missingSkills.slice(0, 5),
      skillsToAdvance: skillsToAdvance.slice(0, 3),
      newDomainKnowledge: [
        `${jobData.jobTitle} best practices and methodologies`,
        `Industry standards for ${jobData.jobTitle} roles`,
        `Advanced techniques specific to ${jobData.companyName || 'this company'}'s domain`
      ],
      criticalLearningPath: `This candidate needs to focus on ${missingSkills.length > 0 ? 'acquiring ' + missingSkills.slice(0, 2).join(' and ') : 'advancing their existing skills'} to meet the ${jobData.jobTitle} requirements.`,
      priorityLevel: isIntensive ? 'Focus only on critical skills for immediate job readiness' :
        isComprehensive ? 'Cover all skills thoroughly with advanced topics' :
          'Balance essential skills with some advanced topics'
    },
    personalizedTopics: [
      ...(missingSkills.slice(0, 3).map(skill => ({
        topicName: `Master ${skill} for ${jobData.jobTitle}`,
        whyNeeded: `This skill is required for the ${jobData.jobTitle} role but is missing from your profile`,
        currentLevel: 'Beginner/No experience',
        targetLevel: 'Intermediate to Advanced',
        studyHours: Math.ceil(totalEstimatedHours / Math.max(missingSkills.length + skillsToAdvance.length, 1)),
        contentType: isIntensive ? 'crash-course' : isComprehensive ? 'comprehensive-course' : 'structured-course',
        specificProjects: [`Build a project demonstrating ${skill} proficiency relevant to ${jobData.jobTitle}`],
        milestones: generateSkillMilestones(skill, durationWeeks, isIntensive)
      }))),
      ...(skillsToAdvance.slice(0, 2).map(skill => ({
        topicName: `Advanced ${skill} for Professional Use`,
        whyNeeded: `You have ${skill} experience but need to advance it for this ${jobData.jobTitle} role`,
        currentLevel: 'Basic to Intermediate',
        targetLevel: 'Advanced/Expert',
        studyHours: Math.ceil(totalEstimatedHours / Math.max(missingSkills.length + skillsToAdvance.length, 1)),
        contentType: isIntensive ? 'crash-course' : isComprehensive ? 'comprehensive-course' : 'structured-course',
        specificProjects: [`Create an advanced ${skill} project showcasing professional-level skills`],
        milestones: generateSkillMilestones(skill, durationWeeks, isIntensive)
      })))
    ],
    weeklyProgression: {
      week1: {
        focus: missingSkills.length > 0 ? `Learn ${missingSkills[0]} fundamentals` : `Advance ${skillsToAdvance[0] || 'core skills'}`,
        topics: missingSkills.length > 0 ? [missingSkills[0]] : [skillsToAdvance[0] || 'Core technical skills'],
        rationale: `Starting with ${missingSkills.length > 0 ? 'the most critical missing skill' : 'advancing your strongest area'} to build confidence`
      },
      week2: {
        focus: missingSkills.length > 1 ? `Learn ${missingSkills[1]} and integration` : `Apply advanced techniques`,
        topics: missingSkills.length > 1 ? [missingSkills[1]] : ['Advanced application patterns'],
        rationale: `Building on week 1 foundation to ${missingSkills.length > 1 ? 'add another critical skill' : 'deepen expertise'}`
      }
    },
    contentRecommendations: {
      videoTypes: isIntensive ? 'Short tutorials, crash courses, bootcamp content' :
        isComprehensive ? 'Full course series, detailed tutorials, advanced workshops' :
          'Structured tutorials with practical exercises',
      projectComplexity: isIntensive ? 'Quick wins, essential demos' :
        isComprehensive ? 'Complex projects, portfolio pieces' :
          'Moderate projects with real-world application',
      learningPath: `Progress from current state to ${jobData.jobTitle} requirements optimized for ${durationWeeks} weeks`
    },
    milestones: generatePlanMilestones(durationWeeks, isIntensive, isComprehensive, missingSkills),
    candidateSpecificResources: {
      basedOnBackground: candidateSkills.length > 0
        ? `Resources building on your existing ${candidateSkills.slice(0, 2).join(' and ')} background`
        : 'Beginner-friendly resources with hands-on projects',
      learningPath: `Progress from your current ${candidateSkills.length > 0 ? 'skill set' : 'starting point'} to ${jobData.jobTitle} job requirements through targeted skill development`
    }
  };
}

/**
 * Enhance prep plan with curated YouTube content
 */
async function enhancePlanWithCuratedContent(detailedPlan, prepPlanData) {
  try {
    console.log('🎥 Starting content curation for prep plan...');
    
    // Extract skills from the detailed plan
    const skills = extractSkillsFromPlan(detailedPlan);
    console.log('🔍 Skills identified for content curation:', skills);
    
    if (!skills || skills.length === 0) {
      console.log('⚠️ No skills found for content curation, returning original plan');
      return detailedPlan;
    }

    // Determine content type based on plan duration and approach
    const duration = prepPlanData.duration || 4;
    const approach = detailedPlan.planMetadata?.approach || 
                    (duration <= 4 ? 'intensive' : duration >= 12 ? 'comprehensive' : 'moderate');
    
    const contentType = approach === 'intensive' ? 'crash-course' : 
                       approach === 'comprehensive' ? 'comprehensive-course' : 
                       'structured-course';
    
    const difficulty = determineDifficultyFromPlan(detailedPlan, prepPlanData);
    
    console.log('📋 Content curation parameters:', {
      skills: skills.length,
      contentType,
      difficulty,
      duration
    });

    // Curate content for each skill
    const curatedContent = {};
    const maxResultsPerSkill = Math.min(10, Math.max(5, Math.floor(20 / skills.length)));
    
    for (const skill of skills.slice(0, 5)) { // Limit to 5 skills to avoid API limits
      try {
        console.log(`🔍 Curating content for: ${skill}`);
        const skillContent = await youtubeContentCurator.searchEducationalContent(
          skill,
          difficulty,
          contentType,
          maxResultsPerSkill
        );
        
        curatedContent[skill] = skillContent;
        console.log(`✅ Found ${skillContent.length} videos for ${skill}`);
        
      } catch (skillError) {
        console.error(`❌ Failed to curate content for ${skill}:`, skillError.message);
        curatedContent[skill] = [];
      }
    }

    // Generate enhanced learning path with video content
    const enhancedLearningPath = generateEnhancedLearningPath(
      curatedContent, 
      detailedPlan, 
      duration, 
      approach
    );

    // Create the enhanced plan
    const enhancedPlan = {
      ...detailedPlan,
      curatedContent: curatedContent,
      enhancedLearningPath: enhancedLearningPath,
      contentMetadata: {
        totalVideos: Object.values(curatedContent).reduce((sum, videos) => sum + videos.length, 0),
        skillsCovered: Object.keys(curatedContent).length,
        contentType: contentType,
        difficulty: difficulty,
        curatedAt: new Date().toISOString()
      }
    };

    console.log('✅ Prep plan enhanced with curated content');
    return enhancedPlan;

  } catch (error) {
    console.error('❌ Error enhancing plan with curated content:', error.message);
    // Return original plan if content curation fails
    return detailedPlan;
  }
}

/**
 * Extract skills from the detailed plan
 */
function extractSkillsFromPlan(detailedPlan) {
  const skills = new Set();
  
  // Extract from gap analysis
  if (detailedPlan.gapAnalysis?.missingSkills) {
    detailedPlan.gapAnalysis.missingSkills.forEach(skill => skills.add(skill));
  }
  
  if (detailedPlan.gapAnalysis?.skillsToAdvance) {
    detailedPlan.gapAnalysis.skillsToAdvance.forEach(skill => skills.add(skill));
  }
  
  // Extract from personalized topics
  if (detailedPlan.personalizedTopics) {
    detailedPlan.personalizedTopics.forEach(topic => {
      // Extract skill name from topic name
      const skillMatch = topic.topicName.match(/^(?:Master |Advanced |Learn )?([^:]+?)(?:\s+for|\s+Tutorial|\s+Course|$)/i);
      if (skillMatch) {
        skills.add(skillMatch[1].trim());
      }
    });
  }
  
  return Array.from(skills).slice(0, 8); // Limit to 8 skills
}

/**
 * Determine difficulty level from plan and resume analysis
 */
function determineDifficultyFromPlan(detailedPlan, prepPlanData) {
  // Check if we have resume analysis data
  if (prepPlanData.resumeAnalysis?.structuredAnalysis) {
    const matchingSkills = prepPlanData.resumeAnalysis.structuredAnalysis.matchingSkills || [];
    const missingSkills = prepPlanData.resumeAnalysis.structuredAnalysis.missingSkills || [];
    
    // If user has many matching skills, they're probably intermediate+
    if (matchingSkills.length >= 5) return 'intermediate';
    if (matchingSkills.length >= 2) return 'beginner';
    if (missingSkills.length >= 5) return 'beginner';
  }
  
  // Check plan metadata for difficulty hints
  if (detailedPlan.planMetadata?.difficultyLevel) {
    const level = detailedPlan.planMetadata.difficultyLevel;
    if (level === 'high') return 'intermediate';
    if (level === 'progressive') return 'beginner';
  }
  
  // Default based on approach
  const approach = detailedPlan.planMetadata?.approach;
  if (approach === 'intensive') return 'intermediate'; // Intensive assumes some background
  if (approach === 'comprehensive') return 'beginner'; // Comprehensive starts from basics
  
  return 'intermediate'; // Default
}

/**
 * Generate enhanced learning path with video content
 */
function generateEnhancedLearningPath(curatedContent, detailedPlan, duration, approach) {
  const skills = Object.keys(curatedContent);
  const weeklySchedule = [];
  
  // Distribute skills across weeks
  const weeksPerSkill = Math.max(1, Math.floor(duration / skills.length));
  const videosPerWeek = approach === 'intensive' ? 2 : approach === 'comprehensive' ? 4 : 3;
  
  let currentWeek = 1;
  
  for (const skill of skills) {
    const skillVideos = curatedContent[skill] || [];
    
    for (let week = 0; week < weeksPerSkill && currentWeek <= duration; week++) {
      const weekVideos = skillVideos.slice(
        week * videosPerWeek,
        (week + 1) * videosPerWeek
      );
      
      if (weekVideos.length > 0) {
        const weekHours = weekVideos.reduce((sum, video) => 
          sum + (video.estimatedCompletionTime || video.duration || 30), 0
        ) / 60;
        
        weeklySchedule.push({
          week: currentWeek,
          skill: skill,
          focus: week === 0 ? `${skill} Fundamentals` : 
                 week === weeksPerSkill - 1 ? `${skill} Advanced Application` : 
                 `${skill} Practical Development`,
          videos: weekVideos.map(video => ({
            id: video.id,
            title: video.title,
            url: video.url,
            duration: Math.round(video.duration),
            estimatedCompletionTime: Math.round(video.estimatedCompletionTime || video.duration * 1.7),
            qualityScore: Math.round(video.qualityScore * 10) / 10,
            overallScore: Math.round(video.overallScore * 10) / 10,
            qualityIndicators: video.qualityIndicators || [],
            channelTitle: video.channelTitle
          })),
          estimatedHours: Math.round(weekHours * 10) / 10,
          milestones: generateWeekMilestones(skill, week, weeksPerSkill),
          completionCriteria: {
            videosToComplete: weekVideos.length,
            minimumWatchPercentage: 75,
            practiceRequired: true
          }
        });
        
        currentWeek++;
      }
    }
  }
  
  return {
    totalWeeks: duration,
    weeklySchedule: weeklySchedule,
    estimatedTotalHours: weeklySchedule.reduce((sum, week) => sum + week.estimatedHours, 0),
    totalVideos: weeklySchedule.reduce((sum, week) => sum + week.videos.length, 0),
    approach: approach
  };
}

/**
 * Generate milestones for a week
 */
function generateWeekMilestones(skill, weekIndex, totalWeeks) {
  if (weekIndex === 0) {
    return [
      `Understand ${skill} fundamentals and core concepts`,
      `Set up ${skill} development environment`,
      `Complete basic ${skill} exercises`
    ];
  } else if (weekIndex === totalWeeks - 1) {
    return [
      `Complete ${skill} capstone project`,
      `Demonstrate ${skill} proficiency`,
      `Prepare ${skill} portfolio piece`
    ];
  } else {
    return [
      `Apply ${skill} in practical scenarios`,
      `Build ${skill} mini-project`,
      `Practice ${skill} best practices`
    ];
  }
}


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Check authentication
  const auth = await authMiddleware(req);
  if (!auth.isAuthenticated) {
    return res.status(auth.status).json({ message: auth.error });
  }

  if (auth.user.userType !== 'applicant') {
    return res.status(403).json({ message: 'Only applicants can generate prep plans' });
  }

  try {
    const { prepPlanId, forceRegenerate = false } = req.body;

    console.log('🎯 Generate detailed plan request:', {
      prepPlanId,
      forceRegenerate,
      userId: auth.user.userId,
      userType: auth.user.userType
    });

    if (!prepPlanId) {
      return res.status(400).json({ message: 'Prep plan ID is required' });
    }

    // Get the database
    const db = await getDatabase();

    // Fetch the prep plan
    const prepPlan = await db.collection('prepPlans').findOne({
      _id: new ObjectId(prepPlanId),
      applicantId: auth.user.userId
    });

    if (!prepPlan) {
      return res.status(404).json({ message: 'Prep plan not found' });
    }

    // Check if detailed plan already exists (unless force regeneration is requested)
    if (!forceRegenerate && prepPlan.detailedPlan && prepPlan.planGenerated) {
      console.log('✅ Detailed plan already exists, returning cached version');
      return res.status(200).json({
        success: true,
        message: 'Detailed prep plan already exists (cached)',
        data: {
          prepPlanId: prepPlanId,
          detailedPlan: prepPlan.detailedPlan,
          cached: true
        }
      });
    }

    // Fetch user profile for personalization
    const userProfile = await db.collection('users').findOne({
      _id: new ObjectId(auth.user.userId)
    });

    console.log('📚 Generating NEW detailed prep plan for:', {
      jobTitle: prepPlan.jobTitle,
      company: prepPlan.companyName,
      userId: auth.user.userId,
      duration: prepPlan.duration || 4,
      hasResumeAnalysis: !!prepPlan.resumeAnalysis,
      source: prepPlan.source
    });

    // Generate the detailed study plan using AI with duration from prep plan
    // Pass resume analysis data if available for personalized gap analysis
    const detailedPlan = await generateDetailedPrepPlan(
      prepPlan,
      userProfile || {},
      prepPlan.duration || 4,
      prepPlan.resumeAnalysis || null // Pass resume analysis for personalization
    );

    // Enhance the plan with curated YouTube content
    console.log('🎥 Enhancing prep plan with curated YouTube content...');
    const enhancedPlan = await enhancePlanWithCuratedContent(detailedPlan, prepPlan);

    // Update the prep plan with the detailed study plan
    const updateResult = await db.collection('prepPlans').updateOne(
      { _id: new ObjectId(prepPlanId) },
      {
        $set: {
          detailedPlan: enhancedPlan,
          planGenerated: true,
          generatedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ message: 'Failed to update prep plan' });
    }

    console.log('✅ Detailed prep plan generated successfully');

    return res.status(200).json({
      success: true,
      message: 'Detailed prep plan generated successfully',
      data: {
        prepPlanId: prepPlanId,
        detailedPlan: enhancedPlan
      }
    });

  } catch (error) {
    console.error('Error generating detailed prep plan:', error);
    return res.status(500).json({
      message: 'Failed to generate detailed prep plan',
      error: error.message
    });
  }
}
