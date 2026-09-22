'use client';

import { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Briefcase, 
  GraduationCap,
  Award,
  Save,
  Trash2,
  Plus,
  Edit,
  CheckCircle
} from 'lucide-react';
import SkillsEditor from './SkillsEditor';

export default function ProfileSettingsDialog({ isOpen, onClose, userRole = 'applicant', onProfileUpdate }) {  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [personalDetailsLocked, setPersonalDetailsLocked] = useState(false);
  const [personalDetailsChanged, setPersonalDetailsChanged] = useState(false);
  const [savingPersonalDetails, setSavingPersonalDetails] = useState(false);
  const [personalDetailsSaved, setPersonalDetailsSaved] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillsSaved, setSkillsSaved] = useState(false);  const [savingEducation, setSavingEducation] = useState(false);
  const [educationSaved, setEducationSaved] = useState(false);
  const [savingExperience, setSavingExperience] = useState(false);
  const [experienceSaved, setExperienceSaved] = useState(false);
  const [savingCertifications, setSavingCertifications] = useState(false);
  const [certificationsSaved, setCertificationsSaved] = useState(false);const [profileData, setProfileData] = useState({
    // Personal Information
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    dateOfBirth: '',
    gender: '',
    
    // Education
    education: [],
    
    // Work Experience
    workExperience: [],
      // Skills
    skills: [],
    
    // Certifications
    certifications: []
  });  // Define fetchProfileData function
  const fetchProfileData = async () => {
    setLoading(true);
    try {
      console.log('🔍 ProfileSettingsDialog: Fetching profile data...');
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }
      
      const response = await fetch('/api/applicant/profile', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      console.log('📊 ProfileSettingsDialog: API Response:', result);
      
      if (response.ok && result.success && result.data) {
        console.log('✅ ProfileSettingsDialog: Profile data received:', result.data);
        
        // Map the flat API response to the expected nested structure
        const userData = result.data;setProfileData({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          phone: userData.phone || '',
          address: userData.address || '',
          city: userData.city || '',
          state: userData.state || '',
          zipCode: userData.zipCode || '',
          dateOfBirth: userData.dateOfBirth || '',
          gender: userData.gender || '',
          education: Array.isArray(userData.education) ? userData.education : [],
          workExperience: Array.isArray(userData.workExperience) ? userData.workExperience : [],
          skills: Array.isArray(userData.skills) ? userData.skills : [],
          certifications: Array.isArray(userData.certifications) ? userData.certifications : []
        });
        
        console.log('🔄 ProfileSettingsDialog: Mapped profile data:', {
          firstName: userData.firstName || 'N/A',
          lastName: userData.lastName || 'N/A',
          email: userData.email || 'N/A',
          phone: userData.phone || 'N/A',
          educationCount: Array.isArray(userData.education) ? userData.education.length : 0,
          workExperienceCount: Array.isArray(userData.workExperience) ? userData.workExperience.length : 0,
          skillsCount: Array.isArray(userData.skills) ? userData.skills.length : 0
        });
      } else {
        console.log('No profile data found, using defaults');
        // If no profile data exists yet, keep default empty state
      }
    } catch (error) {
      console.error('💥 Error fetching profile:', error);
      // For now, just log the error and continue with empty profile data
      // In a real app, you might want to show a user-friendly error message
    } finally {
      setLoading(false);
    }
  };

  // Fetch profile data when dialog opens
  useEffect(() => {
    if (isOpen && userRole === 'applicant') {
      fetchProfileData();
    }
  }, [isOpen, userRole]);  const handleSave = async () => {
    setSaving(true);
    try {
      console.log('Saving profile data:', JSON.stringify(profileData, null, 2));
      console.log('Auth token exists:', localStorage.getItem('token') ? 'Yes' : 'No');
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }
      
      const response = await fetch('/api/applicant/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      
      const result = await response.json();
      console.log('Profile save response:', result);
      
      if (!response.ok) {
        throw new Error(result.message || `Error: ${response.status}`);
      }
      
      if (result.success) {
        onClose();
      } else {
        throw new Error(result.message || 'Failed to save profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      console.error('Error details:', error.message);
      alert(`Error saving profile: ${error.message || 'Please try again.'}`);
    } finally {
      setSaving(false);
    }
  };
  const handleInputChange = (field, value) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Mark personal details as changed if it's a personal field
    const personalFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'dateOfBirth', 'gender'];
    if (personalFields.includes(field)) {
      setPersonalDetailsChanged(true);
      setPersonalDetailsLocked(false); // Unlock if user starts editing
    }
  };

  // Helper function to get input props for personal fields
  const getPersonalInputProps = (baseProps = {}) => ({
    ...baseProps,
    disabled: personalDetailsLocked,
    className: `w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${
      personalDetailsLocked ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''
    } ${baseProps.className || ''}`
  });

  const handleArrayFieldChange = (arrayName, index, field, value) => {
    setProfileData(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const addArrayItem = (arrayName, defaultItem) => {
    setProfileData(prev => ({
      ...prev,
      [arrayName]: [...prev[arrayName], defaultItem]
    }));
  };

  const removeArrayItem = (arrayName, index) => {
    setProfileData(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].filter((_, i) => i !== index)
    }));
  };  const handleSkillsChange = (skillsArray) => {
    setProfileData(prev => ({
      ...prev,
      skills: skillsArray
    }));
  };

  const tabs = [
    { id: 'personal', label: 'Personal Info', icon: <User size={16} /> },
    { id: 'education', label: 'Education', icon: <GraduationCap size={16} /> },
    { id: 'experience', label: 'Experience', icon: <Briefcase size={16} /> },
    { id: 'skills', label: 'Skills', icon: <Award size={16} /> },
    { id: 'certifications', label: 'Certifications', icon: <Award size={16} /> },
  ];
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="card claymorphism max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <h2 className="text-3xl font-bold text-foreground">Profile Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-muted/50 rounded-full transition-all border border-border hover:border-foreground backdrop-blur-sm"
          >
            <X size={24} className="text-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-8 py-5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 backdrop-blur-sm ${
                  activeTab === tab.id
                    ? 'text-foreground border-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 border-transparent hover:border-border'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-primary' : 'text-muted-foreground'}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[65vh] bg-muted/20 backdrop-blur-sm">          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Personal Information Tab */}
              {activeTab === 'personal' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">
                        <User size={16} className="inline mr-2" />
                        First Name
                      </label>                      <input
                        type="text"
                        value={profileData.firstName || ''}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        disabled={personalDetailsLocked}
                        className={`w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${
                          personalDetailsLocked ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">
                        Last Name
                      </label>                      <input
                        type="text"
                        value={profileData.lastName || ''}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        disabled={personalDetailsLocked}
                        className={`w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${
                          personalDetailsLocked ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                  </div>                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">
                        <Mail size={16} className="inline mr-2" />
                        Email
                      </label>                      <input
                        type="email"
                        value={profileData.email || ''}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        disabled={personalDetailsLocked}
                        className={`w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${
                          personalDetailsLocked ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">
                        <Phone size={16} className="inline mr-2" />
                        Phone
                      </label>
                      <input                        type="tel"
                        value={profileData.phone || ''}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        {...getPersonalInputProps()}
                      />
                    </div>
                  </div>                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-3">
                      <MapPin size={16} className="inline mr-2" />
                      Address
                    </label>                    <input
                      type="text"
                      value={profileData.address || ''}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      {...getPersonalInputProps()}
                    />
                  </div>                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">City</label>                      <input
                        type="text"
                        value={profileData.city || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        {...getPersonalInputProps()}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">State</label>                      <input
                        type="text"
                        value={profileData.state || ''}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        {...getPersonalInputProps()}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">Zip Code</label>                      <input
                        type="text"
                        value={profileData.zipCode || ''}
                        onChange={(e) => handleInputChange('zipCode', e.target.value)}
                        {...getPersonalInputProps()}
                      />
                    </div>
                  </div>                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">
                        <Calendar size={16} className="inline mr-2" />
                        Date of Birth
                      </label>                      <input
                        type="date"
                        value={profileData.dateOfBirth || ''}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        {...getPersonalInputProps()}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">Gender</label>                      <select
                        value={profileData.gender || ''}
                        onChange={(e) => handleInputChange('gender', e.target.value)}
                        {...getPersonalInputProps({ className: 'bg-background' })}
                      >
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                      </select>
                    </div>
                  </div>                  {/* Confirm/Edit Personal Details Button */}
                  <div className="flex justify-end pt-6 border-t border-border">
                    <button                      onClick={async () => {
                        if (personalDetailsLocked) {
                          // Enable editing mode
                          setPersonalDetailsLocked(false);
                          setPersonalDetailsChanged(false);
                          setPersonalDetailsSaved(false);
                        } else {
                          // Save personal details
                          try {
                            setSavingPersonalDetails(true);
                            console.log('💾 Saving personal info only...');
                            
                            // Only save personal info fields
                            const personalInfoData = {
                              firstName: profileData.firstName,
                              lastName: profileData.lastName,
                              email: profileData.email,
                              phone: profileData.phone,
                              address: profileData.address,
                              city: profileData.city,
                              state: profileData.state,
                              zipCode: profileData.zipCode,
                              dateOfBirth: profileData.dateOfBirth,
                              gender: profileData.gender
                            };
                            
                            console.log('📤 Personal info to save:', personalInfoData);
                            
                            // Use direct fetch to avoid apiClient issues
                            const token = localStorage.getItem('token');
                            if (!token) {
                              throw new Error('Authentication token not found. Please log in again.');
                            }
                            
                            const response = await fetch('/api/applicant/profile', {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify(personalInfoData)
                            });
                            
                            const result = await response.json();
                            console.log('✅ Personal info save response:', result);
                            
                            if (!response.ok) {
                              throw new Error(result.message || `Error: ${response.status}`);
                            }
                              if (result.success) {
                              // Lock the fields and show success
                              setPersonalDetailsLocked(true);
                              setPersonalDetailsChanged(false);
                              setPersonalDetailsSaved(true);
                              
                              // Notify parent component of profile update
                              if (typeof onProfileUpdate === 'function') {
                                console.log('🔔 Notifying parent of profile update...');
                                onProfileUpdate();
                              }
                              
                              // Reset success state after 2 seconds
                              setTimeout(() => {
                                setPersonalDetailsSaved(false);
                              }, 2000);
                            } else {
                              throw new Error(result.message || 'Failed to save');
                            }
                          } catch (error) {
                            console.error('💥 Error saving personal info:', error);
                            alert(`Error saving personal information: ${error.message}`);
                          } finally {
                            setSavingPersonalDetails(false);
                          }
                        }
                      }}                      disabled={savingPersonalDetails}
                      id="personal-details-btn"
                      className={`flex items-center gap-2 px-6 py-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold ${
                        personalDetailsLocked 
                          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90 border-2 border-border' 
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      {savingPersonalDetails ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                          Saving...
                        </>
                      ) : personalDetailsSaved ? (
                        <>
                          <CheckCircle size={16} />
                          Personal Details Saved!
                        </>
                      ) : personalDetailsLocked ? (
                        <>
                          <Edit size={16} />
                          Edit Personal Details
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          Confirm Personal Details
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}{/* Education Tab */}
              {activeTab === 'education' && (
                <div className="space-y-6">                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground">Education</h3>
                    <button
                      onClick={() => addArrayItem('education', {
                        institution: '',
                        degree: '',
                        field: '',
                        startDate: '',
                        endDate: '',
                        gpa: ''
                      })}
                      className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold"
                    >
                      <Plus size={16} />
                      Add Education
                    </button>
                  </div>{profileData.education.map((edu, index) => (                    <div key={index} className="border-2 border-border rounded-lg p-6 space-y-6 bg-card">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-foreground text-lg">Education {index + 1}</h4>
                        <button
                          onClick={() => removeArrayItem('education', index)}
                          className="text-red-600 hover:text-red-800 transition-colors p-2 hover:bg-red-50 rounded-full"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Institution</label>
                          <input
                            type="text"
                            value={edu.institution || ''}
                            onChange={(e) => handleArrayFieldChange('education', index, 'institution', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Degree</label>
                          <input
                            type="text"
                            value={edu.degree || ''}
                            onChange={(e) => handleArrayFieldChange('education', index, 'degree', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Field of Study</label>
                          <input
                            type="text"
                            value={edu.field || ''}
                            onChange={(e) => handleArrayFieldChange('education', index, 'field', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Start Date</label>
                          <input
                            type="date"
                            value={edu.startDate || ''}
                            onChange={(e) => handleArrayFieldChange('education', index, 'startDate', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">End Date</label>
                          <input
                            type="date"
                            value={edu.endDate || ''}
                            onChange={(e) => handleArrayFieldChange('education', index, 'endDate', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-3">GPA (Optional)</label>
                        <input
                          type="text"
                          value={edu.gpa || ''}
                          onChange={(e) => handleArrayFieldChange('education', index, 'gpa', e.target.value)}
                          className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          placeholder="e.g., 3.8/4.0"
                        />
                      </div>
                    </div>
                  ))}                  {profileData.education.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border-2 border-border">
                      <p className="text-lg">No education records added yet.</p>
                      <p className="text-sm mt-2">Click "Add Education" to get started.</p>
                    </div>
                  )}
                  
                  {/* Education Confirmation Button */}
                  {profileData.education.length > 0 && (
                    <div className="flex justify-end pt-6 border-t border-border">
                      <button
                        onClick={async () => {
                          try {
                            setSavingEducation(true);
                              // Send complete profile data with updated education
                            const completeData = {
                              firstName: profileData.firstName,
                              lastName: profileData.lastName,
                              email: profileData.email,
                              phone: profileData.phone,
                              address: profileData.address,
                              city: profileData.city,
                              state: profileData.state,
                              zipCode: profileData.zipCode,
                              dateOfBirth: profileData.dateOfBirth,
                              gender: profileData.gender,
                              education: profileData.education,
                              workExperience: profileData.workExperience || [],
                              skills: profileData.skills || [],
                              certifications: profileData.certifications || []
                            };
                            
                            console.log('Saving complete profile data with education:', completeData);
                            console.log('Current profileData.education:', profileData.education);
                            console.log('Education array length:', profileData.education?.length || 0);
                            
                            // Validate that we have meaningful education data
                            const validEducation = profileData.education?.filter(edu => 
                              edu?.institution?.trim() && 
                              edu?.degree?.trim()
                            );
                            console.log('Valid education entries:', validEducation?.length || 0);
                            
                            if (!validEducation || validEducation.length === 0) {
                              throw new Error('Please fill in at least Institution and Degree fields before saving.');
                            }
                            
                            const token = localStorage.getItem('token');
                            if (!token) {
                              throw new Error('Authentication token not found. Please log in again.');
                            }
                            
                            const response = await fetch('/api/applicant/profile', {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify(completeData)
                            });
                              const result = await response.json();
                            console.log('Education save result:', result);
                            console.log('Education data that was sent:', completeData);
                            
                            if (!response.ok) {
                              throw new Error(result.message || `Error: ${response.status}`);
                            }
                              // Show success state
                            setEducationSaved(true);
                            
                            // Notify parent component of profile update
                            if (typeof onProfileUpdate === 'function') {
                              console.log('🔔 Notifying parent of profile update...');
                              onProfileUpdate();
                            }
                            
                            // Reset success state after 2 seconds
                            setTimeout(() => {
                              setEducationSaved(false);
                            }, 2000);
                            
                            // Refresh profile data to update the completion percentage
                            if (typeof fetchProfileData === 'function') {
                              console.log('🔄 Refreshing profile data after education save...');
                              fetchProfileData();
                            }
                          } catch (error) {
                            console.error('Failed to save education:', error);
                            alert(`Error saving education: ${error.message}`);
                          } finally {
                            setSavingEducation(false);
                          }
                        }}
                        disabled={savingEducation}
                        className={`flex items-center gap-2 px-6 py-3 rounded-md transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                          educationSaved 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {savingEducation ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                            Saving...
                          </>
                        ) : educationSaved ? (
                          <>
                            <CheckCircle size={16} />
                            Education Saved!
                          </>
                        ) : (
                          <>
                            <Save size={16} />
                            Confirm Education
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}{/* Work Experience Tab */}
              {activeTab === 'experience' && (
                <div className="space-y-6">                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground">Work Experience</h3>
                    <button
                      onClick={() => addArrayItem('workExperience', {
                        company: '',
                        position: '',
                        startDate: '',
                        endDate: '',
                        current: false,
                        description: ''
                      })}
                      className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold"
                    >
                      <Plus size={16} />
                      Add Experience
                    </button>
                  </div>{profileData.workExperience.map((exp, index) => (                    <div key={index} className="border-2 border-border rounded-lg p-6 space-y-6 bg-card">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-foreground text-lg">Experience {index + 1}</h4>
                        <button
                          onClick={() => removeArrayItem('workExperience', index)}
                          className="text-red-600 hover:text-red-800 transition-colors p-2 hover:bg-red-50 rounded-full"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Company</label>
                          <input
                            type="text"
                            value={exp.company || ''}
                            onChange={(e) => handleArrayFieldChange('workExperience', index, 'company', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Position</label>
                          <input
                            type="text"
                            value={exp.position || ''}
                            onChange={(e) => handleArrayFieldChange('workExperience', index, 'position', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Start Date</label>
                          <input
                            type="date"
                            value={exp.startDate || ''}
                            onChange={(e) => handleArrayFieldChange('workExperience', index, 'startDate', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">End Date</label>
                          <input
                            type="date"
                            value={exp.endDate || ''}
                            onChange={(e) => handleArrayFieldChange('workExperience', index, 'endDate', e.target.value)}
                            disabled={exp.current}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
                          />
                          <label className="flex items-center mt-3">
                            <input
                              type="checkbox"
                              checked={exp.current || false}
                              onChange={(e) => handleArrayFieldChange('workExperience', index, 'current', e.target.checked)}
                              className="mr-3 h-4 w-4 text-primary focus:ring-primary border-border rounded"
                            />
                            <span className="text-sm font-medium text-foreground">Currently working here</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-3">Description</label>
                        <textarea
                          value={exp.description || ''}
                          onChange={(e) => handleArrayFieldChange('workExperience', index, 'description', e.target.value)}
                          rows={4}
                          className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          placeholder="Describe your responsibilities and achievements..."
                        />
                      </div>
                    </div>
                  ))}                  {profileData.workExperience.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border-2 border-border">
                      <p className="text-lg">No work experience added yet.</p>
                      <p className="text-sm mt-2">Click "Add Experience" to get started.</p>
                    </div>
                  )}
                  
                  {/* Experience Confirmation Button */}
                  {profileData.workExperience.length > 0 && (
                    <div className="flex justify-end pt-6 border-t border-border">
                      <button
                        onClick={async () => {
                          try {
                            setSavingExperience(true);
                              // Send complete profile data with updated experience
                            const completeData = {
                              firstName: profileData.firstName,
                              lastName: profileData.lastName,
                              email: profileData.email,
                              phone: profileData.phone,
                              address: profileData.address,
                              city: profileData.city,
                              state: profileData.state,
                              zipCode: profileData.zipCode,
                              dateOfBirth: profileData.dateOfBirth,
                              gender: profileData.gender,
                              education: profileData.education || [],
                              workExperience: profileData.workExperience,
                              skills: profileData.skills || [],
                              certifications: profileData.certifications || []
                            };
                            
                            console.log('Saving complete profile data with experience:', completeData);
                            console.log('Current profileData.workExperience:', profileData.workExperience);
                            console.log('Experience array length:', profileData.workExperience?.length || 0);
                            
                            // Validate that we have meaningful experience data
                            const validExperience = profileData.workExperience?.filter(exp => 
                              exp?.company?.trim() && 
                              exp?.position?.trim()
                            );
                            console.log('Valid experience entries:', validExperience?.length || 0);
                            
                            if (!validExperience || validExperience.length === 0) {
                              throw new Error('Please fill in at least Company and Position fields before saving.');
                            }
                            
                            const token = localStorage.getItem('token');
                            if (!token) {
                              throw new Error('Authentication token not found. Please log in again.');
                            }
                            
                            const response = await fetch('/api/applicant/profile', {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify(completeData)
                            });
                            
                            const result = await response.json();
                            console.log('Experience save result:', result);
                            
                            if (!response.ok) {
                              throw new Error(result.message || `Error: ${response.status}`);
                            }
                              // Show success state
                            setExperienceSaved(true);
                            
                            // Notify parent component of profile update
                            if (typeof onProfileUpdate === 'function') {
                              console.log('🔔 Notifying parent of profile update...');
                              onProfileUpdate();
                            }
                            
                            // Reset success state after 2 seconds
                            setTimeout(() => {
                              setExperienceSaved(false);
                            }, 2000);
                          } catch (error) {
                            console.error('Failed to save experience:', error);
                            alert(`Error saving experience: ${error.message}`);
                          } finally {
                            setSavingExperience(false);
                          }
                        }}
                        disabled={savingExperience}
                        className={`flex items-center gap-2 px-6 py-3 rounded-md transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                          experienceSaved 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {savingExperience ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                            Saving...
                          </>
                        ) : experienceSaved ? (
                          <>
                            <CheckCircle size={16} />
                            Experience Saved!
                          </>
                        ) : (
                          <>
                            <Save size={16} />
                            Confirm Experience
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}{/* Skills Tab */}
              {activeTab === 'skills' && (                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Skills</h3>
                  <div className="bg-card p-6 rounded-lg border-2 border-border">
                    <SkillsEditor
                      skills={profileData.skills}
                      onChange={handleSkillsChange}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground mt-4 font-medium">
                      Select skills from the suggestions or type to search. These will help match you with relevant job opportunities.
                    </p>                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={async () => {                          try {
                            setSavingSkills(true);
                            
                            // Send complete profile data with updated skills
                            const completeData = {
                              firstName: profileData.firstName,
                              lastName: profileData.lastName,
                              email: profileData.email,
                              phone: profileData.phone,
                              address: profileData.address,
                              city: profileData.city,
                              state: profileData.state,
                              zipCode: profileData.zipCode,
                              dateOfBirth: profileData.dateOfBirth,
                              gender: profileData.gender,
                              education: profileData.education || [],
                              workExperience: profileData.workExperience || [],
                              skills: profileData.skills,
                              certifications: profileData.certifications || []
                            };
                            
                            console.log('Saving complete profile data with skills:', completeData);
                            
                            // Use a direct fetch instead of the apiClient to bypass potential issues
                            const token = localStorage.getItem('token');
                            if (!token) {
                              throw new Error('Authentication token not found. Please log in again.');
                            }
                            
                            const response = await fetch('/api/applicant/profile', {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify(completeData)
                            });
                            
                            const result = await response.json();
                            console.log('Skills save result:', result);
                            
                            if (!response.ok) {
                              throw new Error(result.message || `Error: ${response.status}`);
                            }
                              // Show success state
                            setSkillsSaved(true);
                            
                            // Notify parent component of profile update
                            if (typeof onProfileUpdate === 'function') {
                              console.log('🔔 Notifying parent of profile update...');
                              onProfileUpdate();
                            }
                            
                            // Reset success state after 2 seconds
                            setTimeout(() => {
                              setSkillsSaved(false);
                            }, 2000);
                          } catch (error) {
                            console.error('Failed to save skills:', error);
                            alert(`Error saving skills: ${error.message}`);
                          } finally {
                            setSavingSkills(false);
                          }
                        }}
                        id="skills-confirm-btn"
                        disabled={savingSkills}
                        className={`flex items-center px-6 py-3 rounded-md transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                          skillsSaved 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {savingSkills ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                            Saving...
                          </>
                        ) : skillsSaved ? (
                          <>
                            <CheckCircle size={16} className="mr-2" />
                            Skills Saved!
                          </>
                        ) : (
                          'Confirm Skills'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}{/* Certifications Tab */}
              {activeTab === 'certifications' && (
                <div className="space-y-6">                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground">Certifications</h3>
                    <button
                      onClick={() => addArrayItem('certifications', {
                        name: '',
                        issuer: '',
                        dateIssued: '',
                        expiryDate: '',
                        credentialId: '',
                        url: ''
                      })}
                      className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold"
                    >
                      <Plus size={16} />
                      Add Certification
                    </button>
                  </div>{profileData.certifications.map((cert, index) => (                    <div key={index} className="border-2 border-border rounded-lg p-6 space-y-6 bg-card">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-foreground text-lg">Certification {index + 1}</h4>
                        <button
                          onClick={() => removeArrayItem('certifications', index)}
                          className="text-red-600 hover:text-red-800 transition-colors p-2 hover:bg-red-50 rounded-full"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Certification Name</label>
                          <input
                            type="text"
                            value={cert.name || ''}
                            onChange={(e) => handleArrayFieldChange('certifications', index, 'name', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Issuing Organization</label>
                          <input
                            type="text"
                            value={cert.issuer || ''}
                            onChange={(e) => handleArrayFieldChange('certifications', index, 'issuer', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Date Issued</label>
                          <input
                            type="date"
                            value={cert.dateIssued || ''}
                            onChange={(e) => handleArrayFieldChange('certifications', index, 'dateIssued', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Expiry Date (Optional)</label>
                          <input
                            type="date"
                            value={cert.expiryDate || ''}
                            onChange={(e) => handleArrayFieldChange('certifications', index, 'expiryDate', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Credential ID (Optional)</label>
                          <input
                            type="text"
                            value={cert.credentialId || ''}
                            onChange={(e) => handleArrayFieldChange('certifications', index, 'credentialId', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-3">Credential URL (Optional)</label>
                          <input
                            type="url"
                            value={cert.url || ''}
                            onChange={(e) => handleArrayFieldChange('certifications', index, 'url', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}                  {profileData.certifications.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border-2 border-border">
                      <p className="text-lg">No certifications added yet.</p>
                      <p className="text-sm mt-2">Click "Add Certification" to get started.</p>
                    </div>
                  )}
                  
                  {/* Certifications Confirmation Button */}
                  {profileData.certifications.length > 0 && (
                    <div className="flex justify-end pt-6 border-t border-border">
                      <button
                        onClick={async () => {
                          try {
                            setSavingCertifications(true);
                              // Send complete profile data with updated certifications
                            const completeData = {
                              firstName: profileData.firstName,
                              lastName: profileData.lastName,
                              email: profileData.email,
                              phone: profileData.phone,
                              address: profileData.address,
                              city: profileData.city,
                              state: profileData.state,
                              zipCode: profileData.zipCode,
                              dateOfBirth: profileData.dateOfBirth,
                              gender: profileData.gender,
                              education: profileData.education || [],
                              workExperience: profileData.workExperience || [],
                              skills: profileData.skills || [],
                              certifications: profileData.certifications
                            };
                            
                            console.log('Saving complete profile data with certifications:', completeData);
                            
                            const token = localStorage.getItem('token');
                            if (!token) {
                              throw new Error('Authentication token not found. Please log in again.');
                            }
                            
                            const response = await fetch('/api/applicant/profile', {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify(completeData)
                            });
                            
                            const result = await response.json();
                            console.log('Certifications save result:', result);
                            
                            if (!response.ok) {
                              throw new Error(result.message || `Error: ${response.status}`);
                            }
                              // Show success state
                            setCertificationsSaved(true);
                            
                            // Notify parent component of profile update
                            if (typeof onProfileUpdate === 'function') {
                              console.log('🔔 Notifying parent of profile update...');
                              onProfileUpdate();
                            }
                            
                            // Reset success state after 2 seconds
                            setTimeout(() => {
                              setCertificationsSaved(false);
                            }, 2000);
                          } catch (error) {
                            console.error('Failed to save certifications:', error);
                            alert(`Error saving certifications: ${error.message}`);
                          } finally {
                            setSavingCertifications(false);
                          }
                        }}
                        disabled={savingCertifications}
                        className={`flex items-center gap-2 px-6 py-3 rounded-md transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                          certificationsSaved 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {savingCertifications ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                            Saving...
                          </>
                        ) : certificationsSaved ? (
                          <>
                            <CheckCircle size={16} />
                            Certifications Saved!
                          </>
                        ) : (
                          <>
                            <Save size={16} />
                            Confirm Certifications
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>        {/* Footer */}
        <div className="flex items-center justify-end gap-4 p-6 border-t-2 border-border bg-card">
          <button
            onClick={onClose}
            className="px-6 py-3 text-foreground border-2 border-border rounded-md hover:bg-muted hover:border-foreground transition-colors font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
