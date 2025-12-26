/**
 * LapBook Renderer Process
 * Handles the main eBook reading functionality using epub.js
 */

// ============================================
// Global Variables
// ============================================
let book = null; // ePub.js book object
let rendition = null; // ePub.js rendition (the visual display)
let pdfViewer = null; // PDF.js viewer instance
let currentFileType = null; // 'epub' or 'pdf'
let settingsManager = null; // Settings manager instance
let currentSearchResults = []; // Store search results
let highlights = []; // Store highlights for current book
let bookIdentifier = null; // Unique identifier for current book
let selectedCfiRange = null; // Currently selected text CFI range
let selectedColor = 'yellow'; // Currently selected highlight color
let currentSearchIndex = 0; // Current position in search results
let searchAnnotations = []; // Track search result annotations
let currentLocationCfi = null; // Track current reading location for TOC
let library = []; // Library of books
let libraryViewMode = 'grid'; // 'grid' or 'list'
let currentBookPath = null; // Currently open book path
let pdfJsLoaded = false; // Track if PDF.js is loaded
let pdfViewerLoaded = false; // Track if PDF viewer is loaded

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize settings manager
  settingsManager = new SettingsManager();
  await settingsManager.load();
  
  // Load library
  await loadLibrary();
  
  // Show library view by default
  showLibrary();
  
  // Dashboard always uses sepia theme
  document.body.classList.remove('theme-white', 'theme-sepia', 'theme-kindle', 'theme-blue', 'theme-gray', 'theme-dark');
  document.body.classList.add('theme-sepia');
  
  // Set up all event listeners
  setupEventListeners();
  
  // Apply saved settings to UI controls
  updateUIFromSettings();
  
  // Listen for menu-triggered file open
  window.electronAPI.onOpenEpub(async (filePath) => {
    await loadBook(filePath);
  });
  
  // Listen for show about dialog
  window.electronAPI.onShowAbout(() => {
    showAboutDialog();
  });
  
  // Listen for show changelog dialog
  window.electronAPI.onShowChangelog(() => {
    showChangelogDialog();
  });
  
  // Listen for show privacy policy
  window.electronAPI.onShowPrivacy(() => {
    showPrivacyDialog();
  });
  
  // Listen for show terms of use
  window.electronAPI.onShowTerms(() => {
    showTermsDialog();
  });
  
  // Listen for app closing to cleanup resources
  window.electronAPI?.onAppClosing?.(() => {
    cleanup();
  });
  
  console.log('LapBook initialized');
});

/**
 * Lazy load PDF.js library
 */
async function loadPDFLibraries() {
  if (pdfJsLoaded && pdfViewerLoaded) return;
  
  try {
    // Load PDF.js
    if (!pdfJsLoaded) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '../node_modules/pdfjs-dist/build/pdf.js';
        script.onload = () => {
          pdfJsLoaded = true;
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    // Load PDF viewer
    if (!pdfViewerLoaded) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'pdf-viewer.js';
        script.onload = () => {
          pdfViewerLoaded = true;
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
  } catch (error) {
    console.error('Failed to load PDF libraries:', error);
    throw new Error('PDF support unavailable. Please restart the application.');
  }
}

/**
 * Cleanup resources before closing
 */
function cleanup() {
  try {
    // Destroy EPUB resources
    if (rendition) {
      rendition.destroy();
      rendition = null;
    }
    if (book) {
      book.destroy();
      book = null;
    }
    
    // Destroy PDF resources
    if (pdfViewer) {
      pdfViewer.destroy();
      pdfViewer = null;
    }
    
    // Clear arrays to free memory
    currentSearchResults = [];
    highlights = [];
    searchAnnotations = [];
    library = [];
    
    console.log('Resources cleaned up');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// ============================================
// Event Listeners Setup
// ============================================
function setupEventListeners() {
  // File operations
  document.getElementById('openBtn').addEventListener('click', openFileDialog);
  document.getElementById('welcomeOpenBtn').addEventListener('click', openFileDialog);
  document.getElementById('addBookBtn').addEventListener('click', () => addBookToLibrary());
  document.getElementById('addBookBtnEmpty').addEventListener('click', () => addBookToLibrary());
  document.getElementById('libraryViewToggle').addEventListener('click', toggleLibraryView);
  document.getElementById('backToLibraryBtn').addEventListener('click', backToLibrary);
  
  // PDF notice close button
  const closePdfNoticeBtn = document.getElementById('closePdfNoticeBtn');
  if (closePdfNoticeBtn) {
    closePdfNoticeBtn.addEventListener('click', () => {
      document.getElementById('pdfLimitationsNotice').style.display = 'none';
    });
  }
  
  // Navigation
  document.getElementById('prevBtn').addEventListener('click', () => goToPreviousPage());
  document.getElementById('nextBtn').addEventListener('click', () => goToNextPage());
  
  // Keyboard navigation
  document.addEventListener('keydown', handleKeyboardNavigation);
  
  // Mouse wheel navigation (on viewer area only)
  document.getElementById('viewer').addEventListener('wheel', handleMouseWheel, { passive: false });
  
  // Panel toggles
  document.getElementById('tocBtn').addEventListener('click', () => togglePanel('tocPanel'));
  document.getElementById('searchBtn').addEventListener('click', () => togglePanel('searchPanel'));
  document.getElementById('settingsBtn').addEventListener('click', () => togglePanel('settingsPanel'));
  document.getElementById('highlightBtn').addEventListener('click', openHighlightDialog);
  document.getElementById('viewHighlightsBtn').addEventListener('click', () => togglePanel('highlightsPanel'));
  
  // Fullscreen toggle
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
  }
  
  // Panel close buttons
  document.getElementById('closeTocBtn').addEventListener('click', () => closePanel('tocPanel'));
  document.getElementById('closeSearchBtn').addEventListener('click', () => closePanel('searchPanel'));
  document.getElementById('closeSettingsBtn').addEventListener('click', () => closePanel('settingsPanel'));
  document.getElementById('closeHighlightsBtn').addEventListener('click', () => closePanel('highlightsPanel'));
  
  // Font controls
  document.getElementById('fontIncreaseBtn').addEventListener('click', increaseFontSize);
  document.getElementById('fontDecreaseBtn').addEventListener('click', decreaseFontSize);
  document.getElementById('fontSelect').addEventListener('change', changeFontFamily);
  
  // Theme
  document.getElementById('themeSelect').addEventListener('change', changeTheme);
  
  // Settings
  document.getElementById('lineSpacingSlider').addEventListener('input', changeLineSpacing);
  document.getElementById('marginSlider').addEventListener('input', changeMargins);
  document.getElementById('mouseWheelToggle').addEventListener('change', toggleMouseWheelNav);
  document.getElementById('animationToggle').addEventListener('change', togglePageAnimation);
  document.getElementById('resetSettingsBtn').addEventListener('click', resetSettings);
  
  // Search
  document.getElementById('searchExecuteBtn').addEventListener('click', executeSearch);
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSearch();
  });
  document.getElementById('searchPrevBtn').addEventListener('click', goToPreviousSearchResult);
  document.getElementById('searchNextBtn').addEventListener('click', goToNextSearchResult);
  document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
  
  // Highlight dialog
  document.getElementById('saveHighlightBtn').addEventListener('click', saveHighlight);
  document.getElementById('cancelHighlightBtn').addEventListener('click', closeHighlightDialog);
  
  // Edit book dialog
  document.getElementById('saveEditBookBtn').addEventListener('click', saveEditedBook);
  document.getElementById('cancelEditBookBtn').addEventListener('click', cancelEditBook);
  
  // Context menu for text selection
  document.getElementById('contextHighlightBtn').addEventListener('click', openHighlightDialog);
  document.getElementById('contextNoteBtn').addEventListener('click', openHighlightDialog);
  document.getElementById('contextDefineBtn').addEventListener('click', lookupWord);
  
  // Dictionary dialog
  document.getElementById('closeDictionaryBtn').addEventListener('click', closeDictionaryDialog);
  
  // Hide context menu when clicking anywhere
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('textContextMenu');
    if (!menu.contains(e.target)) {
      hideContextMenu();
    }
  });
  
  // Color picker buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      selectedColor = e.target.dataset.color;
    });
  });
  
  // Set default selected color
  document.querySelector('.color-btn[data-color="yellow"]').classList.add('selected');
  
  // PDF-specific controls
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const zoomFitBtn = document.getElementById('zoomFitBtn');
  
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
    if (pdfViewer) pdfViewer.zoomIn();
  });
  
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
    if (pdfViewer) pdfViewer.zoomOut();
  });
  
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => {
    if (pdfViewer) pdfViewer.resetZoom();
  });
  
  if (zoomFitBtn) zoomFitBtn.addEventListener('click', () => {
    if (pdfViewer) pdfViewer.fitToPage();
  });
  
  // About and Changelog dialogs
  document.getElementById('closeAboutBtn').addEventListener('click', () => {
    document.getElementById('aboutDialog').classList.add('hidden');
  });
  
  document.getElementById('closeChangelogBtn').addEventListener('click', () => {
    document.getElementById('changelogDialog').classList.add('hidden');
  });
  
  document.getElementById('closePrivacyBtn').addEventListener('click', () => {
    document.getElementById('privacyDialog').classList.add('hidden');
  });
  
  document.getElementById('closeTermsBtn').addEventListener('click', () => {
    document.getElementById('termsDialog').classList.add('hidden');
  });
  
  document.getElementById('supportDevBtn').addEventListener('click', () => {
    window.electronAPI.openExternal('https://buymeacoffee.com/morningapplabs');
  });
  
  document.getElementById('visitXLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.electronAPI.openExternal('https://x.com/MorningAppLabs');
  });
  
  document.getElementById('visitInstagramLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.electronAPI.openExternal('https://instagram.com/morningapplabs');
  });
}

// ============================================
// File Operations
// ============================================
async function openFileDialog() {
  try {
    const filePath = await window.electronAPI.openEpubDialog();
    if (filePath) {
      await loadBook(filePath);
    }
  } catch (error) {
    console.error('Error opening file:', error);
    alert('Failed to open file. Please try again.');
  }
}

async function loadBook(filePath) {
  try {
    console.log('Loading book:', filePath);
    
    // Store current book path
    currentBookPath = filePath;
    
    // Determine file type
    const extension = filePath.split('.').pop().toLowerCase();
    
    if (extension === 'pdf') {
      await loadPDF(filePath);
    } else if (extension === 'epub') {
      await loadEPUB(filePath);
    } else {
      throw new Error('Unsupported file format. Only EPUB and PDF files are supported.');
    }
    
  } catch (error) {
    console.error('Error loading book:', error);
    alert('Failed to load book: ' + error.message);
  }
}

/**
 * Load and display a PDF file
 */
async function loadPDF(filePath) {
  try {
    // Hide library, clean up previous book
    hideLibrary();
    if (rendition) {
      rendition.destroy();
      rendition = null;
    }
    
    updateBookInfo('Loading PDF support...');
    
    // Lazy load PDF.js libraries if not already loaded
    if (!pdfJsLoaded || !pdfViewerLoaded) {
      await loadPDFLibraries();
    }
    
    // Clean up previous PDF viewer to free memory
    if (pdfViewer) {
      pdfViewer.destroy();
      pdfViewer = null;
    }
    
    // Create PDF viewer instance
    pdfViewer = new PDFViewer();
    currentFileType = 'pdf';
    
    updateBookInfo('Loading PDF file...');
    
    // Read PDF file
    const arrayBuffer = await window.electronAPI.readEpubFile(filePath);
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('PDF file is empty or could not be read');
    }
    
    // Load PDF
    const result = await pdfViewer.loadPDF(arrayBuffer);
    console.log(`PDF loaded: ${result.totalPages} pages`);
    
    // Get metadata (with null check)
    const metadata = pdfViewer ? await pdfViewer.getMetadata() : { title: null, author: null };
    console.log('PDF metadata:', metadata);
    
    // Update UI for PDF mode
    showPDFViewer();
    updatePDFControls(true);
    updateBookInfo(metadata.title || filePath.split('\\\\').pop());
    
    // Try to load outline (TOC)
    const outline = await pdfViewer.getOutline();
    if (outline && outline.length > 0) {
      displayPDFOutline(outline);
    }
    
    // Add to library if not already there
    await addBookToLibrary(filePath, metadata.title || 'Untitled PDF', metadata.author || 'Unknown', 'pdf');
    
    console.log('PDF loaded successfully');
  } catch (error) {
    console.error('Error loading PDF:', error);
    const errorMsg = error.message || 'Unknown error';
    let userMsg = 'Failed to load PDF.';
    
    if (errorMsg.includes('empty')) {
      userMsg = 'PDF file appears to be empty or corrupted.';
    } else if (errorMsg.includes('password')) {
      userMsg = 'This PDF is password-protected and cannot be opened.';
    } else if (errorMsg.includes('unavailable')) {
      userMsg = 'PDF support could not be initialized.';
    } else if (pdfViewer) {
      userMsg = 'Failed to load PDF. The file may be corrupted.';
    }
    
    alert(`Error: ${userMsg}\n\nTechnical details: ${errorMsg}`);
    updateBookInfo('Failed to load PDF');
    
    // Cleanup on error
    if (pdfViewer) {
      pdfViewer.destroy();
      pdfViewer = null;
    }
    
    throw error;
  }
}

/**
 * Load and display an EPUB file
 */
async function loadEPUB(filePath) {
  try {
    // Hide library, clean up previous PDF
    hideLibrary();
    if (pdfViewer) {
      pdfViewer.destroy();
      pdfViewer = null;
    }
    
    currentFileType = 'epub';
    
    updateBookInfo('Loading EPUB file...');
    
    // Clean up previous book if exists to free memory
    if (rendition) {
      rendition.destroy();
      rendition = null;
    }
    if (book) {
      book.destroy();
      book = null;
    }
    
    // Read the EPUB file
    const arrayBuffer = await window.electronAPI.readEpubFile(filePath);
    
    console.log('Received data type:', arrayBuffer?.constructor?.name, 'Size:', arrayBuffer?.byteLength);
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('EPUB file is empty or could not be read');
    }
    
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      console.error('ERROR: Expected ArrayBuffer but got:', typeof arrayBuffer, arrayBuffer?.constructor?.name);
      throw new Error('Invalid data type received from main process. Expected ArrayBuffer.');
    }
    
    // Create new ePub.js book instance
    book = ePub(arrayBuffer);
    console.log('Book instance created');
    
    // CRITICAL: Wait for the book to be ready (parsed)
    console.log('Waiting for book.ready...');
    await book.ready;
    console.log('Book is ready!');
    
    // Create rendition (the viewer)
    const viewerElement = document.getElementById('viewer');
    console.log('Viewer element:', viewerElement);
    
    rendition = book.renderTo('viewer', {
      width: '100%',
      height: '100%',
      flow: 'paginated', // Use pagination instead of scrolling
      snap: true // Snap to page boundaries
    });
    console.log('Rendition created');
    
    // Show the viewer FIRST before trying to display
    console.log('About to show EPUB viewer');
    showEPUBViewer();
    updatePDFControls(false);
    console.log('Viewer shown, now attempting to display rendition');
    
    // Force a reflow to ensure the viewer is actually visible
    const viewerEl = document.getElementById('viewer');
    const forceReflow = viewerEl.offsetHeight; // Reading offsetHeight forces reflow
    console.log('Viewer height after showing:', forceReflow);
    
    // Give the DOM a moment to update
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('After 100ms delay, attempting display');
    
    // Display the book with timeout (epub.js display() sometimes hangs)
    try {
      console.log('Calling rendition.display()...');
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Display timeout after 10 seconds')), 10000);
      });
      
      // Race between display and timeout
      const displayPromise = rendition.display();
      await Promise.race([displayPromise, timeoutPromise]);
      
      console.log('Rendition displayed successfully');
    } catch (displayError) {
      console.error('Error or timeout calling rendition.display():', displayError);
      
      // Even if display() hangs, the content might still be loaded
      // Check if there's content in the iframe
      const viewerEl = document.getElementById('viewer');
      const iframe = viewerEl ? viewerEl.querySelector('iframe') : null;
      console.log('Checking for iframe after display error:', iframe);
      
      if (iframe) {
        console.log('Iframe exists, content may have loaded despite error. Continuing...');
      } else {
        throw new Error('Failed to display EPUB content: ' + displayError.message);
      }
    }
    
    // Apply saved settings
    console.log('Applying settings to rendition');
    settingsManager.applyToRenderer(rendition);
    settingsManager.applyTheme(rendition);
    
    // Load table of contents
    console.log('Loading table of contents');
    await loadTableOfContents();
    
    // Generate book identifier and load highlights
    console.log('Loading highlights');
    await generateBookIdentifier();
    await loadHighlights();
    
    // Apply highlights to rendition
    applyHighlights();
    
    // Set up text selection handler
    rendition.on('selected', handleTextSelection);
    
    // Update UI
    updateBookInfo();
    
    // Save book path for later
    settingsManager.set('lastBookPath', filePath);
    await settingsManager.save();
    
    // Set up location tracking
    rendition.on('relocated', onLocationChange);
    
    console.log('EPUB loaded successfully');
  } catch (error) {
    console.error('Error loading EPUB:', error);
    const errorMsg = error.message || 'Unknown error';
    let userMsg = 'Failed to load EPUB file.';
    
    if (errorMsg.includes('empty')) {
      userMsg = 'EPUB file appears to be empty or corrupted.';
    } else if (errorMsg.includes('DRM')) {
      userMsg = 'This EPUB file has DRM protection and cannot be opened.';
    } else if (errorMsg.includes('invalid')) {
      userMsg = 'This file does not appear to be a valid EPUB.';
    }
    
    alert(`Error: ${userMsg}\n\nTechnical details: ${errorMsg}`);
    updateBookInfo('Failed to load EPUB');
    
    // Cleanup on error
    if (rendition) {
      rendition.destroy();
      rendition = null;
    }
    if (book) {
      book.destroy();
      book = null;
    }
  }
}

function showEPUBViewer() {
  console.log('showEPUBViewer called');
  const viewerElement = document.getElementById('viewer');
  console.log('Viewer element before:', viewerElement, 'classList:', viewerElement.classList.toString());
  
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('viewer').classList.remove('hidden');
  document.getElementById('pdfViewer').classList.add('hidden');
  document.getElementById('backToLibraryBtn').classList.remove('hidden');
  
  console.log('Viewer element after:', viewerElement, 'classList:', viewerElement.classList.toString());
  
  // Update file type indicator
  const indicator = document.getElementById('fileTypeIndicator');
  indicator.classList.remove('hidden', 'pdf-mode');
  indicator.classList.add('epub-mode');
  indicator.querySelector('.file-type-icon').textContent = '📖';
  indicator.querySelector('.file-type-text').textContent = 'EPUB Mode';
  
  // Hide after 3 seconds
  setTimeout(() => {
    indicator.classList.add('hidden');
  }, 3000);
}

function showPDFViewer() {
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('viewer').classList.add('hidden');
  document.getElementById('pdfViewer').classList.remove('hidden');
  document.getElementById('backToLibraryBtn').classList.remove('hidden');
  
  // Update file type indicator
  const indicator = document.getElementById('fileTypeIndicator');
  indicator.classList.remove('hidden', 'epub-mode');
  indicator.classList.add('pdf-mode');
  indicator.querySelector('.file-type-icon').textContent = '📄';
  indicator.querySelector('.file-type-text').textContent = 'PDF Mode • Limited Features';
  
  // Hide after 3 seconds
  setTimeout(() => {
    indicator.classList.add('hidden');
  }, 3000);
}

function hideReader() {
  document.getElementById('welcomeScreen').classList.remove('hidden');
  document.getElementById('viewer').classList.add('hidden');
  document.getElementById('pdfViewer').classList.add('hidden');
}

/**
 * Update control states based on file type
 * Enables/disables controls and updates tooltips
 */
function updatePDFControls(isPDF) {
  // PDF-only controls
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const zoomFitBtn = document.getElementById('zoomFitBtn');
  
  // EPUB-only controls
  const fontSelect = document.getElementById('fontSelect');
  const fontIncreaseBtn = document.getElementById('fontIncreaseBtn');
  const fontDecreaseBtn = document.getElementById('fontDecreaseBtn');
  const highlightBtn = document.getElementById('highlightBtn');
  const viewHighlightsBtn = document.getElementById('viewHighlightsBtn');
  
  if (isPDF) {
    // Enable zoom controls
    zoomInBtn.disabled = false;
    zoomOutBtn.disabled = false;
    zoomResetBtn.disabled = false;
    if (zoomFitBtn) zoomFitBtn.disabled = false;
    zoomInBtn.title = 'Zoom in (+)';
    zoomOutBtn.title = 'Zoom out (-)';
    zoomResetBtn.title = 'Reset zoom (0)';
    if (zoomFitBtn) zoomFitBtn.title = 'Fit to page width (F)';
    
    // Disable EPUB-only controls
    fontSelect.disabled = true;
    fontIncreaseBtn.disabled = true;
    fontDecreaseBtn.disabled = true;
    highlightBtn.disabled = true;
    viewHighlightsBtn.disabled = true;
    
    // Update tooltips to explain why disabled
    fontSelect.title = 'Font customization not available for PDFs';
    fontIncreaseBtn.title = 'Font size not available for PDFs (use zoom instead)';
    fontDecreaseBtn.title = 'Font size not available for PDFs (use zoom instead)';
    highlightBtn.title = 'Highlights not yet supported for PDFs';
    viewHighlightsBtn.title = 'Highlights not yet supported for PDFs';
  } else {
    // Disable zoom controls
    zoomInBtn.disabled = true;
    zoomOutBtn.disabled = true;
    zoomResetBtn.disabled = true;
    if (zoomFitBtn) zoomFitBtn.disabled = true;
    zoomInBtn.title = 'Zoom only available for PDFs';
    zoomOutBtn.title = 'Zoom only available for PDFs';
    zoomResetBtn.title = 'Zoom only available for PDFs';
    if (zoomFitBtn) zoomFitBtn.title = 'Fit to page only available for PDFs';
    
    // Enable EPUB-only controls
    fontSelect.disabled = false;
    fontIncreaseBtn.disabled = false;
    fontDecreaseBtn.disabled = false;
    highlightBtn.disabled = false;
    viewHighlightsBtn.disabled = false;
    
    // Restore original tooltips
    fontSelect.title = 'Select font family';
    fontIncreaseBtn.title = 'Increase font size';
    fontDecreaseBtn.title = 'Decrease font size';
    highlightBtn.title = 'Highlight selected text';
    viewHighlightsBtn.title = 'View all highlights';
  }
}

/**
 * Display PDF outline in TOC panel
 */
function displayPDFOutline(outline) {
  const tocList = document.getElementById('tocList');
  tocList.innerHTML = '';
  
  outline.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = `toc-item toc-level-${item.level}`;
    itemEl.textContent = item.title;
    itemEl.addEventListener('click', async () => {
      // PDF.js outline destinations are complex, simplified here
      console.log('TOC click:', item.title);
      alert('PDF TOC navigation is limited. Use page controls to navigate.');
    });
    tocList.appendChild(itemEl);
  });
}

// ============================================
// Navigation
// ============================================
function goToNextPage() {
  if (currentFileType === 'pdf' && pdfViewer) {
    pdfViewer.nextPage();
  } else if (rendition) {
    rendition.next();
    addPageTransition('slide-left');
  }
}

function goToPreviousPage() {
  if (currentFileType === 'pdf' && pdfViewer) {
    pdfViewer.previousPage();
  } else if (rendition) {
    rendition.prev();
    addPageTransition('slide-right');
  }
}

/**
 * Handle keyboard navigation for page turning
 * Supports: Arrow keys, PageUp/Down, Spacebar
 * Prevents interference with text input fields and text selection
 */
function handleKeyboardNavigation(e) {
  if (!rendition && !pdfViewer) return;
  
  // Don't interfere with input fields or textareas
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  // Don't interfere if user is selecting text
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) return;
  
  // F11 key = Toggle fullscreen
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
  
  // 'F' key = Fit to page (PDF only)
  if (e.key === 'f' || e.key === 'F') {
    if (currentFileType === 'pdf' && pdfViewer) {
      e.preventDefault();
      pdfViewer.fitToPage();
    }
    return;
  }
  
  // Left arrow or PageUp = Previous page
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    if (currentFileType === 'pdf' && pdfViewer) {
      pdfViewer.previousPage();
    } else {
      goToPreviousPage();
    }
  }
  // Right arrow, PageDown, or Spacebar = Next page
  else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    if (currentFileType === 'pdf' && pdfViewer) {
      pdfViewer.nextPage();
    } else {
      goToNextPage();
    }
  }
}

/**
 * Handle mouse wheel navigation for page turning
 * Only active when setting is enabled and not interfering with text selection
 */
function handleMouseWheel(e) {
  if (!rendition) return;
  
  // Check if mouse wheel navigation is enabled
  if (!settingsManager.get('mouseWheelNav')) return;
  
  // Don't interfere if user is selecting text
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) return;
  
  // Scroll down (positive deltaY) = Next page
  if (e.deltaY > 0) {
    e.preventDefault();
    goToNextPage();
  }
  // Scroll up (negative deltaY) = Previous page
  else if (e.deltaY < 0) {
    e.preventDefault();
    goToPreviousPage();
  }
}

/**
 * Add smooth page transition animation
 * Only applies if animations are enabled in settings
 * @param {string} type - Animation type: 'slide-left', 'slide-right', or 'fade'
 */
function addPageTransition(type) {
  // Check if animations are enabled
  if (!settingsManager.get('pageAnimation')) return;
  
  const viewer = document.getElementById('viewer');
  viewer.classList.add(`page-transition-${type}`);
  
  // Remove animation class after completion
  setTimeout(() => {
    viewer.classList.remove(`page-transition-${type}`);
  }, 300);
}

function onLocationChange(location) {
  // Update page info in status bar
  updatePageInfo(location);
  
  // Track current location
  if (location && location.start) {
    currentLocationCfi = location.start.cfi;
    settingsManager.set('lastLocation', currentLocationCfi);
    settingsManager.save();
    
    // Save reading progress to library if book is in library
    if (currentBookPath) {
      const book = library.find(b => b.path === currentBookPath);
      if (book) {
        book.lastPosition = currentLocationCfi;
        book.progress = Math.round((location.start.percentage || 0) * 100);
        // Debounced save to avoid too many writes
        clearTimeout(window.librarySaveTimeout);
        window.librarySaveTimeout = setTimeout(() => {
          saveLibrary();
        }, 2000); // Save after 2 seconds of inactivity
      }
    }
  }
}

// ============================================
// Table of Contents - Enhanced with collapsible sections
// ============================================
async function loadTableOfContents() {
  try {
    const navigation = await book.loaded.navigation;
    const tocList = document.getElementById('tocList');
    tocList.innerHTML = ''; // Clear existing
    
    if (navigation.toc && navigation.toc.length > 0) {
      navigation.toc.forEach((item, index) => {
        createTocItem(item, tocList, 1);
      });
      
      // Highlight current chapter if location is known
      if (currentLocationCfi) {
        updateActiveTocItem();
      }
    } else {
      tocList.innerHTML = '<p style="opacity: 0.6; padding: 20px; text-align: center;">No table of contents available</p>';
    }
  } catch (error) {
    console.error('Error loading TOC:', error);
    document.getElementById('tocList').innerHTML = '<p style="opacity: 0.6; padding: 20px; text-align: center;">Failed to load table of contents</p>';
  }
}

function createTocItem(item, container, level) {
  const wrapper = document.createElement('div');
  wrapper.className = 'toc-item-wrapper';
  
  const div = document.createElement('div');
  div.className = `toc-item toc-level-${level}`;
  div.dataset.href = item.href;
  
  // Add expand/collapse icon for items with subitems
  if (item.subitems && item.subitems.length > 0) {
    const expandIcon = document.createElement('span');
    expandIcon.className = 'toc-expand-icon';
    expandIcon.textContent = '▶';
    div.appendChild(expandIcon);
    
    const label = document.createElement('span');
    label.textContent = item.label;
    div.appendChild(label);
    
    // Toggle expand/collapse
    expandIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      wrapper.classList.toggle('expanded');
      expandIcon.textContent = wrapper.classList.contains('expanded') ? '▼' : '▶';
    });
  } else {
    div.textContent = item.label;
  }
  
  // Navigate when clicked
  div.addEventListener('click', () => {
    navigateToChapter(item.href);
  });
  
  wrapper.appendChild(div);
  container.appendChild(wrapper);
  
  // Recursively add sub-items (initially collapsed)
  if (item.subitems && item.subitems.length > 0) {
    const subContainer = document.createElement('div');
    subContainer.className = 'toc-subitems';
    item.subitems.forEach(subitem => {
      createTocItem(subitem, subContainer, level + 1);
    });
    wrapper.appendChild(subContainer);
  }
}

/**
 * Navigate to a chapter with smooth animation
 */
function navigateToChapter(href) {
  if (!rendition) return;
  
  // Display the chapter
  rendition.display(href).then(() => {
    // Close TOC panel after navigation
    closePanel('tocPanel');
    
    // Add page transition for smooth effect
    if (settingsManager.get('pageAnimation')) {
      const viewer = document.getElementById('viewer');
      viewer.classList.add('page-transition-fade');
      setTimeout(() => {
        viewer.classList.remove('page-transition-fade');
      }, 300);
    }
  });
}

/**
 * Update active TOC item based on current location
 */
function updateActiveTocItem() {
  // Remove previous active state
  document.querySelectorAll('.toc-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // This would require more complex logic to match CFI to TOC items
  // For now, we'll keep it simple - can be enhanced later
}

// ============================================
// Search Functionality - Improved with highlighting and navigation
// ============================================

/**
 * Execute search with performance optimizations for large EPUBs and PDF support
 */
async function executeSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchTerm = searchInput.value.trim();
  
  if (!searchTerm) return;
  
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '<p>Searching...</p>';
  
  // Clear previous search highlights
  clearSearchHighlights();
  
  try {
    if (currentFileType === 'pdf' && pdfViewer) {
      // PDF search
      currentSearchResults = await pdfViewer.searchText(searchTerm);
      
      if (currentSearchResults.length > 0) {
        currentSearchIndex = 0;
        displayPDFSearchResults();
        showSearchNavigation();
        updateSearchCounter(1, currentSearchResults.length);
        // Navigate to first result
        await pdfViewer.nextSearchResult();
      } else {
        resultsContainer.innerHTML = '<p style="opacity: 0.6;">No results found</p>';
        hideSearchNavigation();
      }
    } else if (book) {
      // EPUB search
      currentSearchResults = await searchInBook(searchTerm);
      
      if (currentSearchResults.length > 0) {
        currentSearchIndex = 0;
        displaySearchResults();
        showSearchNavigation();
        // Highlight and navigate to first result
        highlightAllSearchResults();
        navigateToSearchResult(0);
      } else {
        resultsContainer.innerHTML = '<p style="opacity: 0.6;">No results found</p>';
        hideSearchNavigation();
      }
    }
  } catch (error) {
    console.error('Search error:', error);
    resultsContainer.innerHTML = '<p style="color: red;">Search failed. Please try again.</p>';
    hideSearchNavigation();
  }
}

/**
 * Search through book with performance optimization
 * Limits results and uses efficient text searching
 */
async function searchInBook(searchTerm) {
  const results = [];
  const maxResults = 100; // Limit for performance
  const spine = book.spine;
  
  // Use epub.js built-in search if available (more efficient)
  try {
    const searchResults = await book.spine.search(searchTerm, maxResults);
    
    for (let result of searchResults) {
      results.push({
        cfi: result.cfi,
        excerpt: result.excerpt || '',
        term: searchTerm
      });
      
      if (results.length >= maxResults) break;
    }
  } catch (error) {
    // Fallback to manual search if spine.search not available
    console.log('Using fallback search method');
    
    for (let i = 0; i < spine.spineItems.length && results.length < maxResults; i++) {
      const item = spine.spineItems[i];
      
      await item.load(book.load.bind(book));
      const doc = item.document;
      const text = doc.body.textContent;
      const searchRegex = new RegExp(searchTerm, 'gi');
      let match;
      
      while ((match = searchRegex.exec(text)) !== null) {
        const start = Math.max(0, match.index - 60);
        const end = Math.min(text.length, match.index + searchTerm.length + 60);
        const excerpt = text.substring(start, end);
        
        // Try to get CFI for the match position
        try {
          const range = doc.createRange();
          const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
          let charCount = 0;
          let node;
          
          while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;
            if (charCount + nodeLength >= match.index) {
              const offset = match.index - charCount;
              range.setStart(node, offset);
              range.setEnd(node, Math.min(offset + searchTerm.length, nodeLength));
              const cfi = item.cfiFromRange(range);
              
              results.push({
                cfi: cfi,
                excerpt: excerpt,
                term: searchTerm
              });
              break;
            }
            charCount += nodeLength;
          }
        } catch (e) {
          // If CFI generation fails, use base CFI
          results.push({
            cfi: item.cfiBase,
            excerpt: excerpt,
            term: searchTerm
          });
        }
        
        if (results.length >= maxResults) break;
      }
      
      item.unload();
    }
  }
  
  return results;
}

/**
 * Display search results in the panel
 */
function displaySearchResults() {
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';
  
  if (currentSearchResults.length === 0) {
    resultsContainer.innerHTML = '<p style="opacity: 0.6;">No results found</p>';
    return;
  }
  
  currentSearchResults.forEach((result, index) => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.dataset.index = index;
    
    const excerpt = document.createElement('div');
    excerpt.className = 'search-result-excerpt';
    
    // Highlight search term
    const highlighted = result.excerpt.replace(
      new RegExp(escapeRegex(result.term), 'gi'),
      match => `<span class="search-highlight">${match}</span>`
    );
    excerpt.innerHTML = '...' + highlighted + '...';
    
    div.appendChild(excerpt);
    div.addEventListener('click', () => {
      navigateToSearchResult(index);
    });
    
    resultsContainer.appendChild(div);
  });
  
  // Update active result
  updateActiveSearchResult();
}

/**
 * Display PDF search results in the panel
 */
function displayPDFSearchResults() {
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';
  
  if (currentSearchResults.length === 0) {
    resultsContainer.innerHTML = '<p style="opacity: 0.6;">No results found</p>';
    return;
  }
  
  currentSearchResults.forEach((result, index) => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.dataset.index = index;
    
    const excerpt = document.createElement('div');
    excerpt.className = 'search-result-excerpt';
    excerpt.textContent = `Page ${result.pageNum}: ${result.text.trim()}`;
    
    div.appendChild(excerpt);
    div.addEventListener('click', async () => {
      await pdfViewer.goToPage(result.pageNum);
      currentSearchIndex = index;
      updateActiveSearchResult();
      updateSearchCounter(index + 1, currentSearchResults.length);
    });
    
    resultsContainer.appendChild(div);
  });
  
  // Update active result
  updateActiveSearchResult();
}

/**
 * Highlight all search results in the book
 */
function highlightAllSearchResults() {
  if (!rendition || currentSearchResults.length === 0) return;
  
  clearSearchHighlights();
  
  currentSearchResults.forEach((result, index) => {
    try {
      rendition.annotations.highlight(
        result.cfi,
        { type: 'search-result', index: index },
        null,
        null,
        { fill: 'rgba(255, 235, 59, 0.4)' } // Yellow highlight for search
      );
      searchAnnotations.push(result.cfi);
    } catch (error) {
      console.warn('Could not highlight search result:', error);
    }
  });
}

/**
 * Clear all search result highlights
 */
function clearSearchHighlights() {
  if (!rendition) return;
  
  searchAnnotations.forEach(cfi => {
    try {
      rendition.annotations.remove(cfi, 'highlight');
    } catch (error) {
      // Ignore removal errors
    }
  });
  searchAnnotations = [];
}

/**
 * Navigate to a specific search result
 */
function navigateToSearchResult(index) {
  if (index < 0 || index >= currentSearchResults.length) return;
  
  currentSearchIndex = index;
  const result = currentSearchResults[index];
  
  // Display the location
  rendition.display(result.cfi).then(() => {
    // Update UI
    updateSearchCounter();
    updateActiveSearchResult();
  });
}

/**
 * Go to next search result
 */
async function goToNextSearchResult() {
  if (currentSearchResults.length === 0) return;
  
  if (currentFileType === 'pdf' && pdfViewer) {
    const result = await pdfViewer.nextSearchResult();
    if (result) {
      currentSearchIndex = result.current - 1;
      updateActiveSearchResult();
      updateSearchCounter(result.current, result.total);
    }
  } else {
    currentSearchIndex = (currentSearchIndex + 1) % currentSearchResults.length;
    navigateToSearchResult(currentSearchIndex);
  }
}

/**
 * Go to previous search result
 */
async function goToPreviousSearchResult() {
  if (currentSearchResults.length === 0) return;
  
  if (currentFileType === 'pdf' && pdfViewer) {
    const result = await pdfViewer.previousSearchResult();
    if (result) {
      currentSearchIndex = result.current - 1;
      updateActiveSearchResult();
      updateSearchCounter(result.current, result.total);
    }
  } else {
    currentSearchIndex = (currentSearchIndex - 1 + currentSearchResults.length) % currentSearchResults.length;
    navigateToSearchResult(currentSearchIndex);
  }
}

/**
 * Clear search and remove highlights
 */
function clearSearch() {
  currentSearchResults = [];
  currentSearchIndex = 0;
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  clearSearchHighlights();
  hideSearchNavigation();
}

/**
 * Show search navigation controls
 */
function showSearchNavigation() {
  document.getElementById('searchNavigation').classList.remove('hidden');
  updateSearchCounter();
}

/**
 * Hide search navigation controls
 */
function hideSearchNavigation() {
  document.getElementById('searchNavigation').classList.add('hidden');
}

/**
 * Update the search result counter
 */
function updateSearchCounter() {
  const counter = document.getElementById('searchCounter');
  if (currentSearchResults.length > 0) {
    counter.textContent = `${currentSearchIndex + 1} / ${currentSearchResults.length}`;
  } else {
    counter.textContent = '0 / 0';
  }
}

/**
 * Update active search result in the list
 */
function updateActiveSearchResult() {
  const items = document.querySelectorAll('.search-result-item');
  items.forEach((item, index) => {
    if (index === currentSearchIndex) {
      item.classList.add('active');
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// Reading Settings
// ============================================
function increaseFontSize() {
  let size = settingsManager.get('fontSize');
  size = Math.min(size + 2, 36); // Max 36px
  settingsManager.set('fontSize', size);
  applyFontSize();
  settingsManager.save();
}

function decreaseFontSize() {
  let size = settingsManager.get('fontSize');
  size = Math.max(size - 2, 10); // Min 10px
  settingsManager.set('fontSize', size);
  applyFontSize();
  settingsManager.save();
}

function applyFontSize() {
  if (rendition) {
    rendition.themes.fontSize(`${settingsManager.get('fontSize')}px`);
  }
}

function changeFontFamily(e) {
  const family = e.target.value;
  settingsManager.set('fontFamily', family);
  if (rendition) {
    rendition.themes.override('font-family', family);
  }
  settingsManager.save();
}

function changeLineSpacing(e) {
  const spacing = parseFloat(e.target.value);
  settingsManager.set('lineSpacing', spacing);
  document.getElementById('lineSpacingValue').textContent = spacing.toFixed(1);
  
  if (rendition) {
    rendition.themes.override('line-height', spacing);
  }
  settingsManager.save();
}

function changeMargins(e) {
  const margin = parseInt(e.target.value);
  settingsManager.set('marginSize', margin);
  document.getElementById('marginValue').textContent = margin + 'px';
  
  if (rendition) {
    rendition.themes.override('padding', `${margin}px`);
  }
  settingsManager.save();
}

function changeTheme(e) {
  const theme = e.target.value;
  settingsManager.set('theme', theme);
  applyThemeToUI(theme);
  if (rendition) {
    settingsManager.applyTheme(rendition);
  }
  settingsManager.save();
}

function applyThemeToUI(theme) {
  // Remove all theme classes and add the selected one
  document.body.classList.remove('theme-white', 'theme-sepia', 'theme-kindle', 'theme-blue', 'theme-gray', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  
  // Update select to match
  document.getElementById('themeSelect').value = theme;
  
  // Apply theme to PDF viewer background if PDF is open
  if (currentFileType === 'pdf') {
    const themeColors = settingsManager.getThemeColors();
    const pdfViewer = document.getElementById('pdfViewer');
    if (pdfViewer) {
      pdfViewer.style.backgroundColor = themeColors.background;
    }
  }
}

function toggleMouseWheelNav(e) {
  const enabled = e.target.checked;
  settingsManager.set('mouseWheelNav', enabled);
  settingsManager.save();
}

function togglePageAnimation(e) {
  const enabled = e.target.checked;
  settingsManager.set('pageAnimation', enabled);
  settingsManager.save();
}

function resetSettings() {
  if (confirm('Reset all settings to defaults?')) {
    settingsManager.reset();
    updateUIFromSettings();
    if (rendition) {
      settingsManager.applyToRenderer(rendition);
      settingsManager.applyTheme(rendition);
    }
    settingsManager.save();
  }
}

function updateUIFromSettings() {
  // Update all UI controls to reflect current settings
  document.getElementById('fontSelect').value = settingsManager.get('fontFamily');
  document.getElementById('themeSelect').value = settingsManager.get('theme');
  document.getElementById('lineSpacingSlider').value = settingsManager.get('lineSpacing');
  document.getElementById('lineSpacingValue').textContent = settingsManager.get('lineSpacing').toFixed(1);
  document.getElementById('marginSlider').value = settingsManager.get('marginSize');
  document.getElementById('marginValue').textContent = settingsManager.get('marginSize') + 'px';
  document.getElementById('mouseWheelToggle').checked = settingsManager.get('mouseWheelNav');
  document.getElementById('animationToggle').checked = settingsManager.get('pageAnimation');
  
  applyThemeToUI(settingsManager.get('theme'));
}

// ============================================
// UI Helpers
// ============================================
function togglePanel(panelId) {
  const panel = document.getElementById(panelId);
  
  // Close all other panels first
  const allPanels = document.querySelectorAll('.side-panel');
  allPanels.forEach(p => {
    if (p.id !== panelId) {
      p.classList.add('hidden');
    }
  });
  
  // Toggle the requested panel
  panel.classList.toggle('hidden');
}

function closePanel(panelId) {
  document.getElementById(panelId).classList.add('hidden');
}

/**
 * Toggle fullscreen mode
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    // Enter fullscreen
    document.documentElement.requestFullscreen().catch(err => {
      console.error('Error attempting to enable fullscreen:', err);
    });
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

async function updateBookInfo(titleOverride = null) {
  try {
    if (titleOverride) {
      document.getElementById('bookTitle').textContent = titleOverride;
      document.title = `${titleOverride} - LapBook`;
    } else if (book) {
      const metadata = await book.loaded.metadata;
      const title = metadata.title || 'Unknown Title';
      document.getElementById('bookTitle').textContent = title;
      document.title = `${title} - LapBook`;
    }
  } catch (error) {
    console.error('Error loading metadata:', error);
  }
}

function updatePageInfo(location) {
  const pageInfo = document.getElementById('pageInfo');
  
  if (pdfViewer && currentFileType === 'pdf') {
    // PDF page info is updated by PDFViewer directly
    return;
  }
  
  if (location && location.start) {
    // Calculate approximate page/progress
    const percentage = Math.round(location.start.percentage * 100);
    pageInfo.textContent = `${percentage}%`;
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a unique identifier for the current book
 * Uses ISBN or title+author as fallback
 */
async function generateBookIdentifier() {
  try {
    const metadata = await book.loaded.metadata;
    // Try to use ISBN if available
    if (metadata.identifier) {
      bookIdentifier = metadata.identifier;
    } else {
      // Fallback to title + author
      const title = metadata.title || 'unknown';
      const author = metadata.creator || 'unknown';
      bookIdentifier = `${title}-${author}`.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }
  } catch (error) {
    console.error('Error generating book identifier:', error);
    bookIdentifier = 'unknown-book-' + Date.now();
  }
}

/**
 * Load highlights for current book
 */
async function loadHighlights() {
  try {
    highlights = await window.electronAPI.loadHighlights(bookIdentifier);
    console.log(`Loaded ${highlights.length} highlights`);
    updateHighlightsList();
  } catch (error) {
    console.error('Error loading highlights:', error);
    highlights = [];
  }
}

/**
 * Save highlights for current book
 */
async function saveHighlightsToFile() {
  try {
    await window.electronAPI.saveHighlights(bookIdentifier, highlights);
    console.log('Highlights saved successfully');
  } catch (error) {
    console.error('Error saving highlights:', error);
  }
}

/**
 * Apply all highlights to the rendition
 */
function applyHighlights() {
  if (!rendition) return;
  
  // Remove all existing highlights first
  rendition.annotations.remove(null, 'highlight');
  
  // Apply each highlight
  highlights.forEach(highlight => {
    const colorMap = {
      yellow: 'rgba(255, 235, 59, 0.3)',
      green: 'rgba(139, 195, 74, 0.3)',
      blue: 'rgba(100, 181, 246, 0.3)',
      pink: 'rgba(244, 143, 177, 0.3)',
      orange: 'rgba(255, 183, 77, 0.3)'
    };
    
    rendition.annotations.highlight(
      highlight.cfiRange,
      { id: highlight.id },
      null,
      null,
      { fill: colorMap[highlight.color] || colorMap.yellow }
    );
  });
}

/**
 * Handle text selection in the book - show context menu
 */
let selectedText = '';
let contextMenuTimeout = null;

function handleTextSelection(cfiRange, contents) {
  selectedCfiRange = cfiRange;
  
  // Get selected text
  const selection = contents.window.getSelection();
  selectedText = selection ? selection.toString().trim() : '';
  
  if (selectedText) {
    // Get selection position
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Show context menu near selection
    showContextMenu(rect.right + 10, rect.top);
  } else {
    hideContextMenu();
  }
}

/**
 * Show text selection context menu
 */
function showContextMenu(x, y) {
  const menu = document.getElementById('textContextMenu');
  menu.classList.remove('hidden');
  
  // Position menu
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  // Adjust if menu goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
  
  // Auto-hide after 10 seconds
  if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
  contextMenuTimeout = setTimeout(() => {
    hideContextMenu();
  }, 10000);
}

/**
 * Hide context menu
 */
function hideContextMenu() {
  document.getElementById('textContextMenu').classList.add('hidden');
  if (contextMenuTimeout) {
    clearTimeout(contextMenuTimeout);
    contextMenuTimeout = null;
  }
}

/**
 * Open highlight dialog when user wants to highlight
 */
function openHighlightDialog() {
  if (!selectedCfiRange) {
    alert('Please select some text first');
    return;
  }
  
  hideContextMenu();
  
  // Clear previous note
  document.getElementById('highlightNoteInput').value = '';
  
  // Show dialog
  document.getElementById('highlightDialog').classList.remove('hidden');
}

/**
 * Close highlight dialog
 */
function closeHighlightDialog() {
  document.getElementById('highlightDialog').classList.add('hidden');
  selectedCfiRange = null;
}

/**
 * Look up word definition in dictionary
 */
async function lookupWord() {
  if (!selectedText) {
    alert('Please select a word or phrase first');
    return;
  }
  
  hideContextMenu();
  
  // Get first word if multiple words selected
  const word = selectedText.split(/\s+/)[0].toLowerCase().replace(/[^\w]/g, '');
  
  if (!word) {
    alert('Invalid selection');
    return;
  }
  
  // Show dictionary dialog
  const dialog = document.getElementById('dictionaryDialog');
  const wordTitle = document.getElementById('dictionaryWord');
  const content = document.getElementById('dictionaryContent');
  
  wordTitle.textContent = word;
  content.innerHTML = '<div class="loading">Loading definition...</div>';
  dialog.classList.remove('hidden');
  
  try {
    // Use Free Dictionary API
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    
    if (!response.ok) {
      throw new Error('Word not found');
    }
    
    const data = await response.json();
    displayDictionaryResult(data[0]);
  } catch (error) {
    console.error('Dictionary lookup error:', error);
    content.innerHTML = `
      <div class="dictionary-error">
        <p>Sorry, we couldn't find the definition for "${word}".</p>
        <p style="margin-top: 8px; font-size: 14px;">The word might be misspelled or not in our dictionary.</p>
      </div>
    `;
  }
}

/**
 * Display dictionary result
 */
function displayDictionaryResult(data) {
  const content = document.getElementById('dictionaryContent');
  
  let html = '';
  
  // Phonetic
  if (data.phonetic) {
    html += `<div class="dictionary-phonetic">${data.phonetic}</div>`;
  }
  
  // Meanings
  data.meanings.forEach(meaning => {
    html += `<div class="dictionary-meaning">`;
    html += `<div class="dictionary-part-of-speech">${meaning.partOfSpeech}</div>`;
    
    meaning.definitions.forEach((def, index) => {
      html += `<div class="dictionary-definition">`;
      html += `<div class="dictionary-definition-text">${index + 1}. ${def.definition}</div>`;
      
      if (def.example) {
        html += `<div class="dictionary-example">"${def.example}"</div>`;
      }
      html += `</div>`;
    });
    
    // Synonyms
    if (meaning.synonyms && meaning.synonyms.length > 0) {
      html += `<div class="dictionary-synonyms"><strong>Synonyms:</strong> ${meaning.synonyms.slice(0, 5).join(', ')}</div>`;
    }
    
    html += `</div>`;
  });
  
  content.innerHTML = html;
}

/**
 * Close dictionary dialog
 */
function closeDictionaryDialog() {
  document.getElementById('dictionaryDialog').classList.add('hidden');
}

/**
 * Save a new highlight
 */
async function saveHighlight() {
  if (!selectedCfiRange) {
    closeHighlightDialog();
    return;
  }
  
  try {
    // Get selected text content
    const range = await book.getRange(selectedCfiRange);
    const text = range.toString().trim();
    
    // Get note if provided
    const note = document.getElementById('highlightNoteInput').value.trim();
    
    // Create highlight object
    const highlight = {
      id: Date.now().toString(),
      cfiRange: selectedCfiRange,
      text: text,
      color: selectedColor,
      note: note,
      created: new Date().toISOString()
    };
    
    // Add to highlights array
    highlights.push(highlight);
    
    // Save to file
    await saveHighlightsToFile();
    
    // Apply to rendition
    applyHighlights();
    
    // Update UI
    updateHighlightsList();
    
    // Close dialog
    closeHighlightDialog();
    
    console.log('Highlight saved:', highlight);
  } catch (error) {
    console.error('Error saving highlight:', error);
    alert('Failed to save highlight. Please try again.');
  }
}

/**
 * Update the highlights list in the panel
 */
function updateHighlightsList() {
  const listContainer = document.getElementById('highlightsList');
  listContainer.innerHTML = '';
  
  if (highlights.length === 0) {
    listContainer.innerHTML = '<div class="highlights-empty">No highlights yet. Select text and click Highlight to add one.</div>';
    return;
  }
  
  // Sort by creation date (newest first)
  const sortedHighlights = [...highlights].sort((a, b) => 
    new Date(b.created) - new Date(a.created)
  );
  
  sortedHighlights.forEach(highlight => {
    const item = document.createElement('div');
    item.className = `highlight-item color-${highlight.color}`;
    
    const text = document.createElement('div');
    text.className = 'highlight-text';
    text.textContent = `"${highlight.text.substring(0, 100)}${highlight.text.length > 100 ? '...' : ''}"`;
    item.appendChild(text);
    
    if (highlight.note) {
      const note = document.createElement('div');
      note.className = 'highlight-note-display';
      note.textContent = highlight.note;
      item.appendChild(note);
    }
    
    const actions = document.createElement('div');
    actions.className = 'highlight-actions';
    
    const goBtn = document.createElement('button');
    goBtn.textContent = 'Go to';
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      rendition.display(highlight.cfiRange);
      closePanel('highlightsPanel');
    });
    actions.appendChild(goBtn);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteHighlight(highlight.id);
    });
    actions.appendChild(deleteBtn);
    
    item.appendChild(actions);
    
    // Click on item to navigate
    item.addEventListener('click', () => {
      rendition.display(highlight.cfiRange);
      closePanel('highlightsPanel');
    });
    
    listContainer.appendChild(item);
  });
}

/**
 * Delete a highlight
 */
async function deleteHighlight(highlightId) {
  if (!confirm('Delete this highlight?')) return;
  
  // Remove from array
  highlights = highlights.filter(h => h.id !== highlightId);
  
  // Save to file
  await saveHighlightsToFile();
  
  // Reapply highlights
  applyHighlights();
  
  // Update UI
  updateHighlightsList();
}

// ============================================
// Library Management
// ============================================

/**
 * Load library from disk
 */
async function loadLibrary() {
  try {
    library = await window.electronAPI.loadLibrary();
    console.log(`Loaded ${library.length} books in library`);
    renderLibrary();
  } catch (error) {
    console.error('Error loading library:', error);
    library = [];
  }
}

/**
 * Save library to disk
 */
async function saveLibrary() {
  try {
    await window.electronAPI.saveLibrary(library);
  } catch (error) {
    console.error('Error saving library:', error);
  }
}

/**
 * Add a book to the library
 */
async function addBookToLibrary(filePathArg = null, titleArg = null, authorArg = null, fileTypeArg = null) {
  try {
    console.log('addBookToLibrary called with:', { filePathArg, titleArg, authorArg, fileTypeArg });
    
    // Handle case where event object is passed instead of arguments
    if (filePathArg && typeof filePathArg === 'object' && filePathArg.constructor.name === 'PointerEvent') {
      console.log('Event object detected, ignoring it');
      filePathArg = null;
    }
    
    // If called programmatically with arguments, use them; otherwise open dialog
    let filePath = filePathArg;
    let title = titleArg;
    let author = authorArg;
    let fileType = fileTypeArg;
    
    if (!filePath) {
      filePath = await window.electronAPI.openEpubDialog();
      if (!filePath) {
        console.log('No file selected');
        return;
      }
    }
    
    console.log('Processing file:', filePath);
    
    // Determine file type if not provided
    if (!fileType) {
      const extension = filePath.split('.').pop().toLowerCase();
      fileType = extension === 'pdf' ? 'pdf' : 'epub';
    }
    
    // Check if book already exists in library
    const existingBook = library.find(b => b.path === filePath);
    if (existingBook) {
      // Book already in library
      // Only open it if user clicked "+Add Book" button (filePathArg is null)
      // Don't open if called from loadPDF/loadEPUB (filePathArg has value)
      if (!filePathArg) {
        await loadBook(filePath);
      }
      return;
    }
    
    // Read and parse the file to get metadata
    const arrayBuffer = await window.electronAPI.readEpubFile(filePath);
    let coverPath = null;
    let bookId;
    
    if (fileType === 'pdf') {
      // Handle PDF
      const tempPdfViewer = new PDFViewer();
      await tempPdfViewer.loadPDF(arrayBuffer);
      const metadata = await tempPdfViewer.getMetadata();
      
      title = title || metadata.title || filePath.split('\\\\').pop();
      author = author || metadata.author || 'Unknown';
      bookId = `${title}-${author}`.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + Date.now();
      
      tempPdfViewer.destroy();
    } else {
      // Handle EPUB
      const tempBook = ePub(arrayBuffer);
      await tempBook.ready;
      
      const metadata = await tempBook.loaded.metadata;
      const cover = await tempBook.loaded.cover;
      
      title = title || metadata.title || 'Unknown Title';
      author = author || metadata.creator || 'Unknown Author';
      bookId = metadata.identifier || `${title}-${author}`.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + Date.now();
      
      // Extract and save cover image if available
      if (cover) {
        try {
          const coverUrl = await tempBook.coverUrl();
          if (coverUrl) {
            // Convert cover to base64 and save
            const response = await fetch(coverUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            const base64Data = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            coverPath = await window.electronAPI.saveCover(bookId, base64Data);
          }
        } catch (error) {
          console.warn('Could not extract cover from cover property:', error);
        }
      }
      
      // If no cover found, try to extract first page as cover
      if (!coverPath) {
        try {
          // Get first spine item (usually the cover page)
          const spineItem = tempBook.spine.get(0);
          if (spineItem) {
            await spineItem.load(tempBook.load.bind(tempBook));
            const doc = spineItem.document;
            
            // Try to find first image in the document
            const img = doc.querySelector('img');
            if (img && img.src) {
              const imgUrl = img.src.startsWith('http') ? img.src : tempBook.url(img.src);
              const response = await fetch(imgUrl);
              const blob = await response.blob();
              const reader = new FileReader();
              const base64Data = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
              coverPath = await window.electronAPI.saveCover(bookId, base64Data);
              console.log('Extracted cover from first page');
            }
          }
        } catch (error) {
          console.warn('Could not extract cover from first page:', error);
        }
      }
      
      // Destroy temp book
      tempBook.destroy();
    }
    
    // Create library entry
    const libraryEntry = {
      id: bookId,
      path: filePath,
      title: title,
      author: author,
      fileType: fileType,  // Add file type
      coverPath: coverPath,
      addedDate: new Date().toISOString(),
      lastOpened: null,
      lastPosition: null,  // CFI of last reading position (EPUB only)
      progress: 0          // Reading progress percentage (0-100)
    };
    
    library.unshift(libraryEntry); // Add to beginning
    await saveLibrary();
    renderLibrary();
    
    // Open the book if not called programmatically
    if (!filePathArg) {
      await loadBook(filePath);
    }
    
  } catch (error) {
    console.error('Error adding book to library:', error);
    alert('Failed to add book to library. Please try again.');
  }
}

/**
 * Remove a book from the library
 */
async function removeBookFromLibrary(bookId) {
  if (!confirm('Remove this book from your library?')) return;
  
  library = library.filter(b => b.id !== bookId);
  await saveLibrary();
  renderLibrary();
}

/**
 * Open edit book dialog
 */
let editingBookId = null;

function openEditBookDialog(bookId) {
  const book = library.find(b => b.id === bookId);
  if (!book) return;
  
  editingBookId = bookId;
  document.getElementById('editBookTitle').value = book.title;
  document.getElementById('editBookAuthor').value = book.author;
  document.getElementById('editBookDialog').classList.remove('hidden');
}

/**
 * Save edited book metadata
 */
async function saveEditedBook() {
  if (!editingBookId) return;
  
  const book = library.find(b => b.id === editingBookId);
  if (!book) return;
  
  book.title = document.getElementById('editBookTitle').value || 'Unknown Title';
  book.author = document.getElementById('editBookAuthor').value || 'Unknown Author';
  
  await saveLibrary();
  renderLibrary();
  
  // Close dialog
  document.getElementById('editBookDialog').classList.add('hidden');
  editingBookId = null;
}

/**
 * Cancel edit book dialog
 */
function cancelEditBook() {
  document.getElementById('editBookDialog').classList.add('hidden');
  editingBookId = null;
}

/**
 * Open a book from the library
 */
async function openBookFromLibrary(bookPath) {
  try {
    // Update last opened time
    const book = library.find(b => b.path === bookPath);
    if (book) {
      book.lastOpened = new Date().toISOString();
      await saveLibrary();
    }
    
    await loadBook(bookPath);
    
    // Resume from last position if available (EPUB only)
    if (book && book.lastPosition && book.fileType === 'epub' && rendition) {
      try {
        await rendition.display(book.lastPosition);
        console.log('Resumed from last position');
      } catch (error) {
        console.warn('Could not resume from last position:', error);
      }
    }
    // For PDFs, go to last page if available
    else if (book && book.lastPosition && book.fileType === 'pdf' && pdfViewer) {
      try {
        const pageNum = parseInt(book.lastPosition);
        if (pageNum > 0) {
          await pdfViewer.goToPage(pageNum);
          console.log('Resumed PDF from page', pageNum);
        }
      } catch (error) {
        console.warn('Could not resume PDF from last position:', error);
      }
    }
  } catch (error) {
    console.error('Error opening book from library:', error);
    alert('Failed to open book. The file may have been moved or deleted.');
  }
}

/**
 * Render the library view
 */
function renderLibrary() {
  const grid = document.getElementById('libraryGrid');
  const empty = document.getElementById('libraryEmpty');
  
  if (library.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  grid.innerHTML = '';
  
  // Get recently opened books (sorted by last opened, max 4)
  const recentBooks = library
    .filter(b => b.lastOpened)
    .sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened))
    .slice(0, 4);
  
  // Show recently opened section if there are any
  if (recentBooks.length > 0) {
    const recentSection = document.createElement('div');
    recentSection.className = 'library-section';
    
    const recentHeader = document.createElement('h2');
    recentHeader.className = 'section-header';
    recentHeader.textContent = 'Recently Opened';
    recentSection.appendChild(recentHeader);
    
    const recentGrid = document.createElement('div');
    recentGrid.className = 'library-grid-horizontal';
    recentBooks.forEach(book => {
      recentGrid.appendChild(createBookCard(book, true));
    });
    recentSection.appendChild(recentGrid);
    grid.appendChild(recentSection);
    
    // Add visual separator if there are more books
    if (library.length > recentBooks.length) {
      const separator = document.createElement('div');
      separator.className = 'library-separator';
      grid.appendChild(separator);
    }
  }
  
  // Show "All Books" section only if there are more books than recent
  const showAllBooksSection = library.length > 0 && (recentBooks.length === 0 || library.length > recentBooks.length);
  
  if (showAllBooksSection) {
    // Add "All Books" header only if we have recent books
    if (recentBooks.length > 0) {
      const allBooksSection = document.createElement('div');
      allBooksSection.className = 'library-section';
      
      const allBooksHeader = document.createElement('h2');
      allBooksHeader.className = 'section-header';
      allBooksHeader.textContent = 'All Books';
      allBooksSection.appendChild(allBooksHeader);
      
      const allBooksGrid = document.createElement('div');
      allBooksGrid.className = libraryViewMode === 'grid' ? 'library-grid' : 'library-list';
      
      library.forEach(book => {
        allBooksGrid.appendChild(createBookCard(book, false));
      });
      
      allBooksSection.appendChild(allBooksGrid);
      grid.appendChild(allBooksSection);
    } else {
      // No recent books, just show all books without section header
      const allBooksGrid = document.createElement('div');
      allBooksGrid.className = libraryViewMode === 'grid' ? 'library-grid' : 'library-list';
      allBooksGrid.style.marginTop = '20px';
      
      library.forEach(book => {
        allBooksGrid.appendChild(createBookCard(book, false));
      });
      
      grid.appendChild(allBooksGrid);
    }
  }
}

/**
 * Create a book card element
 * @param {Object} book - Book object from library
 * @param {Boolean} showProgress - Whether to show reading progress
 */
function createBookCard(book, showProgress) {
  const card = document.createElement('div');
    card.className = 'book-card';
    
    // Cover image
    const cover = document.createElement('div');
    cover.className = 'book-cover';
    if (book.coverPath) {
      const img = document.createElement('img');
      img.src = `file:///${book.coverPath.replace(/\\/g, '/')}`;
      img.alt = book.title;
      img.onerror = () => {
        cover.innerHTML = '<div class="book-cover-placeholder">📖</div>';
      };
      cover.appendChild(img);
    } else {
      cover.innerHTML = '<div class="book-cover-placeholder">📖</div>';
    }
    
    // Add file type badge
    const typeBadge = document.createElement('div');
    typeBadge.className = 'file-type-badge';
    typeBadge.textContent = (book.fileType || 'epub').toUpperCase();
    cover.appendChild(typeBadge);
    
    card.appendChild(cover);
    
    // Book info
    const info = document.createElement('div');
    info.className = 'book-info';
    
    const title = document.createElement('div');
    title.className = 'book-title';
    title.textContent = book.title;
    title.title = book.title;
    info.appendChild(title);
    
    const author = document.createElement('div');
    author.className = 'book-author';
    author.textContent = book.author;
    author.title = book.author;
    info.appendChild(author);
    
    card.appendChild(info);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'book-actions';
    
    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn-small';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openBookFromLibrary(book.path));
    actions.appendChild(openBtn);
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-small';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditBookDialog(book.id);
    });
    actions.appendChild(editBtn);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-small btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeBookFromLibrary(book.id);
    });
    actions.appendChild(removeBtn);
    
    card.appendChild(actions);
    
    // Add progress bar if showing progress and book has been opened
    if (showProgress && book.progress > 0) {
      const progressBar = document.createElement('div');
      progressBar.className = 'book-progress';
      
      const progressFill = document.createElement('div');
      progressFill.className = 'book-progress-fill';
      progressFill.style.width = `${book.progress}%`;
      progressBar.appendChild(progressFill);
      
      const progressText = document.createElement('div');
      progressText.className = 'book-progress-text';
      progressText.textContent = `${book.progress}% complete`;
      
      card.appendChild(progressBar);
      card.appendChild(progressText);
    }
    
    // Click card to open
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('btn')) {
        openBookFromLibrary(book.path);
      }
    });
    
    return card;
}

/**
 * Toggle library view between grid and list
 */
function toggleLibraryView() {
  libraryViewMode = libraryViewMode === 'grid' ? 'list' : 'grid';
  const icon = document.getElementById('viewIcon');
  icon.textContent = libraryViewMode === 'grid' ? '☰' : '⊞';
  renderLibrary();
}

/**
 * Show library view
 */
function showLibrary() {
  document.getElementById('libraryView').classList.remove('hidden');
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('viewer').classList.add('hidden');
  document.getElementById('backToLibraryBtn').classList.add('hidden');
  document.getElementById('bookTitle').textContent = 'My Library';
  
  // Apply sepia theme to dashboard
  document.body.classList.remove('theme-white', 'theme-sepia', 'theme-kindle', 'theme-blue', 'theme-gray', 'theme-dark');
  document.body.classList.add('theme-sepia');
}

/**
 * Hide library view and show reader
 */
function hideLibrary() {
  document.getElementById('libraryView').classList.add('hidden');
  document.getElementById('backToLibraryBtn').classList.remove('hidden');
  
  // Apply user's selected theme when opening a book
  applyThemeToUI(settingsManager.get('theme'));
}

/**
 * Back to library from reader
 */
function backToLibrary() {
  // Clean up current book
  if (rendition) {
    rendition.destroy();
    rendition = null;
    book = null;
  }
  
  // Clear search and highlights
  clearSearch();
  highlights = [];
  
  // Show library
  showLibrary();
  renderLibrary();
}

// ============================================
// Utility Functions (continued)
// ============================================

// Clean up on window close
window.addEventListener('beforeunload', () => {
  if (rendition) {
    rendition.destroy();
  }
});

// ============================================
// About & Changelog Dialogs
// ============================================

/**
 * Show About LapBook dialog
 */
function showAboutDialog() {
  const aboutDialog = document.getElementById('aboutDialog');
  const versionSpan = document.getElementById('appVersion');
  
  // Get version from package.json
  versionSpan.textContent = '1.0.0';
  
  aboutDialog.classList.remove('hidden');
}

/**
 * Show Changelog dialog
 */
async function showChangelogDialog() {
  const changelogDialog = document.getElementById('changelogDialog');
  const changelogContent = document.getElementById('changelogContent');
  
  changelogDialog.classList.remove('hidden');
  changelogContent.innerHTML = '<div class="loading">Loading changelog...</div>';
  
  try {
    const changelogPath = await window.electronAPI.getChangelogPath();
    const changelogMd = await window.electronAPI.readFile(changelogPath);
    
    // Simple markdown to HTML conversion
    const html = convertMarkdownToHtml(changelogMd);
    changelogContent.innerHTML = html;
  } catch (error) {
    console.error('Error loading changelog:', error);
    changelogContent.innerHTML = '<div class="dictionary-error">Failed to load changelog</div>';
  }
}

/**
 * Simple markdown to HTML converter
 */
function convertMarkdownToHtml(markdown) {
  let html = markdown;
  
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');
  
  // Paragraphs
  html = html.replace(/^(?!<[hl]|<ul|<hr)(.+)$/gm, '<p>$1</p>');
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  
  return html;
}

/**
 * Show Privacy Policy dialog
 */
async function showPrivacyDialog() {
  const privacyDialog = document.getElementById('privacyDialog');
  const privacyContent = document.getElementById('privacyContent');
  
  privacyDialog.classList.remove('hidden');
  privacyContent.innerHTML = '<div class="loading">Loading privacy policy...</div>';
  
  try {
    const privacyPath = await window.electronAPI.getPrivacyPath();
    const privacyMd = await window.electronAPI.readFile(privacyPath);
    
    const html = convertMarkdownToHtml(privacyMd);
    privacyContent.innerHTML = html;
  } catch (error) {
    console.error('Error loading privacy policy:', error);
    privacyContent.innerHTML = '<div class="dictionary-error">Failed to load privacy policy</div>';
  }
}

/**
 * Show Terms of Use dialog
 */
async function showTermsDialog() {
  const termsDialog = document.getElementById('termsDialog');
  const termsContent = document.getElementById('termsContent');
  
  termsDialog.classList.remove('hidden');
  termsContent.innerHTML = '<div class="loading">Loading terms of use...</div>';
  
  try {
    const termsPath = await window.electronAPI.getTermsPath();
    const termsMd = await window.electronAPI.readFile(termsPath);
    
    const html = convertMarkdownToHtml(termsMd);
    termsContent.innerHTML = html;
  } catch (error) {
    console.error('Error loading terms of use:', error);
    termsContent.innerHTML = '<div class="dictionary-error">Failed to load terms of use</div>';
  }
}
