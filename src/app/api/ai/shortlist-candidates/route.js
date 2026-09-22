import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFTextExtractor } from '@/lib/pdfExtractor';
import path from 'path';
import fs from 'fs';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(request) {
  console.log('🎯 AI Candidate Shortlisting API called');
  
  try {
    // Check if Gemini API key is available
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not found in environment variables');
      return NextResponse.json({ 
        success: false, 
        message: 'AI service not configured. Please check environment variables.' 
      }, { status: 500 });
    }
    
    const { authMiddleware } = await import('@/lib/middleware');
    const auth = await authMiddleware(request);
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, message: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }
    const decoded = auth.user;
    if (decoded.userType && decoded.userType !== 'recruiter' && decoded.details?.userType !== 'recruiter') {
      return NextResponse.json({ success: false, message: 'Recruiter access required' }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError);
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid request body. Please check your JSON format.' 
      }, { status: 400 });
    }

    const { jobId, jobTitle, jobDescription, jobRequirements, candidates, weights } = body;

    console.log('📊 Shortlisting request:', {
      jobId,
      jobTitle,
      candidateCount: candidates?.length || 0,
      requirements: jobRequirements?.length || 0,
      bodyKeys: Object.keys(body || {})
    });

    // Validate required fields
    if (!jobId || !jobTitle) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required fields: jobId and jobTitle are required' 
      }, { status: 400 });
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No candidates provided for analysis' 
      }, { status: 400 });
    }

    // Step 0: Extract resume text from PDF files
    console.log('📄 Step 0: Extracting resume text from PDF files...');
    console.log('📋 Input candidates:', candidates.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      resumePath: c.resumePath
    })));
    
    const candidatesWithResumeText = await extractResumeTexts(candidates);
    console.log(`📋 Resume extraction: ${candidatesWithResumeText.filter(c => c.resumeText && c.resumeText.length > 100).length}/${candidates.length} candidates have resume text`);
    console.log('📋 Candidates with resume text:', candidatesWithResumeText.map(c => ({
      id: c.id,
      name: c.name,
      resumeTextLength: c.resumeText?.length || 0,
      resumePreview: c.resumeText?.substring(0, 100) + '...'
    })));

    // Step 1: Fast pre-filtering (JavaScript)
    console.log('⚡ Step 1: Fast pre-filtering candidates...');
    console.log('📊 Candidates received:', candidatesWithResumeText.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      skills: c.skills?.length || 0,
      hasResumeText: !!c.resumeText,
      resumeTextLength: c.resumeText?.length || 0,
      resumePath: c.resumePath
    })));
    
    const preFilteredCandidates = await fastPreFilter(candidatesWithResumeText, jobRequirements, jobTitle, weights);
    console.log(`📋 Pre-filtered: ${preFilteredCandidates.length}/${candidatesWithResumeText.length} candidates`);
    console.log('🎯 Pre-filtered candidates:', preFilteredCandidates.map(c => ({
      name: c.name,
      quickScore: c.quickScore?.total,
      skills: c.skills?.length,
      hasResumeText: !!c.resumeText
    })));

    // Step 2: AI-powered detailed analysis (Gemini)
    console.log('🤖 Step 2: AI analysis with Gemini...');
    const rankedCandidates = await analyzeWithGemini(
      preFilteredCandidates, 
      jobTitle, 
      jobDescription, 
      jobRequirements
    );

    // Step 3: Final ranking and formatting
    console.log('📊 Step 3: Final ranking and formatting...');
    console.log('🎯 Ranked candidates before formatting:', rankedCandidates.map(c => ({
      name: c.name,
      email: c.email,
      aiScore: c.aiScore,
      hasResumeText: !!c.resumeText,
      resumeTextLength: c.resumeText?.length
    })));
    
    const finalResults = formatResults(rankedCandidates, candidatesWithResumeText.length);
    
    console.log('✅ Final formatted results:', finalResults.map(r => ({
      rank: r.rank,
      name: r.name,
      email: r.email,
      score: r.score,
      candidateId: r.candidateId
    })));

    return NextResponse.json({
      success: true,
      data: {
        totalCandidates: candidatesWithResumeText.length,
        analyzedCandidates: preFilteredCandidates.length,
        topCandidates: finalResults.slice(0, 10), // Top 10
        allRanked: finalResults,
        processingTime: new Date().toISOString(),
        jobInfo: {
          jobId,
          jobTitle,
          requirements: jobRequirements
        }
      }
    });

  } catch (error) {
    console.error('❌ Shortlisting error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    });
    
    return NextResponse.json({ 
      success: false, 
      message: `Candidate analysis failed: ${error.message}`, 
      error: {
        type: error.name || 'UnknownError',
        message: error.message || 'An unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }, { status: 500 });
  }
}

// Step 1: Fast JavaScript pre-filtering
async function fastPreFilter(candidates, jobRequirements, jobTitle, weights) {
  const filtered = [];
  
  for (const candidate of candidates) {
    const score = calculateQuickScore(candidate, jobRequirements, jobTitle, weights);
    
    // Always include candidates if we have basic info (lowered threshold for demo)
    // In production, you'd want stricter filtering based on actual resume content
    if (score.total >= 10 || candidate.name) {
      filtered.push({
        ...candidate,
        quickScore: score
      });
    }
  }
  
  // Sort by quick score and take top candidates for AI analysis
  return filtered
    .sort((a, b) => b.quickScore.total - a.quickScore.total)
    .slice(0, 20); // Limit to top 20 for AI analysis
}

// Quick scoring algorithm
function calculateQuickScore(candidate, jobRequirements, jobTitle, weights) {
  const resumeText = candidate.resumeText?.toLowerCase() || '';
  const skills = candidate.skills || [];
  const candidateName = candidate.name || '';
  const w = weights || { skills: 0.35, experience: 0.25, education: 0.15, projects: 0.15, communication: 0.1 };
  
  // Base score for having basic candidate info
  let baseScore = candidateName ? 20 : 0;
  
  // Skills matching
  let skillsScore = 0;
  let matchedSkills = 0;
  
  if (jobRequirements && jobRequirements.length > 0) {
    jobRequirements.forEach(requirement => {
      const reqLower = requirement.toLowerCase();
      const hasSkill = skills.some(skill => 
        skill.toLowerCase().includes(reqLower) || reqLower.includes(skill.toLowerCase())
      ) || resumeText.includes(reqLower);
      
      if (hasSkill) {
        matchedSkills++;
        skillsScore += 100 / jobRequirements.length;
      }
    });
  } else {
    // If no requirements specified, give partial credit for having skills
    skillsScore = skills.length > 0 ? 50 : 20;
  }
  
  // Experience level
  const experienceScore = extractExperienceScore(resumeText, jobTitle);
  
  // Education/Keywords (maps remaining weight dims)
  const keywordScore = calculateKeywordScore(resumeText, jobTitle, jobRequirements);
  const restWeight = (Number(w.education) || 0) + (Number(w.projects) || 0) + (Number(w.communication) || 0);
  
  const total = Math.max(baseScore, Math.round(
    (skillsScore * (Number(w.skills) || 0.35)) + 
    (experienceScore * (Number(w.experience) || 0.25)) + 
    (keywordScore * (restWeight || 0.4))
  ));
  
  return {
    total,
    skills: Math.round(skillsScore),
    experience: experienceScore,
    keywords: keywordScore,
    matchedSkills,
    baseScore
  };
}

// Extract experience score from resume text
function extractExperienceScore(resumeText, jobTitle) {
  const yearMatches = resumeText.match(/(\d+)[\s-]*(?:years?|yrs?)/gi) || [];
  const maxYears = Math.max(...yearMatches.map(match => parseInt(match.match(/\d+/)[0])), 0);
  
  // Role-specific experience expectations
  let expectedYears = 3; // Default
  if (jobTitle.toLowerCase().includes('senior')) expectedYears = 5;
  if (jobTitle.toLowerCase().includes('lead') || jobTitle.toLowerCase().includes('principal')) expectedYears = 7;
  if (jobTitle.toLowerCase().includes('junior') || jobTitle.toLowerCase().includes('entry')) expectedYears = 1;
  
  // Score based on experience match
  if (maxYears >= expectedYears) return 100;
  if (maxYears >= expectedYears * 0.7) return 80;
  if (maxYears >= expectedYears * 0.5) return 60;
  if (maxYears > 0) return 40;
  return 20;
}

// Calculate keyword relevance score
function calculateKeywordScore(resumeText, jobTitle, jobRequirements) {
  const keywords = [
    ...jobTitle.toLowerCase().split(' '),
    ...(jobRequirements || []).map(req => req.toLowerCase())
  ];
  
  let found = 0;
  keywords.forEach(keyword => {
    if (resumeText.includes(keyword)) found++;
  });
  
  return Math.min(100, (found / keywords.length) * 100);
}

// Step 2: AI analysis with Gemini
async function analyzeWithGemini(candidates, jobTitle, jobDescription, jobRequirements) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const results = [];
    
    // Process candidates in batches of 5 for efficiency
    for (let i = 0; i < candidates.length; i += 5) {
      const batch = candidates.slice(i, i + 5);
      
      try {
        console.log(`🔄 Processing batch ${i/5 + 1}/${Math.ceil(candidates.length/5)}`);
        const batchResults = await analyzeBatch(model, batch, jobTitle, jobDescription, jobRequirements);
        results.push(...batchResults);
      } catch (error) {
        console.error(`❌ Batch ${i/5 + 1} failed:`, {
          error: error.message,
          batchSize: batch.length,
          candidateNames: batch.map(c => c.name || 'Anonymous')
        });
        // Add candidates with fallback scores
        batch.forEach(candidate => {
          results.push({
            ...candidate,
            aiScore: candidate.quickScore?.total || 0,
            aiAnalysis: `AI analysis failed: ${error.message}`,
            strengths: ['Quick analysis completed'],
            weaknesses: ['Detailed AI analysis unavailable'],
            recommendation: 'REVIEW_MANUALLY'
          });
        });
      }
    }
    
    return results;
  } catch (initError) {
    console.error('❌ Failed to initialize Gemini model:', initError);
    throw new Error(`AI service initialization failed: ${initError.message}`);
  }
}

// Analyze batch of candidates with Gemini
async function analyzeBatch(model, candidates, jobTitle, jobDescription, jobRequirements) {
  const prompt = `You are an expert HR recruiter and technical interviewer with 10+ years of experience. Analyze these ${candidates.length} candidates for the ${jobTitle} position and provide DETAILED, SPECIFIC scoring and recommendations based on their actual resume content.

JOB DETAILS:
Title: ${jobTitle}
Description: ${jobDescription || 'No detailed description provided'}
Requirements: ${(jobRequirements || []).join(', ') || 'No specific requirements listed'}

CANDIDATES TO ANALYZE:
${candidates.map((candidate, index) => `
=== CANDIDATE ${index + 1} ===
Name: ${candidate.name || 'Anonymous'}
Email: ${candidate.email || 'No email provided'}
Applied: ${candidate.appliedAt || 'Unknown date'}

FULL RESUME CONTENT:
${candidate.resumeText?.substring(0, 2000) || `No detailed resume available. Candidate applied for ${jobTitle} position.`}

DECLARED SKILLS: ${(candidate.skills || []).join(', ') || 'No skills listed'}
RESUME PATH: ${candidate.resumePath || 'Not provided'}
`).join('\n')}

ANALYSIS REQUIREMENTS:
1. Extract SPECIFIC details from resume content (projects, technologies, companies, achievements)
2. Match exact skills mentioned in resume to job requirements
3. Identify quantifiable achievements (numbers, percentages, results)
4. Assess education relevance and recent projects
5. Provide CONCRETE examples from their resume in your analysis

For each candidate, provide a JSON response with this exact structure:

{
  "candidates": [
    {
      "candidateIndex": 1,
      "overallScore": 75,
      "skillsMatch": 80,
      "experienceMatch": 70,
      "projectsScore": 75,
      "strengths": [
        "5+ years experience in React and Node.js (mentioned in ABC Corp project)",
        "Led team of 8 developers on microservices migration (Company XYZ 2022-2024)",
        "Increased performance by 40% using Redis caching (Project Alpha)"
      ],
      "weaknesses": [
        "No Docker/Kubernetes experience mentioned in resume",
        "Missing cloud platform certifications (AWS/Azure)",
        "No recent machine learning projects (last ML work in 2021)"
      ],
      "recommendation": "HIRE",
      "reasoning": "Strong technical background with React, Node.js, and PostgreSQL matching job requirements. Resume shows progression from Junior to Senior roles at reputable companies. Quantifiable achievements include 40% performance improvements and successful team leadership. However, lacks modern DevOps skills.",
      "keySkillsFound": ["React", "Node.js", "PostgreSQL", "Team Leadership", "Performance Optimization"],
      "missingCriticalSkills": ["Docker", "AWS", "Machine Learning"],
      "specificProjects": [
        "E-commerce platform handling 10K+ daily transactions",
        "Microservices migration for 50+ services",
        "Real-time analytics dashboard with 99.9% uptime"
      ],
      "educationMatch": "Computer Science degree from recognized university",
      "experienceProgression": "Junior (2019) → Mid-level (2021) → Senior (2023)",
      "quantifiableAchievements": [
        "40% performance improvement",
        "Led team of 8 developers",
        "Managed $2M+ project budget"
      ]
    }
  ]
}

SCORING GUIDELINES (be specific and reference actual resume content):
- Skills Match (40%): Count exact technology matches, frameworks, programming languages
- Experience Match (35%): Years, company types, role progression, domain experience  
- Projects Quality (25%): Complexity, scale, business impact, technical challenges

RECOMMENDATIONS:
- STRONG_HIRE: 85-100% - Exceptional candidate with strong relevant experience and skills
- HIRE: 70-84% - Good candidate with solid background, worth interviewing
- MAYBE: 50-69% - Some relevant experience but gaps, needs assessment
- REJECT: <50% - Insufficient relevant experience or major skill gaps

CRITICAL: Base ALL analysis on ACTUAL CONTENT from the resume. Quote specific projects, companies, technologies, and achievements. If resume content is limited, be honest about what's missing but extract what you can.

Respond ONLY with valid JSON.`;

  try {
    console.log(`📤 Sending prompt to Gemini for ${candidates.length} candidates`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log(`📥 Received response from Gemini: ${text.substring(0, 200)}...`);
    
    // Clean the response text (remove markdown code blocks if present)
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      const analysis = JSON.parse(cleanText);
      console.log(`✅ Successfully parsed Gemini response`);
      
        // Map AI results back to candidates
        return candidates.map((candidate, index) => {
          const aiResult = analysis.candidates?.find(c => c.candidateIndex === index + 1) || {
            overallScore: candidate.quickScore?.total || 0,
            recommendation: 'REVIEW_MANUALLY',
            reasoning: 'AI analysis parsing failed'
          };
          
          console.log(`🎯 Mapping candidate ${index + 1}:`, {
            originalId: candidate.id,
            originalName: candidate.name,
            aiResult: {
              candidateIndex: aiResult.candidateIndex,
              overallScore: aiResult.overallScore,
              recommendation: aiResult.recommendation
            }
          });
          
          return {
            ...candidate, // Preserve all original candidate data
            aiScore: aiResult.overallScore,
            skillsMatch: aiResult.skillsMatch || 0,
            experienceMatch: aiResult.experienceMatch || 0,
            projectsScore: aiResult.projectsScore || 0,
            strengths: aiResult.strengths || [],
            weaknesses: aiResult.weaknesses || [],
            recommendation: aiResult.recommendation || 'REVIEW_MANUALLY',
            reasoning: aiResult.reasoning || 'No detailed analysis available',
            keySkillsFound: aiResult.keySkillsFound || [],
            missingCriticalSkills: aiResult.missingCriticalSkills || [],
            specificProjects: aiResult.specificProjects || [],
            educationMatch: aiResult.educationMatch || '',
            experienceProgression: aiResult.experienceProgression || '',
            quantifiableAchievements: aiResult.quantifiableAchievements || []
          };
        });    } catch (parseError) {
      console.error('❌ Failed to parse Gemini response:', {
        error: parseError.message,
        responseLength: text.length,
        responsePreview: text.substring(0, 500)
      });
      
      // Fallback to quick scores
      return candidates.map(candidate => ({
        ...candidate,
        aiScore: candidate.quickScore?.total || 0,
        recommendation: candidate.quickScore?.total >= 70 ? 'HIRE' : 'MAYBE',
        reasoning: `AI parsing failed: ${parseError.message}. Using quick score analysis.`
      }));
    }
  } catch (apiError) {
    console.error('❌ Gemini API call failed:', {
      error: apiError.message,
      code: apiError.code,
      status: apiError.status
    });
    throw new Error(`Gemini API failed: ${apiError.message}`);
  }
}

// Step 3: Format final results
function formatResults(rankedCandidates, totalCandidates) {
  console.log('🏁 Formatting results for candidates:', rankedCandidates.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    aiScore: c.aiScore
  })));
  
  return rankedCandidates
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
    .map((candidate, index) => ({
      rank: index + 1,
      candidateId: candidate.id || candidate._id,
      name: candidate.name || 'Unknown Candidate', // Use the actual candidate name
      email: candidate.email || 'No email provided', // Use the actual candidate email
      score: candidate.aiScore || candidate.quickScore?.total || 0,
      recommendation: candidate.recommendation || 'REVIEW_MANUALLY',
      
      // Detailed scores
      breakdown: {
        skills: candidate.skillsMatch || candidate.quickScore?.skills || 0,
        experience: candidate.experienceMatch || candidate.quickScore?.experience || 0,
        projects: candidate.projectsScore || 0,
        overall: candidate.aiScore || candidate.quickScore?.total || 0
      },
      
      // Key insights
      strengths: candidate.strengths || [],
      weaknesses: candidate.weaknesses || [],
      keySkillsFound: candidate.keySkillsFound || [],
      missingCriticalSkills: candidate.missingCriticalSkills || [],
      specificProjects: candidate.specificProjects || [],
      educationMatch: candidate.educationMatch || '',
      experienceProgression: candidate.experienceProgression || '',
      quantifiableAchievements: candidate.quantifiableAchievements || [],
      
      // Analysis
      reasoning: candidate.reasoning || 'Quick analysis completed',
      
      // Metadata
      processedWith: candidate.aiScore ? 'AI' : 'QuickScore',
      appliedAt: candidate.appliedAt || candidate.createdAt,
      resumePath: candidate.resumePath,
      
      // Debug info to track data flow
      debug: {
        originalId: candidate.id,
        originalName: candidate.name,
        originalEmail: candidate.email,
        hasAiScore: !!candidate.aiScore,
        resumeTextLength: candidate.resumeText?.length || 0
      }
    }));
}

// Step 0: Extract resume text from PDF files
async function extractResumeTexts(candidates) {
  const candidatesWithText = [];
  
  for (const candidate of candidates) {
    let resumeText = candidate.resumeText || '';
    
    console.log(`🔍 Processing candidate: ${candidate.name}`);
    console.log(`📄 Resume path: ${candidate.resumePath}`);
    console.log(`📝 Initial resume text length: ${resumeText.length}`);
    
    // If we have a resume path and no substantial resume text, try to extract it
    if (candidate.resumePath && (!resumeText || resumeText.length < 100)) {
      try {
        // Convert relative path to absolute path
        const resumePath = candidate.resumePath.startsWith('/') 
          ? path.join(process.cwd(), 'public', candidate.resumePath)
          : path.join(process.cwd(), candidate.resumePath);
        
        console.log(`📄 Extracting text from: ${candidate.resumePath} -> ${resumePath}`);
        
        // Check if file exists
        if (!fs.existsSync(resumePath)) {
          throw new Error(`Resume file not found at: ${resumePath}`);
        }
        
        const extractedText = await PDFTextExtractor.extractFromFile(resumePath);
        resumeText = extractedText;
        
        console.log(`✅ Extracted ${extractedText.length} characters for ${candidate.name}`);
        console.log(`📝 First 200 characters: ${extractedText.substring(0, 200)}...`);
        
      } catch (error) {
        console.error(`❌ Failed to extract resume for ${candidate.name}:`, error.message);
        // Fallback to basic info
        resumeText = `${candidate.name} - Applied for position. Email: ${candidate.email || 'N/A'}. Skills: ${(candidate.skills || []).join(', ')}`;
      }
    } else {
      console.log(`ℹ️ Using existing resume text or no path available for ${candidate.name}`);
    }
    
    candidatesWithText.push({
      ...candidate,
      resumeText: resumeText || `${candidate.name} - Basic application information only`
    });
  }
  
  return candidatesWithText;
}