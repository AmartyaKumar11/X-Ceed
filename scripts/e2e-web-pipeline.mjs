import dotenv from 'dotenv';
import fs from 'fs';
import { SignJWT } from 'jose';
dotenv.config({ path: '.env.local' });

const CORE = 'http://127.0.0.1:8000';
const SUP = 'http://127.0.0.1:8001';
const resume = fs.readFileSync('tmp-e2e-resume.txt', 'utf8');

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(async () => ({ raw: await r.text() }));
  return { status: r.status, j };
}

console.log('1 ANALYZE');
const an = await post(CORE + '/analyze', { resume_text: resume });
console.log(' status', an.status, 'skills', an.j.skills?.length);

console.log('2 MATCH');
const job = {
  title: 'Senior Frontend Engineer',
  description:
    'React TypeScript Next.js GraphQL Node MongoDB. Strong communication. Build AI-assisted hiring tools.',
  requirements: ['React', 'TypeScript', 'GraphQL', 'Node.js', 'MongoDB', 'Next.js'],
};
const weights = {
  skills: 0.4,
  experience: 0.25,
  education: 0.1,
  projects: 0.15,
  communication: 0.1,
};
const match = await post(CORE + '/match', {
  candidate_profile: an.j,
  job_requirements: job,
  weights,
});
console.log(' score', match.j.overall_score, 'explanation?', !!match.j.explanation);

console.log('3 GAP');
const gap = await post(CORE + '/gap', { match_result: match.j });
const gaps = gap.j.gaps || [];
console.log(
  ' gaps',
  gaps.length,
  gaps.slice(0, 5).map((g) => `${g.requirement}:${g.classification}`)
);

console.log('4 CAREER PLAN + YT MODULES');
const plan = await post(CORE + '/career-plan', { gaps, target_role: job.title });
console.log(' modules', plan.j.modules?.length, 'status', plan.status);
for (const m of plan.j.modules || []) {
  console.log(`  [${m.classification}] ${m.requirement}: ${(m.videos || []).length} videos`);
  for (const v of (m.videos || []).slice(0, 3)) {
    console.log('   -', v.order, v.title, v.url);
  }
}

const firstVid = (plan.j.modules || []).flatMap((m) => m.videos || [])[0];
let videoId = null;
let notesSummary = null;
let chatReply = null;
if (firstVid?.url) {
  videoId = firstVid.url.match(/[?&]v=([^&]+)/)?.[1];
  console.log('5 VIDEO NOTES', videoId, firstVid.title);
  const notes = await post(SUP + '/video/notes', {
    video_id: videoId,
    video_title: firstVid.title,
  });
  notesSummary = notes.j.summary || notes.j.notes || notes.j.detail || notes.j.error;
  console.log(' notes', String(notesSummary).slice(0, 200), 'status', notes.status);
  const chat = await post(SUP + '/video/chat', {
    video_id: videoId,
    question: 'Summarize the main learning outcomes in 2 sentences.',
    video_title: firstVid.title,
  });
  chatReply = chat.j.reply || chat.j.response;
  console.log(' chat', String(chatReply).slice(0, 180), 'status', chat.status);
} else {
  console.log('5 SKIP video — no curated videos');
}

console.log('6 QUIZ from first gap');
const topic = gaps[0]?.requirement || 'React';
const quiz = await post(SUP + '/quiz/generate', {
  topic,
  difficulty: 'medium',
  num_questions: 3,
  context: JSON.stringify(gaps.slice(0, 3)),
});
console.log(' quiz', quiz.status, 'qs', quiz.j.questions?.length);

console.log('7 MOCK INTERVIEW');
const q1 = await post(SUP + '/mock-interview/question', {
  role: job.title,
  interview_type: 'technical',
  question_number: 1,
  job_description: job.description,
  previous_qa_pairs: [],
});
console.log(' q1', String(q1.j.question || '').slice(0, 120));

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const applicant = await new SignJWT({
  userId: '686d41c8a7597e3bc30ee649',
  userType: 'applicant',
  email: 'amartya-applicant@gmail.com',
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('4h')
  .sign(secret);

fs.writeFileSync('tmp-e2e-token.txt', applicant);
fs.writeFileSync(
  'tmp-e2e-pipeline.json',
  JSON.stringify(
    {
      ok: plan.status === 200 && !!plan.j.modules?.length,
      skills: an.j.skills,
      matchScore: match.j.overall_score,
      explanation: match.j.explanation,
      gaps,
      modules: plan.j.modules,
      firstVideo: firstVid,
      videoId,
      notesSummary,
      chatReply,
      quizQuestions: quiz.j.questions?.map((q) => q.question),
      mockQ1: q1.j.question,
      careerPlanUrl: `http://127.0.0.1:3002/dashboard/applicant/career-plan`,
      videoAssistantUrl: videoId
        ? `http://127.0.0.1:3002/video-ai-assistant?videoId=${videoId}&title=${encodeURIComponent(firstVid.title || '')}`
        : null,
    },
    null,
    2
  )
);
console.log('DONE — artifacts written');
