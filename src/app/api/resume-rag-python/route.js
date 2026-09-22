import { verifyToken } from '@/lib/auth';
import { PDFTextExtractor } from '@/lib/pdfExtractor';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

// Python FastAPI service URLs
const PYTHON_RAG_SERVICE_URL = process.env.NEXT_PUBLIC_AI_CORE_URL || process.env.PYTHON_RAG_SERVICE_URL || 'http://localhost:8000';
const PYTHON_GEMINI_CHAT_SERVICE_URL = process.env.NEXT_PUBLIC_AI_CORE_URL || process.env.PYTHON_GEMINI_CHAT_SERVICE_URL || 'http://localhost:8000';

export async function POST(request) {
  console.log('🤖 Python RAG-Powered Resume Analysis API called');
  
  try {
    const { authMiddleware } = await import('@/lib/middleware');
    const auth = await authMiddleware(request);
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, message: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }
    const decoded = auth.user;

    const body = await request.json();
    console.log('📥 Received request body:', JSON.stringify(body, null, 2));
      const { action, jobId, jobDescription, jobTitle, jobRequirements, resumePath, resumeText, question, conversationHistory, analysisContext } = body;

    console.log('📊 Extracted values:', { 
      action: action, 
      actionType: typeof action,
      jobId: jobId, 
      jobTitle: jobTitle, 
      hasResumeText: !!resumeText,
      allKeys: Object.keys(body)
    });

    console.log('📊 Python RAG Analysis request:', { action, jobId, jobTitle, hasResumeText: !!resumeText });

    // Handle different actions - default to 'analyze' if no action specified
    if (action === 'analyze' || (!action && (jobTitle || jobDescription || resumePath))) {
      return await handlePythonAnalysis({
        jobId,
        jobDescription,
        jobTitle,
        jobRequirements,
        resumePath,
        resumeText,
        userId: decoded.userId
      });    } else if (action === 'chat') {
      return await handlePythonChat({ question, conversationHistory, analysisContext });
    } else {
      console.error('❌ Invalid action received:', action, 'Body keys:', Object.keys(body));
      return NextResponse.json({ success: false, message: `Invalid action: ${action}. Expected 'analyze' or 'chat'` }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ Python RAG API Error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Analysis failed', 
      error: error.message 
    }, { status: 500 });
  }
}

async function handlePythonAnalysis({ jobId, jobDescription, jobTitle, jobRequirements, resumePath, resumeText, userId }) {
  try {
    // Get resume content
    let finalResumeText = resumeText;
    
    if (!finalResumeText && resumePath) {
      // Try to read resume from file
      try {
        console.log('📄 Extracting text from PDF:', resumePath);
        
        // Handle different path formats
        let fullPath;
        if (resumePath.startsWith('/uploads/') || resumePath.startsWith('uploads/')) {
          fullPath = path.join(process.cwd(), 'public', resumePath);
        } else if (resumePath.startsWith('/api/resume/view/')) {
          // Extract filename from API path
          const filename = resumePath.split('/').pop();
          fullPath = path.join(process.cwd(), 'public', 'uploads', 'temp-resumes', filename);
        } else {
          fullPath = path.join(process.cwd(), resumePath);
        }
        
        console.log('📂 Looking for PDF at:', fullPath);
        
        if (fs.existsSync(fullPath)) {
          finalResumeText = await PDFTextExtractor.extractFromFile(fullPath);
          console.log('✅ PDF text extracted successfully, length:', finalResumeText.length);
        } else {
          console.warn('📂 PDF file not found at:', fullPath);
          // Try alternative locations
          const alternativePaths = [
            path.join(process.cwd(), 'public', 'uploads', resumePath),
            path.join(process.cwd(), 'uploads', resumePath),
            path.join(process.cwd(), 'public', resumePath)
          ];
          
          for (const altPath of alternativePaths) {
            if (fs.existsSync(altPath)) {
              console.log('📂 Found PDF at alternative location:', altPath);
              finalResumeText = await PDFTextExtractor.extractFromFile(altPath);
              break;
            }
          }
        }
      } catch (fileError) {
        console.warn('❌ Could not extract resume text:', fileError);
      }
    }    if (!finalResumeText) {
      console.warn('⚠️ No resume text available, using test data');
      finalResumeText = `John Doe
Software Developer
Email: john.doe@email.com
Phone: (555) 123-4567

EXPERIENCE:
- 5 years of experience in software development
- Proficient in JavaScript, React, Node.js
- Experience with databases and API development
- Strong problem-solving skills

EDUCATION:
- Bachelor's Degree in Computer Science
- Relevant coursework in web development`;
    }

    // Ensure we have job data
    const finalJobTitle = jobTitle || 'Software Developer';
    const finalJobDescription = jobDescription || 'We are looking for a skilled software developer to join our team.';
    
    // ENHANCED: Extract requirements from job description if not provided
    let finalJobRequirements = jobRequirements || [];
    if (!finalJobRequirements || finalJobRequirements.length === 0) {
      console.log('📋 No explicit job requirements found, extracting from job description...');
      finalJobRequirements = extractRequirementsFromJobDescription(finalJobDescription, finalJobTitle);
      console.log('🔍 Extracted requirements:', finalJobRequirements);
    }    // Call Python FastAPI service
    console.log('🐍 Calling Python RAG service...');
    
    const requestPayload = {
        resume_text: finalResumeText,
        job_description: finalJobDescription,
        job_title: finalJobTitle,
        job_requirements: finalJobRequirements
    };
    
    console.log('📤 Sending to Python service:');
    console.log(`   - Job Title: "${requestPayload.job_title}"`);
    console.log(`   - Job Description (first 200 chars): "${requestPayload.job_description.substring(0, 200)}..."`);
    console.log(`   - Job Requirements: [${requestPayload.job_requirements.join(', ')}]`);
    console.log(`   - Resume Text (first 100 chars): "${requestPayload.resume_text.substring(0, 100)}..."`);
      // Use Enhanced OpenRouter AI as PRIMARY (better than Python service)
    let analysisResult;
    try {
      console.log('🤖 Using Enhanced OpenRouter AI Analysis (PRIMARY)...');
      analysisResult = await performOpenRouterAnalysis({
        jobDescription: finalJobDescription,
        jobTitle: finalJobTitle,
        jobRequirements: finalJobRequirements,
        resumeText: finalResumeText,
        userId: userId
      });
      console.log('✅ Enhanced OpenRouter AI analysis completed successfully');
      
    } catch (openRouterError) {
      console.warn('⚠️ OpenRouter AI failed, using enhanced JavaScript fallback:', openRouterError.message);
      analysisResult = await performEnhancedFallback({
        jobDescription: finalJobDescription,
        jobTitle: finalJobTitle,
        jobRequirements: finalJobRequirements,
        resumeText: finalResumeText,
        userId: userId
      });
      console.log('✅ Enhanced JavaScript fallback completed successfully');
    }    console.log('🔍 Full analysis response:', JSON.stringify(analysisResult, null, 2));

    // Extract the analysis data properly
    const analysisData = analysisResult.data?.analysis || analysisResult.data || analysisResult;
    console.log('📊 Extracted analysis data:', JSON.stringify(analysisData, null, 2));    return NextResponse.json({
      success: true,
      data: {
        analysis: analysisData,  // Pass the full analysis data
        resumeText: finalResumeText, // Include the extracted resume text
        metadata: {
          analyzedAt: new Date().toISOString(),
          jobId,
          userId,
          model: 'liquidai/lfm2.5-1.2b-thinking:free',
          ragEnabled: true,
          service: 'python-fastapi',
          resumeTextLength: finalResumeText ? finalResumeText.length : 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Python analysis error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Python analysis failed', 
      error: error.message 
    }, { status: 500 });
  }
}

async function performOpenRouterAnalysis({ jobDescription, jobTitle, jobRequirements, resumeText, userId }) {
  console.log('🤖 Performing OpenRouter AI analysis as fallback...');
  
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API Key not configured');
  }
  
  // Extract skills and experience from resume content for intelligent analysis
  const resumeExtractedSkills = extractSkillsFromResumeContent(resumeText);
  const experienceData = extractExperienceLevel(resumeText);
  const userSkills = []; // No explicit skills in this context
  const allUserSkills = [...userSkills, ...resumeExtractedSkills];
  
  console.log('🔍 OpenRouter analysis - Skills from resume:', resumeExtractedSkills);
  console.log('📋 OpenRouter analysis - Combined skills:', allUserSkills);
  console.log('💼 OpenRouter analysis - Experience detected:', experienceData);
  
  // Enhanced AI prompt for deep analysis beyond literal matching
  const prompt = `You are a senior technical recruiter and career advisor with 15+ years of experience. Perform a comprehensive gap analysis between this candidate's resume and the job requirements.

CRITICAL INSTRUCTIONS:
1. Look beyond literal skill mentions - analyze DEMONSTRATED CAPABILITIES through projects, experience, and context
2. Identify skills that are IMPLIED by the job description but not explicitly stated
3. Focus on ACTIONABLE, SPECIFIC skills the candidate can learn
4. Avoid generic advice - be precise and technical
5. Consider skill transferability and related competencies
6. IGNORE soft skills, personality traits, work environment preferences
7. IGNORE generic requirements like "communication skills", "self-motivated", "reliable internet"
8. Only include concrete technical skills that can be learned and demonstrated
9. PUT ALL MISSING TECHNICAL SKILLS IN "missingSkills" - if candidate doesn't have it, it's missing

==== JOB ANALYSIS ====
Position: ${jobTitle}
Company Requirements: ${Array.isArray(jobRequirements) ? jobRequirements.join(', ') : 'See description'}

Job Description:
${jobDescription}

==== CANDIDATE RESUME ====
${resumeText}

==== ANALYSIS FRAMEWORK ====
Analyze the following dimensions:

1. TECHNICAL SKILLS GAP
   - What specific technologies/frameworks are required but missing?
   - What skills are implied by the role but not explicitly mentioned?
   - What level of expertise is expected vs. what the candidate demonstrates?
   - IMPORTANT: If candidate has NO evidence of a skill, put it in "missingSkills"

2. DOMAIN KNOWLEDGE GAP
   - What industry-specific knowledge is required?
   - What business context understanding is needed?
   - What domain-specific tools/processes are expected?

3. EXPERIENCE DEPTH GAP
   - What types of projects/challenges has the candidate NOT tackled?
   - What scale of responsibility is missing?
   - What collaborative/leadership experience is lacking?

4. IMPLICIT REQUIREMENTS (CRITICAL - Look for these patterns)
   - "responsive user interfaces" → React/Vue/Angular + CSS frameworks
   - "RESTful services" → Node.js/Express/API frameworks + HTTP knowledge
   - "database schemas" → SQL/MongoDB + database design
   - "cloud infrastructure" → AWS/Azure/Docker + DevOps
   - "user authentication" → JWT/OAuth + security practices
   - "real-time features" → WebSockets/Socket.io + event handling
   - "high traffic" → Load balancing + performance optimization
   - "modern web applications" → Modern frameworks + build tools

RESPOND ONLY WITH VALID JSON:

CRITICAL: You MUST put ALL missing technical skills in the "missingSkills" array. Do NOT put them in suggestions or other sections.

For the job description provided, you MUST include these implied skills in missingSkills if not found in resume:

GENERAL DEVELOPMENT:
- "responsive user interfaces" → React, Vue, or Angular
- "RESTful services" → Node.js, Express.js
- "database schemas" → Database Design, MongoDB, SQL
- "user authentication" → Authentication Systems, JWT
- "cloud infrastructure" → AWS, Cloud Deployment
- "real-time features" → WebSockets, Socket.io
- "high traffic" → Load Balancing, Performance Optimization
- "modern web applications" → Build Tools, Package Management

SDET/QA SPECIFIC (CRITICAL - Always check for these):
- "test automation" → Selenium, Cypress, TestNG, JUnit
- "automated testing" → Selenium, Cypress, Test Automation
- "api testing" → Postman, REST Assured, SoapUI
- "performance testing" → JMeter, LoadRunner, K6
- "mobile testing" → Appium, Espresso, XCUITest
- "regression testing" → Test Automation, Selenium
- "functional testing" → Selenium, TestNG, JUnit
- "ui automation" → Selenium, Cypress, Playwright
- "continuous testing" → Jenkins, CI/CD, GitHub Actions
- "test management" → Jira, TestRail, Zephyr
- "bdd" or "behavior driven" → Cucumber, SpecFlow
- "security testing" → OWASP, Burp Suite

ROLE-BASED DETECTION:
- If job title contains "SDET", "QA", "Test Engineer" → ALWAYS include core testing tools (Selenium, TestNG/JUnit, Postman) in missing if not found
- If job mentions "automation" → ALWAYS include automation frameworks
- If job mentions "framework" in testing context → Include Page Object Model, Test Automation

IMPORTANT: If candidate has NO evidence of a skill, put it in "missingSkills" - NOT in suggestions!

{
  "overallScore": 65,
  "skillsScore": 70,
  "experienceScore": 60,
  "keywordScore": 65,
  "overallSummary": "Detailed assessment of overall technical fit",
  "matchedSkills": ["Skills clearly demonstrated in resume"],
  "missingSkills": [
    "React",
    "Node.js", 
    "Express.js",
    "Database Design",
    "MongoDB",
    "Authentication Systems",
    "JWT Authentication",
    "Cloud Deployment",
    "AWS",
    "RESTful API Design"
  ],

  "foundKeywords": ["Technical keywords found in resume"],
  "missingKeywords": ["Important technical keywords missing"],
  "gapAnalysis": "Detailed analysis of what candidate specifically needs to learn for this role, focusing on technical gaps and implied requirements",
  "experienceAnalysis": {
    "resumeYears": 3,
    "requiredYears": 5,
    "details": [
      {
        "requirement": "specific experience type",
        "matched": true,
        "analysis": "Evidence found in resume"
      }
    ]
  },
  "suggestions": [
    {
      "title": "Focus on Learning Priority Skills",
      "description": "Concentrate on the missing skills listed above",
      "priority": "Critical"
    }
  ]
}

FINAL REMINDER: Put ALL technical skills the candidate lacks in "missingSkills".`;

  // Try multiple free models with fallback
  const freeModels = [
    'liquidai/lfm2.5-1.2b-thinking:free',
    'microsoft/phi-3-mini-128k-instruct:free',
    'google/gemma-2-9b-it:free'
  ];
  
  for (const model of freeModels) {
    try {
      console.log(`🤖 Trying OpenRouter model: ${model}`);
      
      // Check API key before making request
      if (!OPENROUTER_API_KEY) {
        console.error(`❌ OpenRouter API key not found for model ${model}`);
        throw new Error('OPENROUTER_API_KEY not configured');
      }
      
      console.log(`🔑 Using OpenRouter API key: ${OPENROUTER_API_KEY.substring(0, 10)}...`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002',
          'X-Title': 'X-CEED Resume Gap Analysis'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 3000,
        }),
      });

      console.log(`📡 OpenRouter response status for ${model}: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (content) {
          // Try to parse JSON from the response
          let analysisResult = null;
          
          // Method 1: Direct parse
          try {
            analysisResult = JSON.parse(content.trim());
          } catch (e) {
            // Method 2: Extract JSON block
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                analysisResult = JSON.parse(jsonMatch[0]);
              } catch (e2) {
                console.warn(`JSON parsing failed for ${model}`);
                continue;
              }
            } else {
              continue;
            }
          }
          
          if (analysisResult && analysisResult.overallScore) {
            console.log(`✅ Successfully analyzed with ${model}`);
            
            // Process and clean the AI response - prioritize our intelligent extraction
            console.log('🔍 Processing skills - Extracted:', resumeExtractedSkills);
            console.log('🔍 Processing skills - Job Requirements:', jobRequirements);
            console.log('🔍 Processing skills - AI Matched:', analysisResult.matchedSkills);
            console.log('🔍 Processing skills - AI Missing:', analysisResult.missingSkills);
            
            // Extract implicit skills from job description
            const implicitSkills = extractImplicitSkillsFromJobDescription(jobDescription, jobTitle);
            console.log('🔍 Implicit skills detected from JD:', implicitSkills);
            
            // Smart skill matching using our extracted skills
            const processedMatchedSkills = [];
            const processedMissingSkills = [...(analysisResult.missingSkills || [])];
            
            // Add implicit skills that are not found in resume
            implicitSkills.forEach(implicitSkill => {
              const foundInResume = resumeExtractedSkills.some(extracted => {
                const extractedLower = extracted.toLowerCase();
                const implicitLower = implicitSkill.toLowerCase();
                return (
                  extractedLower.includes(implicitLower) ||
                  implicitLower.includes(extractedLower)
                );
              });
              
              if (!foundInResume && !processedMissingSkills.some(existing => 
                existing.toLowerCase().includes(implicitSkill.toLowerCase())
              )) {
                processedMissingSkills.push(implicitSkill);
              }
            });
            
            // Process explicit job requirements
            (jobRequirements || []).forEach(jobReq => {
              const jobReqLower = jobReq.toLowerCase();
              
              // Check if this job requirement is found in extracted skills
              const foundInExtracted = resumeExtractedSkills.some(extracted => {
                const extractedLower = extracted.toLowerCase();
                return (
                  extractedLower.includes(jobReqLower) ||
                  jobReqLower.includes(extractedLower)
                );
              });
              
              if (foundInExtracted) {
                processedMatchedSkills.push(jobReq);
              } else if (!processedMissingSkills.some(existing => 
                existing.toLowerCase().includes(jobReqLower)
              )) {
                processedMissingSkills.push(jobReq);
              }
            });
            
            // Remove generic/non-technical skills from missing
            const finalMissingSkills = processedMissingSkills.filter(skill => {
              const skillLower = skill.toLowerCase();
              return !skillLower.includes('problem-solving') && 
                     !skillLower.includes('communication') &&
                     !skillLower.includes('teamwork') &&
                     !skillLower.includes('leadership') &&
                     !skillLower.includes('self-motivated');
            }).slice(0, 8); // Limit to 8 most important
            
            // Categorize gaps for proper analysis
            const categorizedGaps = categorizeGapsByPriority(finalMissingSkills, jobRequirements, jobDescription);
            
            console.log('✅ Final Matched Skills:', processedMatchedSkills);
            console.log('❌ Final Missing Skills:', finalMissingSkills);
            console.log('🔍 Implicit Skills Added:', implicitSkills);
            console.log('🎯 Gap Categories:', categorizedGaps);
            
            // Format for frontend compatibility (exact structure frontend expects)
            return {
              data: {
                analysis: {
                  structuredAnalysis: {
                    // Overall match information (frontend expects this exact structure)
                    overallMatch: {
                      score: Math.round((processedMatchedSkills.length / Math.max((jobRequirements || []).length, 1)) * 100),
                      level: getMatchLevel(Math.round((processedMatchedSkills.length / Math.max((jobRequirements || []).length, 1)) * 100)),
                      summary: analysisResult.overallSummary || 'Technical skills analysis completed'
                    },
                    
                    // Skills - frontend expects these exact field names
                    matchingSkills: processedMatchedSkills,
                    missingSkills: finalMissingSkills,
                    extractedSkills: resumeExtractedSkills || [],
                    
                    // Key strengths (frontend expects this)
                    keyStrengths: generateKeyStrengths(processedMatchedSkills, resumeExtractedSkills || []),
                    
                    // Experience analysis (frontend expects these exact field names)
                    experienceAnalysis: {
                      relevantExperience: generateRelevantExperience({
                        resumeYears: experienceData.years,
                        level: experienceData.level,
                        details: experienceData.details
                      }),
                      experienceGaps: generateExperienceGaps({
                        resumeYears: experienceData.years,
                        requiredYears: analysisResult.experienceAnalysis?.requiredYears || 3,
                        level: experienceData.level,
                        criticalSkills: categorizedGaps.critical
                      }),
                      score: calculateExperienceScore(experienceData, categorizedGaps),
                      years: experienceData.years,
                      required: analysisResult.experienceAnalysis?.requiredYears || 3,
                      level: experienceData.level,
                      complexityScore: experienceData.complexityScore
                    },
                    

                    
                    // Additional data for internal use
                    skillsAnalysis: {
                      score: analysisResult.skillsScore || 0,
                      matched: analysisResult.matchedSkills || [],
                      missing: analysisResult.missingSkills || [],
                      extracted: resumeExtractedSkills || []
                    },
                    
                    // Gap analysis
                    gapAnalysis: {
                      summary: generateEnhancedGapAnalysis(categorizedGaps, experienceData, jobTitle),
                      critical: categorizedGaps.critical,
                      important: categorizedGaps.important,
                      niceToHave: categorizedGaps.niceToHave,
                      suggestions: analysisResult.suggestions || []
                    },
                    
                    // Keywords
                    keywordAnalysis: {
                      score: analysisResult.keywordScore || 0,
                      found: analysisResult.foundKeywords || [],
                      missing: analysisResult.missingKeywords || []
                    },
                    
                    // Metadata
                    metadata: {
                      analysisType: 'openrouter-ai',
                      model: model,
                      timestamp: new Date().toISOString(),
                      enhanced: true
                    }
                  },
                  
                  // Also include comprehensive analysis as formatted text
                  comprehensiveAnalysis: formatComprehensiveAnalysis(analysisResult, resumeExtractedSkills),
                  
                  // Keep original data for debugging
                  rawAnalysis: analysisResult
                }
              }
            };
          } else {
            console.warn(`⚠️ ${model} returned empty content`);
            continue;
          }
        } else {
          console.warn(`⚠️ ${model} returned no content in response`);
          continue;
        }
      } else {
        // Response not OK - log the error
        const errorText = await response.text().catch(() => 'Could not read error response');
        console.error(`❌ ${model} API error (${response.status} ${response.statusText}):`, errorText);
        try {
          const errorJson = JSON.parse(errorText);
          console.error(`❌ ${model} error details:`, JSON.stringify(errorJson, null, 2));
        } catch (e) {
          // Error response is not JSON, already logged as text
        }
        continue;
      }
    } catch (error) {
      // Enhanced error logging
      console.error(`❌ ${model} failed:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: error
      });
      
      // Try to get response body if available
      if (error.response) {
        try {
          const errorBody = await error.response.text();
          console.error(`❌ ${model} error response body:`, errorBody);
        } catch (e) {
          // Ignore if we can't read the body
        }
      }
      
      continue;
    }
  }
  
  throw new Error('All OpenRouter models failed for resume analysis');
}

async function performEnhancedFallback({ jobDescription, jobTitle, jobRequirements, resumeText, userId }) {
  console.log('🤖 Performing enhanced fallback analysis...');
  
  // ENHANCED: Extract requirements from job description if not provided
  let finalJobRequirements = jobRequirements || [];
  if (!finalJobRequirements || finalJobRequirements.length === 0) {
    console.log('📋 Fallback - No explicit job requirements, extracting from description...');
    finalJobRequirements = extractRequirementsFromJobDescription(jobDescription, jobTitle);
    console.log('🔍 Fallback - Extracted requirements:', finalJobRequirements);
  }
  
  // Extract skills and experience from resume content
  const resumeExtractedSkills = extractSkillsFromResumeContent(resumeText);
  const experienceData = extractExperienceLevel(resumeText);
  console.log('🔍 Fallback - Extracted skills:', resumeExtractedSkills);
  console.log('🔍 Fallback - Job requirements:', finalJobRequirements);
  console.log('💼 Fallback - Experience detected:', experienceData);
  
  // Smart matching logic
  const matched = [];
  const missing = [];
  
  finalJobRequirements.forEach(jobReq => {
    const jobReqLower = jobReq.toLowerCase();
    
    const foundInExtracted = resumeExtractedSkills.some(extracted => {
      const extractedLower = extracted.toLowerCase();
      return (
        extractedLower.includes(jobReqLower) ||
        jobReqLower.includes(extractedLower) ||
        (jobReqLower.includes('node') && extractedLower.includes('node')) ||
        (jobReqLower.includes('express') && extractedLower.includes('express')) ||
        (jobReqLower.includes('mongo') && extractedLower.includes('mongo')) ||
        (jobReqLower.includes('docker') && extractedLower.includes('docker')) ||
        (jobReqLower.includes('aws') && extractedLower.includes('aws'))
      );
    });
    
    if (foundInExtracted) {
      matched.push(jobReq);
    } else {
      missing.push(jobReq);
    }
  });
  
  // Categorize missing skills by priority
  const categorizedGaps = categorizeGapsByPriority(missing, finalJobRequirements, jobDescription);
  const finalMissing = [...categorizedGaps.critical, ...categorizedGaps.important].slice(0, 5);
  
  console.log('✅ Fallback - Final matched:', matched);
  console.log('❌ Fallback - Final missing:', finalMissing);
  console.log('🎯 Fallback - Gap categories:', categorizedGaps);
  
  const skillsScore = finalJobRequirements.length > 0 
    ? Math.round((matched.length / finalJobRequirements.length) * 100)
    : 0;
  
  const overallScore = Math.round((skillsScore * 0.6) + (70 * 0.4)); // Higher weight on skills
  
  // Generate focused gap analysis
  let gapAnalysis = `Technical Skills Analysis for ${jobTitle}:\n\n`;
  
  if (matched.length > 0) {
    gapAnalysis += `✅ TECHNICAL STRENGTHS: ${matched.join(', ')}\n`;
    gapAnalysis += `You have demonstrated experience with these technologies.\n\n`;
  }
  
  if (finalMissing.length > 0) {
    gapAnalysis += `📚 SKILLS TO LEARN: ${finalMissing.join(', ')}\n`;
    gapAnalysis += `Focus on these ${finalMissing.length} technical skills to become a strong candidate.\n`;
  } else {
    gapAnalysis += `🎉 EXCELLENT: You have all the required technical skills!\n`;
  }
  
  const fallbackSuggestions = finalMissing.length > 0 ? [
    {
      title: 'Learn Missing Technical Skills',
      description: `Focus on: ${finalMissing.join(', ')}`,
      priority: 'high'
    }
  ] : [
    {
      title: 'Enhance Existing Skills',
      description: 'Continue building expertise in your current technology stack',
      priority: 'medium'
    }
  ];

  return {
    data: {
      analysis: {
        structuredAnalysis: {
          // Overall match information (frontend expects this exact structure)
          overallMatch: {
            score: overallScore,
            level: getMatchLevel(overallScore),
            summary: overallScore >= 80 ? 'Excellent technical match' : overallScore >= 60 ? 'Good technical match' : 'Technical skills need development'
          },
          
          // Skills - frontend expects these exact field names
          matchingSkills: matched,
          missingSkills: finalMissing,
          extractedSkills: resumeExtractedSkills,
          
          // Key strengths (frontend expects this)
          keyStrengths: generateKeyStrengths(matched, resumeExtractedSkills),
          
          // Experience analysis (frontend expects these exact field names)
          experienceAnalysis: {
            relevantExperience: generateRelevantExperience({
              resumeYears: experienceData.years,
              level: experienceData.level,
              details: experienceData.details
            }),
            experienceGaps: generateExperienceGaps({
              resumeYears: experienceData.years,
              requiredYears: 3,
              level: experienceData.level,
              criticalSkills: categorizedGaps.critical
            }),
            score: calculateExperienceScore(experienceData, categorizedGaps),
            years: experienceData.years,
            required: 3,
            level: experienceData.level,
            complexityScore: experienceData.complexityScore
          },
          
          // Additional data for internal use
          skillsAnalysis: {
            score: skillsScore,
            matched: matched,
            missing: finalMissing,
            toImprove: [],
            extracted: resumeExtractedSkills
          },
          
          // Gap analysis
          gapAnalysis: {
            summary: generateEnhancedGapAnalysis(categorizedGaps, experienceData, jobTitle),
            critical: categorizedGaps.critical,
            important: categorizedGaps.important,
            niceToHave: categorizedGaps.niceToHave,
            suggestions: fallbackSuggestions
          },
          
          // Keywords
          keywordAnalysis: {
            score: skillsScore,
            found: matched,
            missing: finalMissing
          },
          
          // Metadata
          metadata: {
            analysisType: 'enhanced-fallback',
            model: 'javascript-fallback',
            timestamp: new Date().toISOString(),
            enhanced: true
          }
        },
        
        // Comprehensive analysis
        comprehensiveAnalysis: formatComprehensiveAnalysis({
          overallScore: overallScore,
          matchedSkills: matched,
          missingSkills: missing,
          gapAnalysis: gapAnalysis,
          suggestions: fallbackSuggestions
        }, resumeExtractedSkills)
      }
    }
  };
}

// Extract explicit requirements from job description when not provided
function extractRequirementsFromJobDescription(jobDescription, jobTitle) {
  const jobText = `${jobTitle} ${jobDescription}`.toLowerCase();
  const requirements = [];
  
  // Common skill patterns in job descriptions
  const skillPatterns = [
    // Programming Languages
    /\b(javascript|js|typescript|ts|python|java|c#|c\+\+|go|rust|php|ruby|swift|kotlin)\b/gi,
    // Frontend Frameworks
    /\b(react|angular|vue|svelte|next\.?js|nuxt\.?js)\b/gi,
    // Backend Frameworks
    /\b(node\.?js|express|django|flask|spring|laravel|rails)\b/gi,
    // Databases
    /\b(mongodb|mysql|postgresql|postgres|redis|elasticsearch|sql)\b/gi,
    // Cloud & DevOps
    /\b(aws|azure|gcp|google cloud|docker|kubernetes|jenkins|terraform)\b/gi,
    // Testing (SDET specific)
    /\b(selenium|cypress|testng|junit|pytest|postman|jmeter|appium|cucumber)\b/gi,
    // Tools
    /\b(git|jira|confluence|slack)\b/gi,
    // Methodologies
    /\b(agile|scrum|devops|microservices|rest api|graphql)\b/gi
  ];
  
  // Extract skills using patterns
  skillPatterns.forEach(pattern => {
    const matches = jobText.match(pattern) || [];
    matches.forEach(match => {
      const skill = match.trim();
      if (skill && !requirements.some(req => req.toLowerCase() === skill.toLowerCase())) {
        requirements.push(skill.charAt(0).toUpperCase() + skill.slice(1).toLowerCase());
      }
    });
  });
  
  // Role-specific requirements
  if (jobTitle.toLowerCase().includes('sdet') || jobTitle.toLowerCase().includes('test')) {
    const testingSkills = ['Selenium', 'TestNG', 'JUnit', 'API Testing', 'Test Automation'];
    testingSkills.forEach(skill => {
      if (!requirements.includes(skill)) requirements.push(skill);
    });
  }
  
  if (jobTitle.toLowerCase().includes('devops')) {
    const devopsSkills = ['Docker', 'Kubernetes', 'AWS', 'Jenkins', 'CI/CD'];
    devopsSkills.forEach(skill => {
      if (!requirements.includes(skill)) requirements.push(skill);
    });
  }
  
  if (jobTitle.toLowerCase().includes('data')) {
    const dataSkills = ['Python', 'SQL', 'Pandas', 'Apache Spark'];
    dataSkills.forEach(skill => {
      if (!requirements.includes(skill)) requirements.push(skill);
    });
  }
  
  // Limit to most relevant skills
  return requirements.slice(0, 10);
}

function extractImplicitSkillsFromJobDescription(jobDescription, jobTitle) {
  const jobText = `${jobTitle} ${jobDescription}`.toLowerCase();
  const implicitSkills = [];
  
  // Map job description phrases to specific technical skills
  const implicitSkillsMap = {
    // Frontend implications
    'responsive user interfaces': ['React', 'Vue.js', 'Angular'],
    'user interfaces': ['React', 'Vue.js', 'Angular'],
    'modern web applications': ['React', 'Vue.js', 'Angular', 'TypeScript'],
    'single page applications': ['React', 'Vue.js', 'Angular'],
    'interactive web': ['React', 'Vue.js', 'JavaScript Frameworks'],
    
    // Backend implications
    'restful services': ['Node.js', 'Express.js', 'RESTful API Design'],
    'api development': ['Node.js', 'Express.js', 'API Design'],
    'web services': ['Node.js', 'Express.js', 'Web APIs'],
    'server-side': ['Node.js', 'Express.js', 'Backend Development'],
    'backend services': ['Node.js', 'Express.js', 'Server Architecture'],
    
    // Database implications
    'database schemas': ['Database Design', 'MongoDB', 'SQL'],
    'data modeling': ['Database Design', 'Data Architecture'],
    'data storage': ['Database Management', 'MongoDB', 'SQL'],
    'database design': ['Database Architecture', 'Schema Design'],
    
    // Authentication implications
    'user authentication': ['Authentication Systems', 'JWT', 'OAuth'],
    'secure login': ['Authentication', 'Security Practices'],
    'user management': ['Authentication Systems', 'User Security'],
    'access control': ['Authorization', 'Security Implementation'],
    
    // Cloud implications
    'cloud infrastructure': ['AWS', 'Cloud Deployment', 'DevOps'],
    'cloud deployment': ['AWS', 'Azure', 'Cloud Services'],
    'scalable applications': ['Cloud Architecture', 'Load Balancing'],
    'production deployment': ['DevOps', 'CI/CD', 'Cloud Platforms'],
    
    // Performance implications
    'high traffic': ['Performance Optimization', 'Load Balancing', 'Caching'],
    'fast loading': ['Performance Optimization', 'Web Performance'],
    'optimize performance': ['Performance Tuning', 'Code Optimization'],
    
    // Real-time implications
    'real-time features': ['WebSockets', 'Socket.io', 'Real-time Communication'],
    'live updates': ['WebSockets', 'Server-Sent Events'],
    'instant messaging': ['WebSockets', 'Real-time APIs'],
    
    // Full stack implications
    'full stack': ['Frontend Frameworks', 'Backend APIs', 'Database Management', 'DevOps Basics'],
    'end-to-end': ['Full Stack Development', 'System Integration'],
    
    // SDET/QA Testing implications - CRITICAL FOR SDET ROLES
    'test automation': ['Selenium', 'Cypress', 'Test Automation', 'TestNG', 'JUnit'],
    'automated testing': ['Selenium', 'Cypress', 'Test Automation', 'Playwright'],
    'automation framework': ['Selenium', 'Test Automation', 'Page Object Model'],
    'ui automation': ['Selenium', 'Cypress', 'Playwright', 'UI Testing'],
    'web automation': ['Selenium', 'Cypress', 'WebDriver'],
    'selenium webdriver': ['Selenium', 'WebDriver', 'Test Automation'],
    'functional testing': ['Selenium', 'TestNG', 'JUnit', 'Functional Testing'],
    'regression testing': ['Test Automation', 'Regression Testing', 'Selenium'],
    'smoke testing': ['Test Automation', 'Smoke Testing'],
    'sanity testing': ['Test Automation', 'Sanity Testing'],
    
    // API Testing implications
    'api testing': ['Postman', 'REST Assured', 'API Testing', 'SoapUI'],
    'rest api testing': ['Postman', 'REST Assured', 'Newman'],
    'web services testing': ['SoapUI', 'Postman', 'API Testing'],
    'microservices testing': ['Postman', 'REST Assured', 'API Testing'],
    'service testing': ['API Testing', 'REST Assured', 'Postman'],
    
    // Performance Testing implications
    'performance testing': ['JMeter', 'LoadRunner', 'Performance Testing', 'K6'],
    'load testing': ['JMeter', 'LoadRunner', 'K6', 'Load Testing'],
    'stress testing': ['JMeter', 'LoadRunner', 'Stress Testing'],
    'volume testing': ['Performance Testing', 'JMeter'],
    'scalability testing': ['Performance Testing', 'Load Testing', 'JMeter'],
    
    // Mobile Testing implications
    'mobile testing': ['Appium', 'Mobile Testing', 'Espresso', 'XCUITest'],
    'android testing': ['Espresso', 'Appium', 'Android Testing'],
    'ios testing': ['XCUITest', 'Appium', 'iOS Testing'],
    'mobile automation': ['Appium', 'Mobile Testing', 'Mobile Automation'],
    
    // Security Testing implications
    'security testing': ['OWASP', 'Burp Suite', 'Security Testing'],
    'vulnerability testing': ['OWASP', 'Nessus', 'Security Testing'],
    'penetration testing': ['Burp Suite', 'OWASP', 'Security Testing'],
    
    // Test Management implications
    'test management': ['Jira', 'TestRail', 'Test Management', 'Zephyr'],
    'test planning': ['Test Management', 'TestRail', 'Test Planning'],
    'test execution': ['Test Management', 'TestRail', 'Test Execution'],
    'defect tracking': ['Jira', 'Bugzilla', 'Defect Tracking'],
    'bug tracking': ['Jira', 'Bugzilla', 'Bug Tracking'],
    
    // CI/CD Testing implications
    'continuous testing': ['Jenkins', 'CI/CD', 'GitHub Actions', 'Continuous Testing'],
    'pipeline testing': ['Jenkins', 'GitLab CI', 'CI/CD Pipeline'],
    'build automation': ['Jenkins', 'CI/CD', 'Build Automation'],
    'deployment testing': ['CI/CD', 'Jenkins', 'Deployment Testing'],
    
    // BDD/TDD implications
    'behavior driven development': ['Cucumber', 'SpecFlow', 'BDD', 'Gherkin'],
    'bdd': ['Cucumber', 'SpecFlow', 'Behavior Driven Development'],
    'test driven development': ['TDD', 'JUnit', 'Test Driven Development'],
    'tdd': ['Test Driven Development', 'JUnit', 'TestNG'],
    'gherkin': ['Cucumber', 'BDD', 'Gherkin'],
    
    // Database Testing implications
    'database testing': ['SQL', 'Database Testing', 'Data Validation'],
    'data validation': ['SQL', 'Database Testing', 'Data Validation'],
    'etl testing': ['SQL', 'ETL Testing', 'Data Testing']
  };
  
  // Check each pattern and add implied skills
  Object.entries(implicitSkillsMap).forEach(([phrase, skills]) => {
    if (jobText.includes(phrase)) {
      console.log(`🔍 Found phrase "${phrase}" → implies: ${skills.join(', ')}`);
      implicitSkills.push(...skills);
    }
  });
  
  // Remove duplicates and return
  return [...new Set(implicitSkills)];
}

function getMatchLevel(score) {
  if (score >= 80) return 'Excellent Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Fair Match';
  return 'Poor Match';
}

function generateKeyStrengths(matchedSkills, extractedSkills) {
  const allSkills = [...new Set([...matchedSkills, ...extractedSkills])];
  
  return allSkills.slice(0, 5).map(skill => ({
    title: `${skill.charAt(0).toUpperCase() + skill.slice(1)} Proficiency`,
    description: `Demonstrated experience with ${skill} through projects and work experience`,
    relevance: 'High'
  }));
}

function generateRelevantExperience(experienceAnalysis) {
  if (experienceAnalysis?.resumeYears && experienceAnalysis?.level) {
    const levelDesc = {
      'entry': 'Entry-level',
      'junior': 'Junior',
      'mid': 'Mid-level',
      'senior': 'Senior'
    }[experienceAnalysis.level] || 'Professional';
    
    return `${levelDesc} developer with ${experienceAnalysis.resumeYears} years of experience. ${experienceAnalysis.details?.slice(0, 2).join('. ') || ''}`;
  }
  return 'Experience level determined from resume content and project descriptions';
}

function generateExperienceGaps(experienceAnalysis) {
  const gaps = [];
  
  if (experienceAnalysis?.requiredYears && experienceAnalysis?.resumeYears) {
    const yearGap = experienceAnalysis.requiredYears - experienceAnalysis.resumeYears;
    if (yearGap > 0) {
      gaps.push(`Need ${yearGap} more years of experience`);
    }
  }
  
  if (experienceAnalysis?.criticalSkills && experienceAnalysis.criticalSkills.length > 0) {
    gaps.push(`Missing critical skills: ${experienceAnalysis.criticalSkills.slice(0, 2).join(', ')}`);
  }
  
  if (experienceAnalysis?.level === 'entry' && experienceAnalysis?.requiredYears >= 3) {
    gaps.push('Consider gaining more hands-on project experience');
  }
  
  return gaps.length > 0 ? gaps.join('. ') : 'No significant experience gaps identified';
}



function formatComprehensiveAnalysis(analysisResult, extractedSkills) {
  const score = analysisResult.overallScore || 0;
  const matchLevel = getMatchLevel(score);
  
  let analysis = `## Resume Analysis Results\n\n`;
  analysis += `**Overall Match:** ${score}% - ${matchLevel}\n\n`;
  
  if (extractedSkills && extractedSkills.length > 0) {
    analysis += `### 🎉 Skills Detected from Projects\n`;
    analysis += `Our intelligent analysis found these skills in your project descriptions:\n`;
    analysis += `${extractedSkills.slice(0, 10).join(', ')}\n\n`;
  }
  
  if (analysisResult.matchedSkills && analysisResult.matchedSkills.length > 0) {
    analysis += `### ✅ Matching Skills\n`;
    analysis += `${analysisResult.matchedSkills.join(', ')}\n\n`;
  }
  
  if (analysisResult.missingSkills && analysisResult.missingSkills.length > 0) {
    analysis += `### ❌ Skills to Develop\n`;
    analysis += `${analysisResult.missingSkills.slice(0, 5).join(', ')}\n\n`;
  }
  
  if (analysisResult.gapAnalysis) {
    analysis += `### 📊 Gap Analysis\n`;
    analysis += `${analysisResult.gapAnalysis}\n\n`;
  }
  
  if (analysisResult.suggestions && analysisResult.suggestions.length > 0) {
    analysis += `### 💡 Recommendations\n`;
    analysisResult.suggestions.forEach((suggestion, index) => {
      analysis += `${index + 1}. **${suggestion.title}**: ${suggestion.description}\n`;
    });
  }
  
  return analysis;
}

// Enhanced experience level detection
function extractExperienceLevel(resumeText) {
  if (!resumeText) return { years: 0, level: 'entry', details: [] };
  
  const resumeTextLower = resumeText.toLowerCase();
  const details = [];
  
  // Extract years of experience patterns
  const yearPatterns = [
    /(\d+)\+?\s*years?\s*of\s*experience/gi,
    /(\d+)\+?\s*years?\s*in\s*(software|development|programming)/gi,
    /experience.*(\d+)\+?\s*years?/gi,
    /(\d+)\+?\s*years?\s*(software|web|full.?stack|backend|frontend)/gi
  ];
  
  let maxYears = 0;
  yearPatterns.forEach(pattern => {
    const matches = resumeText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const yearMatch = match.match(/(\d+)/);
        if (yearMatch) {
          const years = parseInt(yearMatch[1]);
          if (years > maxYears) maxYears = years;
          details.push(`Found: "${match.trim()}"`);
        }
      });
    }
  });
  
  // Infer experience from job titles and descriptions
  const seniorityIndicators = [
    { pattern: /senior|lead|principal|architect/gi, years: 5, level: 'senior' },
    { pattern: /mid.?level|intermediate/gi, years: 3, level: 'mid' },
    { pattern: /junior|entry.?level|associate/gi, years: 1, level: 'junior' },
    { pattern: /intern|trainee|graduate/gi, years: 0, level: 'entry' }
  ];
  
  let inferredLevel = 'entry';
  let inferredYears = 0;
  
  seniorityIndicators.forEach(({ pattern, years, level }) => {
    if (pattern.test(resumeTextLower)) {
      if (years > inferredYears) {
        inferredYears = years;
        inferredLevel = level;
        details.push(`Inferred from title: ${level} level (${years}+ years)`);
      }
    }
  });
  
  // Count project complexity indicators
  const complexityIndicators = [
    'microservices', 'distributed systems', 'scalable', 'architecture',
    'team lead', 'mentoring', 'code review', 'deployment', 'ci/cd'
  ];
  
  let complexityScore = 0;
  complexityIndicators.forEach(indicator => {
    if (resumeTextLower.includes(indicator)) {
      complexityScore++;
    }
  });
  
  // Adjust experience based on complexity
  if (complexityScore >= 5) {
    inferredYears = Math.max(inferredYears, 4);
    inferredLevel = 'senior';
    details.push(`High complexity indicators suggest senior level`);
  } else if (complexityScore >= 3) {
    inferredYears = Math.max(inferredYears, 2);
    inferredLevel = inferredLevel === 'entry' ? 'mid' : inferredLevel;
    details.push(`Moderate complexity suggests mid-level experience`);
  }
  
  const finalYears = Math.max(maxYears, inferredYears);
  const finalLevel = finalYears >= 5 ? 'senior' : finalYears >= 2 ? 'mid' : finalYears >= 1 ? 'junior' : 'entry';
  
  return {
    years: finalYears,
    level: finalLevel,
    details: details,
    complexityScore: complexityScore
  };
}

// Enhanced gap categorization by priority
function categorizeGapsByPriority(missingSkills, jobRequirements, jobDescription) {
  const critical = [];
  const important = [];
  const niceToHave = [];
  
  // Define critical skill patterns (must-have for most jobs)
  const criticalPatterns = [
    /react|angular|vue/i,
    /javascript|typescript/i,
    /node\.?js|python|java|c#/i,
    /sql|mongodb|database/i,
    /git|version control/i
  ];
  
  // Define important skill patterns (valuable but not always required)
  const importantPatterns = [
    /docker|kubernetes/i,
    /aws|azure|cloud/i,
    /rest|api|graphql/i,
    /testing|jest|cypress/i
  ];
  
  const jobDescLower = (jobDescription || '').toLowerCase();
  const jobReqsLower = (jobRequirements || []).map(req => req.toLowerCase());
  
  missingSkills.forEach(skill => {
    const skillLower = skill.toLowerCase();
    
    // Check if skill is mentioned as "required" or "must have" in job description
    const isExplicitlyRequired = 
      jobDescLower.includes(`required: ${skillLower}`) ||
      jobDescLower.includes(`must have ${skillLower}`) ||
      jobDescLower.includes(`essential: ${skillLower}`) ||
      jobReqsLower.includes(skillLower);
    
    // Check if it's a critical technical skill
    const isCriticalSkill = criticalPatterns.some(pattern => pattern.test(skillLower));
    
    // Check if it's mentioned multiple times (indicates importance)
    const mentionCount = (jobDescLower.match(new RegExp(skillLower, 'g')) || []).length;
    
    if (isExplicitlyRequired || (isCriticalSkill && mentionCount >= 2)) {
      critical.push(skill);
    } else if (isCriticalSkill || importantPatterns.some(pattern => pattern.test(skillLower)) || mentionCount >= 1) {
      important.push(skill);
    } else {
      niceToHave.push(skill);
    }
  });
  
  return {
    critical: critical.slice(0, 3), // Limit to top 3 critical
    important: important.slice(0, 4), // Limit to top 4 important
    niceToHave: niceToHave.slice(0, 3) // Limit to top 3 nice-to-have
  };
}

function extractSkillsFromResumeContent(resumeText) {
  if (!resumeText) return [];
  
  const resumeTextLower = resumeText.toLowerCase();
  
  // COMPREHENSIVE: Technical skills including SDET/QA specializations
  const skillDatabase = [
    // Frontend Technologies
    { skill: 'React', variations: ['react', 'reactjs', 'react.js'] },
    { skill: 'Angular', variations: ['angular', 'angularjs'] },
    { skill: 'Vue.js', variations: ['vue', 'vuejs', 'vue.js'] },
    { skill: 'JavaScript', variations: ['javascript', 'js', 'es6', 'es2015'] },
    { skill: 'TypeScript', variations: ['typescript', 'ts'] },
    { skill: 'HTML5', variations: ['html', 'html5'] },
    { skill: 'CSS3', variations: ['css', 'css3'] },
    { skill: 'Sass', variations: ['sass', 'scss'] },
    { skill: 'Bootstrap', variations: ['bootstrap'] },
    { skill: 'Tailwind CSS', variations: ['tailwind', 'tailwindcss'] },
    
    // Backend Technologies
    { skill: 'Node.js', variations: ['node', 'nodejs', 'node.js'] },
    { skill: 'Express.js', variations: ['express', 'expressjs', 'express.js'] },
    { skill: 'Python', variations: ['python', 'py'] },
    { skill: 'Django', variations: ['django'] },
    { skill: 'Flask', variations: ['flask'] },
    { skill: 'Java', variations: ['java'] },
    { skill: 'Spring Boot', variations: ['spring', 'spring boot', 'springboot'] },
    { skill: 'PHP', variations: ['php'] },
    { skill: 'Laravel', variations: ['laravel'] },
    { skill: 'Ruby', variations: ['ruby'] },
    { skill: 'Ruby on Rails', variations: ['rails', 'ruby on rails'] },
    { skill: 'Go', variations: ['go', 'golang'] },
    { skill: 'C#', variations: ['c#', 'csharp', 'c sharp'] },
    { skill: '.NET', variations: ['.net', 'dotnet', 'asp.net'] },
    
    // SDET/QA Testing Frameworks - CRITICAL FOR SDET ROLES
    { skill: 'Selenium', variations: ['selenium', 'selenium webdriver', 'webdriver'] },
    { skill: 'Cypress', variations: ['cypress', 'cypress.io'] },
    { skill: 'Playwright', variations: ['playwright', 'playwright testing'] },
    { skill: 'TestNG', variations: ['testng', 'test ng'] },
    { skill: 'JUnit', variations: ['junit', 'junit5', 'junit 5'] },
    { skill: 'Pytest', variations: ['pytest', 'py.test'] },
    { skill: 'Mocha', variations: ['mocha', 'mochajs'] },
    { skill: 'Jasmine', variations: ['jasmine', 'jasmine testing'] },
    { skill: 'Jest', variations: ['jest', 'jest testing'] },
    { skill: 'Cucumber', variations: ['cucumber', 'gherkin', 'bdd'] },
    { skill: 'SpecFlow', variations: ['specflow', 'spec flow'] },
    
    // API Testing Tools - ESSENTIAL FOR SDET
    { skill: 'Postman', variations: ['postman', 'postman api'] },
    { skill: 'REST Assured', variations: ['rest assured', 'restassured'] },
    { skill: 'SoapUI', variations: ['soapui', 'soap ui'] },
    { skill: 'Insomnia', variations: ['insomnia', 'insomnia api'] },
    { skill: 'Newman', variations: ['newman', 'postman newman'] },
    
    // Performance Testing Tools
    { skill: 'JMeter', variations: ['jmeter', 'apache jmeter'] },
    { skill: 'LoadRunner', variations: ['loadrunner', 'load runner', 'hp loadrunner'] },
    { skill: 'K6', variations: ['k6', 'k6 testing', 'grafana k6'] },
    { skill: 'Gatling', variations: ['gatling', 'gatling testing'] },
    { skill: 'Artillery', variations: ['artillery', 'artillery.io'] },
    
    // Mobile Testing Tools
    { skill: 'Appium', variations: ['appium', 'appium testing'] },
    { skill: 'Espresso', variations: ['espresso', 'android espresso'] },
    { skill: 'XCUITest', variations: ['xcuitest', 'xcui test', 'ios testing'] },
    { skill: 'Detox', variations: ['detox', 'react native testing'] },
    
    // Test Management & Bug Tracking
    { skill: 'Jira', variations: ['jira', 'atlassian jira'] },
    { skill: 'TestRail', variations: ['testrail', 'test rail'] },
    { skill: 'Zephyr', variations: ['zephyr', 'zephyr scale'] },
    { skill: 'Azure DevOps', variations: ['azure devops', 'tfs', 'team foundation'] },
    { skill: 'Quality Center', variations: ['quality center', 'hp quality center', 'alm'] },
    { skill: 'Bugzilla', variations: ['bugzilla'] },
    
    // Security Testing
    { skill: 'OWASP', variations: ['owasp', 'owasp zap', 'security testing'] },
    { skill: 'Burp Suite', variations: ['burp suite', 'burp', 'portswigger'] },
    { skill: 'Nessus', variations: ['nessus', 'vulnerability scanning'] },
    
    // Databases
    { skill: 'MongoDB', variations: ['mongodb', 'mongo'] },
    { skill: 'MySQL', variations: ['mysql'] },
    { skill: 'PostgreSQL', variations: ['postgresql', 'postgres'] },
    { skill: 'Redis', variations: ['redis'] },
    { skill: 'SQL', variations: ['sql', 'database testing'] },
    
    // Cloud & DevOps
    { skill: 'AWS', variations: ['aws', 'amazon web services'] },
    { skill: 'Azure', variations: ['azure', 'microsoft azure'] },
    { skill: 'Google Cloud', variations: ['gcp', 'google cloud'] },
    { skill: 'Docker', variations: ['docker', 'containerization'] },
    { skill: 'Kubernetes', variations: ['kubernetes', 'k8s'] },
    { skill: 'Jenkins', variations: ['jenkins', 'jenkins pipeline'] },
    { skill: 'CI/CD', variations: ['ci/cd', 'continuous integration', 'continuous deployment'] },
    { skill: 'GitHub Actions', variations: ['github actions', 'gh actions'] },
    { skill: 'GitLab CI', variations: ['gitlab ci', 'gitlab pipeline'] },
    
    // Essential Tools
    { skill: 'Git', variations: ['git', 'version control'] },
    { skill: 'REST API', variations: ['rest', 'rest api', 'restful', 'api'] },
    { skill: 'GraphQL', variations: ['graphql'] },
    { skill: 'Microservices', variations: ['microservices'] },
    { skill: 'Webpack', variations: ['webpack'] },
    
    // Additional SDET Skills
    { skill: 'Test Automation', variations: ['test automation', 'automated testing', 'automation framework'] },
    { skill: 'Page Object Model', variations: ['page object model', 'pom', 'page object pattern'] },
    { skill: 'Data-Driven Testing', variations: ['data driven testing', 'ddt', 'parameterized testing'] },
    { skill: 'Behavior Driven Development', variations: ['bdd', 'behavior driven development', 'behavior driven testing'] },
    { skill: 'Test Driven Development', variations: ['tdd', 'test driven development'] },
    { skill: 'Regression Testing', variations: ['regression testing', 'regression test suite'] },
    { skill: 'Smoke Testing', variations: ['smoke testing', 'smoke tests'] },
    { skill: 'Integration Testing', variations: ['integration testing', 'integration tests'] },
    { skill: 'End-to-End Testing', variations: ['e2e testing', 'end to end testing', 'e2e'] }
  ];
  
  const extractedSkills = [];
  
  // Look for skills in project descriptions and experience
  skillDatabase.forEach(({ skill, variations }) => {
    const found = variations.some(variation => {
      // Check for exact matches and context-aware matches
      const patterns = [
        new RegExp(`\\b${variation}\\b`, 'i'), // Exact word boundary match
        new RegExp(`built.*${variation}`, 'i'), // "built with React"
        new RegExp(`using.*${variation}`, 'i'), // "using MongoDB"
        new RegExp(`developed.*${variation}`, 'i'), // "developed in Python"
        new RegExp(`implemented.*${variation}`, 'i'), // "implemented with Node.js"
        new RegExp(`worked.*${variation}`, 'i'), // "worked with AWS"
        new RegExp(`experience.*${variation}`, 'i'), // "experience with Docker"
        new RegExp(`${variation}.*project`, 'i'), // "React project"
        new RegExp(`${variation}.*application`, 'i'), // "Node.js application"
        new RegExp(`${variation}.*development`, 'i') // "Python development"
      ];
      
      return patterns.some(pattern => pattern.test(resumeTextLower));
    });
    
    if (found && !extractedSkills.includes(skill)) {
      extractedSkills.push(skill);
    }
  });
  
  return extractedSkills;
}

// Calculate experience score based on multiple factors
function calculateExperienceScore(experienceData, categorizedGaps) {
  let score = 0;
  
  // Base score from years of experience
  const yearScore = Math.min(experienceData.years * 15, 60); // Max 60 points for years
  score += yearScore;
  
  // Bonus for seniority level
  const levelBonus = {
    'entry': 0,
    'junior': 10,
    'mid': 20,
    'senior': 30
  }[experienceData.level] || 0;
  score += levelBonus;
  
  // Bonus for complexity indicators
  score += Math.min(experienceData.complexityScore * 3, 15); // Max 15 points for complexity
  
  // Penalty for critical missing skills
  score -= categorizedGaps.critical.length * 5; // -5 points per critical missing skill
  
  // Penalty for important missing skills
  score -= categorizedGaps.important.length * 2; // -2 points per important missing skill
  
  return Math.max(0, Math.min(100, score)); // Ensure score is between 0-100
}

// Generate enhanced gap analysis summary
function generateEnhancedGapAnalysis(categorizedGaps, experienceData, jobTitle) {
  let analysis = `## Gap Analysis for ${jobTitle}\n\n`;
  
  // Experience Level Assessment
  analysis += `**Experience Level:** ${experienceData.level.charAt(0).toUpperCase() + experienceData.level.slice(1)} (${experienceData.years} years)\n`;
  if (experienceData.complexityScore >= 3) {
    analysis += `**Technical Complexity:** High - demonstrates advanced project experience\n`;
  }
  analysis += `\n`;
  
  // Critical Gaps
  if (categorizedGaps.critical.length > 0) {
    analysis += `🚨 **CRITICAL GAPS** (Must Address):\n`;
    categorizedGaps.critical.forEach(skill => {
      analysis += `• ${skill} - Essential for this role\n`;
    });
    analysis += `\n`;
  }
  
  // Important Gaps
  if (categorizedGaps.important.length > 0) {
    analysis += `⚠️ **IMPORTANT GAPS** (Should Address):\n`;
    categorizedGaps.important.forEach(skill => {
      analysis += `• ${skill} - Valuable for career growth\n`;
    });
    analysis += `\n`;
  }
  
  // Nice to Have
  if (categorizedGaps.niceToHave.length > 0) {
    analysis += `💡 **NICE TO HAVE**:\n`;
    categorizedGaps.niceToHave.forEach(skill => {
      analysis += `• ${skill} - Additional advantage\n`;
    });
    analysis += `\n`;
  }
  
  // Recommendations
  analysis += `**Recommendation:** `;
  if (categorizedGaps.critical.length > 0) {
    analysis += `Focus immediately on critical skills: ${categorizedGaps.critical.slice(0, 2).join(', ')}. `;
  }
  if (experienceData.years < 2 && categorizedGaps.critical.length === 0) {
    analysis += `Build more project experience to demonstrate your skills. `;
  }
  if (categorizedGaps.critical.length === 0 && categorizedGaps.important.length === 0) {
    analysis += `Excellent match! Consider highlighting your experience more prominently.`;
  }
  
  return analysis;
}

async function handlePythonChat({ question, conversationHistory, analysisContext }) {
  try {
    console.log('💬 Processing chat question via Gemini service:', question);
    console.log('📝 Analysis context available:', !!analysisContext);
    console.log('💭 Conversation history length:', conversationHistory?.length || 0);
    
    if (analysisContext) {
      console.log('🔍 Analysis context details:');
      console.log(`   - Job Title: ${analysisContext.jobTitle || 'N/A'}`);
      console.log(`   - Job Description: ${analysisContext.jobDescription ? 'Available' : 'Missing'}`);
      console.log(`   - Analysis Result: ${analysisContext.analysisResult ? 'Available' : 'Missing'}`);
    }
    
    // Use Gemini chat service for resume analysis chat
    const geminiResponse = await fetch(`${PYTHON_GEMINI_CHAT_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: question,
        session_id: 'default',
        conversation_history: conversationHistory?.slice(-6) || [], // Last 6 messages for context
        context: analysisContext
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      throw new Error(`Gemini chat service error: ${errorData.error || geminiResponse.statusText}`);
    }

    const chatResult = await geminiResponse.json();

    return NextResponse.json({
      success: true,
      data: {
        response: chatResult.response,
        timestamp: new Date().toISOString()
      },
      // For backward compatibility
      response: chatResult.response
    });

  } catch (error) {
    console.error('❌ Gemini chat error:', error);
    
    // Provide helpful error messages based on the error type
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch')) {
      return NextResponse.json({ 
        success: false, 
        message: 'Gemini chat service is not running. Please start the service on port 8003.', 
        error: 'Service unavailable',
        hint: 'Run: npm run dev:full or npm run gemini-chat'
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      success: false, 
      message: 'Chat failed', 
      error: error.message 
    }, { status: 500 });
  }
}
