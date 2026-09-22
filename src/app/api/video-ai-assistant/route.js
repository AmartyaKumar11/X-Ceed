import { NextResponse } from 'next/server';

const PYTHON_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || process.env.PYTHON_VIDEO_AI_SERVICE_URL || 'http://localhost:8001';

export async function POST(request) {
  try {
    const { message, videoId, videoTitle, videoChannel, conversationHistory } = await request.json();

    // Check if user is asking for notes specifically
    const isNotesRequest = message && (
      message.toLowerCase().includes('notes') ||
      message.toLowerCase().includes('summarize') ||
      message.toLowerCase().includes('summary') ||
      message.toLowerCase().includes('key points')
    );

    // Try to connect to Python service first
    try {
      console.log('Attempting to connect to Python service at:', PYTHON_SERVICE_URL);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout for notes
      
      // Use different endpoint based on request type
      // Prefer AI Support video endpoints (port 8001)
      const endpoint = isNotesRequest ? '/video/notes' : '/video/chat';
      const requestBody = isNotesRequest ? 
        { transcript: '', video_title: videoTitle, title: videoTitle, channel: videoChannel, video_id: videoId } :
        {
          message,
          transcript: '',
          video_title: videoTitle,
          video_id: videoId,
          video_channel: videoChannel,
          history: conversationHistory || [],
          conversation_history: conversationHistory || []
        };

      console.log(`Making ${isNotesRequest ? 'notes' : 'chat'} request to:`, `${PYTHON_SERVICE_URL}${endpoint}`);
      
      const pythonResponse = await fetch(`${PYTHON_SERVICE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);      if (pythonResponse.ok) {
        const pythonData = await pythonResponse.json();
        
        console.log('Python service responded successfully');
          if (isNotesRequest) {
          // Handle notes response - only send the notes content, not a separate response
          return NextResponse.json({
            success: true,
            response: pythonData.notes, // Send notes as the main response content
            actions: [
              { type: 'notes', title: 'Generated Notes', content: pythonData.notes }
            ],
            clips: [],
            source: 'python_service_notes',
            video_title: pythonData.video_title
          });
        } else {          // Handle chat response
          return NextResponse.json({
            success: true,
            response: pythonData.response,
            actions: pythonData.actions || [],
            clips: pythonData.clips || [],
            source: 'python_service_chat'
          });
        }
      } else {
        console.log('Python service returned non-OK status:', pythonResponse.status);
      }
    } catch (pythonError) {
      console.log('Python service not available, falling back to Gemini:', pythonError.message);
    }    // Fallback to direct Gemini API call
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Try Gemini 2.0 first, then 1.5-flash, then gemini-pro (with fallback chain)
    // Note: JavaScript SDK uses model name without "models/" prefix
    const modelChain = [
      'gemini-2.5-flash',          // Gemini 2.5 Flash (best performance, 5 RPM)
      'gemini-2.5-flash-lite',     // Gemini 2.5 Flash Lite (higher rate limits, 10 RPM)
      'gemini-3-flash',            // Gemini 3 Flash (if available)
      'gemini-1.5-flash',          // Gemini 1.5 Flash (stable fallback)
      'gemini-pro'                 // Gemini Pro (final fallback)
    ];
    let model;
    for (const modelName of modelChain) {
      try {
        model = genAI.getGenerativeModel({ model: modelName });
        console.log(`[INFO] Using Gemini model: ${modelName}`);
        break;
      } catch (error) {
        console.log(`[DEBUG] Model ${modelName} not available, trying next...`);
        continue;
      }
    }
    if (!model) {
      throw new Error('Failed to initialize any Gemini model');
    }

    // Build conversation context
    const conversationContext = conversationHistory
      ?.slice(-5) // Last 5 messages for context
      ?.map(msg => `${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      ?.join('\n') || '';

    const systemPrompt = `You are an AI video assistant helping users analyze YouTube videos. 

Video Information:
- Title: ${videoTitle}
- Channel: ${videoChannel}
- YouTube Video ID: ${videoId}

You can help with:
1. 📝 Answering questions about video content
2. ✂️ Suggesting clips (provide timestamps when possible)
3. 📸 Screenshot suggestions (provide timestamps)
4. 📋 Creating notes and summaries
5. 🎯 Learning recommendations

Recent conversation:
${conversationContext}

Current user message: ${message}

Provide helpful responses about the video. If you need the actual transcript to give better answers, mention that the enhanced Python service provides more detailed analysis with full transcript access.

For clip suggestions, use format like "2:30-4:15" for timestamps.
For screenshots, suggest specific times like "at 3:45".`;

    const result = await model.generateContent(systemPrompt);
    const response = result.response.text();

    // Detect actions from user message
    const actions = detectActions(message);

    return NextResponse.json({
      success: true,
      response: response,
      actions: actions,
      source: 'gemini_fallback',
      note: 'For enhanced video analysis with full transcript access, ensure the Python service is running.'
    });

  } catch (error) {
    console.error('Error in video AI assistant:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process request',
      response: 'I apologize, but I encountered an error processing your request. Please try again in a moment.'
    }, { status: 500 });
  }
}

function detectActions(message) {
  const actions = [];
  const messageLower = message.toLowerCase();

  if (messageLower.includes('notes') || messageLower.includes('note') || messageLower.includes('summary')) {
    actions.push({
      type: 'notes',
      text: 'Generate Notes',
      description: 'Create structured notes from this video'
    });
  }

  if (messageLower.includes('clip') || messageLower.includes('segment') || messageLower.includes('timestamp')) {
    actions.push({
      type: 'clips',
      text: 'Suggest Clips',
      description: 'Find interesting video segments'
    });
  }

  if (messageLower.includes('screenshot') || messageLower.includes('capture')) {
    actions.push({
      type: 'screenshot',
      text: 'Screenshot',
      description: 'Suggest screenshot moments'
    });
  }

  return actions;
}
