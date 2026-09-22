'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  User, 
  Briefcase, 
  FileText, 
  MessageSquare, 
  Bell, 
  Settings, 
  LogOut,
  GraduationCap,
  Video,
  Target
} from 'lucide-react';
import ProfileSettingsDialog from './ProfileSettingsDialog';
import NotificationPanel from './NotificationPanel';
import DarkModeToggle from './DarkModeToggle';

export default function Sidebar({ role }) {
  const pathname = usePathname();  const [isOpen, setIsOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const sidebarRef = useRef(null);
    // Define menu items based on role
  const menuItems = role === 'applicant' ? [
    { icon: <Home size={18} />, label: 'Dashboard', href: '/dashboard/applicant' },
    { icon: <User size={18} />, label: 'Profile', href: '#', onClick: () => setIsProfileDialogOpen(true) },
    { icon: <Briefcase size={18} />, label: 'Jobs', href: '/dashboard/applicant/jobs' },
    { icon: <GraduationCap size={18} />, label: 'Prep Plans', href: '/dashboard/applicant/prep-plans' },
    { icon: <Target size={18} />, label: 'Career Plan', href: '/dashboard/applicant/career-plan' },
    { icon: <Video size={18} />, label: 'Mock Interview', href: '/dashboard/applicant/mock-interview' },
    { icon: <FileText size={18} />, label: 'Quiz', href: '/quiz' },
    { icon: <MessageSquare size={18} />, label: 'Video Assistant', href: '/video-ai-assistant' },
    { icon: <FileText size={18} />, label: 'Applications', href: '#' },
    { icon: <Bell size={18} />, label: 'Notifications', href: '#', onClick: () => setIsNotificationPanelOpen(true) },
    { icon: <Settings size={18} />, label: 'Settings', href: '#' },
  ] : [
    { icon: <Home size={18} />, label: 'Dashboard', href: '/dashboard/recruiter' },
    { icon: <Briefcase size={18} />, label: 'Job Postings', href: '/dashboard/recruiter/jobs' },
    { icon: <FileText size={18} />, label: 'Applications', href: '#' },
    { icon: <MessageSquare size={18} />, label: 'Messages', href: '#' },
    { icon: <Settings size={18} />, label: 'Settings', href: '#' },
  ];
  useEffect(() => {
    // Function to handle mouse enter on the left edge
    const handleMouseEnter = () => {
      setIsOpen(true);
    };
    
    // Function to handle mouse leave
    const handleMouseLeave = (e) => {
      // Check if mouse is still within the sidebar
      if (!sidebarRef.current?.contains(e.relatedTarget)) {
        setIsOpen(false);
      }
    };
    
    // Add event listener to sidebar for mouse leave
    const sidebar = sidebarRef.current;
    if (sidebar) {
      sidebar.addEventListener('mouseleave', handleMouseLeave);
    }
    
    // Cleanup
    return () => {
      if (sidebar) {
        sidebar.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, []);  return (
    <>      {/* Trigger area - React-based instead of DOM manipulation */}
      <div 
        className="fixed top-0 left-0 w-5 h-full z-40 cursor-pointer"        onMouseEnter={() => setIsOpen(true)}
      />      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`sidebar fixed top-0 left-0 h-screen bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border shadow-2xl transition-all duration-300 ease-in-out z-50 ${
          isOpen ? 'w-64 opacity-100' : 'w-0 opacity-0'
        }`}
        style={{ 
          backdropFilter: 'blur(20px) saturate(150%)',
          WebkitBackdropFilter: 'blur(20px) saturate(150%)'
        }}
      >        <div className="h-16 border-b border-sidebar-border/50 flex items-center justify-between px-6 bg-sidebar-accent/10">
          <Link 
            href={role === 'applicant' ? '/dashboard/applicant' : '/dashboard/recruiter'} 
            className="header-link text-xl font-bold text-sidebar-foreground hover:text-sidebar-primary transition-colors cursor-pointer flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          >
            X-CEED
          </Link>
          <div className="header-controls flex items-center space-x-3 flex-shrink-0">
            <div onClick={(e) => e.stopPropagation()}>
              <DarkModeToggle />
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors p-2 rounded-md hover:bg-sidebar-accent/20"
              aria-label="Close menu"
            >              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        
        <div className="py-4 flex-1 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {menuItems.map((item, index) => (
              <li key={index}>
                {item.onClick ? (
                  <button 
                    onClick={item.onClick}
                    className={`sidebar-item flex items-center px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-accent-foreground cursor-pointer w-full text-left transition-all duration-200 rounded-lg group ${
                      pathname === item.href ? 'active bg-sidebar-primary text-sidebar-primary-foreground shadow-md' : ''
                    }`}
                  >
                    <span className="sidebar-icon mr-3 text-current group-hover:scale-110 transition-transform">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ) : (
                  <Link 
                    href={item.href} 
                    className={`sidebar-item flex items-center px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-accent-foreground cursor-pointer transition-all duration-200 rounded-lg group ${
                      pathname === item.href ? 'active bg-sidebar-primary text-sidebar-primary-foreground shadow-md' : ''
                    }`}
                  >
                    <span className="sidebar-icon mr-3 text-current group-hover:scale-110 transition-transform">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>        <div className="border-t border-sidebar-border/50 p-3 bg-sidebar-accent/5">
          <Link 
            href="/auth" 
            className="sidebar-item flex items-center px-4 py-3 text-sidebar-foreground hover:bg-red-500/20 hover:text-red-400 cursor-pointer transition-all duration-200 rounded-lg group"
          >
            <span className="sidebar-icon mr-3 text-current group-hover:scale-110 transition-transform"><LogOut size={18} /></span>
            <span className="font-medium">Sign out</span>
          </Link>
        </div>
      </div>      {/* Profile Settings Dialog - Outside sidebar container */}
      <ProfileSettingsDialog 
        isOpen={isProfileDialogOpen}
        onClose={() => setIsProfileDialogOpen(false)}
        userRole={role}
      />

      {/* Notification Panel - Outside sidebar container */}
      <NotificationPanel 
        isOpen={isNotificationPanelOpen}
        onClose={() => setIsNotificationPanelOpen(false)}
      />
    </>
  );
}
