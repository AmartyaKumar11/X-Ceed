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
        className={`sidebar glass fixed top-0 left-0 h-screen transition-all duration-300 ease-in-out z-50 overflow-hidden ${
          isOpen ? 'w-64 opacity-100' : 'w-0 opacity-0'
        }`}
      >        <div className="h-14 flex items-center justify-between px-5 shadow-[inset_0_-1px_0_0_hsl(var(--border)/0.4)]">
          <Link 
            href={role === 'applicant' ? '/dashboard/applicant' : '/dashboard/recruiter'} 
            className="header-link text-sm font-medium tracking-[-0.02em] text-sidebar-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          >
            <span className="vercel-gradient size-4 rounded-sm" aria-hidden />
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
                    className={`sidebar-item flex items-center px-3 py-2 text-sm text-sidebar-foreground hover:bg-muted cursor-pointer w-full text-left transition-colors rounded-md group ${
                      pathname === item.href ? 'text-vercel-blue shadow-[inset_2px_0_0_0_hsl(var(--vercel-blue))] bg-muted/50' : ''
                    }`}
                  >
                    <span className="sidebar-icon mr-3 text-current">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ) : (
                  <Link 
                    href={item.href} 
                    className={`sidebar-item flex items-center px-3 py-2 text-sm text-sidebar-foreground hover:bg-muted cursor-pointer transition-colors rounded-md group ${
                      pathname === item.href ? 'text-vercel-blue shadow-[inset_2px_0_0_0_hsl(var(--vercel-blue))] bg-muted/50' : ''
                    }`}
                  >
                    <span className="sidebar-icon mr-3 text-current">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>        <div className="p-3 shadow-[inset_0_1px_0_0_hsl(var(--border)/0.4)]">
          <Link 
            href="/auth" 
            className="sidebar-item flex items-center px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors rounded-md group"
          >
            <span className="sidebar-icon mr-3 text-current"><LogOut size={18} /></span>
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
