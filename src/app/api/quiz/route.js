import { NextResponse } from 'next/server';

const QUIZ_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || process.env.PYTHON_QUIZ_SERVICE_URL || 'http://localhost:8001';

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action || (body.answers ? 'submit_quiz' : 'generate_quiz');
    const data = body.data || body;

    let endpoint = '';
    let payload = data;

    if (action === 'generate_quiz' || action === 'generate') {
      endpoint = '/quiz/generate';
      payload = {
        // UI sends video_title; support service requires topic
        topic: data.topic || data.video_title || data.videoTitle || 'General',
        difficulty: data.difficulty || data.difficulty_level || 'medium',
        num_questions: data.num_questions || data.question_count || 5,
        question_count: data.question_count || data.num_questions || 5,
        transcript: data.transcript,
        context: data.context,
        user_id: data.user_id || data.userId,
      };
    } else if (action === 'submit_quiz' || action === 'submit') {
      endpoint = '/quiz/submit';
      payload = {
        quiz_id: data.quiz_id || data.quizId,
        questions: data.questions,
        answers: data.answers,
        topic: data.topic,
        user_id: data.user_id || data.userId,
      };
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    const response = await fetch(`${QUIZ_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: result.detail || result.error || `Quiz service ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Quiz API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
