import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { authMiddleware } from '@/lib/middleware';

export async function POST(request) {
  try {
    const auth = await authMiddleware(request);
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, message: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }

    console.log('📥 Resume upload request received');
    
    const formData = await request.formData();
    const file = formData.get('resume');

    console.log('📁 File data:', file ? {
      name: file.name,
      size: file.size,
      type: file.type
    } : 'No file found');

    if (!file) {
      console.log('❌ No file uploaded');
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, message: 'Only PDF files are allowed' }, { status: 400 });
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'File size must be less than 5MB' }, { status: 400 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'temp-resumes');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }    // Generate unique filename with timestamp and random string
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = path.extname(file.name);
    const filename = `resume_${timestamp}_${randomString}${fileExtension}`;
    const filepath = path.join(uploadsDir, filename);    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    console.log('💾 File saved successfully:', filepath);

    // Return file information
    const resumeData = {
      id: `${timestamp}_${randomString}`, // Unique identifier
      filename: filename,
      originalName: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      viewUrl: `/api/resume/view/${filename}`,
      downloadUrl: `/uploads/temp-resumes/${filename}`
    };

    console.log('✅ Returning resume data:', resumeData);

    return NextResponse.json({
      success: true,
      message: 'Resume uploaded successfully',
      resumeData
    });

  } catch (error) {
    console.error('Resume upload error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to upload resume' },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
