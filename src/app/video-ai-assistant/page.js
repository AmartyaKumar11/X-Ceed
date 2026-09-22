'use client';

import { useState, useEffect, useRef, useCallback, Suspense} from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, Loader2, Download, Scissors, Camera, FolderPlus, Bot, Video, MessageSquare, FileText, Clock, Play, ExternalLink, Pause, Square, SkipForward, Trash, Brain } from 'lucide-react';
import TypingAnimation from '@/components/TypingAnimation';
import GoogleIntegration from '@/components/GoogleIntegration';

function VideoAIAssistantInner() {
  const searchParams = useSearchParams();
  const [videoId, setVideoId] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoChannel, setVideoChannel] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pausedMessages, setPausedMessages] = useState(new Set());
  const [completedMessages, setCompletedMessages] = useState(new Set());
  const [showFullContent, setShowFullContent] = useState(new Set());
  const [pendingNotes, setPendingNotes] = useState(null);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);  const [showDocumentNameDialog, setShowDocumentNameDialog] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [showProjectSetupDialog, setShowProjectSetupDialog] = useState(false);
  const [projectFolder, setProjectFolder] = useState(null);
  const [projectFolderName, setProjectFolderName] = useState('');  const [existingDoc, setExistingDoc] = useState(null);
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const [availableDocs, setAvailableDocs] = useState([]);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [showScreenshotDialog, setShowScreenshotDialog] = useState(false);
  const [pendingScreenshot, setPendingScreenshot] = useState(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(50); // Percentage
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef(null);  // Cloud database functions (replace localStorage)
  const saveChatToDatabase = async (sessionData) => {
    try {
      const response = await fetch('/api/chat-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    } catch (error) {
      console.warn('Failed to save to database:', error);
      // Fallback to localStorage
      const chatKey = `chat_${sessionData.videoId}_${btoa(sessionData.videoTitle || '').slice(0, 10)}`;
      saveToLocalStorage(`${chatKey}_messages`, sessionData.messages);
      saveToLocalStorage(`${chatKey}_projectFolder`, sessionData.projectFolder);
    }
  };

  const loadChatFromDatabase = async (videoId, videoTitle) => {
    try {
      const response = await fetch(`/api/chat-session?videoId=${videoId}&title=${encodeURIComponent(videoTitle)}`);
      const data = await response.json();
      if (data.success && data.session) {
        return {
          messages: data.session.messages || [],
          projectFolder: data.session.projectFolder || null
        };
      }
      return null;
    } catch (error) {
      console.warn('Failed to load from database:', error);
      // Fallback to localStorage
      const chatKey = `chat_${videoId}_${btoa(videoTitle || '').slice(0, 10)}`;
      const savedMessages = loadFromLocalStorage(`${chatKey}_messages`);
      const savedProjectFolder = loadFromLocalStorage(`${chatKey}_projectFolder`);
      if (savedMessages && savedMessages.length > 0) {
        return { messages: savedMessages, projectFolder: savedProjectFolder };
      }
      return null;
    }
  };

  // Keep localStorage as fallback
  const saveToLocalStorage = (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  };
  const loadFromLocalStorage = (key, defaultValue = null) => {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          
          // If loading messages, convert timestamp strings back to Date objects
          if (key.includes('_messages') && Array.isArray(parsed)) {
            return parsed.map(message => ({
              ...message,
              timestamp: new Date(message.timestamp)
            }));
          }
          
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
    }
    return defaultValue;
  };  useEffect(() => {
    const loadChatData = async () => {
      const currentVideoId = searchParams.get('videoId') || '';
      const currentVideoTitle = decodeURIComponent(searchParams.get('title') || '');
      const currentVideoChannel = decodeURIComponent(searchParams.get('channel') || '');
      
      setVideoId(currentVideoId);
      setVideoTitle(currentVideoTitle);
      setVideoChannel(currentVideoChannel);

      // Load saved panel width (keep in localStorage as it's user preference)
      const savedPanelWidth = loadFromLocalStorage('panelWidth', 50);
      setLeftPanelWidth(savedPanelWidth);

      if (!currentVideoId) return;

      // Try to load chat data from Firebase
      const savedData = await loadChatFromDatabase(currentVideoId, currentVideoTitle);
      
      if (savedData && savedData.messages && savedData.messages.length > 0) {
        // Restore saved chat from Firebase
        setMessages(savedData.messages);
        setProjectFolder(savedData.projectFolder);
        setCompletedMessages(new Set(savedData.messages.map(m => m.id)));
        setShowFullContent(new Set(savedData.messages.map(m => m.id)));
      } else {
        // Create new welcome message
        const welcomeMessage = {
          id: 1,
          type: 'ai',
          content: `Hi! I'm your AI video assistant. I can help you:

• Create detailed notes and summaries
• Clip specific sections of the video
• Take screenshots of key moments
• Save content to Google Drive
• Answer questions about the video content

**Want to stay organized?** I can create a dedicated Google Drive folder for this video project.

What would you like me to help you with?`,
          timestamp: new Date(),
          isWelcome: true,
          showProjectSetup: true
        };
        
        setMessages([welcomeMessage]);
        setCompletedMessages(new Set([1]));
        setShowFullContent(new Set([1]));
      }
    };

    loadChatData();
  }, [searchParams]);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };  useEffect(() => {
    scrollToBottom();
    
    // Save chat state to Firebase whenever messages change
    if (videoId && messages.length > 0) {
      // Debounce the save operation to avoid too many writes
      const timeoutId = setTimeout(() => {
        saveChatToDatabase({
          videoId,
          videoTitle,
          videoChannel,
          messages,
          projectFolder
        });
      }, 1000); // Wait 1 second after last change

      return () => clearTimeout(timeoutId);
    }
  }, [messages, projectFolder, videoId, videoTitle, videoChannel]);// Save panel width when it changes
  useEffect(() => {
    saveToLocalStorage('panelWidth', leftPanelWidth);
  }, [leftPanelWidth]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/video-ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          videoId: videoId,
          videoTitle: videoTitle,
          videoChannel: videoChannel,
          conversationHistory: messages
        }),
      });

      const data = await response.json();      if (data.success) {
        const aiMessage = {
          id: Date.now() + 1,
          type: 'ai',
          content: data.response,
          timestamp: new Date(),
          actions: data.actions || [],
          clips: data.clips,
          notes: data.notes
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // Check if AI generated notes and show document management dialog
        if (data.notes && data.notes.length > 0) {
          setPendingNotes({
            notes: data.notes,
            messageId: aiMessage.id
          });
          setShowDocumentDialog(true);
        }
      } else {
        throw new Error(data.error || 'Failed to get AI response');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const togglePause = (messageId) => {
    setPausedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const skipToEnd = (messageId) => {
    setShowFullContent(prev => new Set([...prev, messageId]));
    setPausedMessages(prev => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });
    setCompletedMessages(prev => new Set([...prev, messageId]));
  };
  const handleTypingComplete = useCallback((messageId) => {
    // Use setTimeout to defer the state update and avoid updating during render
    setTimeout(() => {
      setCompletedMessages(prev => new Set([...prev, messageId]));
      setPausedMessages(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }, 0);  }, []);  // Screenshot Functions
  const captureVideoScreenshot = async () => {
    if (!videoId) {
      alert('No video loaded to capture screenshot from.');
      return;
    }

    setIsCapturingScreenshot(true);

    try {
      // Try to get the current time from the YouTube iframe (if possible)
      let currentTime = 0;
      try {
        // Since we can't directly access YouTube iframe due to CORS,
        // we'll try to get a timestamp-based thumbnail
        // Note: This is a limitation - we can't get the exact current frame
        const iframe = document.querySelector('iframe[src*="youtube.com/embed"]');
        if (iframe && iframe.contentWindow) {
          // Unfortunately, we can't access the current time due to CORS
          console.log('Cannot access current video time due to CORS restrictions');
        }
      } catch (error) {
        console.log('Could not access video current time:', error.message);
      }

      // Show user dialog to input current timestamp
      const userTime = prompt(
        'To capture the current frame, please enter the current video timestamp (in seconds).\n\n' +
        'For example: enter "125" for 2:05, or "305" for 5:05\n\n' +
        'You can see the current time in the YouTube player controls.',
        '0'
      );

      if (userTime === null) {
        // User cancelled
        return;
      }

      const timestamp = parseInt(userTime) || 0;
      console.log('Attempting to capture screenshot at timestamp:', timestamp);

      // YouTube provides thumbnails at specific intervals, but we can try to get close
      // Unfortunately, YouTube doesn't provide frame-perfect thumbnails via public API
      // We'll use the best available thumbnail and note the timestamp
      
      const thumbnailUrls = [
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/default.jpg`
      ];
      
      // Try each thumbnail URL until one works
      for (let i = 0; i < thumbnailUrls.length; i++) {
        const thumbnailUrl = thumbnailUrls[i];
        console.log(`Trying thumbnail URL ${i + 1}:`, thumbnailUrl);
        
        try {
          await new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            // Enable CORS for the image
            img.crossOrigin = 'anonymous';
            
            img.onload = async () => {
              try {
                console.log('Image loaded successfully, dimensions:', img.width, 'x', img.height);
                
                // Set canvas size to image size
                canvas.width = img.width;
                canvas.height = img.height;
                
                // Draw the image on canvas
                ctx.drawImage(img, 0, 0);

                // Add timestamp overlay on the image
                if (timestamp > 0) {
                  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                  ctx.fillRect(10, 10, 200, 40);
                  ctx.fillStyle = 'white';
                  ctx.font = '16px Arial';
                  const timeStr = `${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}`;
                  ctx.fillText(`Timestamp: ${timeStr}`, 20, 35);
                }
                  // Convert canvas to blob
                canvas.toBlob(async (blob) => {
                  if (!blob) {
                    reject(new Error('Failed to create image blob'));
                    return;
                  }

                  console.log('Created blob with size:', blob.size, 'bytes');
                  
                  // Store screenshot data and show dialog
                  setPendingScreenshot({
                    blob: blob,
                    timestamp: timestamp,
                    fileName: `Screenshot_${videoTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp > 0 ? `${Math.floor(timestamp / 60)}m${timestamp % 60}s` : 'thumbnail'}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`
                  });
                  setShowScreenshotDialog(true);
                  resolve();
                }, 'image/jpeg', 0.9);
              } catch (error) {
                console.error('Error processing image:', error);
                reject(error);
              }
            };
            
            img.onerror = (e) => {
              console.error(`Failed to load thumbnail ${i + 1}:`, e);
              reject(new Error(`Failed to load thumbnail quality ${i + 1}`));
            };
            
            img.src = thumbnailUrl;
          });
          
          // If we get here, the screenshot was successful
          return;
        } catch (error) {
          console.log(`Thumbnail ${i + 1} failed:`, error.message);
          if (i === thumbnailUrls.length - 1) {
            // This was the last attempt
            throw new Error('All thumbnail qualities failed to load. This might be due to the video being private, restricted, or not having thumbnails available.');
          }
          // Continue to next thumbnail quality
        }
      }
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      alert('Failed to capture screenshot: ' + error.message);
    } finally {
      setIsCapturingScreenshot(false);
    }
  };  const uploadScreenshotToDrive = async (imageBlob, timestamp = 0, targetFolderId = null) => {
    try {
      console.log('Starting screenshot upload, blob size:', imageBlob.size);
      console.log('Target folder ID:', targetFolderId);
      
      // Convert blob to base64
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Remove the data:image/jpeg;base64, prefix
          const base64 = reader.result.split(',')[1];
          console.log('Converted to base64, length:', base64.length);
          resolve(base64);
        };
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
          reject(error);
        };
        reader.readAsDataURL(imageBlob);
      });

      const timestampStr = timestamp > 0 ? `_${Math.floor(timestamp / 60)}m${timestamp % 60}s` : '';
      const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Screenshot_${videoTitle.replace(/[^a-zA-Z0-9]/g, '_')}${timestampStr}_${fileTimestamp}.jpg`;

      console.log('Uploading screenshot with filename:', fileName);
      console.log('Video timestamp:', timestamp > 0 ? `${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}` : 'Not specified');

      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'upload_screenshot',
          data: {
            imageData: base64Image,
            fileName: fileName,
            folderId: targetFolderId,
            videoTitle: videoTitle,
            videoId: videoId,
            videoChannel: videoChannel,
            timestamp: timestamp
          }
        }),
      });

      const data = await response.json();
      console.log('API response:', data);
      
      if (data.success) {
        // Add a system message to confirm screenshot saved
        const timeStr = timestamp > 0 ? ` at ${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}` : '';
        const locationStr = targetFolderId ? 
          (targetFolderId === projectFolder?.folderId ? 'project folder' : 'specified folder') : 
          'Google Drive root';
        
        const systemMessage = {
          id: Date.now(),
          type: 'ai',
          content: `📷 Screenshot captured and saved to your ${locationStr}!

**File:** ${fileName}
**Video Time:** ${timestamp > 0 ? `${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}` : 'Default thumbnail'}

📄 [View Screenshot](${data.file?.webViewLink || '#'})${targetFolderId === projectFolder?.folderId && projectFolder ? `\n\n📁 [View Project Folder](${projectFolder.folderUrl || projectFolder.webViewLink})` : ''}

*Note: Due to YouTube's security restrictions, this is the best available thumbnail with timestamp overlay. For exact frame capture, you might need to use a browser extension or screen capture tool.*`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, systemMessage]);
        setCompletedMessages(prev => new Set([...prev, systemMessage.id]));
        setShowFullContent(prev => new Set([...prev, systemMessage.id]));
      } else {
        throw new Error(data.error || data.message || 'Failed to upload screenshot');
      }
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      
      // Show user-friendly error message
      let errorMessage = 'Failed to upload screenshot to Google Drive. ';
      if (error.message.includes('thumbnail')) {
        errorMessage += 'The video thumbnail could not be accessed. This might be due to the video being private or restricted.';
      } else if (error.message.includes('auth')) {
        errorMessage += 'Authentication failed. Please check your Google Drive integration.';
      } else {
        errorMessage += 'Please try again or check your internet connection.';
      }
      
      alert(errorMessage + '\n\nTechnical details: ' + error.message);
      throw error;
    }
  };

  // Handler Functions
  const handleSaveToGoogleDrive = (content) => {
    setPendingNotes(content);
    setShowDocumentDialog(true);
  };

  const handleDocumentChoice = async (choice) => {
    setShowDocumentDialog(false);
    
    if (!pendingNotes) return;
    
    try {
      switch (choice) {
        case 'new':
          // Show document name dialog for new document
          setShowDocumentNameDialog(true);
          setExistingDoc(null);
          break;
        case 'existing':
          // Add to existing document
          await addToExistingDocument();
          break;        case 'select':
          // Show document selector
          await handleShowDocumentSelector();
          break;
      }
    } catch (error) {
      console.error('Error handling document choice:', error);
      alert('Failed to process document choice. Please try again.');
    }
  };  const addToExistingDocument = async () => {
    try {
      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'list_docs_in_folder',
          data: {
            folderId: projectFolder?.folderId
          }
        }),
      });

      const data = await response.json();
      
      if (data.success && data.docs && data.docs.length > 0) {
        // Show document selector dialog with all available documents
        setAvailableDocs(data.docs);
        setShowDocumentSelector(true);
      } else {
        // No existing docs, create new one
        alert('No documents found in your project folder. Creating a new document instead.');
        setShowDocumentNameDialog(true);
        setExistingDoc(null);
      }
    } catch (error) {
      console.error('Error listing documents:', error);
      // Fallback to creating new document
      alert('Failed to fetch documents. Creating a new document instead.');
      setShowDocumentNameDialog(true);
      setExistingDoc(null);
    }
  };const handleShowDocumentSelector = async () => {
    try {
      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'list_docs_in_folder',
          data: {
            folderId: projectFolder?.folderId
          }
        }),
      });

      const data = await response.json();
      
      if (data.success && data.docs && data.docs.length > 0) {
        // Show document selector dialog with all available documents
        setAvailableDocs(data.docs);
        setShowDocumentSelector(true);
      } else {
        // No existing docs, show message and create new one
        alert('No documents found in your project folder. Creating a new document instead.');
        setShowDocumentNameDialog(true);
        setExistingDoc(null);
      }
    } catch (error) {
      console.error('Error listing documents:', error);
      alert('Failed to fetch documents. Creating a new document instead.');
      setShowDocumentNameDialog(true);
      setExistingDoc(null);
    }
  };

  const handleSelectDocument = (doc) => {
    setExistingDoc(doc);
    setShowDocumentSelector(false);
    setShowDocumentNameDialog(true);
  };
  const handleSaveNotes = async () => {
    try {
      let response;
      
      if (existingDoc) {
        // Add to existing document
        response = await fetch('/api/google-integration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'add_notes_to_doc',            data: {
              documentId: existingDoc.documentId || existingDoc.id,
              notes: pendingNotes,
              videoTitle: videoTitle,
              videoId: videoId,
              videoChannel: videoChannel
            }
          }),
        });      } else {        // Create new document
        const action = projectFolder?.folderId ? 'create_doc_in_folder' : 'create_doc_for_video';
        const data = projectFolder?.folderId ? {
          videoTitle: videoTitle,
          videoChannel: videoChannel,
          videoId: videoId,
          folderId: projectFolder.folderId,
          docTitle: documentName.trim(),
          userEmail: null,
          notes: pendingNotes
        } : {
          videoTitle: videoTitle,
          videoChannel: videoChannel,
          videoId: videoId,
          docTitle: documentName.trim(),
          userEmail: null,
          notes: pendingNotes
        };
        
        response = await fetch('/api/google-integration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: action,            data: data
          }),
        });
      }const data = await response.json();
      
      if (data.success) {
        setShowDocumentNameDialog(false);
        setDocumentName('');
        setExistingDoc(null);
        setPendingNotes(null);        // Add a system message to confirm save
        const documentDisplayName = existingDoc 
          ? (existingDoc.name || existingDoc.title || 'Selected Document')
          : documentName.trim();
          
        const systemMessage = {
          id: Date.now(),
          type: 'ai',
          content: `✅ Notes ${existingDoc ? 'added to' : 'saved in'} "${documentDisplayName}". Document ${existingDoc ? 'updated' : 'created'} successfully!

📄 [Open Document](${data.doc?.documentUrl || data.document?.documentUrl || '#'})${projectFolder ? `\n\n📁 [View Project Folder](${projectFolder.folderUrl || projectFolder.webViewLink})` : ''}

*Note: Documents are set to be accessible with the link for easy sharing.*`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, systemMessage]);
        setCompletedMessages(prev => new Set([...prev, systemMessage.id]));
        setShowFullContent(prev => new Set([...prev, systemMessage.id]));
      } else {
        throw new Error(data.error || data.message || 'Failed to save notes');
      }
    } catch (error) {
      console.error('Error saving notes:', error);
      
      // Provide more specific error message to user
      let userMessage = 'Failed to save notes. ';
      if (error.message.includes('share')) {
        userMessage += 'Document was created but sharing failed.';
      } else if (error.message.includes('folder')) {
        userMessage += 'Please create a project folder first.';
      } else {
        userMessage += 'Please try again.';
      }
      
      alert(userMessage + '\n\nError details: ' + error.message);
    }
  };
  const handleCreateProjectFolder = async () => {
    try {
      const folderName = projectFolderName.trim() || `${videoTitle} - Notes`;
      
      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },        body: JSON.stringify({
          action: 'create_project_folder',
          data: {
            projectName: folderName,
            videoTitle: videoTitle,
            userEmail: null // Don't try to share with a fake email
          }
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setProjectFolder(data.folder);
        setShowProjectSetupDialog(false);
        setProjectFolderName('');        // Add a system message to confirm folder creation
        const systemMessage = {
          id: Date.now(),
          type: 'ai',
          content: `✅ Created project folder "${folderName}" in your Google Drive. All future notes will be saved here.

📁 [Open Project Folder](${data.folder.folderUrl || data.folder.webViewLink})

*Note: The folder is set to be accessible with the link. You can edit permissions in Google Drive if needed.*`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, systemMessage]);
        setCompletedMessages(prev => new Set([...prev, systemMessage.id]));
        setShowFullContent(prev => new Set([...prev, systemMessage.id]));
      } else {
        throw new Error(data.error || 'Failed to create folder');
      }    } catch (error) {
      console.error('Error creating project folder:', error);
      
      let errorMessage = 'Failed to create project folder. Please try again.';
      
      if (error.message.includes('Google API credentials not configured')) {
        errorMessage = `🔧 Google Drive integration is not set up yet. To use this feature:

1. Go to Google Cloud Console (https://console.cloud.google.com/)
2. Create a project and enable Google Drive & Docs APIs
3. Set up OAuth2 credentials or a service account
4. Add the credentials to your .env.local file

For now, you can still use the video assistant without Google Drive integration.`;
      } else if (error.message.includes('authenticate')) {
        errorMessage = 'Google API authentication failed. Please check your credentials in .env.local';
      }
      
      alert(errorMessage);
    }
  };  const clearChatHistory = async () => {
    if (confirm('Are you sure you want to clear the chat history? This will remove all messages and start fresh.')) {
      try {
        // First, clear from Firebase cloud database
        const response = await fetch(`/api/chat-session?videoId=${videoId}&title=${encodeURIComponent(videoTitle)}`, {
          method: 'DELETE'
        });
        const result = await response.json();
        if (!result.success) {
          console.warn('Failed to clear from database:', result.error);
        }
      } catch (error) {
        console.warn('Failed to clear from database:', error);
      }
      
      const chatKey = `chat_${videoId}_${btoa(videoTitle).slice(0, 10)}`;
      
      // Clear localStorage (fallback)
      localStorage.removeItem(`${chatKey}_messages`);
      localStorage.removeItem(`${chatKey}_projectFolder`);
      localStorage.removeItem(`${chatKey}_completedMessages`);
      localStorage.removeItem(`${chatKey}_showFullContent`);
      
      // Reset state to welcome message
      const welcomeMessage = {
        id: Date.now(),
        type: 'ai',
        content: `Hi! I'm your AI video assistant. I can help you:

• Create detailed notes and summaries
• Clip specific sections of the video
• Take screenshots of key moments
• Save content to Google Drive
• Answer questions about the video content

**Want to stay organized?** I can create a dedicated Google Drive folder for this video project.

What would you like me to help you with?`,
        timestamp: new Date(),
        isWelcome: true,
        showProjectSetup: true
      };
      
      setMessages([welcomeMessage]);
      setCompletedMessages(new Set([welcomeMessage.id]));
      setShowFullContent(new Set([welcomeMessage.id]));
      setProjectFolder(null);
      setPendingNotes(null);
      
      // Save the fresh state to Firebase (just the welcome message)
      await saveChatToDatabase({
        videoId,
        videoTitle,
        videoChannel,
        messages: [welcomeMessage],
        projectFolder: null
      });
    }
  };

const quickActions = [
    { icon: <Download className="h-4 w-4" />, text: "Create Notes", action: "Create detailed notes for this video", type: "message" },
    { icon: <Scissors className="h-4 w-4" />, text: "Clip Video", action: "Help me clip a specific part of this video", type: "message" },
    { icon: <Camera className="h-4 w-4" />, text: "Screenshot", action: captureVideoScreenshot, type: "function" },
    { icon: <FolderPlus className="h-4 w-4" />, text: "Save to Drive", action: "Save this video content to my Google Drive", type: "message" },
    { icon: <Brain className="h-4 w-4" />, text: "Take Quiz", action: () => {
      if (!videoId || !videoTitle) {
        alert('Please select a video first');
        return;
      }
      // Navigate to quiz page with video data
      const quizUrl = `/quiz?videoId=${videoId}&title=${encodeURIComponent(videoTitle)}&transcript=${encodeURIComponent('Video transcript will be fetched...')}`;
      window.open(quizUrl, '_blank');
    }, type: "function" }
  ];

  // Screenshot Dialog Handlers
  const handleScreenshotChoice = async (choice) => {
    setShowScreenshotDialog(false);
    
    if (!pendingScreenshot) return;
    
    try {
      switch (choice) {
        case 'project':
          // Save to project folder
          await uploadScreenshotToDrive(pendingScreenshot.blob, pendingScreenshot.timestamp, projectFolder?.folderId);
          break;
        case 'root':
          // Save to Drive root
          await uploadScreenshotToDrive(pendingScreenshot.blob, pendingScreenshot.timestamp, null);
          break;
        case 'select':
          // Show folder selector (not implemented yet - for future enhancement)
          alert('Folder selection coming soon! For now, saving to Google Drive root.');
          await uploadScreenshotToDrive(pendingScreenshot.blob, pendingScreenshot.timestamp, null);
          break;
      }
    } catch (error) {
      console.error('Error handling screenshot choice:', error);
      alert('Failed to save screenshot. Please try again.');
    } finally {
      setPendingScreenshot(null);
    }
  };

  const cancelScreenshot = () => {
    setShowScreenshotDialog(false);
    setPendingScreenshot(null);
  };// Resizable panel handlers
  const handleMouseDown = useCallback((e) => {
    console.log('Mouse down on resize handle');
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    console.log('Mouse move while dragging');
    const container = document.querySelector('.split-container');
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    
    // Constrain the width between 20% and 80%
    const constrainedWidth = Math.min(80, Math.max(20, newLeftWidth));
    console.log('New width:', constrainedWidth);
    setLeftPanelWidth(constrainedWidth);
  }, [isDragging]);
  const handleMouseUp = useCallback(() => {
    console.log('Mouse up - ending drag');
    setIsDragging(false);
  }, []);

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="h-screen flex bg-background split-container">
      {/* Left Panel - Video Player */}
      <div 
        className="flex flex-col bg-card border-r border-border transition-all duration-200 ease-out"
        style={{ width: `${leftPanelWidth}%` }}
      >
        {/* Video Header */}
        <div className="px-6 py-4 bg-card border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Video className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate">{videoTitle}</h2>
              <p className="text-sm text-muted-foreground truncate">{videoChannel}</p>
            </div>
          </div>
        </div>
        
        {/* Video Player Container */}
        <div className="flex-1 flex items-center justify-center bg-black p-6">
          {videoId ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="aspect-video w-full max-w-none h-full max-h-full">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&showinfo=1`}
                  title={videoTitle}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full rounded-lg shadow-lg"
                ></iframe>
              </div>
            </div>
          ) : (
            <div className="text-white text-center">
              <Video className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No video selected</p>
              <p className="text-sm opacity-70 mt-2">Select a video to get started</p>
            </div>
          )}
        </div>        {/* Video Info */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Use the AI assistant to create notes, clips, and analyze this video content
            </p>
          </div>        </div>
      </div>      {/* Resize Handle */}
      <div
        className={`w-2 bg-border hover:bg-primary/50 cursor-col-resize transition-colors duration-200 relative group flex items-center justify-center ${
          isDragging ? 'bg-primary' : ''
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panels"
      >
        <div className="w-1 h-12 bg-muted-foreground/50 rounded-full group-hover:bg-primary/70 transition-colors duration-200" />
      </div>

      {/* Right Panel - AI Chat */}
      <div 
        className="flex flex-col bg-card transition-all duration-200 ease-out"
        style={{ width: `${100 - leftPanelWidth}%` }}
      >{/* Header */}
        <div className="px-6 py-5 border-b border-border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary rounded-xl">
                <Bot className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">AI Video Assistant</h1>
                <p className="text-sm text-muted-foreground">Powered by Gemini AI</p>
              </div>
            </div>            <button
              onClick={clearChatHistory}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
              title="Clear chat history"
            >
              <Trash className="h-4 w-4" />
              Clear History
            </button>
          </div>
        </div>{/* Quick Actions */}
        <div className="px-6 py-4 bg-muted/30 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  if (action.type === 'function') {
                    action.action();
                  } else {
                    setInputMessage(action.action);
                  }
                }}
                disabled={action.type === 'function' && action.text === 'Screenshot' && isCapturingScreenshot}
                className="flex items-center gap-3 p-3 text-sm bg-card border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                  {action.text === 'Screenshot' && isCapturingScreenshot ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    action.icon
                  )}
                </div>
                <span className="font-medium text-foreground">
                  {action.text === 'Screenshot' && isCapturingScreenshot ? 'Capturing...' : action.text}
                </span>
              </button>
            ))}
          </div>
        </div>        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start gap-2 max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                {message.type === 'ai' && (
                  <div className="flex-shrink-0 w-7 h-7 bg-primary rounded-full flex items-center justify-center mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`px-3 py-2 rounded-lg text-sm ${
                    message.type === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground border border-border rounded-bl-sm'
                  }`}
                >                  {message.type === 'ai' ? (
                    <div className="relative">
                      <TypingAnimation 
                        content={message.content} 
                        speed={15} 
                        isPaused={pausedMessages.has(message.id)}
                        showFullContent={showFullContent.has(message.id)}
                        onComplete={() => handleTypingComplete(message.id)}
                      />
                        {/* Typing Controls - Only show while typing and not for welcome message */}
                      {!completedMessages.has(message.id) && !message.isWelcome && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                          <button
                            onClick={() => togglePause(message.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 border border-border rounded transition-colors"
                            title={pausedMessages.has(message.id) ? "Resume typing" : "Pause typing"}
                          >
                            {pausedMessages.has(message.id) ? (
                              <>
                                <Play className="h-3 w-3" />
                                Resume
                              </>
                            ) : (
                              <>
                                <Pause className="h-3 w-3" />
                                Pause
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={() => skipToEnd(message.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 border border-border rounded transition-colors"
                            title="Show full response"
                          >
                            <SkipForward className="h-3 w-3" />
                            Skip
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed">{message.content}</div>
                  )}

                  {/* Display Video Clips */}
                  {message.clips && message.clips.length > 0 && (
                    <div className="mt-4 p-4 bg-background border border-border rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Scissors className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-foreground">Suggested Clips ({message.clips.length})</span>
                      </div>
                      <div className="space-y-3">
                        {message.clips.map((clip, clipIndex) => (
                          <div key={clipIndex} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                            <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
                              <Play className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-foreground truncate">{clip.title}</h4>
                                <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded text-xs font-mono text-primary">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(clip.start_time)} - {formatTime(clip.end_time)}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{clip.description}</p>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    const startTime = clip.start_time;
                                    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}&t=${startTime}s`;
                                    window.open(youtubeUrl, '_blank');
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Watch Clip
                                </button>
                                <span className="text-xs text-muted-foreground">• {clip.value}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {message.actions.map((action, index) => (
                        <button
                          key={index}
                          className="block w-full text-left p-2 text-xs bg-background/20 rounded border border-border hover:bg-background/40 transition-colors"
                        >
                          {action.text}
                        </button>
                      ))}
                    </div>
                  )}                  {/* Save to Google Drive button - Show for AI messages with notes */}
                  {message.type === 'ai' && completedMessages.has(message.id) && message.content && (
                    message.content.toLowerCase().includes('notes') || 
                    message.content.toLowerCase().includes('summary') ||
                    message.content.length > 500 // Show for long responses
                  ) && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleSaveToGoogleDrive(message.content)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <FolderPlus className="h-4 w-4" />
                        Save to Google Drive
                      </button>
                    </div>
                  )}                  {/* Project Setup Button - Show only in welcome message */}
                  {message.isWelcome && message.showProjectSetup && !projectFolder && (
                    <div className="mt-4 p-4 bg-muted/30 border border-border rounded-lg">
                      <h4 className="font-semibold text-foreground mb-2">Stay Organized</h4>
                      <p className="text-sm text-muted-foreground mb-3">Create a dedicated Google Drive folder for this video project to keep all your notes and content organized.</p>
                      <button
                        onClick={() => setShowProjectSetupDialog(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        <FolderPlus className="h-4 w-4" />
                        Create Project Folder
                      </button>
                    </div>
                  )}                  {/* Project Folder Link - Show when folder exists */}
                  {message.isWelcome && projectFolder && (
                    <div className="mt-4 p-4 bg-accent/30 border border-border rounded-lg">
                      <h4 className="font-semibold text-foreground mb-2">📁 Project Folder</h4>
                      <p className="text-sm text-muted-foreground mb-3">Your notes are being saved to:</p>
                      <a
                        href={projectFolder.folderUrl || projectFolder.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                      >
                        <FolderPlus className="h-4 w-4" />
                        Open Project Folder
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}                  <div className="text-xs opacity-60 mt-1">
                    {message.timestamp instanceof Date 
                      ? message.timestamp.toLocaleTimeString() 
                      : new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>          ))}          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-7 h-7 bg-primary rounded-full flex items-center justify-center mt-1">
                  <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <div className="bg-muted text-foreground px-3 py-2 rounded-lg rounded-bl-sm border border-border flex items-center gap-2 text-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span>AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>        {/* Input */}
        <div className="px-4 py-3 border-t border-border bg-card">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about this video..."
                className="w-full p-2.5 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground transition-all text-sm"
                rows="1"
                disabled={isLoading}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className="px-3 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all duration-200 text-sm font-medium"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>          </div>
        </div>
      </div>      {/* Document Management Dialog */}
      {showDocumentDialog && pendingNotes && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Save Notes to Google Docs</h3>
            <p className="text-muted-foreground mb-6">
              I've generated detailed notes for you! Where would you like to save them?
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleDocumentChoice('new')}
                className="w-full p-3 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-foreground">Create New Document</div>
                    <div className="text-sm text-muted-foreground">Create a new Google Doc in your project folder</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleDocumentChoice('existing')}
                className="w-full p-3 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-foreground">Add to Existing Document</div>
                    <div className="text-sm text-muted-foreground">Append to your current video notes document</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleDocumentChoice('select')}
                className="w-full p-3 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderPlus className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-foreground">Select Document</div>
                    <div className="text-sm text-muted-foreground">Choose from existing documents in your project</div>
                  </div>
                </div>
              </button>
            </div>
            
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDocumentDialog(false)}
                className="flex-1 px-4 py-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}      {/* Document Name Dialog */}
      {showDocumentNameDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {existingDoc ? 'Add to Document' : 'Create New Document'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {existingDoc ? 'These notes will be appended to the selected document.' : 'Enter a name for your new Google Doc.'}
            </p>
            
            {!existingDoc && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Document Name
                </label>
                <input
                  type="text"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="Video Notes"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDocumentNameDialog(false);
                  setDocumentName('');
                  setExistingDoc(null);
                  setPendingNotes(null);
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={!existingDoc && !documentName.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {existingDoc ? 'Add Notes' : 'Create & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Selector Dialog */}
      {showDocumentSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Select Document</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose a document from your project folder to add these notes to.
            </p>
            
            <div className="max-h-60 overflow-y-auto mb-4">              {availableDocs.map((doc) => (
                <button
                  key={doc.documentId || doc.id}
                  onClick={() => handleSelectDocument(doc)}
                  className="w-full p-3 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors mb-2 last:mb-0"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{doc.name || doc.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {doc.modifiedTime ? `Modified: ${new Date(doc.modifiedTime).toLocaleDateString()}` : 'Google Document'}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDocumentSelector(false);
                  setAvailableDocs([]);
                  setPendingNotes(null);
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDocumentSelector(false);
                  setShowDocumentNameDialog(true);
                  setExistingDoc(null);
                }}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Create New Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Setup Dialog */}
      {showProjectSetupDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Create Project Folder</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a dedicated Google Drive folder to organize all content for this video project.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Folder Name
              </label>
              <input
                type="text"
                value={projectFolderName}
                onChange={(e) => setProjectFolderName(e.target.value)}
                placeholder={`${videoTitle} - Notes`}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowProjectSetupDialog(false);
                  setProjectFolderName('');
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleCreateProjectFolder}
                disabled={!projectFolderName.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Folder
              </button>
            </div>          </div>        </div>      )}

      {/* Document Selector Dialog */}
      {showDocumentSelector && availableDocs.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Select Document</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Choose which document you want to add the notes to:
            </p>
            
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {availableDocs.map((doc) => (
                <button
                  key={doc.documentId}
                  onClick={() => handleSelectDocument(doc)}
                  className="w-full p-4 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">{doc.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Last modified: {new Date(doc.modifiedTime).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDocumentSelector(false)}
                className="flex-1 px-4 py-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDocumentSelector(false);
                  setShowDocumentNameDialog(true);
                  setExistingDoc(null);
                }}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Create New Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Management Dialog */}
      {showScreenshotDialog && pendingScreenshot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Save Screenshot</h3>
            <p className="text-muted-foreground mb-6">
              You've captured a screenshot! Where would you like to save it?
            </p>
              <div className="space-y-3">
              {projectFolder && (
                <button
                  onClick={() => handleScreenshotChoice('project')}
                  className="w-full p-3 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FolderPlus className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">Save to Project Folder</div>
                      <div className="text-sm text-muted-foreground">Save in "{projectFolder.name || 'Project'}" folder</div>
                    </div>
                  </div>
                </button>
              )}
              
              <button
                onClick={() => handleScreenshotChoice('root')}
                className="w-full p-3 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderPlus className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-foreground">Save to Google Drive</div>
                    <div className="text-sm text-muted-foreground">Save in the root directory of your Google Drive</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleScreenshotChoice('select')}
                className="w-full p-3 text-left border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderPlus className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-foreground">Select Folder</div>
                    <div className="text-sm text-muted-foreground">Choose a specific folder in your Google Drive</div>
                  </div>
                </div>
              </button>
              
              {!projectFolder && (
                <div className="p-3 bg-muted/30 border border-border rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    💡 <strong>Tip:</strong> Create a project folder to keep your screenshots organized!
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex gap-3">
              <button
                onClick={cancelScreenshot}
                className="flex-1 px-4 py-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VideoAIAssistant() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <VideoAIAssistantInner />
    </Suspense>
  );
}

