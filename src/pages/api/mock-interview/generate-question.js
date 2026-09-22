export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Handle test requests for status checking
  if (req.body.test) {
    try {
      const fetch = require("node-fetch");
      const base = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || "http://localhost:8001";
      const response = await fetch(`${base}/health`, {
        method: "GET",
        timeout: 5000,
      });
      
      if (response.ok) {
        return res.status(200).json({ status: "online" });
      } else {
        return res.status(503).json({ status: "offline" });
      }
    } catch (error) {
      return res.status(503).json({ 
        error: "Backend service unavailable", 
        message: "The Python backend service (port 8008) is not running.",
        fallback: true
      });
    }
  }

  try {
    const fetch = require("node-fetch");
    
    // Transform the request to match backend expectations
    const backendRequest = {
      job_description: req.body.jobDescription || req.body.job_description,
      previous_questions: req.body.questionHistory || req.body.previous_questions || []
    };
    
    const base = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || "http://localhost:8001";
    const response = await fetch(`${base}/mock-interview/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backendRequest),
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error connecting to Python backend:', error);
    
    // Return a fallback error response
    res.status(503).json({ 
      error: "Backend service unavailable", 
      message: "The Python backend service (port 8008) is not running. Please start the service and try again.",
      fallback: true
    });
  }
} 