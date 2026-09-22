import { NextResponse } from 'next/server';

const SUPPORT = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || process.env.PYTHON_VIDEO_AI_SERVICE_URL || 'http://localhost:8001';

async function supportPost(path, body) {
  const res = await fetch(`${SUPPORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    const msg = json.detail || json.message || json.error || text.slice(0, 200);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return json;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      action,
      message,
      videoId,
      videoTitle,
      videoChannel,
      conversationHistory,
      transcript: providedTranscript,
    } = body;

    if (!videoId && !providedTranscript) {
      return NextResponse.json({ success: false, error: 'videoId or transcript required' }, { status: 400 });
    }

    // Resolve transcript (required for real grounding)
    let transcript = providedTranscript || '';
    if (!transcript && videoId) {
      const t = await supportPost('/video/transcript', { video_id: videoId });
      transcript = t.transcript || '';
    }
    if (!transcript) {
      return NextResponse.json({ success: false, error: 'Could not load video transcript' }, { status: 502 });
    }

    const wantNotes =
      action === 'notes' ||
      action === 'auto_notes' ||
      (message && /notes|summarize|summary|key points/i.test(message));

    if (wantNotes || action === 'notes' || action === 'auto_notes') {
      const notes = await supportPost('/video/notes', {
        transcript,
        video_title: videoTitle,
        video_id: videoId,
      });
      return NextResponse.json({
        success: true,
        response: notes.notes || notes.summary,
        notes,
        transcript_length: transcript.length,
        source: 'ai_support_notes',
      });
    }

    if (action === 'clips') {
      const clips = await supportPost('/video/clips', { transcript, topic: message || videoTitle });
      return NextResponse.json({ success: true, ...clips, source: 'ai_support_clips' });
    }

    // Chat grounded on transcript
    const chat = await supportPost('/video/chat', {
      message: message || body.question,
      transcript,
      video_title: videoTitle,
      video_id: videoId,
      history: conversationHistory || [],
    });

    return NextResponse.json({
      success: true,
      response: chat.reply || chat.response,
      reply: chat.reply || chat.response,
      source: 'ai_support_chat',
    });
  } catch (error) {
    console.error('video-ai-assistant error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Video AI failed' },
      { status: 500 }
    );
  }
}
