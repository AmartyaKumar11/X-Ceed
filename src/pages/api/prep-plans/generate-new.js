import { authMiddleware } from '../../../lib/middleware';
import { getDatabase } from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';

// Generate a detailed AI-powered prep plan using OpenRouter
async function generateDetailedPrepPlan(jobData, userProfile, duration = 4) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_PREP_PLAN_API_KEY;
  
  console.log('🔑 OpenRouter API Key check:', OPENROUTER_API_KEY ? 'Available' : 'Missing');
  console.log('📊 Generation parameters:', { 
    jobTitle: jobData.jobTitle, 
    duration, 
    hasProfile: !!userProfile 
  });
  
  if (!OPENROUTER_API_KEY) {
    console.error('❌ OpenRouter API Key not configured');
    throw new Error('OpenRouter API Key not configured');
  }

  const prompt = `Create a ${duration}-week study plan for ${jobData.jobTitle} at ${jobData.companyName}.

Requirements: ${Array.isArray(jobData.requirements) ? jobData.requirements.slice(0, 3).join(', ') : 'Programming skills'}
Candidate Skills: ${Array.isArray(userProfile.skills) ? userProfile.skills.slice(0, 3).join(', ') : 'Basic skills'}

Return JSON format:
{
  "overview": {
    "title": "Study Plan",
    "duration": "${duration} weeks",
    "hours": "${duration * 20} hours total"
  },
  "skillGaps": {
    "critical": ["skill1", "skill2", "skill3"],
    "strategy": "Focus on missing skills"
  },
  "weeklyPlan": {
    "week1": {
      "title": "Week 1",
      "objectives": ["Learn basics"],
      "keyAreas": ["fundamental concepts"]
    }
  },
  "resources": {
    "courses": ["course1", "course2"],
    "books": ["book1", "book2"]
  }
}`;

  console.log('📝 Prompt length:', prompt.length);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002',
        'X-Title': 'X-CEED Prep Plan Generator'
      },
      body: JSON.stringify({
        model: 'liquidai/lfm2.5-1.2b-thinking:free',
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

    console.log('🌐 OpenRouter API Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenRouter API error details:', errorText);
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ API Response received, content length:', data.choices?.[0]?.message?.content?.length || 0);

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in API response');
    }

    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const prepPlan = JSON.parse(jsonMatch[0]);
    console.log('✅ Plan parsed successfully');
    
    return prepPlan;
  } catch (error) {
    console.error('❌ Generation error:', error.message);
    
    // Return a fallback plan
    return {
      overview: {
        title: `${duration}-Week Study Plan for ${jobData.jobTitle}`,
        duration: `${duration} weeks`,
        hours: `${duration * 20} hours total`,
        description: 'A comprehensive preparation plan tailored to your needs'
      },
      skillGaps: {
        critical: ['Technical skills', 'Domain knowledge', 'Interview preparation'],
        strategy: 'Focus on the most important skills first'
      },
      weeklyPlan: {
        week1: {
          title: 'Week 1: Foundation Building',
          objectives: ['Learn core concepts', 'Set up learning environment'],
          keyAreas: ['Fundamental skills', 'Basic concepts']
        }
      },
      resources: {
        courses: ['Online tutorials', 'Documentation'],
        books: ['Industry standard books', 'Technical guides']
      }
    };
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
      duration: prepPlan.duration || 4
    });

    // Generate the detailed study plan using AI with duration from prep plan
    const detailedPlan = await generateDetailedPrepPlan(prepPlan, userProfile || {}, prepPlan.duration || 4);

    // Update the prep plan with the detailed study plan
    const updateResult = await db.collection('prepPlans').updateOne(
      { _id: new ObjectId(prepPlanId) },
      {
        $set: {
          detailedPlan: detailedPlan,
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
        detailedPlan: detailedPlan
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
