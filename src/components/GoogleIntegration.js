'use client';

import { useState } from 'react';
import { FileText, FolderPlus, Upload, Search, ExternalLink, CheckCircle, AlertCircle, PenTool, Plus, X } from 'lucide-react';
import { ShiningText } from '@/components/ui/shining-text';

export default function GoogleIntegration({ videoTitle, videoChannel, videoId, notes }) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [projectDocs, setProjectDocs] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [showDocChoice, setShowDocChoice] = useState(false);

  const handleCreateFolder = () => {
    setFolderName(`${videoTitle} - Project`);
    setShowFolderDialog(true);
  };

  const handleFolderDialogSubmit = async () => {
    if (!folderName.trim()) return;

    setIsLoading(true);
    setError('');
    setStatus('Creating Google Drive folder...');
    setShowFolderDialog(false);

    try {      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_project_folder',
          data: { 
            projectName: folderName.trim(),
            videoTitle,
            userEmail: 'kumaramartya11@gmail.com' // TODO: Get from user profile
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setCurrentFolder(result.folder);
        setStatus(result.message);
        // Load existing docs in this folder
        loadProjectDocs(result.folder.folderId);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to create Google Drive folder');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjectDocs = async (folderId) => {
    try {
      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_docs_in_folder',
          data: { folderId }
        })
      });

      const result = await response.json();
      if (result.success) {
        setProjectDocs(result.docs || []);
      }
    } catch (err) {
      console.warn('Could not load existing docs');
    }
  };

  const handleCreateDoc = async () => {
    if (!currentFolder) {
      setError('Please create a project folder first');
      return;
    }

    setIsLoading(true);
    setError('');
    setStatus('Creating Google Doc in project folder...');

    try {
      const docTitle = `${videoTitle} - Notes ${new Date().toLocaleDateString()}`;
      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_doc_in_folder',
          data: { 
            videoTitle, 
            videoChannel, 
            videoId,
            folderId: currentFolder.folderId,
            docTitle,
            userEmail: 'kumaramartya11@gmail.com'
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setCurrentDoc(result.doc);
        setStatus(result.message);
        // Refresh the docs list
        loadProjectDocs(currentFolder.folderId);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to create Google Doc');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotesAction = () => {
    if (!notes) return;
    
    if (currentFolder && projectDocs.length > 0) {
      setShowDocChoice(true);
    } else if (currentDoc) {
      handleAddNotesToDoc(currentDoc.documentId);
    } else {
      setError('Please create a project folder and document first');
    }
  };

  const handleAddNotesToDoc = async (docId = null) => {
    const documentId = docId || currentDoc?.documentId;
    if (!documentId || !notes) return;

    setIsLoading(true);
    setError('');
    setStatus('Writing notes to Google Doc...');
    setShowDocChoice(false);

    try {
      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_notes_to_doc',
          data: { 
            documentId,
            notes,
            videoTitle,
            videoId,
            videoChannel
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setStatus(result.message);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to write notes to Google Doc');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewDocWithNotes = async () => {
    setShowDocChoice(false);
    await handleCreateDoc();
    // Add a small delay to ensure doc is created, then add notes
    setTimeout(() => {
      if (currentDoc) {
        handleAddNotesToDoc(currentDoc.documentId);
      }
    }, 1000);
  };

  const handleSaveNotesToDrive = async (format = 'txt') => {
    if (!currentFolder || !notes) return;

    setIsLoading(true);
    setError('');
    setStatus(`Saving notes as ${format.toUpperCase()} to Google Drive...`);

    try {
      const response = await fetch('/api/google-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_notes_to_drive',
          data: { 
            folderId: currentFolder.folderId,
            notes,
            videoTitle,
            videoId,
            format
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setStatus(result.message);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to save notes to Drive');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-muted/20 border border-border rounded-lg">
      <div className="flex items-center gap-2">
        <PenTool className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Google Docs Integration</h3>
      </div>

      {/* Status Messages */}
      {status && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-2 rounded">
          <CheckCircle className="h-4 w-4" />
          {status}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Folder Dialog */}
      {showFolderDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Create Project Folder</h4>
              <button
                onClick={() => setShowFolderDialog(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Folder Name</label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-foreground"
                  placeholder="Enter folder name..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowFolderDialog(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFolderDialogSubmit}
                  disabled={!folderName.trim() || isLoading}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Create Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Doc Choice Dialog */}
      {showDocChoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Add Notes to Document</h4>
              <button
                onClick={() => setShowDocChoice(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose how to add your notes:
              </p>
              
              {/* Existing Docs */}
              {projectDocs.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium mb-2">Add to existing document:</h5>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {projectDocs.map((doc) => (
                      <button
                        key={doc.documentId}
                        onClick={() => handleAddNotesToDoc(doc.documentId)}
                        className="w-full text-left p-2 text-sm bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded border"
                      >
                        <div className="font-medium truncate">{doc.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Modified: {new Date(doc.modifiedTime).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Create New Doc */}
              <div>
                <button
                  onClick={handleCreateNewDocWithNotes}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Create New Document with Notes
                </button>
              </div>
              
              <button
                onClick={() => setShowDocChoice(false)}
                className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main UI */}
      <div className="space-y-4">
        {/* Project Folder Section */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
            <FolderPlus className="h-3 w-3" />
            Project Folder
          </h4>
          
          <div className="flex gap-2">
            {!currentFolder ? (
              <button
                onClick={handleCreateFolder}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <FolderPlus className="h-3 w-3" />
                Create Project Folder
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <a
                  href={currentFolder.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open Folder
                </a>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {currentFolder.folderName}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Documents Section */}
        {currentFolder && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <FileText className="h-3 w-3" />
              Documents ({projectDocs.length})
            </h4>
            
            <div className="flex gap-2">
              <button
                onClick={handleCreateDoc}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                Create New Doc
              </button>
              
              {notes && (
                <button
                  onClick={handleNotesAction}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-2 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  <PenTool className="h-3 w-3" />
                  Add Notes
                </button>
              )}
            </div>

            {/* Document List */}
            {projectDocs.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {projectDocs.map((doc) => (
                  <div key={doc.documentId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{doc.title}</div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {new Date(doc.modifiedTime).toLocaleDateString()}
                      </div>
                    </div>
                    <a
                      href={doc.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* File Export Section */}
        {currentFolder && notes && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Upload className="h-3 w-3" />
              Export Notes
            </h4>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveNotesToDrive('txt')}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                <Upload className="h-3 w-3" />
                Save as TXT
              </button>
              <button
                onClick={() => handleSaveNotesToDrive('md')}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                <Upload className="h-3 w-3" />
                Save as MD
              </button>
            </div>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="text-xs">
          <ShiningText text="Processing... Please wait." className="text-xs" />
        </div>
      )}
    </div>
  );
}
