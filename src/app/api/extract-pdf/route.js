import pdf from 'pdf-parse/lib/pdf-parse.js';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { filePath, jobId } = await request.json();

    if (!filePath) {
      return NextResponse.json({
        success: false,
        error: 'File path is required'
      }, { status: 400 });
    }

    // Construct full file path
    const fullPath = path.join(process.cwd(), 'public', filePath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({
        success: false,
        error: 'PDF file not found'
      }, { status: 404 });
    }

    // Read and parse PDF
    const dataBuffer = fs.readFileSync(fullPath);
    const pdfData = await pdf(dataBuffer);
    
    const extractedText = pdfData.text;
    const numPages = pdfData.numpages;
    
    console.log(`Extracted ${extractedText.length} characters from ${numPages} page(s)`);

    // Clean up the extracted text
    const cleanedText = cleanAndFormatPDFText(extractedText);

    return NextResponse.json({
      success: true,
      data: {
        text: cleanedText,
        rawText: extractedText,
        metadata: {
          numPages,
          numCharacters: extractedText.length,
          numWords: extractedText.split(/\s+/).length,
          extractedAt: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('PDF Extraction Error:', error);
    return NextResponse.json({
      success: false,
      error: `Failed to extract PDF content: ${error.message}`
    }, { status: 500 });
  }
}

function cleanAndFormatPDFText(rawText) {
  // Remove excessive whitespace and clean up formatting
  let cleaned = rawText
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Replace multiple newlines with double newline
    .replace(/\n+/g, '\n\n')
    // Remove page breaks and form feeds
    .replace(/[\f\r]/g, '')
    // Trim leading/trailing whitespace
    .trim();

  // Try to detect and format common sections
  cleaned = formatJobSections(cleaned);

  return cleaned;
}

function formatJobSections(text) {
  // Common job description sections
  const sectionPatterns = [
    { pattern: /\b(job\s*description|overview|summary)\b/gi, replacement: '\n\n## Job Description\n' },
    { pattern: /\b(responsibilities|duties|what\s*you['']?ll\s*do)\b/gi, replacement: '\n\n## Responsibilities\n' },
    { pattern: /\b(requirements|qualifications|skills|experience)\b/gi, replacement: '\n\n## Requirements\n' },
    { pattern: /\b(benefits|perks|what\s*we\s*offer)\b/gi, replacement: '\n\n## Benefits\n' },
    { pattern: /\b(about\s*(us|the\s*company))\b/gi, replacement: '\n\n## About the Company\n' },
    { pattern: /\b(how\s*to\s*apply|application\s*process)\b/gi, replacement: '\n\n## How to Apply\n' }
  ];

  let formatted = text;
  sectionPatterns.forEach(({ pattern, replacement }) => {
    formatted = formatted.replace(pattern, replacement);
  });

  return formatted;
}
