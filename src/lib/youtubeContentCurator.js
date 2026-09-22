/**
 * YouTube Content Curation and Ranking System
 * Finds, analyzes, and ranks educational content for personalized learning plans
 */

// YouTube Data API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * Main content curation class
 */
export class YouTubeContentCurator {
  constructor() {
    this.apiKey = YOUTUBE_API_KEY;
    this.baseUrl = YOUTUBE_API_BASE_URL;
  }

  /**
   * Search for educational content based on skill requirements
   * @param {string} skill - The skill to search for (e.g., "React", "Node.js")
   * @param {string} difficulty - Difficulty level: 'beginner', 'intermediate', 'advanced'
   * @param {string} contentType - Content type: 'crash-course', 'comprehensive-course', 'structured-course'
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} Array of curated video objects
   */
  async searchEducationalContent(skill, difficulty = 'intermediate', contentType = 'structured-course', maxResults = 20) {
    console.log(`🔍 Searching YouTube for: ${skill} (${difficulty}, ${contentType})`);

    if (!this.apiKey) {
      console.warn('⚠️ YouTube API key not configured, using mock data');
      return this.generateMockContent(skill, difficulty, contentType, maxResults);
    }

    try {
      // Build search query based on skill and content type
      const searchQuery = this.buildSearchQuery(skill, difficulty, contentType);
      console.log(`📝 Search query: "${searchQuery}"`);

      // Search YouTube
      const searchResults = await this.searchYouTube(searchQuery, maxResults);
      
      // Get detailed video information
      const detailedVideos = await this.getVideoDetails(searchResults);
      
      // Analyze and rank content
      const rankedContent = await this.rankContentByQuality(detailedVideos, skill, difficulty, contentType);
      
      console.log(`✅ Found and ranked ${rankedContent.length} videos for ${skill}`);
      return rankedContent;

    } catch (error) {
      console.error('❌ YouTube content search failed:', error.message);
      return this.generateMockContent(skill, difficulty, contentType, maxResults);
    }
  }

  /**
   * Build optimized search query for educational content
   */
  buildSearchQuery(skill, difficulty, contentType) {
    const skillTerms = skill.toLowerCase();
    
    // Base educational terms
    const educationalTerms = ['tutorial', 'course', 'learn', 'guide', 'training'];
    
    // Content type specific terms
    const contentTypeTerms = {
      'crash-course': ['crash course', 'bootcamp', 'quick start', 'fast track', 'in minutes'],
      'comprehensive-course': ['complete course', 'full tutorial', 'masterclass', 'deep dive', 'comprehensive'],
      'structured-course': ['step by step', 'beginner to advanced', 'complete guide', 'full course']
    };

    // Difficulty specific terms
    const difficultyTerms = {
      'beginner': ['beginner', 'basics', 'introduction', 'getting started', 'fundamentals'],
      'intermediate': ['intermediate', 'practical', 'hands-on', 'project-based'],
      'advanced': ['advanced', 'expert', 'professional', 'mastery', 'deep dive']
    };

    // Combine terms intelligently
    const typeTerms = contentTypeTerms[contentType] || contentTypeTerms['structured-course'];
    const levelTerms = difficultyTerms[difficulty] || difficultyTerms['intermediate'];
    
    // Build query with skill + educational context
    const queryParts = [
      skillTerms,
      typeTerms[0], // Primary content type term
      levelTerms[0]  // Primary difficulty term
    ];

    return queryParts.join(' ');
  }

  /**
   * Search YouTube using the Data API
   */
  async searchYouTube(query, maxResults) {
    const searchUrl = `${this.baseUrl}/search`;
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: maxResults,
      order: 'relevance',
      videoDuration: 'medium', // 4-20 minutes
      videoDefinition: 'high',
      key: this.apiKey
    });

    const response = await fetch(`${searchUrl}?${params}`);
    
    if (!response.ok) {
      throw new Error(`YouTube API search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Get detailed information about videos
   */
  async getVideoDetails(searchResults) {
    if (!searchResults.length) return [];

    const videoIds = searchResults.map(item => item.id.videoId).join(',');
    const detailsUrl = `${this.baseUrl}/videos`;
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      id: videoIds,
      key: this.apiKey
    });

    const response = await fetch(`${detailsUrl}?${params}`);
    
    if (!response.ok) {
      throw new Error(`YouTube API details failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Rank content by quality using multiple factors
   */
  async rankContentByQuality(videos, skill, difficulty, contentType) {
    console.log(`📊 Ranking ${videos.length} videos for quality...`);

    const rankedVideos = videos.map(video => {
      const qualityScore = this.calculateQualityScore(video, skill, difficulty, contentType);
      const difficultyScore = this.assessContentDifficulty(video, difficulty);
      const relevanceScore = this.calculateRelevanceScore(video, skill);

      return {
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
        thumbnails: video.snippet.thumbnails,
        duration: this.parseDuration(video.contentDetails.duration),
        viewCount: parseInt(video.statistics.viewCount || 0),
        likeCount: parseInt(video.statistics.likeCount || 0),
        commentCount: parseInt(video.statistics.commentCount || 0),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        
        // Quality metrics
        qualityScore: qualityScore,
        difficultyScore: difficultyScore,
        relevanceScore: relevanceScore,
        overallScore: (qualityScore * 0.4) + (relevanceScore * 0.4) + (difficultyScore * 0.2),
        
        // Metadata
        skill: skill,
        targetDifficulty: difficulty,
        contentType: contentType,
        estimatedCompletionTime: this.estimateCompletionTime(video),
        
        // Quality indicators
        qualityIndicators: this.getQualityIndicators(video, qualityScore, relevanceScore)
      };
    });

    // Sort by overall score (highest first)
    rankedVideos.sort((a, b) => b.overallScore - a.overallScore);

    console.log(`✅ Ranked videos - Top score: ${rankedVideos[0]?.overallScore.toFixed(2)}`);
    return rankedVideos;
  }

  /**
   * Calculate quality score based on engagement metrics
   */
  calculateQualityScore(video, skill, difficulty, contentType) {
    const stats = video.statistics;
    const views = parseInt(stats.viewCount || 0);
    const likes = parseInt(stats.likeCount || 0);
    const comments = parseInt(stats.commentCount || 0);

    // Engagement rate (likes + comments per view)
    const engagementRate = views > 0 ? (likes + comments) / views : 0;
    
    // Like ratio (likes per view)
    const likeRatio = views > 0 ? likes / views : 0;
    
    // Comment engagement (comments per view)
    const commentRatio = views > 0 ? comments / views : 0;

    // Age factor (newer content gets slight boost, but not too much)
    const publishDate = new Date(video.snippet.publishedAt);
    const ageInDays = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
    const ageFactor = Math.max(0.5, 1 - (ageInDays / 365)); // Decay over 1 year

    // Channel credibility (basic heuristics)
    const channelTitle = video.snippet.channelTitle.toLowerCase();
    const isEducationalChannel = this.isEducationalChannel(channelTitle);
    const channelBonus = isEducationalChannel ? 1.2 : 1.0;

    // Duration appropriateness
    const duration = this.parseDuration(video.contentDetails.duration);
    const durationScore = this.scoreDurationAppropriate(duration, contentType);

    // Combine factors
    let qualityScore = 0;
    qualityScore += Math.min(engagementRate * 1000, 30); // Cap at 30 points
    qualityScore += Math.min(likeRatio * 1000, 25);      // Cap at 25 points
    qualityScore += Math.min(commentRatio * 500, 15);    // Cap at 15 points
    qualityScore += ageFactor * 10;                      // Up to 10 points
    qualityScore += (channelBonus - 1) * 10;             // Up to 2 points bonus
    qualityScore += durationScore;                       // Up to 10 points

    return Math.min(qualityScore, 100); // Cap at 100
  }

  /**
   * Assess content difficulty level
   */
  assessContentDifficulty(video, targetDifficulty) {
    const title = video.snippet.title.toLowerCase();
    const description = video.snippet.description.toLowerCase();
    const text = title + ' ' + description;

    // Difficulty indicators
    const beginnerTerms = ['beginner', 'basics', 'introduction', 'getting started', 'fundamentals', 'first', 'start'];
    const intermediateTerms = ['intermediate', 'practical', 'hands-on', 'project', 'build', 'create'];
    const advancedTerms = ['advanced', 'expert', 'professional', 'mastery', 'deep dive', 'complex'];

    // Count occurrences
    const beginnerCount = beginnerTerms.filter(term => text.includes(term)).length;
    const intermediateCount = intermediateTerms.filter(term => text.includes(term)).length;
    const advancedCount = advancedTerms.filter(term => text.includes(term)).length;

    // Determine detected difficulty
    let detectedDifficulty = 'intermediate'; // default
    if (beginnerCount > intermediateCount && beginnerCount > advancedCount) {
      detectedDifficulty = 'beginner';
    } else if (advancedCount > beginnerCount && advancedCount > intermediateCount) {
      detectedDifficulty = 'advanced';
    }

    // Score based on match with target difficulty
    if (detectedDifficulty === targetDifficulty) {
      return 100; // Perfect match
    } else if (
      (targetDifficulty === 'intermediate' && detectedDifficulty !== 'intermediate') ||
      (targetDifficulty === 'beginner' && detectedDifficulty === 'advanced') ||
      (targetDifficulty === 'advanced' && detectedDifficulty === 'beginner')
    ) {
      return 60; // Partial match
    } else {
      return 80; // Close match
    }
  }

  /**
   * Calculate relevance score to the skill
   */
  calculateRelevanceScore(video, skill) {
    const title = video.snippet.title.toLowerCase();
    const description = video.snippet.description.toLowerCase();
    const channelTitle = video.snippet.channelTitle.toLowerCase();
    
    const skillLower = skill.toLowerCase();
    const skillVariations = this.getSkillVariations(skillLower);
    
    let relevanceScore = 0;
    
    // Title relevance (most important)
    if (title.includes(skillLower)) relevanceScore += 40;
    skillVariations.forEach(variation => {
      if (title.includes(variation)) relevanceScore += 20;
    });
    
    // Description relevance
    if (description.includes(skillLower)) relevanceScore += 20;
    skillVariations.forEach(variation => {
      if (description.includes(variation)) relevanceScore += 10;
    });
    
    // Channel relevance
    if (channelTitle.includes(skillLower)) relevanceScore += 15;
    
    return Math.min(relevanceScore, 100);
  }

  /**
   * Get skill variations for better matching
   */
  getSkillVariations(skill) {
    const variations = {
      'react': ['reactjs', 'react.js', 'react js'],
      'node.js': ['nodejs', 'node js', 'node'],
      'javascript': ['js', 'ecmascript', 'es6', 'es2015'],
      'typescript': ['ts'],
      'mongodb': ['mongo db', 'mongo'],
      'postgresql': ['postgres', 'psql'],
      'docker': ['containerization', 'containers'],
      'kubernetes': ['k8s', 'container orchestration']
    };
    
    return variations[skill] || [];
  }

  /**
   * Check if channel appears to be educational
   */
  isEducationalChannel(channelTitle) {
    const educationalIndicators = [
      'academy', 'university', 'school', 'education', 'learning', 'tutorial',
      'course', 'training', 'bootcamp', 'coding', 'programming', 'dev',
      'tech', 'learn', 'master', 'guide'
    ];
    
    return educationalIndicators.some(indicator => channelTitle.includes(indicator));
  }

  /**
   * Score duration appropriateness for content type
   */
  scoreDurationAppropriate(durationMinutes, contentType) {
    const idealDurations = {
      'crash-course': { min: 10, max: 30, ideal: 20 },
      'comprehensive-course': { min: 30, max: 120, ideal: 60 },
      'structured-course': { min: 15, max: 60, ideal: 30 }
    };
    
    const target = idealDurations[contentType] || idealDurations['structured-course'];
    
    if (durationMinutes >= target.min && durationMinutes <= target.max) {
      // Within range, score based on closeness to ideal
      const distance = Math.abs(durationMinutes - target.ideal);
      const maxDistance = Math.max(target.ideal - target.min, target.max - target.ideal);
      return 10 * (1 - distance / maxDistance);
    } else {
      // Outside range, lower score
      return 3;
    }
  }

  /**
   * Parse YouTube duration format (PT4M13S) to minutes
   */
  parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 60 + minutes + seconds / 60;
  }

  /**
   * Estimate completion time including practice
   */
  estimateCompletionTime(video) {
    const watchTime = this.parseDuration(video.contentDetails.duration);
    // Add practice time (typically 1.5-2x watch time for coding tutorials)
    const practiceMultiplier = 1.7;
    return Math.round(watchTime * practiceMultiplier);
  }

  /**
   * Get quality indicators for UI display
   */
  getQualityIndicators(video, qualityScore, relevanceScore) {
    const indicators = [];
    
    if (qualityScore >= 80) indicators.push('High Quality');
    if (relevanceScore >= 90) indicators.push('Highly Relevant');
    if (this.isEducationalChannel(video.snippet.channelTitle.toLowerCase())) {
      indicators.push('Educational Channel');
    }
    
    const views = parseInt(video.statistics.viewCount || 0);
    if (views > 100000) indicators.push('Popular');
    if (views > 1000000) indicators.push('Viral');
    
    const publishDate = new Date(video.snippet.publishedAt);
    const ageInDays = (Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 90) indicators.push('Recent');
    
    return indicators;
  }

  /**
   * Generate mock content when API is not available
   */
  generateMockContent(skill, difficulty, contentType, maxResults) {
    console.log(`🎭 Generating mock content for ${skill} (${difficulty}, ${contentType})`);
    
    const mockVideos = [];
    const titles = this.generateMockTitles(skill, difficulty, contentType);
    
    for (let i = 0; i < Math.min(maxResults, titles.length); i++) {
      mockVideos.push({
        id: `mock_${skill}_${i}`,
        title: titles[i],
        description: `Learn ${skill} with this ${difficulty} level ${contentType.replace('-', ' ')}. Perfect for developers looking to master ${skill} skills.`,
        channelTitle: `${skill} Academy`,
        publishedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        thumbnails: {
          medium: { url: `https://via.placeholder.com/320x180?text=${encodeURIComponent(skill)}` }
        },
        duration: this.generateMockDuration(contentType),
        viewCount: Math.floor(Math.random() * 500000) + 10000,
        likeCount: Math.floor(Math.random() * 20000) + 500,
        commentCount: Math.floor(Math.random() * 2000) + 50,
        url: `https://youtube.com/watch?v=mock_${skill}_${i}`,
        
        qualityScore: 70 + Math.random() * 25,
        difficultyScore: 85 + Math.random() * 15,
        relevanceScore: 80 + Math.random() * 20,
        overallScore: 75 + Math.random() * 20,
        
        skill: skill,
        targetDifficulty: difficulty,
        contentType: contentType,
        estimatedCompletionTime: this.generateMockDuration(contentType) * 1.7,
        qualityIndicators: ['Mock Content', 'Educational Channel']
      });
    }
    
    return mockVideos.sort((a, b) => b.overallScore - a.overallScore);
  }

  generateMockTitles(skill, difficulty, contentType) {
    const templates = {
      'crash-course': [
        `${skill} Crash Course - Learn in 30 Minutes`,
        `${skill} Bootcamp: ${difficulty} to Pro`,
        `Master ${skill} Fast - Complete Guide`,
        `${skill} Quick Start Tutorial`,
        `Learn ${skill} in One Video`
      ],
      'comprehensive-course': [
        `Complete ${skill} Course - ${difficulty} to Advanced`,
        `${skill} Masterclass: Full Tutorial Series`,
        `The Ultimate ${skill} Guide`,
        `${skill} Deep Dive: Complete Course`,
        `Professional ${skill} Development Course`
      ],
      'structured-course': [
        `${skill} Tutorial: Step by Step Guide`,
        `Learn ${skill} - ${difficulty} Course`,
        `${skill} for Beginners: Complete Tutorial`,
        `${skill} Project-Based Learning`,
        `Practical ${skill} Development`
      ]
    };
    
    return templates[contentType] || templates['structured-course'];
  }

  generateMockDuration(contentType) {
    const ranges = {
      'crash-course': [15, 35],
      'comprehensive-course': [45, 90],
      'structured-course': [20, 50]
    };
    
    const range = ranges[contentType] || ranges['structured-course'];
    return Math.floor(Math.random() * (range[1] - range[0]) + range[0]);
  }
}

// Export singleton instance
export const youtubeContentCurator = new YouTubeContentCurator();