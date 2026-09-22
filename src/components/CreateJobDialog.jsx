'use client';

import { useState } from 'react';
import { X, Plus, Calendar, MapPin, DollarSign, Users, Clock, Briefcase, Upload, FileText, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
//import { SimpleDatePicker } from '@/components/ui/simple-date-picker';
import { FileUpload } from '@/components/ui/file-upload';
import { DEFAULT_WEIGHTS, normalizeWeights } from '@/lib/normalizeWeights';

const STEPS = [
  { id: 1, title: 'Basic Information', icon: Briefcase },
  { id: 2, title: 'Job Details', icon: MapPin },
  { id: 3, title: 'Compensation', icon: DollarSign },
  { id: 4, title: 'Timeline & Weights', icon: Calendar }
];

const WEIGHT_KEYS = [
  { key: 'skills', label: 'Skills' },
  { key: 'experience', label: 'Experience' },
  { key: 'education', label: 'Education' },
  { key: 'projects', label: 'Projects' },
  { key: 'communication', label: 'Communication' },
];

export default function CreateJobDialog({ isOpen, onClose, onJobCreated }) {  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Step 1: Basic Information
    title: '',
    department: '',
    level: '',
    description: '',
    
    // Step 2: Job Details
    workMode: '', // remote, onsite, hybrid
    location: '',
    jobType: '', // full-time, part-time, contract, internship
    duration: '', // permanent, 3-months, 6-months, 1-year
    
    // Step 3: Compensation
    salaryMin: '',
    salaryMax: '',
    currency: 'USD',
    benefits: '',
      // Step 4: Timeline & Openings
    numberOfOpenings: 1,
    // Date components for start date
    startDay: '',
    startMonth: '',
    startYear: '',
    // Date components for end date
    endDay: '',
    endMonth: '',
    endYear: '',
    jobDescriptionType: 'text', // 'text' or 'file'
    jobDescriptionText: '',
    jobDescriptionFile: null,
    evaluationWeights: { ...DEFAULT_WEIGHTS },
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleWeightChange = (key, raw) => {
    const value = Math.max(0, Math.min(1, Number(raw) / 100));
    setFormData((prev) => ({
      ...prev,
      evaluationWeights: normalizeWeights({ ...prev.evaluationWeights, [key]: value }),
    }));
  };
  // Helper function to get day options (1-31)
  const getDayOptions = (month, year) => {
    if (!month || !year) return Array.from({ length: 31 }, (_, i) => i + 1);
    
    // Get days in the selected month
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  };
  
  // Helper function to convert separate date fields to a Date object
  const getDateFromComponents = (day, month, year) => {
    if (!day || !month || !year) return null;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };
  
  // Helper function to check if start date is valid
  const isStartDateValid = () => {
    const { startDay, startMonth, startYear } = formData;
    if (!startDay || !startMonth || !startYear) return false;
    
    const startDate = getDateFromComponents(startDay, startMonth, startYear);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return startDate && startDate >= today;
  };
  
  // Helper function to check if end date is valid
  const isEndDateValid = () => {
    const { endDay, endMonth, endYear, startDay, startMonth, startYear } = formData;
    if (!endDay || !endMonth || !endYear) return false;
    
    const endDate = getDateFromComponents(endDay, endMonth, endYear);
    const startDate = getDateFromComponents(startDay, startMonth, startYear);
    
    return endDate && startDate && endDate >= startDate;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      console.log('🚀 Starting job creation process...');
      
      // Check token first
      const token = localStorage.getItem('token');
      console.log('🔑 Current token:', token);
      console.log('🔑 Token preview:', token ? token.substring(0, 50) + '...' : 'null');
      
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      // Debug: Try to decode the token locally
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('🔍 Token payload decoded:', payload);
        console.log('🆔 User ID in token:', payload.userId);
        console.log('👤 User type:', payload.userType);
        console.log('📧 Email:', payload.email);
        console.log('⏰ Expires:', new Date(payload.exp * 1000).toISOString());
      } catch (tokenDecodeError) {
        console.error('❌ Failed to decode token locally:', tokenDecodeError);
      }
      
      // Convert date components to Date objects
      const applicationStart = getDateFromComponents(formData.startDay, formData.startMonth, formData.startYear);
      const applicationEnd = getDateFromComponents(formData.endDay, formData.endMonth, formData.endYear);
      
      console.log('📅 Application dates:', { applicationStart, applicationEnd });
      
      let jobDescriptionFileUrl = null;
      
      // Upload PDF file if job description type is 'file'
      if (formData.jobDescriptionType === 'file' && formData.jobDescriptionFile) {
        console.log('📄 Uploading job description PDF...', formData.jobDescriptionFile.name);
        
        const fileFormData = new FormData();
        fileFormData.append('file', formData.jobDescriptionFile);
          const uploadResponse = await fetch('/api/upload/job-description', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: fileFormData,
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          console.error('❌ File upload failed:', errorData);
          throw new Error(errorData.message || 'Failed to upload job description file');
        }        const uploadResult = await uploadResponse.json();
        
        if (!uploadResult.fileUrl) {
          console.error('❌ Invalid upload response:', uploadResult);
          throw new Error('Failed to upload job description file - no file URL returned');
        }
        
        jobDescriptionFileUrl = uploadResult.fileUrl;
        console.log('✅ Job description PDF uploaded:', jobDescriptionFileUrl);
      }
      
      // Prepare job data for backend
      const jobData = {
        title: formData.title,
        department: formData.department,
        level: formData.level,
        description: formData.description,
        jobDescriptionType: formData.jobDescriptionType,
        jobDescriptionText: formData.jobDescriptionType === 'text' ? formData.jobDescriptionText : '',
        jobDescriptionFile: jobDescriptionFileUrl,
        workMode: formData.workMode,
        location: formData.location,
        jobType: formData.jobType,
        duration: formData.duration,
        salaryMin: parseInt(formData.salaryMin),
        salaryMax: parseInt(formData.salaryMax),
        currency: formData.currency,
        benefits: formData.benefits,
        numberOfOpenings: parseInt(formData.numberOfOpenings),
        applicationStart: applicationStart.toISOString(),
        applicationEnd: applicationEnd.toISOString(),
        status: 'active',
        evaluationWeights: normalizeWeights(formData.evaluationWeights),
      };

      console.log('📝 Creating job with data:', jobData);
        // Create job via API
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(jobData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Job creation failed:', errorData);
        throw new Error(errorData.message || 'Failed to create job');
      }
      
      const result = await response.json();
      console.log('✅ Job created successfully:', result.data);
      
      // Notify parent component
      onJobCreated(result.data);
      
      // Show success message
      alert('Job created successfully!');
        // Close dialog
      onClose();
      
      // Reset form
      setFormData({
        title: '',
        department: '',
        level: '',
        description: '',
        workMode: '',
        location: '',
        jobType: '',
        duration: '',
        salaryMin: '',
        salaryMax: '',
        currency: 'USD',
        benefits: '',
        numberOfOpenings: 1,
        startDay: '',
        startMonth: '',
        startYear: '',
        endDay: '',
        endMonth: '',
        endYear: '',
        jobDescriptionType: 'text',
        jobDescriptionText: '',
        jobDescriptionFile: null,
        evaluationWeights: { ...DEFAULT_WEIGHTS },
      });
      setCurrentStep(1);
      
    } catch (error) {
      console.error('❌ Error creating job:', error);
      alert(`Failed to create job: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.title && formData.department && formData.level;
      case 2:
        return formData.workMode && formData.jobType && formData.duration;
      case 3:
        return formData.salaryMin && formData.salaryMax;
      case 4:
        const hasJobDescription = formData.jobDescriptionType === 'text' 
          ? formData.jobDescriptionText.trim() 
          : formData.jobDescriptionFile;
        const hasStartDate = formData.startDay && formData.startMonth && formData.startYear && isStartDateValid();
        const hasEndDate = formData.endDay && formData.endMonth && formData.endYear && isEndDateValid();
        return formData.numberOfOpenings > 0 && 
               hasStartDate && 
               hasEndDate && 
               hasJobDescription;
      default:
        return false;
    }};

  const renderStepContent = () => {
    switch (currentStep) {      case 1:
        return (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g., Senior Frontend Developer"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="department">Department *</Label>                <Select value={formData.department} onValueChange={(value) => handleInputChange('department', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value="engineering">Engineering</SelectItem>
                    <SelectItem value="design">Design</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="hr">Human Resources</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="operations">Operations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="level">Experience Level *</Label>              <Select value={formData.level} onValueChange={(value) => handleInputChange('level', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select experience level" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="intern">Intern (0-1 years)</SelectItem>
                  <SelectItem value="entry">Entry Level (0-2 years)</SelectItem>
                  <SelectItem value="junior">Junior Level (1-3 years)</SelectItem>
                  <SelectItem value="mid">Mid Level (3-5 years)</SelectItem>
                  <SelectItem value="senior">Senior Level (5-8 years)</SelectItem>
                  <SelectItem value="lead">Lead Level (8-12 years)</SelectItem>
                  <SelectItem value="principal">Principal Level (10+ years)</SelectItem>
                  <SelectItem value="director">Director Level (12+ years)</SelectItem>
                  <SelectItem value="vp">VP Level (15+ years)</SelectItem>
                  <SelectItem value="executive">C-Level Executive (15+ years)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="description">Job Description</Label>              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe the role, responsibilities, and requirements..."
                className="mt-1 w-full h-24 px-3 py-2 border border-input bg-background text-foreground rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground"
              />
            </div>
          </div>
        );      case 2:
        return (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="workMode">Work Mode *</Label>
                <Select value={formData.workMode} onValueChange={(value) => handleInputChange('workMode', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select work mode" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="jobType">Employment Type *</Label>
                <Select value={formData.jobType} onValueChange={(value) => handleInputChange('jobType', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select employment type" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="part-time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder={formData.workMode === 'remote' ? 'Not applicable' : 'e.g., New York, NY'}
                  className="mt-1"
                  disabled={formData.workMode === 'remote'}
                />
              </div>
              <div>
                <Label htmlFor="duration">Contract Duration *</Label>
                <Select value={formData.duration} onValueChange={(value) => handleInputChange('duration', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value="permanent">Permanent</SelectItem>
                    <SelectItem value="3-months">3 Months</SelectItem>
                    <SelectItem value="6-months">6 Months</SelectItem>
                    <SelectItem value="1-year">1 Year</SelectItem>
                    <SelectItem value="2-years">2 Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );      case 3:
        return (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">              <div>
                <Label htmlFor="salaryMin">Minimum Salary *</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="salaryMin"
                    type="number"
                    value={formData.salaryMin}
                    onChange={(e) => handleInputChange('salaryMin', e.target.value)}
                    placeholder="50000"
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="salaryMax">Maximum Salary *</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="salaryMax"
                    type="number"
                    value={formData.salaryMax}
                    onChange={(e) => handleInputChange('salaryMax', e.target.value)}
                    placeholder="80000"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>              <Select value={formData.currency} onValueChange={(value) => handleInputChange('currency', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="CAD">CAD (C$)</SelectItem>
                  <SelectItem value="AUD">AUD (A$)</SelectItem>
                  <SelectItem value="INR">INR (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="benefits">Benefits & Perks</Label>              <textarea
                id="benefits"
                value={formData.benefits}
                onChange={(e) => handleInputChange('benefits', e.target.value)}
                placeholder="Health insurance, 401k, flexible hours, remote work..."
                className="mt-1 w-full h-20 px-3 py-2 border border-input bg-background text-foreground rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground"
              />
            </div>
          </div>
        );      case 4:
        return (
          <div className="space-y-4 sm:space-y-6">
            <div>
              <Label htmlFor="numberOfOpenings">Number of Openings *</Label>              <div className="relative mt-1">
                <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="numberOfOpenings"
                  type="number"
                  min="1"
                  value={formData.numberOfOpenings}
                  onChange={(e) => handleInputChange('numberOfOpenings', parseInt(e.target.value) || 1)}
                  className="pl-10"
                />
              </div>
            </div>              <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-4">
              <div className="space-y-2">
                <Label>Application Start Date *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Day dropdown */}
                  <Select 
                    value={formData.startDay} 
                    onValueChange={(value) => handleInputChange('startDay', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {getDayOptions(formData.startMonth, formData.startYear).map(day => (
                        <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Month dropdown */}
                  <Select 
                    value={formData.startMonth} 
                    onValueChange={(value) => {
                      handleInputChange('startMonth', value);
                      // Reset day if it exceeds days in the month
                      const daysInMonth = new Date(
                        parseInt(formData.startYear || new Date().getFullYear()), 
                        parseInt(value), 
                        0
                      ).getDate();
                      if (parseInt(formData.startDay) > daysInMonth) {
                        handleInputChange('startDay', '');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">January</SelectItem>
                      <SelectItem value="2">February</SelectItem>
                      <SelectItem value="3">March</SelectItem>
                      <SelectItem value="4">April</SelectItem>
                      <SelectItem value="5">May</SelectItem>
                      <SelectItem value="6">June</SelectItem>
                      <SelectItem value="7">July</SelectItem>
                      <SelectItem value="8">August</SelectItem>
                      <SelectItem value="9">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Year dropdown */}
                  <Select 
                    value={formData.startYear} 
                    onValueChange={(value) => handleInputChange('startYear', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i).map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>                {!isStartDateValid() && formData.startDay && formData.startMonth && formData.startYear && (
                  <p className="text-sm text-destructive">Start date must be today or later</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Application End Date *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Day dropdown */}
                  <Select 
                    value={formData.endDay} 
                    onValueChange={(value) => handleInputChange('endDay', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {getDayOptions(formData.endMonth, formData.endYear).map(day => (
                        <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Month dropdown */}
                  <Select 
                    value={formData.endMonth} 
                    onValueChange={(value) => {
                      handleInputChange('endMonth', value);
                      // Reset day if it exceeds days in the month
                      const daysInMonth = new Date(
                        parseInt(formData.endYear || new Date().getFullYear()), 
                        parseInt(value), 
                        0
                      ).getDate();
                      if (parseInt(formData.endDay) > daysInMonth) {
                        handleInputChange('endDay', '');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">January</SelectItem>
                      <SelectItem value="2">February</SelectItem>
                      <SelectItem value="3">March</SelectItem>
                      <SelectItem value="4">April</SelectItem>
                      <SelectItem value="5">May</SelectItem>
                      <SelectItem value="6">June</SelectItem>
                      <SelectItem value="7">July</SelectItem>
                      <SelectItem value="8">August</SelectItem>
                      <SelectItem value="9">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Year dropdown */}
                  <Select 
                    value={formData.endYear} 
                    onValueChange={(value) => handleInputChange('endYear', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i).map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>                {!isEndDateValid() && formData.endDay && formData.endMonth && formData.endYear && (
                  <p className="text-sm text-destructive">End date must be after start date</p>
                )}
              </div>
            </div>
            
            <div>
              <Label>Job Description *</Label>
              <div className="mt-2">                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="jobDescriptionType"
                      value="text"
                      checked={formData.jobDescriptionType === 'text'}
                      onChange={(e) => handleInputChange('jobDescriptionType', e.target.value)}
                      className="text-primary accent-primary"
                    />
                    <span className="text-sm text-foreground">Text Description</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="jobDescriptionType"
                      value="file"
                      checked={formData.jobDescriptionType === 'file'}
                      onChange={(e) => handleInputChange('jobDescriptionType', e.target.value)}
                      className="text-primary accent-primary"
                    />
                    <span className="text-sm text-foreground">Upload PDF</span>
                  </label>
                </div>
                
                {formData.jobDescriptionType === 'text' ? (                  <textarea
                    value={formData.jobDescriptionText}
                    onChange={(e) => handleInputChange('jobDescriptionText', e.target.value)}
                    placeholder="Enter detailed job description, requirements, responsibilities..."
                    className="w-full h-32 px-3 py-2 border border-input bg-background text-foreground rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground"
                  />
                ) : (                  <div className="border-2 border-dashed border-border rounded-lg p-6 bg-background">
                    <FileUpload
                      onFileChange={(file) => handleInputChange('jobDescriptionFile', file)}
                      accept=".pdf"
                      maxSize={10}
                      label="Upload job description PDF (max 10MB)"
                    />
                    {formData.jobDescriptionFile && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <FileText className="h-4 w-4" />
                        <span>{formData.jobDescriptionFile.name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <Label className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Evaluation weights (auto-normalize to 1.0)
              </Label>
              {WEIGHT_KEYS.map(({ key, label }) => (
                <div key={key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((formData.evaluationWeights?.[key] ?? 0) * 100)}
                    onChange={(e) => handleWeightChange(key, e.target.value)}
                    className="w-full accent-primary"
                  />
                  <span className="text-xs text-right tabular-nums">
                    {(formData.evaluationWeights?.[key] ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-background text-foreground">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl text-foreground">
            <Plus className="h-5 w-5" />
            Create New Job
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6 px-2 sm:px-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            
            return (
              <div key={step.id} className="flex items-center flex-1">                <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 ${
                  isActive 
                    ? 'border-primary bg-primary text-primary-foreground' 
                    : isCompleted 
                      ? 'border-green-500 bg-green-500 text-white dark:border-green-400 dark:bg-green-400 dark:text-gray-900' 
                      : 'border-muted-foreground bg-background text-muted-foreground'
                }`}>
                  <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                </div>                <div className="ml-2 hidden md:block flex-1">
                  <p className={`text-xs font-medium ${isActive ? 'text-primary' : isCompleted ? 'text-green-500 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Step {step.id}
                  </p>
                  <p className={`text-xs ${isActive ? 'text-primary' : isCompleted ? 'text-green-500 dark:text-green-400' : 'text-muted-foreground'}`}>
                    {step.title}
                  </p>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 sm:mx-4 ${isCompleted ? 'bg-green-500 dark:bg-green-400' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px] px-2 sm:px-4">
          {renderStepContent()}
        </div>        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0 pt-4 mt-4 border-t border-border px-2 sm:px-4">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className="w-full sm:w-auto"
          >
            Previous
          </Button>
          
          <div className="flex gap-2">
            {currentStep < STEPS.length ? (
              <Button
                onClick={handleNext}
                disabled={!isStepValid()}
                className="w-full sm:w-auto"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!isStepValid() || isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? 'Creating...' : 'Create Job'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
