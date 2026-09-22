/**
 * YouTube Content Curation — live YouTube Data API only.
 * No mock / fallback content. Failures throw.
 */
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

export class YouTubeContentCurator {
  constructor() {
    this.apiKey = YOUTUBE_API_KEY;
    this.baseUrl = YOUTUBE_API_BASE_URL;
  }

  async searchEducationalContent(skill, difficulty = 'intermediate', contentType = 'structured-course', maxResults = 20) {
    if (!this.apiKey) {
      throw new Error('YOUTUBE_API_KEY not configured');
    }
    const searchQuery = this.buildSearchQuery(skill, difficulty, contentType);
    const searchResults = await this.searchYouTube(searchQuery, maxResults);
    if (!searchResults.length) {
      throw new Error(`YouTube returned no results for: ${searchQuery}`);
    }
    const detailedVideos = await this.getVideoDetails(searchResults);
    return this.rankContentByQuality(detailedVideos, skill, difficulty, contentType);
  }

  buildSearchQuery(skill, difficulty, contentType) {
    const skillTerms = skill.toLowerCase();
    const contentTypeTerms = {
      'crash-course': 'crash course bootcamp',
      'comprehensive-course': 'complete course masterclass',
      'structured-course': 'step by step full course',
      missing: 'beginner tutorial crash course for beginners',
      weak: 'advanced techniques best practices project tutorial',
      'under-evidenced': 'portfolio project hands-on build',
    };
    const difficultyTerms = {
      beginner: 'beginner basics introduction',
      intermediate: 'intermediate practical hands-on',
      advanced: 'advanced expert deep dive',
    };
    const ct = contentTypeTerms[contentType] || contentTypeTerms['structured-course'];
    const df = difficultyTerms[difficulty] || difficultyTerms.intermediate;
    return `${skillTerms} ${ct} ${df} tutorial`.trim();
  }

  async searchYouTube(query, maxResults = 20) {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', String(Math.min(maxResults, 25)));
    url.searchParams.set('q', query);
    url.searchParams.set('key', this.apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `YouTube search HTTP ${res.status}`);
    }
    return (data.items || [])
      .map((it) => ({
        id: it.id?.videoId,
        title: it.snippet?.title,
        channelTitle: it.snippet?.channelTitle,
        description: it.snippet?.description,
        publishedAt: it.snippet?.publishedAt,
        thumbnails: it.snippet?.thumbnails,
      }))
      .filter((v) => v.id);
  }

  async getVideoDetails(videos) {
    if (!videos.length) return [];
    const ids = videos.map((v) => v.id).join(',');
    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set('part', 'contentDetails,statistics,snippet');
    url.searchParams.set('id', ids);
    url.searchParams.set('key', this.apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `YouTube videos HTTP ${res.status}`);
    }
    const byId = Object.fromEntries((data.items || []).map((it) => [it.id, it]));
    return videos.map((v) => {
      const d = byId[v.id] || {};
      const durationSec = this.parseDuration(d.contentDetails?.duration);
      return {
        ...v,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        duration: durationSec,
        viewCount: Number(d.statistics?.viewCount || 0),
        likeCount: Number(d.statistics?.likeCount || 0),
        commentCount: Number(d.statistics?.commentCount || 0),
        channelTitle: d.snippet?.channelTitle || v.channelTitle,
      };
    });
  }

  parseDuration(iso) {
    if (!iso) return 0;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  }

  async rankContentByQuality(videos) {
    return videos
      .map((v) => {
        const views = Math.log10((v.viewCount || 1) + 1);
        const likes = Math.log10((v.likeCount || 1) + 1);
        const overallScore = views * 0.5 + likes * 0.5;
        return {
          ...v,
          qualityScore: overallScore,
          overallScore,
          estimatedCompletionTime: Math.round((v.duration || 600) * 1.5 / 60),
          qualityIndicators: ['YouTube Data API'],
        };
      })
      .sort((a, b) => b.overallScore - a.overallScore);
  }
}

export const youtubeContentCurator = new YouTubeContentCurator();
