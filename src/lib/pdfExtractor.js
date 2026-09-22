// Import the implementation directly — pdf-parse's index.js runs a debug
// harness that opens ./test/data/05-versions-space.pdf when module.parent is unset
// (common under Next/Webpack ESM bundling on Vercel).
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import fs from 'fs';
import path from 'path';

export class PDFTextExtractor {
  
  /**
   * Extract text from PDF file
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<string>} - Extracted text content
   */
  static async extractFromFile(filePath) {
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`PDF file not found: ${absolutePath}`);
      }

      const dataBuffer = fs.readFileSync(absolutePath);
      const data = await pdfParse(dataBuffer);
      
      // Clean up the extracted text
      return this.cleanText(data.text);
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF buffer
   * @param {Buffer} buffer - PDF file buffer
   * @returns {Promise<string>} - Extracted text content
   */
  static async extractFromBuffer(buffer) {
    try {
      const data = await pdfParse(buffer);
      return this.cleanText(data.text);
    } catch (error) {
      console.error('PDF buffer extraction failed:', error);
      throw new Error(`Failed to extract text from PDF buffer: ${error.message}`);
    }
  }

  /**
   * Clean and normalize extracted text
   * @param {string} text - Raw extracted text
   * @returns {string} - Cleaned text
   */
  static cleanText(text) {
    if (!text) return '';

    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove page breaks and form feeds
      .replace(/[\f\r]/g, '')
      // Normalize line breaks
      .replace(/\n\s*\n/g, '\n\n')
      // Remove leading/trailing whitespace
      .trim();
  }

  /**
   * Extract structured resume data from text
   * @param {string} text - Resume text content
   * @returns {Object} - Structured resume data
   */
  static extractResumeStructure(text) {
    const structure = {
      rawText: text,
      sections: {},
      contact: {},
      skills: [],
      experience: [],
      education: []
    };

    try {
      // Extract email
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        structure.contact.email = emailMatch[0];
      }

      // Extract phone number
      const phoneMatch = text.match(/[\+]?[1-9]?[\d\s\-\(\)]{8,15}/);
      if (phoneMatch) {
        structure.contact.phone = phoneMatch[0].trim();
      }

      // Extract skills section
      const skillsMatch = text.match(/(?:SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES)[:\s\n]+(.*?)(?=\n[A-Z]{2,}|$)/is);
      if (skillsMatch) {
        structure.skills = skillsMatch[1]
          .split(/[,\n•·\-]/)
          .map(skill => skill.trim())
          .filter(skill => skill.length > 1 && skill.length < 50);
      }

      // Extract experience section
      const expMatch = text.match(/(?:EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE)[:\s\n]+(.*?)(?=\n[A-Z]{2,}|EDUCATION|$)/is);
      if (expMatch) {
        const expText = expMatch[1];
        const jobBlocks = expText.split(/\n(?=[A-Z][a-z]+.*(?:20\d{2}|19\d{2}))/);
        
        structure.experience = jobBlocks.map(block => {
          const lines = block.trim().split('\n');
          return {
            title: lines[0] || '',
            description: lines.slice(1).join(' ').trim()
          };
        }).filter(job => job.title.length > 0);
      }

      // Extract education section
      const eduMatch = text.match(/(?:EDUCATION|ACADEMIC BACKGROUND)[:\s\n]+(.*?)(?=\n[A-Z]{2,}|$)/is);
      if (eduMatch) {
        const eduText = eduMatch[1];
        const eduLines = eduText.split('\n').filter(line => line.trim().length > 0);
        
        structure.education = eduLines.map(line => ({
          degree: line.trim()
        }));
      }

    } catch (error) {
      console.warn('Resume structure extraction failed:', error);
    }

    return structure;
  }
}

export default PDFTextExtractor;
