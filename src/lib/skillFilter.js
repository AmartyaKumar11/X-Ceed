/*  *//**
 * Skill Filtering and Normalization System
 * Filters out non-learnable items and converts vague terms into specific, learnable skills
 */

export class SkillFilter {
  constructor() {
    // Non-learnable patterns that should be filtered out
    this.nonLearnablePatterns = [
      // Experience requirements
      /\d+\+?\s*years?\s*of\s*(relevant\s*)?experience/i,
      /\d+\+?\s*years?\s*experience/i,
      /relevant\s*experience/i,
      /work\s*experience/i,
      /professional\s*experience/i,
      /industry\s*experience/i,

      // Leadership/soft skills that can't be "studied"
      /leadership\s*(skills?|experience|abilities?)/i,
      /mentoring\s*(skills?|experience)/i,
      /team\s*lead(ership)?/i,
      /management\s*experience/i,
      /communication\s*skills?/i,
      /interpersonal\s*skills?/i,

      // Vague descriptors
      /strong\s*(programming\s*)?skills?/i,
      /excellent\s*(programming\s*)?skills?/i,
      /solid\s*(programming\s*)?skills?/i,
      /good\s*(programming\s*)?skills?/i,
      /proficient\s*in/i,
      /expertise\s*in/i,
      /knowledge\s*of/i,
      /understanding\s*of/i,
      /familiarity\s*with/i,

      // Company-specific or role-specific items
      /startup\s*environment/i,
      /fast[- ]paced\s*environment/i,
      /agile\s*environment/i,
      /remote\s*work/i,
      /collaboration/i,
      /problem[- ]solving/i,

      // Educational requirements
      /bachelor'?s?\s*degree/i,
      /master'?s?\s*degree/i,
      /computer\s*science\s*degree/i,
      /engineering\s*degree/i,

      // Generic terms
      /technical\s*skills?/i,
      /programming\s*skills?/i,
      /development\s*skills?/i,
      /software\s*skills?/i,
    ];

    // Mapping of vague terms to specific learnable skills
    this.skillMappings = {
      // Programming language generalizations
      'strong programming skills': ['Data Structures & Algorithms', 'Object-Oriented Programming', 'Code Design Patterns'],
      'excellent programming skills': ['Advanced Programming Concepts', 'Software Architecture', 'Code Optimization'],
      'solid programming skills': ['Programming Fundamentals', 'Clean Code Practices', 'Debugging Techniques'],
      'backend development': ['API Development', 'Database Design', 'Server Architecture'],
      'frontend development': ['HTML/CSS', 'JavaScript', 'Responsive Design', 'UI/UX Principles'],
      'full stack development': ['Frontend Frameworks', 'Backend APIs', 'Database Management', 'DevOps Basics'],
      'web development': ['HTML/CSS', 'JavaScript', 'Web APIs', 'Browser Development Tools'],
      'mobile development': ['Mobile App Architecture', 'Platform-specific Development', 'Mobile UI Design'],

      // Technology stack generalizations
      'modern web technologies': ['ES6+ JavaScript', 'Modern CSS', 'Web Components', 'Progressive Web Apps'],
      'cloud technologies': ['Cloud Architecture', 'Containerization', 'Serverless Computing', 'Cloud Security'],
      'database technologies': ['SQL', 'Database Design', 'Query Optimization', 'Data Modeling'],
      'devops practices': ['CI/CD', 'Infrastructure as Code', 'Monitoring & Logging', 'Deployment Strategies'],

      // Methodology generalizations
      'agile methodologies': ['Scrum Framework', 'Kanban', 'Sprint Planning', 'User Story Writing'],
      'testing practices': ['Unit Testing', 'Integration Testing', 'Test-Driven Development', 'Automated Testing'],
      'version control': ['Git', 'Branching Strategies', 'Code Review Process', 'Merge Conflict Resolution'],

      // Architecture generalizations
      'software architecture': ['Design Patterns', 'System Design', 'Microservices', 'API Design'],
      'system design': ['Scalability Patterns', 'Load Balancing', 'Caching Strategies', 'Database Sharding'],
      'api development': ['RESTful APIs', 'GraphQL', 'API Security', 'API Documentation'],

      // Data visualization generalizations
      'data visualization': ['Tableau', 'Power BI', 'D3.js', 'Chart.js', 'Data Storytelling'],
      'business intelligence': ['Tableau', 'Power BI', 'Looker', 'Dashboard Design', 'KPI Development'],
      'reporting tools': ['Tableau', 'Power BI', 'Excel Advanced', 'SQL Reporting', 'Dashboard Creation'],
      'dashboard development': ['Tableau', 'Power BI', 'Grafana', 'Chart.js', 'Data Visualization Principles'],

      // SDET/QA Testing generalizations
      'test automation': ['Selenium', 'Cypress', 'TestNG', 'JUnit', 'Page Object Model'],
      'automated testing': ['Selenium', 'Cypress', 'Test Automation Framework', 'Playwright'],
      'automation framework': ['Selenium', 'Page Object Model', 'Data-Driven Testing', 'Test Framework Design'],
      'ui automation': ['Selenium', 'Cypress', 'Playwright', 'WebDriver'],
      'web automation': ['Selenium WebDriver', 'Cypress', 'Browser Automation'],
      'api testing': ['Postman', 'REST Assured', 'SoapUI', 'API Test Automation'],
      'performance testing': ['JMeter', 'LoadRunner', 'K6', 'Performance Test Design'],
      'load testing': ['JMeter', 'LoadRunner', 'Performance Testing', 'Stress Testing'],
      'mobile testing': ['Appium', 'Espresso', 'XCUITest', 'Mobile Test Automation'],
      'security testing': ['OWASP', 'Burp Suite', 'Security Test Automation', 'Vulnerability Assessment'],
      'test management': ['Jira', 'TestRail', 'Zephyr', 'Test Planning', 'Test Execution'],
      'continuous testing': ['Jenkins', 'CI/CD Pipeline Testing', 'GitHub Actions', 'Test Automation in CI/CD'],
      'regression testing': ['Test Automation', 'Regression Test Suite', 'Automated Regression Testing'],
      'functional testing': ['Selenium', 'TestNG', 'JUnit', 'Functional Test Automation'],
      'bdd testing': ['Cucumber', 'SpecFlow', 'Gherkin', 'Behavior-Driven Development'],
      'quality assurance': ['Test Planning', 'Test Design', 'Test Execution', 'Defect Management'],
    };

    // Known learnable technical skills (whitelist)
    this.learnableSkills = [
      // Programming Languages
      'javascript', 'python', 'java', 'c#', 'c++', 'go', 'rust', 'typescript', 'php', 'ruby', 'swift', 'kotlin',

      // Frontend Technologies
      'react', 'vue', 'angular', 'svelte', 'html', 'css', 'sass', 'less', 'webpack', 'vite', 'parcel',

      // Backend Technologies
      'node.js', 'express', 'django', 'flask', 'spring', 'asp.net', 'laravel', 'rails', 'fastapi',

      // Databases
      'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb',

      // Cloud & DevOps
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'gitlab ci', 'github actions',

      // Tools & Frameworks
      'git', 'linux', 'bash', 'powershell', 'nginx', 'apache', 'graphql', 'rest api', 'microservices',

      // Data & AI
      'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit-learn', 'data analysis',

      // Data Visualization Tools
      'tableau', 'power bi', 'powerbi', 'd3.js', 'd3', 'plotly', 'matplotlib', 'seaborn', 'ggplot2', 'bokeh',
      'chartjs', 'chart.js', 'highcharts', 'amcharts', 'grafana', 'kibana', 'looker', 'qlik', 'qlikview', 'qliksense',
      'data visualization', 'data viz', 'business intelligence', 'bi tools', 'dashboards', 'reporting tools',

      // Testing & SDET Skills
      'jest', 'cypress', 'selenium', 'junit', 'pytest', 'unit testing', 'integration testing', 'e2e testing',
      'testng', 'mocha', 'jasmine', 'cucumber', 'specflow', 'playwright', 'webdriver',
      'postman', 'rest assured', 'soapui', 'insomnia', 'newman', 'api testing',
      'jmeter', 'loadrunner', 'k6', 'gatling', 'artillery', 'performance testing', 'load testing',
      'appium', 'espresso', 'xcuitest', 'detox', 'mobile testing', 'android testing', 'ios testing',
      'test automation', 'automation framework', 'page object model', 'data driven testing',
      'behavior driven development', 'bdd', 'test driven development', 'tdd', 'gherkin',
      'regression testing', 'smoke testing', 'sanity testing', 'functional testing',
      'security testing', 'owasp', 'burp suite', 'nessus', 'vulnerability testing',
      'jira', 'testrail', 'zephyr', 'quality center', 'bugzilla', 'test management',
      'continuous testing', 'pipeline testing', 'build automation', 'deployment testing',

      // Mobile
      'react native', 'flutter', 'ios development', 'android development', 'xamarin',

      // Specific Concepts
      'data structures', 'algorithms', 'object-oriented programming', 'functional programming', 'design patterns',
      'system design', 'database design', 'api design', 'security practices', 'performance optimization'
    ];
  }

  /**
   * Filter and normalize a list of skills
   * @param {string[]} skills - Raw skills from resume analysis
   * @returns {Object} Filtered and categorized skills
   */
  filterAndNormalizeSkills(skills) {
    if (!Array.isArray(skills)) {
      return { learnable: [], filtered: [], mapped: [] };
    }

    const learnable = [];
    const filtered = [];
    const mapped = [];

    skills.forEach(skill => {
      const normalizedSkill = skill.trim().toLowerCase();

      // Check if it's a non-learnable pattern
      if (this.isNonLearnable(skill)) {
        filtered.push({
          original: skill,
          reason: 'Non-learnable (experience/soft skill requirement)'
        });
        return;
      }

      // Check if it can be mapped to specific skills
      const mappedSkills = this.mapToSpecificSkills(normalizedSkill);
      if (mappedSkills.length > 0) {
        mapped.push({
          original: skill,
          mappedTo: mappedSkills
        });
        learnable.push(...mappedSkills);
        return;
      }

      // Check if it's a known learnable skill
      if (this.isLearnableSkill(normalizedSkill)) {
        learnable.push(this.normalizeSkillName(skill));
        return;
      }

      // If we can't categorize it, try to extract learnable parts
      const extractedSkills = this.extractLearnableSkills(skill);
      if (extractedSkills.length > 0) {
        learnable.push(...extractedSkills);
      } else {
        filtered.push({
          original: skill,
          reason: 'Could not identify as learnable technical skill'
        });
      }
    });

    return {
      learnable: [...new Set(learnable)], // Remove duplicates
      filtered,
      mapped
    };
  }

  /**
   * Check if a skill matches non-learnable patterns
   */
  isNonLearnable(skill) {
    return this.nonLearnablePatterns.some(pattern => pattern.test(skill));
  }

  /**
   * Map vague terms to specific learnable skills
   */
  mapToSpecificSkills(normalizedSkill) {
    for (const [vagueTerm, specificSkills] of Object.entries(this.skillMappings)) {
      if (normalizedSkill.includes(vagueTerm.toLowerCase())) {
        return specificSkills;
      }
    }
    return [];
  }

  /**
   * Check if a skill is in the learnable skills whitelist
   */
  isLearnableSkill(normalizedSkill) {
    return this.learnableSkills.some(learnableSkill =>
      normalizedSkill.includes(learnableSkill) ||
      learnableSkill.includes(normalizedSkill)
    );
  }

  /**
   * Extract learnable skills from complex skill descriptions
   */
  extractLearnableSkills(skill) {
    const extracted = [];
    const skillLower = skill.toLowerCase();

    // Look for technology names within the skill description
    this.learnableSkills.forEach(tech => {
      if (skillLower.includes(tech)) {
        extracted.push(this.normalizeSkillName(tech));
      }
    });

    return extracted;
  }

  /**
   * Normalize skill names for consistency
   */
  normalizeSkillName(skill) {
    const skillLower = skill.toLowerCase().trim();

    // Common normalizations
    const normalizations = {
      'js': 'JavaScript',
      'javascript': 'JavaScript',
      'ts': 'TypeScript',
      'typescript': 'TypeScript',
      'node': 'Node.js',
      'nodejs': 'Node.js',
      'node.js': 'Node.js',
      'reactjs': 'React',
      'react.js': 'React',
      'vuejs': 'Vue.js',
      'vue.js': 'Vue.js',
      'angularjs': 'Angular',
      'html5': 'HTML',
      'css3': 'CSS',
      'es6': 'ES6+ JavaScript',
      'postgresql': 'PostgreSQL',
      'mysql': 'MySQL',
      'mongodb': 'MongoDB',
      'aws': 'Amazon Web Services (AWS)',
      'gcp': 'Google Cloud Platform',
      'k8s': 'Kubernetes',
      'docker': 'Docker',
      'git': 'Git',
      'ci/cd': 'CI/CD',
      'rest': 'REST APIs',
      'graphql': 'GraphQL',
      'sql': 'SQL',
      'nosql': 'NoSQL Databases',
      'ml': 'Machine Learning',
      'ai': 'Artificial Intelligence',
      'tensorflow': 'TensorFlow',
      'pytorch': 'PyTorch',
      'tableau': 'Tableau',
      'powerbi': 'Power BI',
      'power bi': 'Power BI',
      'd3': 'D3.js',
      'd3.js': 'D3.js',
      'plotly': 'Plotly',
      'matplotlib': 'Matplotlib',
      'seaborn': 'Seaborn',
      'ggplot2': 'ggplot2',
      'chartjs': 'Chart.js',
      'chart.js': 'Chart.js',
      'highcharts': 'Highcharts',
      'grafana': 'Grafana',
      'kibana': 'Kibana',
      'looker': 'Looker',
      'qlik': 'Qlik',
      'qlikview': 'QlikView',
      'qliksense': 'QlikSense',
      'bi': 'Business Intelligence',
      'data viz': 'Data Visualization',
      'data visualization': 'Data Visualization',

      // SDET/Testing normalizations
      'selenium': 'Selenium WebDriver',
      'webdriver': 'Selenium WebDriver',
      'selenium webdriver': 'Selenium WebDriver',
      'testng': 'TestNG',
      'junit': 'JUnit',
      'junit5': 'JUnit 5',
      'pytest': 'Pytest',
      'cypress': 'Cypress',
      'playwright': 'Playwright',
      'postman': 'Postman',
      'rest assured': 'REST Assured',
      'restassured': 'REST Assured',
      'soapui': 'SoapUI',
      'jmeter': 'Apache JMeter',
      'apache jmeter': 'Apache JMeter',
      'loadrunner': 'LoadRunner',
      'k6': 'K6',
      'appium': 'Appium',
      'espresso': 'Espresso',
      'xcuitest': 'XCUITest',
      'cucumber': 'Cucumber',
      'specflow': 'SpecFlow',
      'gherkin': 'Gherkin',
      'bdd': 'Behavior-Driven Development',
      'tdd': 'Test-Driven Development',
      'test automation': 'Test Automation',
      'api testing': 'API Testing',
      'performance testing': 'Performance Testing',
      'load testing': 'Load Testing',
      'mobile testing': 'Mobile Testing',
      'security testing': 'Security Testing',
      'regression testing': 'Regression Testing',
      'functional testing': 'Functional Testing',
      'integration testing': 'Integration Testing',
      'e2e testing': 'End-to-End Testing',
      'unit testing': 'Unit Testing',
      'smoke testing': 'Smoke Testing',
      'sanity testing': 'Sanity Testing',
      'owasp': 'OWASP',
      'burp suite': 'Burp Suite',
      'jira': 'Jira',
      'testrail': 'TestRail',
      'zephyr': 'Zephyr',
      'page object model': 'Page Object Model',
      'pom': 'Page Object Model',
      'data driven testing': 'Data-Driven Testing',
      'ddt': 'Data-Driven Testing'
    };

    return normalizations[skillLower] || this.capitalizeSkill(skill);
  }

  /**
   * Properly capitalize skill names
   */
  capitalizeSkill(skill) {
    // Handle special cases
    const specialCases = {
      'api': 'API',
      'ui': 'UI',
      'ux': 'UX',
      'html': 'HTML',
      'css': 'CSS',
      'sql': 'SQL',
      'json': 'JSON',
      'xml': 'XML',
      'http': 'HTTP',
      'https': 'HTTPS',
      'tcp': 'TCP',
      'udp': 'UDP',
      'rest': 'REST',
      'soap': 'SOAP'
    };

    const skillLower = skill.toLowerCase();
    if (specialCases[skillLower]) {
      return specialCases[skillLower];
    }

    // Default capitalization
    return skill.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Generate study recommendations for filtered skills
   */
  generateStudyRecommendations(filteredResult) {
    const recommendations = [];

    // Add recommendations for mapped skills
    filteredResult.mapped.forEach(mapping => {
      recommendations.push({
        type: 'skill_mapping',
        message: `"${mapping.original}" has been broken down into specific learnable skills`,
        skills: mapping.mappedTo,
        priority: 'high'
      });
    });

    // Add recommendations for filtered skills
    filteredResult.filtered.forEach(filtered => {
      if (filtered.reason.includes('experience')) {
        recommendations.push({
          type: 'experience_alternative',
          message: `Instead of "${filtered.original}", focus on building relevant projects and portfolio work`,
          skills: ['Portfolio Development', 'Project-Based Learning', 'Open Source Contributions'],
          priority: 'medium'
        });
      }
    });

    return recommendations;
  }
}

// Export singleton instance
export const skillFilter = new SkillFilter();