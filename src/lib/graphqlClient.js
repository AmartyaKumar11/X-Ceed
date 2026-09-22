'use client';

/**
 * Lightweight GraphQL client — fetch + optional react-query caller.
 */
export async function gql(query, variables = {}) {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('token') || localStorage.getItem('auth_token')
      : null;

  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.[0]?.message || `GraphQL ${res.status}`;
    throw new Error(msg);
  }
  return json.data;
}

export const RECRUITER_DASHBOARD_QUERY = `
  query RecruiterDashboard {
    recruiterDashboard {
      jobs {
        id
        title
        status
        department
        location
        applicationCount
        createdAt
      }
      stats {
        totalJobs
        totalApplications
        shortlistedCount
        activeJobs
      }
      recentApplications {
        id
        status
        appliedAt
        jobId
        jobTitle
      }
    }
  }
`;

export const CANDIDATE_PROFILE_QUERY = `
  query CandidateProfile {
    candidateProfile {
      user { id name email }
      skills { name level evidence }
      gaps { requirement classification priority }
      prepPlans { id targetRole progress createdAt }
      learningBets { id goal stakeAmount deadline status }
      matchHistory { overallScore explanation }
    }
  }
`;
