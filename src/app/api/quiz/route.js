import { NextResponse } from 'next/server';

const QUIZ_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || process.env.PYTHON_QUIZ_SERVICE_URL || 'http://localhost:8001';

export async function POST(request) {
  try {
    const { action, data } = await request.json();
    
    let endpoint = '';
    let requestData = data;
    
    switch (action) {
      case 'generate_quiz':
        endpoint = '/quiz/generate';
        break;
      case 'submit_quiz':
        endpoint = '/quiz/submit';
        break;
      default:
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid action' 
        });
    }
    
    console.log(`🎯 Calling quiz service: ${QUIZ_SERVICE_URL}${endpoint}`);
    
    const response = await fetch(`${QUIZ_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Quiz service error:', errorText);
      throw new Error(`Quiz service error: ${response.status}`);
    }
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('Quiz API error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    });
  }
}
