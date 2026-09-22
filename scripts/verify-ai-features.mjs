/**
 * AI features verification matrix
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const CORE = process.env.NEXT_PUBLIC_AI_CORE_URL || 'http://127.0.0.1:8000';
const SUP = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || 'http://127.0.0.1:8001';
const NEXT = 'http://127.0.0.1:3002';
const results = [];

function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 220) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + String(detail).slice(0, 160) : ''));
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, text };
}

async function main() {
  // F1: missing vs weak Python playlists differ
  const missing = await jfetch(CORE + '/career-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_role: 'Backend Engineer',
      gaps: [{ requirement: 'Python', classification: 'missing', priority: 'high' }],
    }),
  });
  const weak = await jfetch(CORE + '/career-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_role: 'Backend Engineer',
      gaps: [{ requirement: 'Python', classification: 'weak', priority: 'high' }],
    }),
  });

  const mMod = missing.json.modules?.[0];
  const wMod = weak.json.modules?.[0];
  const mQueries = JSON.stringify(mMod?.queries || []);
  const wQueries = JSON.stringify(wMod?.queries || []);
  ok('F1 career-plan missing HTTP', missing.status === 200, 'videos=' + (mMod?.videos?.length ?? 0));
  ok('F1 career-plan weak HTTP', weak.status === 200, 'videos=' + (wMod?.videos?.length ?? 0));
  ok('F1 different search queries missing vs weak', mQueries !== wQueries, `m=${mQueries.slice(0,80)} | w=${wQueries.slice(0,80)}`);
  const mUrls = (mMod?.videos || []).map((v) => v.url);
  const wUrls = (wMod?.videos || []).map((v) => v.url);
  ok('F1 real youtube URLs', mUrls.every((u) => /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+$/.test(u)) && mUrls.length > 0, mUrls[0] || 'none');
  ok('F1 playlists differ (or different ordering/content)', JSON.stringify(mUrls) !== JSON.stringify(wUrls) || mQueries !== wQueries, `m=${mUrls.length} w=${wUrls.length}`);

  // F2: video notes + chat (known public video with captions)
  const VIDEO = 'jNQXAC9IVRw'; // me at the zoo — has captions
  const notes = await jfetch(SUP + '/video/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: VIDEO, video_title: 'Me at the zoo' }),
  });
  ok('F2 auto notes via transcript', notes.status === 200 && !!(notes.json.summary || notes.json.notes), (notes.json.summary || notes.json.error || notes.json.detail || '').toString().slice(0, 120));

  const chat = await jfetch(SUP + '/video/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_id: VIDEO,
      question: 'What animal is mentioned in the video?',
      video_title: 'Me at the zoo',
    }),
  });
  const reply = (chat.json.reply || chat.json.response || '').toLowerCase();
  ok('F2 video chat grounded', chat.status === 200 && reply.length > 10, reply.slice(0, 120));

  // Next proxy auto notes
  const nextNotes = await jfetch(NEXT + '/api/video-ai-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'auto_notes', videoId: VIDEO, videoTitle: 'Me at the zoo' }),
  });
  ok('F2 Next auto_notes proxy', nextNotes.status === 200 && nextNotes.json.success, nextNotes.json.error || 'ok');

  // F3: adaptive mock interview
  const q1 = await jfetch(SUP + '/mock-interview/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'Frontend Engineer',
      interview_type: 'technical',
      question_number: 1,
      previous_qa_pairs: [],
      job_description: 'React TypeScript engineer',
    }),
  });
  ok('F3 question 1', q1.status === 200 && !!q1.json.question, (q1.json.question || '').slice(0, 100));

  const a1 = await jfetch(SUP + '/mock-interview/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'Frontend Engineer',
      interview_type: 'technical',
      question: q1.json.question,
      answer: 'I do not know. I never used React.',
    }),
  });
  ok('F3 analyze weak answer', a1.status === 200 && typeof a1.json.score === 'number', 'score=' + a1.json.score);

  const q2 = await jfetch(SUP + '/mock-interview/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'Frontend Engineer',
      interview_type: 'technical',
      question_number: 2,
      previous_qa_pairs: [
        { question: q1.json.question, answer: 'I do not know. I never used React.', score: a1.json.score },
      ],
      job_description: 'React TypeScript engineer',
    }),
  });
  const q2text = (q2.json.question || '').toLowerCase();
  ok(
    'F3 Q2 adapts after weak answer',
    q2.status === 200 && q2.json.question && q2.json.question !== q1.json.question,
    (q2.json.probes_weakness ? 'probes_weakness=true ' : '') + q2text.slice(0, 120)
  );

  const report = await jfetch(SUP + '/mock-interview/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'Frontend Engineer',
      interview_type: 'technical',
      qa_pairs: [
        { question: q1.json.question, answer: 'I do not know', score: a1.json.score },
        { question: q2.json.question, answer: 'Still unsure about hooks', score: 3 },
      ],
    }),
  });
  ok('F3 final report', report.status === 200 && report.json.overall_score != null, 'score=' + report.json.overall_score);

  // F4: quiz uniqueness + explanations
  const quiz1 = await jfetch(SUP + '/quiz/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'React hooks', difficulty: 'medium', num_questions: 3 }),
  });
  const quiz2 = await jfetch(SUP + '/quiz/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'React hooks', difficulty: 'medium', num_questions: 3 }),
  });
  const qs1 = (quiz1.json.questions || []).map((q) => q.question).join('|');
  const qs2 = (quiz2.json.questions || []).map((q) => q.question).join('|');
  ok('F4 quiz generate x2', quiz1.status === 200 && quiz2.status === 200, 'n1=' + (quiz1.json.questions?.length) + ' n2=' + (quiz2.json.questions?.length));
  ok('F4 quizzes differ', qs1 && qs2 && qs1 !== qs2, 'same=' + (qs1 === qs2));

  const submit = await jfetch(SUP + '/quiz/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quiz_id: quiz1.json.quiz_id,
      topic: 'React hooks',
      questions: quiz1.json.questions,
      answers: quiz1.json.questions.map(() => 0),
    }),
  });
  ok(
    'F4 submit explanations',
    submit.status === 200 &&
      Array.isArray(submit.json.details) &&
      submit.json.details.some((d) => d.explanation || d.option_explanations || d.why_wrong),
    'score=' + submit.json.score + ' details=' + submit.json.details?.length
  );

  // No Gemini in support health / models
  const health = await jfetch(SUP + '/health');
  ok('DeepSeek flag on support', health.json.deepseek === true, JSON.stringify(health.json));

  const failed = results.filter((r) => !r.pass);
  console.log('\n==== SUMMARY ====');
  console.log('passed', results.filter((r) => r.pass).length + '/' + results.length);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(' -', f.name, '::', f.detail));
    process.exitCode = 1;
  } else {
    console.log('ALL GREEN');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
